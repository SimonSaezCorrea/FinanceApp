import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, Transaction as TransactionRow } from "@prisma/client";

import { transactions } from "@finance/contracts";
import { addMoney, moneyToString, subtractMoney, toMoney } from "@finance/money";

import { currentCycleStart } from "../accounts/billing-cycle";
import { TransactionsRepository } from "./transactions.repository";

/** Effective movement fields used to validate rules + enforce credit limits. */
interface EffectiveMovement {
  type: transactions.TransactionType;
  bankAccountId: string;
  cardId?: string | null;
  amount: string;
  currency: string;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly repo: TransactionsRepository) {}

  async list(
    userId: string,
    filters: transactions.TransactionFilters,
  ): Promise<transactions.Transaction[]> {
    const where: Omit<Prisma.TransactionWhereInput, "userId"> = {};
    if (filters.type) where.type = filters.type;
    if (filters.bankAccountId) where.bankAccountId = filters.bankAccountId;
    if (filters.cardId) where.cardId = filters.cardId;
    if (filters.from || filters.to) {
      where.occurredAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    const rows = await this.repo.list(userId, where);
    return rows.map(toContract);
  }

  async get(userId: string, id: string): Promise<transactions.Transaction> {
    const row = await this.repo.findOne(userId, id);
    if (!row) throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    return toContract(row);
  }

  async create(
    userId: string,
    input: transactions.CreateTransaction,
  ): Promise<transactions.Transaction> {
    const creditPoolDelta = await this.validateMovement(userId, {
      type: input.type,
      bankAccountId: input.bankAccountId,
      cardId: input.cardId,
      amount: input.amount,
      currency: input.currency,
    });
    // Contributing movements link live to whichever billing period is currently OPEN
    // for the account — creates one if this is the first contribution since the last
    // close (see `CreditStatement`).
    const creditStatementId =
      creditPoolDelta !== "0"
        ? (await this.repo.findOrCreateOpenStatement(input.bankAccountId)).id
        : null;
    const row = await this.repo.create(userId, {
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      occurredAt: new Date(input.occurredAt),
      category: input.category,
      description: input.description,
      observation: input.observation,
      emisor: input.emisor,
      receptor: input.receptor,
      lugar: input.lugar,
      bankAccountId: input.bankAccountId,
      cardId: input.type === "INCOME" ? null : (input.cardId ?? null),
      creditStatementId,
    });
    if (creditPoolDelta !== "0") {
      await this.repo.adjustCreditUsed(input.bankAccountId, creditPoolDelta);
    }
    return toContract(row);
  }

  async update(
    userId: string,
    id: string,
    input: transactions.UpdateTransaction,
  ): Promise<transactions.Transaction> {
    const current = await this.repo.findOne(userId, id);
    if (!current) throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });

    // Merge patch over current to get the effective movement, then re-validate
    // and enforce (excluding this tx's own contribution to the pool).
    const effectiveType = input.type ?? current.type;
    const effective: EffectiveMovement = {
      type: effectiveType,
      bankAccountId: input.bankAccountId ?? current.bankAccountId ?? "",
      // Switching to INCOME always drops the card (mirrors the `data.card` write
      // below) — otherwise a patch that only changes `type` would validate against
      // the tx's *old* cardId and wrongly reject with CARD_NOT_ALLOWED.
      cardId: effectiveType === "INCOME" ? undefined : (input.cardId ?? current.cardId),
      amount: input.amount ?? current.amount.toString(),
      currency: input.currency ?? current.currency,
    };

    // What the ORIGINAL row currently contributes to its account's credit pool —
    // computed the same way as a fresh movement, but never throws (a previously
    // valid tx must always be revertible even if limits shrank since).
    const oldAccountId = current.bankAccountId;
    const oldContribution = oldAccountId
      ? await this.creditPoolContribution(userId, oldAccountId, current.cardId, current.currency, {
          type: current.type,
          amount: current.amount.toString(),
        })
      : "0";
    // Once a transaction's billing period is PAID, its pool effect is already
    // settled — editing it must never touch `creditUsed` or its statement link
    // again (same "no cascade" rule as correcting a paid statement's amount).
    const oldLinkedToPaid = current.creditStatementId
      ? await this.repo.isStatementPaid(current.creditStatementId)
      : false;

    let newContribution = "0";
    if (effective.bankAccountId) {
      const sameAccount = effective.bankAccountId === oldAccountId;
      newContribution = await this.validateMovement(
        userId,
        effective,
        id,
        sameAccount ? oldContribution : "0",
      );
    }

    const data: Prisma.TransactionUpdateInput = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.occurredAt !== undefined) data.occurredAt = new Date(input.occurredAt);
    if (input.category !== undefined) data.category = input.category;
    if (input.description !== undefined) data.description = input.description;
    if (input.observation !== undefined) data.observation = input.observation;
    if (input.emisor !== undefined) data.emisor = input.emisor;
    if (input.receptor !== undefined) data.receptor = input.receptor;
    if (input.lugar !== undefined) data.lugar = input.lugar;
    if (input.bankAccountId !== undefined) {
      data.bankAccount = { connect: { id: input.bankAccountId } };
    }
    // Keep card consistent with the effective type (income never carries a card).
    if (input.cardId !== undefined || input.type !== undefined) {
      const nextCard = effective.type === "INCOME" ? null : (effective.cardId ?? null);
      data.card = nextCard ? { connect: { id: nextCard } } : { disconnect: true };
    }

    // Re-link (or unlink) the billing period this movement contributes to, unless
    // it's already settled by a paid statement (left untouched in that case).
    if (!oldLinkedToPaid) {
      const sameAccount = effective.bankAccountId === oldAccountId;
      if (sameAccount && oldContribution === "0" && newContribution !== "0") {
        const stmt = await this.repo.findOrCreateOpenStatement(oldAccountId!);
        data.creditStatement = { connect: { id: stmt.id } };
      } else if (sameAccount && oldContribution !== "0" && newContribution === "0") {
        data.creditStatement = { disconnect: true };
      } else if (!sameAccount) {
        if (newContribution !== "0" && effective.bankAccountId) {
          const stmt = await this.repo.findOrCreateOpenStatement(effective.bankAccountId);
          data.creditStatement = { connect: { id: stmt.id } };
        } else if (oldContribution !== "0") {
          data.creditStatement = { disconnect: true };
        }
      }
      // else: still contributing to the same account — stays linked to whatever
      // statement it was originally assigned to ("se va llenando", no reassignment).
    }

    const row = await this.repo.update(userId, id, data);
    if (!row) throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });

    if (!oldLinkedToPaid) {
      // Apply the net effect on whichever account(s) held a contribution — same
      // account nets to one delta, a cross-account move reverts the old one and
      // applies the new one independently.
      if (oldAccountId && effective.bankAccountId === oldAccountId) {
        const netDelta = subtractMoney(newContribution, oldContribution);
        if (netDelta !== "0") await this.repo.adjustCreditUsed(oldAccountId, netDelta);
      } else {
        if (oldAccountId && oldContribution !== "0") {
          await this.repo.adjustCreditUsed(oldAccountId, subtractMoney("0", oldContribution));
        }
        if (effective.bankAccountId && newContribution !== "0") {
          await this.repo.adjustCreditUsed(effective.bankAccountId, newContribution);
        }
      }
    }
    return toContract(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const current = await this.repo.findOne(userId, id);
    if (!current) throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    const linkedToPaid = current.creditStatementId
      ? await this.repo.isStatementPaid(current.creditStatementId)
      : false;
    const contribution =
      !linkedToPaid && current.bankAccountId
        ? await this.creditPoolContribution(userId, current.bankAccountId, current.cardId, current.currency, {
            type: current.type,
            amount: current.amount.toString(),
          })
        : "0";
    const ok = await this.repo.remove(userId, id);
    if (!ok) throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    if (!linkedToPaid && current.bankAccountId && contribution !== "0") {
      await this.repo.adjustCreditUsed(current.bankAccountId, subtractMoney("0", contribution));
    }
  }

  /**
   * Movement rules (spec 007, revised — plus per-card sub-limits): a "standalone
   * credit card" is an account of type CREDIT_LINE whose credit pool lives on the
   * account; but ANY cardable account can grow a CREDIT-kind card (e.g. a checking
   * account's add-on credit card), in which case the SAME account-level pool
   * applies to it too. Individual cards may additionally carry their own narrower
   * sub-limit (one per currency) — the account pool is always the master/shared
   * cap; a card's sub-limit, if set, is an extra, tighter cap on top of it.
   *  - bank must exist (scoped to user)
   *  - INCOME: no card
   *  - EXPENSE on CASH: no card
   *  - EXPENSE on CREDIT_LINE: a card of that account is required
   *  - EXPENSE on other accounts: card optional, but if given it must belong
   *  - Whenever the card used is kind=CREDIT: the amount must fit both the
   *    account's shared pool (creditLimit, persisted `creditUsed`) and, if set,
   *    that card's own sub-limit (still derived from transactions).
   *
   * Returns this movement's signed contribution to its account's credit pool
   * ("0" if it doesn't touch one) — the caller applies it to `creditUsed`.
   */
  private async validateMovement(
    userId: string,
    m: EffectiveMovement,
    excludeTxId?: string,
    poolOffset = "0",
  ): Promise<string> {
    const account = await this.repo.findAccount(userId, m.bankAccountId);
    if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });

    if (m.type === "INCOME") {
      if (m.cardId) throw new BadRequestException({ code: "CARD_NOT_ALLOWED" });
    } else if (account.type === "CASH") {
      if (m.cardId) throw new BadRequestException({ code: "CARD_NOT_ALLOWED" });
      return "0";
    } else if (account.type === "CREDIT_LINE") {
      if (!m.cardId) throw new BadRequestException({ code: "CARD_REQUIRED" });
      await this.assertCardBelongs(userId, m.cardId, m.bankAccountId);
      await this.assertWithinCardLimit(
        userId,
        m.cardId,
        m,
        account.billingSettings?.billingCycleDay ?? null,
        excludeTxId,
      );
    } else if (m.cardId) {
      // Other non-cash accounts: card optional, but a CREDIT-kind card still
      // draws on the account's shared pool + its own sub-limit.
      const card = await this.assertCardBelongs(userId, m.cardId, m.bankAccountId);
      if (card.kind === "CREDIT") {
        await this.assertWithinCardLimit(
        userId,
        m.cardId,
        m,
        account.billingSettings?.billingCycleDay ?? null,
        excludeTxId,
      );
      } else {
        return "0";
      }
    } else {
      return "0";
    }

    const contribution = await this.creditPoolContribution(
      userId,
      account.id,
      account.type === "CASH" ? null : (m.cardId ?? null),
      m.currency,
      m,
    );
    if (contribution === "0") return "0";
    const projected = toMoney(account.creditUsed.toString())
      .minus(toMoney(poolOffset))
      .plus(toMoney(contribution));
    if (projected.greaterThan(toMoney(account.creditLimit.toString()))) {
      throw new BadRequestException({ code: "CARD_LIMIT_EXCEEDED" });
    }
    return contribution;
  }

  private async assertCardBelongs(userId: string, cardId: string, accountId: string) {
    const card = await this.repo.findCardInAccount(userId, cardId, accountId);
    if (!card) throw new BadRequestException({ code: "CARD_ACCOUNT_MISMATCH" });
    return card;
  }

  /**
   * A movement's signed contribution to its account's shared credit pool
   * ("0" if it doesn't touch one): +amount for an EXPENSE via a pool-sharing
   * CREDIT card, −amount for INCOME on a standalone CREDIT_LINE account (its
   * only way to record a payment), "0" for a card with its own independent
   * `CardLimit` (that stays out of the account pool). No throwing — also used
   * to recompute a transaction's ORIGINAL contribution on edit/delete, which
   * must always be revertible even if limits shrank since.
   */
  private async creditPoolContribution(
    userId: string,
    accountId: string,
    cardId: string | null,
    currency: string,
    m: { type: transactions.TransactionType; amount: string },
  ): Promise<string> {
    const account = await this.repo.findAccount(userId, accountId);
    if (!account || account.type === "CASH") return "0";
    if (m.type === "INCOME") {
      return account.type === "CREDIT_LINE" ? subtractMoney("0", m.amount) : "0";
    }
    if (!cardId) return "0";
    const card = await this.repo.findCardInAccount(userId, cardId, accountId);
    if (!card || card.kind !== "CREDIT") return "0";
    const limit = await this.repo.findCardLimit(userId, cardId, currency);
    return limit ? "0" : m.amount;
  }

  /**
   * A card's own sub-limit (if set, for this currency) is a narrower cap on
   * top of the account pool — scoped to the SAME billing cycle as the account
   * (one statement covers every card sharing it).
   */
  private async assertWithinCardLimit(
    userId: string,
    cardId: string,
    m: EffectiveMovement,
    billingCycleDay: number | null,
    excludeTxId?: string,
  ): Promise<void> {
    const limit = await this.repo.findCardLimit(userId, cardId, m.currency);
    if (!limit) return;
    const since = currentCycleStart(billingCycleDay, new Date());
    const { income, expense } = await this.repo.sumsForCard(
      userId,
      cardId,
      m.currency,
      since,
      excludeTxId,
    );
    const used = subtractMoney(addMoney(limit.usedInitial.toString(), expense), income);
    const projected = toMoney(used).plus(toMoney(m.amount));
    if (projected.greaterThan(toMoney(limit.limitAmount.toString()))) {
      throw new BadRequestException({ code: "CARD_SUBLIMIT_EXCEEDED" });
    }
  }
}

function toContract(row: TransactionRow): transactions.Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: moneyToString(row.amount.toString()),
    currency: row.currency,
    occurredAt: row.occurredAt.toISOString(),
    category: row.category,
    description: row.description,
    observation: row.observation,
    emisor: row.emisor,
    receptor: row.receptor,
    lugar: row.lugar,
    bankAccountId: row.bankAccountId,
    cardId: row.cardId,
    installmentPlanId: row.installmentPlanId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
