import type { accounts, transactions } from "@finance/contracts";
import { addMoney, subtractMoney, toMoney } from "@finance/money";

import {
  CardAccountMismatchError,
  CardLimitExceededError,
  CardNotAllowedError,
  CardRequiredError,
  CardSubLimitExceededError,
  BalanceCeilingExceededError,
  OverdraftLimitExceededError,
  PrepaidInsufficientBalanceError,
} from "./errors";

/** Effective movement fields used to validate rules + enforce credit limits. */
export interface EffectiveMovement {
  /** Issuer charge on the account itself; see `MovementPolicy.validate`. */
  financeCharge?: boolean;
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
  /** What the account currently holds. Only a PREPAID account is BOUNDED by it
   * (it can never go negative); every other type may. */
  currentBalance: string;
  /** How far below zero this account may go ("0" = no line configured). */
  overdraftLimit?: string;
  /** The most it may hold (null = no ceiling declared). */
  balanceCeiling?: string | null;
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
 *  - EXPENSE on CREDIT_CARD: a card of that account is required
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
    /** On an edit, what this same movement already took off the account's balance —
     * so re-saving it doesn't check against a balance that still carries its own
     * old charge. */
    prepaidOffset = "0",
  ): string {
    // A prepaid account can only spend what was provisioned into it, whatever the
    // channel: with a card, without one, or as the outgoing leg of a transfer.
    this.assertWithinPrepaidBalance(m, account, prepaidOffset);
    // A cash account may go negative only as far as its overdraft line allows.
    this.assertWithinOverdraft(m, account, prepaidOffset);
    // ...and only hold as much as its ceiling allows, where one is declared.
    this.assertWithinCeiling(m, account, prepaidOffset);

    if (m.type === "INCOME") {
      if (m.cardId) throw new CardNotAllowedError();
    } else if (account.type === "CASH") {
      if (m.cardId) throw new CardNotAllowedError();
      return "0";
    } else if (account.type === "CREDIT_CARD") {
      // An issuer charge (interest, annual fee, insurance) is applied to the
      // ACCOUNT: no card made it, so requiring one would make it unrecordable —
      // and then the carried-over balance could never match the bank's.
      if (m.financeCharge) {
        if (m.cardId) throw new CardNotAllowedError();
        return m.amount;
      }
      if (!m.cardId) throw new CardRequiredError();
      if (!card) throw new CardAccountMismatchError();
      this.assertWithinCardLimit(m, cardLimit, cardUsage);
    } else if (m.cardId) {
      if (!card) throw new CardAccountMismatchError();
      if (card.kind === "PREPAID") return "0";
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
   * CREDIT card, −amount for INCOME on a standalone CREDIT_CARD account (its
   * only way to record a payment), "0" for a card with its own independent
   * sub-limit (that stays out of the account pool). Never throws — also used
   * to recompute a transaction's ORIGINAL contribution on edit/delete, which
   * must always be revertible even if limits shrank since.
   */
  static contribution(
    m: { type: transactions.TransactionType; amount: string; financeCharge?: boolean },
    account: Pick<AccountContext, "type">,
    card: CardContext | null,
    cardLimit: CardLimitContext | null,
  ): string {
    if (account.type === "CASH") return "0";
    if (m.type === "INCOME") {
      return account.type === "CREDIT_CARD" ? subtractMoney("0", m.amount) : "0";
    }
    // Same rule as `validate`, kept in step so an edit/delete reverts exactly
    // what the movement contributed.
    if (m.financeCharge) return account.type === "CREDIT_CARD" ? m.amount : "0";
    if (!card || card.kind !== "CREDIT") return "0";
    return cardLimit ? "0" : m.amount;
  }

  /**
   * A prepaid account can only spend what was provisioned into it. Rejected rather
   * than allowed to go negative: a prepaid product declines, it does not lend — and
   * unlike a checking account there is no overdraft behind it.
   *
   * `offset` is what this same movement already took off the balance, so an edit is
   * checked against the balance as it was BEFORE its own old charge.
   */
  /**
   * A cash account can be overdrawn only down to the line the bank granted:
   * `currentBalance - amount >= -overdraftLimit`. With no line (the default "0")
   * this is just "don't go below zero"… except that a checking account WITHOUT a
   * declared line is exactly the case where the app has no business refusing —
   * the bank may allow it and the movement really happened. So the check only
   * bites when a line is configured, and what it enforces is its ceiling.
   *
   * `offset` is what this same movement already took off the balance, so an edit
   * is checked against the balance as it was BEFORE its own old charge.
   */
  static assertWithinOverdraft(
    m: { type: transactions.TransactionType; amount: string },
    account: Pick<AccountContext, "type" | "currentBalance" | "overdraftLimit">,
    offset = "0",
  ): void {
    if (m.type !== "EXPENSE") return;
    const limit = toMoney(account.overdraftLimit ?? "0");
    if (!limit.greaterThan(0)) return;
    const available = toMoney(account.currentBalance).plus(toMoney(offset)).plus(limit);
    if (toMoney(m.amount).greaterThan(available)) {
      throw new OverdraftLimitExceededError();
    }
  }

  /**
   * Mirror image of the overdraft: an account whose balance is capped (a sight
   * account like CuentaRUT, a prepaid one) cannot receive money past the cap —
   * the bank itself would bounce the deposit. Only enforced when a ceiling IS
   * declared: without one there is nothing to compare against.
   */
  static assertWithinCeiling(
    m: { type: transactions.TransactionType; amount: string },
    account: Pick<AccountContext, "currentBalance" | "balanceCeiling">,
    offset = "0",
  ): void {
    if (m.type !== "INCOME" || account.balanceCeiling == null) return;
    const ceiling = toMoney(account.balanceCeiling);
    const resulting = toMoney(account.currentBalance)
      .minus(toMoney(offset))
      .plus(toMoney(m.amount));
    if (resulting.greaterThan(ceiling)) throw new BalanceCeilingExceededError();
  }

  static assertWithinPrepaidBalance(
    m: { type: transactions.TransactionType; amount: string },
    account: Pick<AccountContext, "type" | "currentBalance">,
    offset = "0",
  ): void {
    if (account.type !== "PREPAID" || m.type !== "EXPENSE") return;
    const available = toMoney(account.currentBalance).plus(toMoney(offset));
    if (toMoney(m.amount).greaterThan(available)) {
      throw new PrepaidInsufficientBalanceError();
    }
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
