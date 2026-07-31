import type { accounts, transactions } from "@finance/contracts";
import { addMoney, subtractMoney, toMoney } from "@finance/money";

import {
  CardAccountMismatchError,
  CardLimitExceededError,
  CardNotAllowedError,
  CardRequiredError,
  CardSubLimitExceededError,
} from "./errors";

/** Effective movement fields used to validate rules + enforce credit limits. */
export interface EffectiveMovement {
  type: transactions.TransactionType;
  bankAccountId: string;
  cardId?: string | null;
  amount: string;
  currency: string;
}

/** Pre-fetched account context — a plain read model, not the `accounts`
 * domain's own aggregate (this domain never constructs one, only reads the
 * few fields it needs; FR-011 keeps the two domains decoupled). */
export interface AccountContext {
  id: string;
  type: accounts.AccountType;
  creditLimit: string;
  creditUsed: string;
  billingCycleDay: number | null;
}

export interface CardContext {
  id: string;
  kind: accounts.CardKind;
}

export interface CardLimitContext {
  limitAmount: string;
  usedInitial: string;
}

/**
 * `MovementPolicy`: pure domain rules (spec 007) — zero Prisma, zero I/O, so
 * fully unit-testable against plain fixtures. Ported unchanged from the
 * pre-migration `TransactionsService.validateMovement` /
 * `creditPoolContribution` / `assertWithinCardLimit`.
 *
 *  - bank must exist (caller's job to fetch + 404 before calling in)
 *  - INCOME: no card
 *  - EXPENSE on CASH: no card
 *  - EXPENSE on CREDIT_LINE: a card of that account is required
 *  - EXPENSE on other accounts: card optional, but if given it must belong
 *  - Whenever the card used is kind=CREDIT: the amount must fit both the
 *    account's shared pool (creditLimit, persisted `creditUsed`) and, if set,
 *    that card's own sub-limit (still derived from transactions by the
 *    caller and passed in as `cardUsage`).
 */
export class MovementPolicy {
  /**
   * Validates the movement and returns its signed contribution to the
   * account's shared credit pool ("0" if it doesn't touch one). Throws the
   * relevant domain error on any rule violation.
   *
   * `card` must be supplied (already ownership-checked by the caller) when
   * `m.cardId` is set; `cardLimit`/`cardUsage` describe the card's own
   * sub-limit (if any) and its currently used amount excluding this
   * transaction — required only when `card.kind === "CREDIT"`.
   */
  static validate(
    m: EffectiveMovement,
    account: AccountContext,
    card: CardContext | null,
    cardLimit: CardLimitContext | null,
    cardUsage: { income: string; expense: string },
    poolOffset = "0",
  ): string {
    if (m.type === "INCOME") {
      if (m.cardId) throw new CardNotAllowedError();
    } else if (account.type === "CASH") {
      if (m.cardId) throw new CardNotAllowedError();
      return "0";
    } else if (account.type === "CREDIT_LINE") {
      if (!m.cardId) throw new CardRequiredError();
      if (!card) throw new CardAccountMismatchError();
      this.assertWithinCardLimit(m, cardLimit, cardUsage);
    } else if (m.cardId) {
      if (!card) throw new CardAccountMismatchError();
      if (card.kind === "CREDIT") {
        this.assertWithinCardLimit(m, cardLimit, cardUsage);
      } else {
        return "0";
      }
    } else {
      return "0";
    }

    const contribution = this.contribution(m, account, card, cardLimit);
    if (contribution === "0") return "0";
    const projected = toMoney(account.creditUsed)
      .minus(toMoney(poolOffset))
      .plus(toMoney(contribution));
    if (projected.greaterThan(toMoney(account.creditLimit))) {
      throw new CardLimitExceededError();
    }
    return contribution;
  }

  /**
   * A movement's signed contribution to its account's shared credit pool
   * ("0" if it doesn't touch one): +amount for an EXPENSE via a pool-sharing
   * CREDIT card, −amount for INCOME on a standalone CREDIT_LINE account (its
   * only way to record a payment), "0" for a card with its own independent
   * sub-limit (that stays out of the account pool). Never throws — also used
   * to recompute a transaction's ORIGINAL contribution on edit/delete, which
   * must always be revertible even if limits shrank since.
   */
  static contribution(
    m: { type: transactions.TransactionType; amount: string },
    account: Pick<AccountContext, "type">,
    card: CardContext | null,
    cardLimit: CardLimitContext | null,
  ): string {
    if (account.type === "CASH") return "0";
    if (m.type === "INCOME") {
      return account.type === "CREDIT_LINE" ? subtractMoney("0", m.amount) : "0";
    }
    if (!card || card.kind !== "CREDIT") return "0";
    return cardLimit ? "0" : m.amount;
  }

  /**
   * A card's own sub-limit (if set, for this currency) is a narrower cap on
   * top of the account pool — scoped to the same billing cycle as the
   * account (`cardUsage` is pre-scoped by the caller).
   */
  static assertWithinCardLimit(
    m: { amount: string },
    cardLimit: CardLimitContext | null,
    cardUsage: { income: string; expense: string },
  ): void {
    if (!cardLimit) return;
    const used = subtractMoney(
      addMoney(cardLimit.usedInitial, cardUsage.expense),
      cardUsage.income,
    );
    const projected = toMoney(used).plus(toMoney(m.amount));
    if (projected.greaterThan(toMoney(cardLimit.limitAmount))) {
      throw new CardSubLimitExceededError();
    }
  }
}
