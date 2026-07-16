import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  BankAccount as BankAccountRow,
  CardAccount as CardRow,
  FinancialInstitution as InstitutionRow,
} from "@prisma/client";
import { AccountStatus, TransactionType } from "@prisma/client";

import { accounts } from "@finance/contracts";
import { addMoney, moneyToString, subtractMoney, toMoney } from "@finance/money";

import { AccountsRepository } from "./accounts.repository";
import { toContract as cardToContract } from "./cards.service";

type AccountWithCards = BankAccountRow & {
  cards: CardRow[];
  financialInstitution?: InstitutionRow | null;
};

type WindowTx = {
  bankAccountId: string | null;
  type: TransactionType;
  amount: { toString(): string };
  occurredAt: Date;
};

/** accountId -> { income, expense } all-time sums (decimal strings). */
type AccountSums = Map<string, { income: string; expense: string }>;

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
  constructor(private readonly repo: AccountsRepository) {}

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
    // Derived credit `used`: all-time income/expense sums per account, one grouped query.
    const sums: AccountSums = new Map();
    for (const s of await this.repo.sumsByAccount(userId, ids)) {
      if (!s.bankAccountId) continue;
      const entry = sums.get(s.bankAccountId) ?? { income: "0", expense: "0" };
      if (s.type === TransactionType.INCOME) entry.income = s.sum;
      else entry.expense = s.sum;
      sums.set(s.bankAccountId, entry);
    }
    return rows.map((row) =>
      toContract(
        row,
        computeSeries(row.currentBalance.toString(), byAccount.get(row.id) ?? [], now),
        sums.get(row.id),
      ),
    );
  }

  private async withSeries(userId: string, row: AccountWithCards): Promise<accounts.BankAccount> {
    const [acc] = await this.attachSeries(userId, [row]);
    return acc;
  }

  async create(userId: string, input: accounts.CreateBankAccount): Promise<accounts.BankAccount> {
    const initialBalance = input.initialBalance ?? "0";
    // A linked institution drives the displayed institution name.
    const institution = input.institutionId
      ? ((await this.repo.institutionName(input.institutionId)) ?? input.institution)
      : input.institution;
    const cards = (input.cards ?? []).map((c) => ({
      userId,
      name: c.name,
      kind: c.kind,
      last4: c.last4,
      expiryMonth: c.expiryMonth,
      expiryYear: c.expiryYear,
      isActive: c.isActive ?? true,
    }));
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
      creditLimit: input.creditLimit ?? "0",
      creditUsedInitial: input.creditUsedInitial ?? "0",
      ...(cards.length > 0 ? { cards: { create: cards } } : {}),
    });
    return this.withSeries(userId, row);
  }

  async update(
    userId: string,
    id: string,
    input: accounts.UpdateBankAccount,
  ): Promise<accounts.BankAccount> {
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
    return this.withSeries(userId, row);
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
}

function toContract(
  row: AccountWithCards,
  series: { series: string[]; balanceChangePct: string | null },
  sums?: { income: string; expense: string },
): accounts.BankAccount {
  // Credit used (derived) only for credit lines: seed + Σexpense − Σincome (payments reduce it).
  const isCredit = row.type === "CREDIT_LINE";
  const creditUsed = isCredit
    ? moneyToString(
        subtractMoney(
          addMoney(row.creditUsedInitial.toString(), sums?.expense ?? "0"),
          sums?.income ?? "0",
        ),
      )
    : "0";
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
    balanceSeries: series.series,
    balanceChangePct: series.balanceChangePct,
    cards: (row.cards ?? []).map(cardToContract),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
