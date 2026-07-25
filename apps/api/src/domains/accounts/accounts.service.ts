import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  BankAccount as BankAccountRow,
  BillingSettings as BillingSettingsRow,
  CardAccount as CardRow,
  CardLimit as CardLimitRow,
  CreditStatement as CreditStatementRow,
  FinancialInstitution as InstitutionRow,
} from "@prisma/client";
import { AccountStatus, TransactionType } from "@prisma/client";

import { accounts } from "@finance/contracts";
import { addMoney, moneyToString, subtractMoney, toMoney } from "@finance/money";

import { AccountsRepository } from "./accounts.repository";
import { BillingGenerationService } from "./billing-generation.service";
import { CardsRepository } from "./cards.repository";
import { toContract as cardToContract } from "./cards.service";

type CardWithLimits = CardRow & { limits: CardLimitRow[] };

type AccountWithCards = BankAccountRow & {
  cards: CardWithLimits[];
  financialInstitution?: InstitutionRow | null;
  billingSettings?: BillingSettingsRow | null;
};

/** cardId:currency -> { income, expense } all-time sums. For each card limit's derived `used`. */
type CardSums = Map<string, { income: string; expense: string }>;

type WindowTx = {
  bankAccountId: string | null;
  type: TransactionType;
  amount: { toString(): string };
  occurredAt: Date;
};

const SERIES_DAYS = 30;
const DAY_MS = 86_400_000;

/** Reconciled balance, one point per day (oldest→newest, ends at currentBalance), + % change. */
function computeSeries(
  currentBalance: string,
  txs: WindowTx[],
  now: Date,
): { series: string[]; balanceChangePct: string | null } {
  const endOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS;
  const series: string[] = [];
  for (let i = SERIES_DAYS - 1; i >= 0; i--) {
    const boundary = endOfToday - i * DAY_MS;
    // Balance at this point = currentBalance minus the net effect of every later transaction.
    let bal = currentBalance;
    for (const t of txs) {
      if (t.occurredAt.getTime() >= boundary) {
        const amt = t.amount.toString();
        bal = t.type === TransactionType.INCOME ? subtractMoney(bal, amt) : addMoney(bal, amt);
      }
    }
    series.push(moneyToString(bal));
  }
  const first = toMoney(series[0]);
  const last = toMoney(series[series.length - 1]);
  const balanceChangePct = first.isZero()
    ? null
    : last.minus(first).div(first.abs()).times(100).toFixed(1);
  return { series, balanceChangePct };
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly repo: AccountsRepository,
    private readonly cardsRepo: CardsRepository,
    private readonly billing: BillingGenerationService,
  ) {}

  async list(userId: string, filters: accounts.AccountFilters): Promise<accounts.BankAccount[]> {
    const where = filters.status
      ? { status: filters.status === "active" ? AccountStatus.ACTIVE : AccountStatus.INACTIVE }
      : {};
    const rows = await this.repo.list(userId, where);
    return this.attachSeries(userId, rows);
  }

  async get(userId: string, id: string): Promise<accounts.BankAccount> {
    const row = await this.repo.findOne(userId, id);
    if (!row) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    return this.withSeries(userId, row);
  }

  /** Attach a per-day balance series + derived credit `used` to each account. */
  private async attachSeries(
    userId: string,
    rows: AccountWithCards[],
  ): Promise<accounts.BankAccount[]> {
    if (rows.length === 0) return [];
    const now = new Date();
    const since = new Date(now.getTime() - SERIES_DAYS * DAY_MS);
    const ids = rows.map((r) => r.id);
    const txs = (await this.repo.txWindow(userId, ids, since)) as WindowTx[];
    const byAccount = new Map<string, WindowTx[]>();
    for (const t of txs) {
      if (t.bankAccountId === null) continue;
      const bucket = byAccount.get(t.bankAccountId) ?? [];
      bucket.push(t);
      byAccount.set(t.bankAccountId, bucket);
    }
    // Same, but per (card, currency) — for each card's own optional sub-limit's derived `used`.
    // A card has no billing day of its own — it inherits its account's.
    const cardsInfo = rows.flatMap((r) =>
      r.cards.map((c) => ({ id: c.id, billingCycleDay: r.billingSettings?.billingCycleDay ?? null })),
    );
    const cardSums: CardSums = new Map();
    for (const s of await this.cardsRepo.sumsByCard(userId, cardsInfo)) {
      if (!s.cardId) continue;
      const key = `${s.cardId}:${s.currency}`;
      const entry = cardSums.get(key) ?? { income: "0", expense: "0" };
      if (s.type === "INCOME") entry.income = s.sum;
      else entry.expense = s.sum;
      cardSums.set(key, entry);
    }
    return rows.map((row) =>
      toContract(
        row,
        computeSeries(row.currentBalance.toString(), byAccount.get(row.id) ?? [], now),
        cardSums,
      ),
    );
  }

  private async withSeries(userId: string, row: AccountWithCards): Promise<accounts.BankAccount> {
    const [acc] = await this.attachSeries(userId, [row]);
    return acc;
  }

  async create(userId: string, input: accounts.CreateBankAccount): Promise<accounts.BankAccount> {
    if ((input.cards?.length ?? 0) > 0 && !accounts.isCardableAccountType(input.type)) {
      throw new BadRequestException({ code: "ACCOUNT_CANNOT_HAVE_CARD" });
    }
    const initialBalance = input.initialBalance ?? "0";
    // A linked institution drives the displayed institution name.
    const institution = input.institutionId
      ? ((await this.repo.institutionName(input.institutionId)) ?? input.institution)
      : input.institution;

    // Same primary/mandatory-limit resolution as CardsService.create, but done in
    // memory over the whole inline cards[] batch: no account/card rows exist yet
    // to query, so "does a primary already exist" is just "have we seen a CREDIT
    // card earlier in this same array" — the first one always becomes primary.
    let creditLimit = input.creditLimit ?? "0";
    let creditUsedInitial = input.creditUsedInitial ?? "0";
    let primaryAssigned = false;
    const cards = (input.cards ?? []).map((c) => {
      let isPrimary = false;
      let cardLimits: { currency: string; limitAmount: string; usedInitial: string }[] = [];
      if (c.kind === "CREDIT") {
        if (!primaryAssigned) {
          const own = (c.limits ?? []).find((l) => l.currency === input.currency);
          if (!own || !toMoney(own.limitAmount).greaterThan(0)) {
            throw new BadRequestException({ code: "CARD_LIMIT_REQUIRED" });
          }
          creditLimit = own.limitAmount;
          creditUsedInitial = own.usedInitial ?? "0";
          isPrimary = true;
          primaryAssigned = true;
          // Any OTHER currency also entered becomes a real CardLimit row on the
          // primary itself — an independent pool per currency (no FX, so never
          // cross-checked against the account's own-currency pool above).
          const extra = (c.limits ?? []).filter((l) => l.currency !== input.currency);
          cardLimits = extra.map((l) => ({
            currency: l.currency,
            limitAmount: l.limitAmount,
            usedInitial: l.usedInitial ?? "0",
          }));
        } else if (c.usesAccountPool === false) {
          if (!c.limits || c.limits.length === 0) {
            throw new BadRequestException({ code: "CARD_LIMIT_REQUIRED" });
          }
          cardLimits = c.limits.map((l) => {
            if (
              l.currency === input.currency &&
              toMoney(l.limitAmount).greaterThan(toMoney(creditLimit))
            ) {
              throw new BadRequestException({ code: "CARD_SUBLIMIT_EXCEEDS_ACCOUNT" });
            }
            return { currency: l.currency, limitAmount: l.limitAmount, usedInitial: l.usedInitial ?? "0" };
          });
        }
      }
      return {
        userId,
        name: c.name,
        kind: c.kind,
        last4: c.last4,
        expiryMonth: c.expiryMonth,
        expiryYear: c.expiryYear,
        isActive: c.isActive ?? true,
        isPrimary,
        ...(cardLimits.length > 0 ? { limits: { create: cardLimits } } : {}),
      };
    });
    const row = await this.repo.create(userId, {
      name: input.name,
      type: input.type,
      status: input.status,
      currency: input.currency,
      institution,
      institutionId: input.institutionId ?? null,
      accountNumber: input.accountNumber,
      initialBalance,
      currentBalance: initialBalance,
      creditLimit,
      creditUsedInitial,
      creditUsed: creditUsedInitial,
      ...(cards.length > 0 ? { cards: { create: cards } } : {}),
    });
    await this.repo.upsertBillingSettings(row.id, {
      billingCycleDay: input.billingCycleDay ?? null,
      paymentMethod: input.paymentMethod ?? "MANUAL",
    });
    const fresh = await this.repo.findOne(userId, row.id);
    return this.withSeries(userId, fresh ?? row);
  }

  async update(
    userId: string,
    id: string,
    input: accounts.UpdateBankAccount,
  ): Promise<accounts.BankAccount> {
    const current = await this.repo.findOne(userId, id);
    if (!current) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    const effectiveType = input.type ?? current.type;
    const effectiveAccountNumber = input.accountNumber ?? current.accountNumber;
    if (accounts.isAccountNumberRequired(effectiveType) && !effectiveAccountNumber?.trim()) {
      throw new BadRequestException({ code: "ACCOUNT_NUMBER_REQUIRED" });
    }
    // When an institution is (re)linked, mirror its name into `institution` for display.
    const linkedName =
      input.institutionId !== undefined && input.institutionId
        ? await this.repo.institutionName(input.institutionId)
        : undefined;
    const row = await this.repo.update(userId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.institutionId !== undefined ? { institutionId: input.institutionId ?? null } : {}),
      ...(linkedName !== undefined
        ? { institution: linkedName }
        : input.institution !== undefined
          ? { institution: input.institution }
          : {}),
      ...(input.accountNumber !== undefined ? { accountNumber: input.accountNumber } : {}),
      ...(input.initialBalance !== undefined ? { initialBalance: input.initialBalance } : {}),
      ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
      ...(input.creditUsedInitial !== undefined
        ? { creditUsedInitial: input.creditUsedInitial }
        : {}),
    });
    if (!row) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    if (input.billingCycleDay !== undefined || input.paymentMethod !== undefined) {
      await this.repo.upsertBillingSettings(id, {
        ...(input.billingCycleDay !== undefined ? { billingCycleDay: input.billingCycleDay } : {}),
        ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
      });
    }
    const fresh = await this.repo.findOne(userId, id);
    return this.withSeries(userId, fresh ?? row);
  }

  async setStatus(
    userId: string,
    id: string,
    status: accounts.AccountStatus,
  ): Promise<accounts.BankAccount> {
    const row = await this.repo.update(userId, id, { status });
    if (!row) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    return this.withSeries(userId, row);
  }

  /** currentBalance = initialBalance + Σincome − Σexpense (scoped to user + account). */
  async reconcile(userId: string, id: string): Promise<accounts.BankAccount> {
    const account = await this.repo.findOne(userId, id);
    if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    const { income, expense } = await this.repo.sumByType(userId, id);
    const reconciled = subtractMoney(addMoney(account.initialBalance.toString(), income), expense);
    const row = await this.repo.update(userId, id, { currentBalance: reconciled });
    return this.withSeries(userId, row ?? account);
  }

  async remove(userId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(userId, id);
    if (!ok) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
  }

  /** Manual "Generar facturación" — same rules as the daily cron, just scoped to
   * one account on demand. Returns the (possibly unchanged) statement list. */
  async generateStatements(userId: string, id: string): Promise<accounts.CreditStatement[]> {
    await this.billing.generateForAccount(userId, id);
    return this.listCreditStatements(userId, id);
  }

  async listCreditStatements(userId: string, id: string): Promise<accounts.CreditStatement[]> {
    const account = await this.repo.findOne(userId, id);
    if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    const rows = await this.repo.listCreditStatements(userId, id);
    return Promise.all(rows.map((r) => this.statementToContract(r)));
  }

  /**
   * Pay a statement by choosing a source bank account: creates a real EXPENSE
   * movement there, decrements the credit account's `creditUsed`, and freezes the
   * statement as paid — see `AccountsRepository.payStatement`.
   */
  async payCreditStatement(
    userId: string,
    id: string,
    statementId: string,
    fromAccountId: string,
  ): Promise<accounts.CreditStatement> {
    const account = await this.repo.findOne(userId, id);
    if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    const statement = await this.repo.findStatement(userId, id, statementId);
    if (!statement) throw new NotFoundException({ code: "STATEMENT_NOT_FOUND" });
    if (statement.paidAt) throw new BadRequestException({ code: "STATEMENT_ALREADY_PAID" });
    const fromAccount = await this.repo.findOne(userId, fromAccountId);
    if (!fromAccount) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    if (fromAccount.type === "CREDIT_LINE") {
      throw new BadRequestException({ code: "INVALID_PAYMENT_SOURCE" });
    }
    const amount = await this.repo.sumLinkedTransactions(statementId);
    if (!toMoney(amount).greaterThan(0)) throw new BadRequestException({ code: "NOTHING_TO_PAY" });
    const paid = await this.repo.payStatement({
      userId,
      creditAccountId: id,
      statementId,
      fromAccountId,
      amount,
      currency: account.currency,
      description: account.name,
      wasClosedAt: statement.closedAt,
    });
    return this.statementToContract(paid);
  }

  /** Correct a PAID statement's frozen amount — rejected for OPEN/PENDING ones
   * (edit their linked transactions instead; the live sum updates itself). */
  async updateCreditStatement(
    userId: string,
    id: string,
    statementId: string,
    amount: string,
  ): Promise<accounts.CreditStatement> {
    const account = await this.repo.findOne(userId, id);
    if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    const statement = await this.repo.findStatement(userId, id, statementId);
    if (!statement) throw new NotFoundException({ code: "STATEMENT_NOT_FOUND" });
    if (!statement.paidAt) throw new BadRequestException({ code: "STATEMENT_NOT_PAID" });
    const updated = await this.repo.updateStatementAmount(statementId, amount);
    return this.statementToContract(updated);
  }

  private async statementToContract(r: CreditStatementRow): Promise<accounts.CreditStatement> {
    const amount = r.paidAt
      ? (r.amount?.toString() ?? "0")
      : await this.repo.sumLinkedTransactions(r.id);
    return {
      id: r.id,
      accountId: r.accountId,
      status: r.paidAt ? "PAID" : r.closedAt ? "PENDING" : "OPEN",
      periodStart: r.periodStart.toISOString(),
      closedAt: r.closedAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
      amount: moneyToString(amount),
      paidFromAccountId: r.paidFromAccountId ?? null,
      paidTransactionId: r.paidTransactionId ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}

function toContract(
  row: AccountWithCards,
  series: { series: string[]; balanceChangePct: string | null },
  cardSums?: CardSums,
): accounts.BankAccount {
  // Credit pool (persisted `creditUsed`) for credit lines, OR any other cardable account
  // that has grown a CREDIT-kind card (e.g. a checking account's add-on credit card) —
  // the account-level creditLimit is the shared/master pool across all its cards either way.
  const hasCreditPool = row.type === "CREDIT_LINE" || row.cards.some((c) => c.kind === "CREDIT");
  const creditUsed = hasCreditPool ? moneyToString(row.creditUsed.toString()) : "0";
  const cardsContract = (row.cards ?? []).map((c) => cardToContract(c, row.currency, cardSums));
  // The account's own-currency pool, plus any EXTRA currency the primary card
  // also carries its own CardLimit for (e.g. a CLP account whose primary card
  // also has a USD sub-limit) — a non-primary card's own sub-limit stays
  // scoped to that card alone, not rolled up here.
  const primaryCard = cardsContract.find((c) => c.isPrimary);
  const creditPools: accounts.CreditPool[] = hasCreditPool
    ? [
        { currency: row.currency, limit: moneyToString(row.creditLimit.toString()), used: creditUsed },
        ...(primaryCard?.limits ?? []).map((l) => ({
          currency: l.currency,
          limit: l.limitAmount,
          used: l.used,
        })),
      ]
    : [];
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    currency: row.currency,
    institution: row.institution,
    institutionId: row.institutionId ?? null,
    institutionName: row.financialInstitution?.name ?? null,
    accountNumber: row.accountNumber ?? null,
    initialBalance: moneyToString(row.initialBalance.toString()),
    currentBalance: moneyToString(row.currentBalance.toString()),
    creditLimit: moneyToString(row.creditLimit.toString()),
    creditUsed,
    creditPools,
    billingCycleDay: row.billingSettings?.billingCycleDay ?? null,
    paymentMethod: row.billingSettings?.paymentMethod ?? "MANUAL",
    balanceSeries: series.series,
    balanceChangePct: series.balanceChangePct,
    cards: cardsContract,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
