import { Inject, Injectable } from "@nestjs/common";

import type { accounts } from "@finance/contracts";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  ACCOUNT_CREDIT_LIMIT_REPOSITORY,
  type AccountCreditLimitRepositoryPort,
} from "../../account-credit-limit/domain/ports/account-credit-limit.repository.port";
import {
  BILLING_SETTINGS_REPOSITORY,
  type BillingSettingsRepositoryPort,
} from "../../billing-settings/domain/ports/billing-settings.repository.port";
import type { CardProps } from "../../card-account/domain/card-account.entity";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../card-account/domain/ports/card-account.repository.port";
import {
  FINANCIAL_INSTITUTION_LOOKUP,
  type FinancialInstitutionLookupPort,
} from "../../financial-institution/domain/ports/financial-institution-lookup.port";
import { BankAccount, type BankAccountProps } from "../domain/bank-account.aggregate";
import type {
  BankAccountRepositoryPort,
  CreateAccountPlan,
  CreateCardPlan,
} from "../domain/ports/bank-account.repository.port";

type Row = {
  id: string;
  userId: string;
  name: string;
  type: BankAccountProps["type"];
  status: BankAccountProps["status"];
  currency: string;
  institution: string | null;
  institutionId: string | null;
  accountNumber: string | null;
  accountAlias: string | null;
  initialBalance: { toString(): string };
  overdraftLimit: { toString(): string };
  balanceCeiling: { toString(): string } | null;
  currentBalance: { toString(): string };
  creditLimit: { toString(): string };
  creditUsedInitial: { toString(): string };
  creditUsed: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Adapter — the ONLY file that touches `prisma.bankAccount`. Everything a
 * hydrated `BankAccount` needs from another table is fetched through that
 * table's own port (`card-account`, `billing-settings`, `financial-institution`),
 * never with a Prisma `include` reaching across the boundary.
 */
@Injectable()
export class PrismaBankAccountRepository implements BankAccountRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(BILLING_SETTINGS_REPOSITORY) private readonly billing: BillingSettingsRepositoryPort,
    @Inject(FINANCIAL_INSTITUTION_LOOKUP)
    private readonly institutions: FinancialInstitutionLookupPort,
    @Inject(ACCOUNT_CREDIT_LIMIT_REPOSITORY)
    private readonly creditLines: AccountCreditLimitRepositoryPort,
  ) {}

  /** Composes the child tables' own adapters into whole aggregates. */
  private async hydrate(rows: Row[]): Promise<BankAccount[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [cards, settings, institutionNames, lines] = await Promise.all([
      this.cards.listByAccounts(ids),
      this.billing.listByAccounts(ids),
      this.institutions.namesByIds(rows.flatMap((r) => (r.institutionId ? [r.institutionId] : []))),
      this.creditLines.listByAccounts(ids),
    ]);
    return rows.map((row) => {
      const accountCards: CardProps[] = cards
        .filter((c) => c.accountId === row.id)
        .map(({ accountId: _accountId, ...card }) => card);
      const accountSettings = settings.find((s) => s.accountId === row.id);
      return BankAccount.fromPersistence({
        id: row.id,
        userId: row.userId,
        name: row.name,
        type: row.type,
        status: row.status,
        currency: row.currency,
        institution: row.institution,
        institutionId: row.institutionId ?? null,
        institutionName: row.institutionId
          ? (institutionNames.get(row.institutionId) ?? null)
          : null,
        accountNumber: row.accountNumber ?? null,
        accountAlias: row.accountAlias ?? null,
        initialBalance: row.initialBalance.toString(),
        overdraftLimit: row.overdraftLimit.toString(),
        balanceCeiling: row.balanceCeiling?.toString() ?? null,
        currentBalance: row.currentBalance.toString(),
        creditLimit: row.creditLimit.toString(),
        creditUsedInitial: row.creditUsedInitial.toString(),
        creditUsed: row.creditUsed.toString(),
        billingCycleDay: accountSettings?.billingCycleDay ?? null,
        billingCycleType: accountSettings?.cycleType ?? "BUSINESS_DAY",
        paymentMethod: accountSettings?.paymentMethod ?? "MANUAL",
        paymentDueDay: accountSettings?.paymentDueDay ?? null,
        paymentDueCycleType: accountSettings?.paymentDueCycleType ?? "BUSINESS_DAY",
        minimumPaymentPercent: accountSettings?.minimumPaymentPercent ?? null,
        extraCreditLimits: lines
          .filter((l) => l.accountId === row.id)
          .map(({ accountId: _accountId, ...line }) => line),
        cards: accountCards,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    });
  }

  async findById(userId: string, id: string): Promise<BankAccount | null> {
    const row = await this.prisma.bankAccount.findFirst({ where: { id, userId } });
    if (!row) return null;
    const [aggregate] = await this.hydrate([row]);
    return aggregate ?? null;
  }

  async findByIdForUpdateWithTx(
    tx: unknown,
    userId: string,
    id: string,
  ): Promise<BankAccount | null> {
    const client = tx as PrismaService;
    const locked = await client.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "bank-account" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE
    `;
    if (locked.length === 0) return null;
    return this.findById(userId, id);
  }

  async listByUser(
    userId: string,
    where: { status?: "ACTIVE" | "INACTIVE" },
  ): Promise<BankAccount[]> {
    const rows = await this.prisma.bankAccount.findMany({
      where: { ...where, userId },
      orderBy: { createdAt: "desc" },
    });
    return this.hydrate(rows);
  }

  countByType(userId: string, type: accounts.AccountType): Promise<number> {
    return this.prisma.bankAccount.count({ where: { userId, type } });
  }

  institutionName(id: string): Promise<string | null> {
    return this.institutions.nameById(id);
  }
  institutionCountry(id: string): Promise<string | null> {
    return this.institutions.countryAlpha2ById(id);
  }

  async createWithCards(userId: string, plan: CreateAccountPlan): Promise<BankAccount> {
    const { id } = await this.createWithCardsWithTx(this.prisma, userId, plan);
    const fresh = await this.findById(userId, id);
    if (!fresh) throw new Error("account disappeared right after being created");
    return fresh;
  }

  async createWithCardsWithTx(
    tx: unknown,
    userId: string,
    plan: CreateAccountPlan & { minimumPaymentPercent?: string | null },
  ): Promise<{ id: string; cardIds: string[] }> {
    const client = tx as PrismaService;
    const row = await client.bankAccount.create({
      data: {
        userId,
        name: plan.name,
        type: plan.type,
        status: plan.status,
        currency: plan.currency,
        institution: plan.institution,
        institutionId: plan.institutionId,
        accountNumber: plan.accountNumber,
        initialBalance: plan.initialBalance,
        currentBalance: plan.initialBalance,
        overdraftLimit: plan.overdraftLimit,
        balanceCeiling: plan.balanceCeiling,
        creditLimit: plan.creditLimit,
        creditUsedInitial: plan.creditUsedInitial,
        creditUsed: plan.creditUsedInitial,
      },
    });
    await this.creditLines.createForAccountWithTx(tx, row.id, plan.extraCreditLimits ?? []);
    const cardIds: string[] = [];
    for (const card of plan.cards) {
      cardIds.push(await this.cards.createWithTx(tx, userId, row.id, card));
    }
    await this.billing.upsertWithTx(tx, row.id, {
      billingCycleDay: plan.billingCycleDay,
      cycleType: plan.billingCycleType,
      paymentMethod: plan.paymentMethod,
      paymentDueDay: plan.paymentDueDay,
      paymentDueCycleType: plan.paymentDueCycleType,
      ...(plan.minimumPaymentPercent != null
        ? { minimumPaymentPercent: plan.minimumPaymentPercent }
        : {}),
    });
    return { id: row.id, cardIds };
  }

  async setStatusWithTx(
    tx: unknown,
    accountId: string,
    status: accounts.AccountStatus,
  ): Promise<void> {
    await (tx as PrismaService).bankAccount.update({ where: { id: accountId }, data: { status } });
  }

  async save(aggregate: BankAccount): Promise<void> {
    await this.saveWithTx(this.prisma, aggregate);
  }

  async saveWithTx(tx: unknown, aggregate: BankAccount): Promise<void> {
    const client = tx as PrismaService;
    const snap = aggregate.snapshot();
    await client.bankAccount.update({
      where: { id: snap.id },
      data: {
        name: snap.name,
        type: snap.type,
        status: snap.status,
        currency: snap.currency,
        institution: snap.institution,
        institutionId: snap.institutionId,
        accountNumber: snap.accountNumber,
        accountAlias: snap.accountAlias,
        initialBalance: snap.initialBalance,
        overdraftLimit: snap.overdraftLimit,
        balanceCeiling: snap.balanceCeiling,
        currentBalance: snap.currentBalance,
        creditLimit: snap.creditLimit,
        creditUsedInitial: snap.creditUsedInitial,
        creditUsed: snap.creditUsed,
      },
    });
    await this.creditLines.replaceForAccountWithTx(
      client,
      snap.id,
      (snap.extraCreditLimits ?? []).map((l) => ({
        currency: l.currency,
        limitAmount: l.limitAmount,
        usedInitial: l.usedInitial,
      })),
    );
    await this.billing.upsertWithTx(client, snap.id, {
      billingCycleDay: snap.billingCycleDay,
      cycleType: snap.billingCycleType,
      paymentMethod: snap.paymentMethod,
      paymentDueDay: snap.paymentDueDay,
      paymentDueCycleType: snap.paymentDueCycleType,
      minimumPaymentPercent: snap.minimumPaymentPercent,
    });
  }

  async incrementBalanceWithTx(tx: unknown, accountId: string, delta: string): Promise<void> {
    const client = tx as PrismaService;
    await client.bankAccount.update({
      where: { id: accountId },
      data: { currentBalance: { increment: delta } },
    });
  }

  async adjustOpeningWithTx(
    tx: unknown,
    accountId: string,
    balanceDelta: string,
    creditDelta: string,
  ): Promise<void> {
    const client = tx as PrismaService;
    await client.bankAccount.update({
      where: { id: accountId },
      data: {
        initialBalance: { increment: balanceDelta },
        creditUsedInitial: { increment: creditDelta },
      },
    });
  }

  async incrementCreditUsedWithTx(tx: unknown, accountId: string, delta: string): Promise<void> {
    const client = tx as PrismaService;
    await client.bankAccount.update({
      where: { id: accountId },
      data: { creditUsed: { increment: delta } },
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.bankAccount.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async removeWithTx(tx: unknown, userId: string, id: string): Promise<boolean> {
    const client = tx as PrismaService;
    const result = await client.bankAccount.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async addCard(userId: string, accountId: string, plan: CreateCardPlan): Promise<BankAccount> {
    await this.cards.create(userId, accountId, plan);
    const fresh = await this.findById(userId, accountId);
    if (!fresh) throw new Error("account disappeared while adding a card");
    return fresh;
  }

  async updateCard(
    userId: string,
    accountId: string,
    cardId: string,
    plan: CreateCardPlan,
  ): Promise<BankAccount | null> {
    const existing = await this.cards.findOnAccount(userId, accountId, cardId);
    if (!existing) return null;
    await this.cards.update(cardId, plan);
    return this.findById(userId, accountId);
  }

  removeCard(userId: string, accountId: string, cardId: string): Promise<boolean> {
    return this.cards.remove(userId, accountId, cardId);
  }

  async saveCardRolesWithTx(tx: unknown, aggregate: BankAccount): Promise<void> {
    // Cards that stop being primary are written first: the one-primary-per-account index
    // must never see two at once.
    const cards = [...aggregate.cards].sort((a, b) => Number(a.isPrimary) - Number(b.isPrimary));
    for (const card of cards) {
      await this.cards.updateRoleWithTx(tx, card.id, {
        isPrimary: card.isPrimary,
        isActive: card.isActive,
        limits: card.limits.map((l) => ({
          currency: l.currency,
          limitAmount: l.limitAmount,
          usedInitial: l.usedInitial,
        })),
      });
    }
  }

  addCardWithTx(
    tx: unknown,
    userId: string,
    accountId: string,
    plan: CreateCardPlan,
  ): Promise<string> {
    return this.cards.createWithTx(tx, userId, accountId, plan);
  }

  removeCardWithTx(
    tx: unknown,
    userId: string,
    accountId: string,
    cardId: string,
  ): Promise<boolean> {
    return this.cards.removeWithTx(tx, userId, accountId, cardId);
  }

  async countForUser(userId: string): Promise<number> {
    return this.prisma.bankAccount.count({ where: { userId } });
  }

  async deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void> {
    await (tx as PrismaService).bankAccount.deleteMany({ where: { userId } });
  }
}
