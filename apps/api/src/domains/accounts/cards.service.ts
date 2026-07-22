import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CardAccount as CardRow, CardLimit as CardLimitRow } from "@prisma/client";

import { accounts } from "@finance/contracts";
import { addMoney, moneyToString, subtractMoney, toMoney } from "@finance/money";

import { AccountsRepository } from "./accounts.repository";
import { CardsRepository } from "./cards.repository";

type CardWithLimits = CardRow & { limits: CardLimitRow[] };
type LimitInsert = { currency: string; limitAmount: string; usedInitial: string };

@Injectable()
export class CardsService {
  constructor(
    private readonly repo: CardsRepository,
    private readonly accountsRepo: AccountsRepository,
  ) {}

  async create(
    userId: string,
    accountId: string,
    input: accounts.CreateCard,
  ): Promise<accounts.Card> {
    const account = await this.repo.accountExists(userId, accountId);
    if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    if (!accounts.isCardableAccountType(account.type)) {
      throw new BadRequestException({ code: "ACCOUNT_CANNOT_HAVE_CARD" });
    }
    const { isPrimary, cardLimits } = await this.resolveCreditLimits(
      userId,
      accountId,
      account,
      input,
      null,
    );
    const row = await this.repo.create(
      userId,
      accountId,
      {
        name: input.name,
        kind: input.kind,
        last4: input.last4,
        expiryMonth: input.expiryMonth,
        expiryYear: input.expiryYear,
        isActive: input.isActive ?? true,
        isPrimary,
      },
      cardLimits,
    );
    return this.toContractWithUsage(userId, row, account.currency, account.billingCycleDay);
  }

  async update(
    userId: string,
    accountId: string,
    cardId: string,
    input: accounts.CreateCard,
  ): Promise<accounts.Card> {
    const account = await this.repo.accountExists(userId, accountId);
    if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    const { isPrimary, cardLimits } = await this.resolveCreditLimits(
      userId,
      accountId,
      account,
      input,
      cardId,
    );
    const row = await this.repo.update(
      userId,
      accountId,
      cardId,
      {
        name: input.name,
        kind: input.kind,
        last4: input.last4,
        expiryMonth: input.expiryMonth,
        expiryYear: input.expiryYear,
        isActive: input.isActive ?? true,
        isPrimary,
      },
      cardLimits,
    );
    if (!row) throw new NotFoundException({ code: "CARD_NOT_FOUND" });
    return this.toContractWithUsage(userId, row, account.currency, account.billingCycleDay);
  }

  async remove(userId: string, accountId: string, cardId: string): Promise<void> {
    const ok = await this.repo.remove(userId, accountId, cardId);
    if (!ok) throw new NotFoundException({ code: "CARD_NOT_FOUND" });
  }

  /**
   * Works out whether this CREDIT card is/becomes the account's PRIMARY (the
   * account's own creditLimit/creditUsedInitial mirror its limit 1:1, updated
   * here), or an additional card that either shares the account pool (no
   * CardLimit rows) or carries its own sub-limit ("tope propio"). Non-CREDIT
   * cards never have a pool concept. `selfCardId` excludes the card being
   * edited from the "does a primary already exist" check.
   */
  private async resolveCreditLimits(
    userId: string,
    accountId: string,
    account: {
      creditLimit: { toString(): string };
      creditUsedInitial: { toString(): string };
      currency: string;
    },
    input: accounts.CreateCard,
    selfCardId: string | null,
  ): Promise<{ isPrimary: boolean; cardLimits: LimitInsert[] }> {
    if (input.kind !== "CREDIT") {
      return { isPrimary: false, cardLimits: [] };
    }

    const existingPrimary = await this.repo.findPrimaryCreditCard(
      userId,
      accountId,
      selfCardId ?? undefined,
    );

    // Editing the account's own current primary card and no new usedInitial was
    // given: preserve the account's existing seed baseline instead of zeroing it
    // out — the UI never surfaces this field, so an omission here means "unchanged".
    const isEditingCurrentPrimary = selfCardId != null && !existingPrimary;
    const fallbackUsedInitial = isEditingCurrentPrimary ? account.creditUsedInitial.toString() : "0";

    if (!existingPrimary) {
      // This card becomes (or remains) the primary — its limit IS the account's own pool.
      const own = (input.limits ?? []).find((l) => l.currency === account.currency);
      if (!own || !toMoney(own.limitAmount).greaterThan(0)) {
        throw new BadRequestException({ code: "CARD_LIMIT_REQUIRED" });
      }
      await this.accountsRepo.update(userId, accountId, {
        creditLimit: own.limitAmount,
        creditUsedInitial: own.usedInitial ?? fallbackUsedInitial,
      });
      // Any OTHER currency the user also entered becomes a real CardLimit row on
      // the primary itself — an independent pool per currency, same mechanism an
      // additional card's own sub-limit uses (no FX, so never cross-checked).
      const extra = (input.limits ?? []).filter((l) => l.currency !== account.currency);
      return { isPrimary: true, cardLimits: this.normalizeLimits(extra, account) };
    }

    // An additional card: share the account pool (default) or carry its own sub-limit.
    if (input.usesAccountPool !== false) {
      return { isPrimary: false, cardLimits: [] };
    }
    if (!input.limits || input.limits.length === 0) {
      throw new BadRequestException({ code: "CARD_LIMIT_REQUIRED" });
    }
    return { isPrimary: false, cardLimits: this.normalizeLimits(input.limits, account) };
  }

  /** A card's own sub-limit currency can't promise more than the account's shared pool. */
  private normalizeLimits(
    limits: accounts.CreateCardLimit[],
    account: { creditLimit: { toString(): string }; currency: string },
  ): LimitInsert[] {
    return limits.map((l) => {
      if (
        l.currency === account.currency &&
        toMoney(l.limitAmount).greaterThan(toMoney(account.creditLimit.toString()))
      ) {
        throw new BadRequestException({ code: "CARD_SUBLIMIT_EXCEEDS_ACCOUNT" });
      }
      return { currency: l.currency, limitAmount: l.limitAmount, usedInitial: l.usedInitial ?? "0" };
    });
  }

  private async toContractWithUsage(
    userId: string,
    row: CardWithLimits,
    accountCurrency: string,
    billingCycleDay: number | null,
  ): Promise<accounts.Card> {
    const sums = await this.repo.sumsByCard(userId, [{ id: row.id, billingCycleDay }]);
    const map = new Map<string, { income: string; expense: string }>();
    for (const s of sums) {
      if (!s.cardId) continue;
      const key = `${s.cardId}:${s.currency}`;
      const entry = map.get(key) ?? { income: "0", expense: "0" };
      if (s.type === "INCOME") entry.income = s.sum;
      else entry.expense = s.sum;
      map.set(key, entry);
    }
    return toContract(row, accountCurrency, map);
  }
}

export function toContract(
  row: CardWithLimits,
  accountCurrency: string,
  sums?: Map<string, { income: string; expense: string }>,
): accounts.Card {
  // This card's OWN spend in the account's own currency, regardless of
  // whether it shares the account pool or carries its own CardLimit — so a
  // pool-sharing card can show "how much did I contribute" instead of only
  // the fully-combined pool total. No seed baseline: only the account
  // (creditUsedInitial) and a CardLimit (usedInitial) have one; a pool-sharing
  // card has nowhere to store one, so pre-existing debt not tied to a
  // transaction is invisible here (it still counts in the account's own total).
  const ownSums = row.kind === "CREDIT" ? sums?.get(`${row.id}:${accountCurrency}`) : undefined;
  const ownUsed = ownSums
    ? moneyToString(subtractMoney(ownSums.expense, ownSums.income))
    : "0";
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    last4: row.last4,
    expiryMonth: row.expiryMonth,
    expiryYear: row.expiryYear,
    isActive: row.isActive,
    isPrimary: row.isPrimary,
    ownUsed,
    limits: row.limits.map((l) => {
      const s = sums?.get(`${row.id}:${l.currency}`);
      const used = subtractMoney(
        addMoney(l.usedInitial.toString(), s?.expense ?? "0"),
        s?.income ?? "0",
      );
      return {
        id: l.id,
        currency: l.currency,
        limitAmount: moneyToString(l.limitAmount.toString()),
        used: moneyToString(used),
      };
    }),
  };
}
