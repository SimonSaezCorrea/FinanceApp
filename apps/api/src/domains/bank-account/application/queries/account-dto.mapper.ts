import type { accounts } from "@finance/contracts";
import { addMoney, moneyToString, subtractMoney, toMoney } from "@finance/money";

import { currentCycleStart } from "../../../billing-settings/domain/billing-cycle";
import type { TransactionSumsRepositoryPort } from "../../../transaction/domain/ports/transaction-sums.repository.port";
import type { BankAccount } from "../../domain/bank-account.aggregate";

const SERIES_DAYS_DEFAULT = 30;
const DAY_MS_DEFAULT = 86_400_000;

/** Attaches a per-day balance series + per-card usage sums to every row and
 * maps each to its public DTO — shared by `ListAccountsQueryHandler` and
 * `GetAccountQueryHandler` so both read paths shape identically. */
export async function accountsToDtos(
  sumsRepo: TransactionSumsRepositoryPort,
  userId: string,
  rows: BankAccount[],
): Promise<accounts.BankAccount[]> {
  if (rows.length === 0) return [];
  const now = new Date();
  const since = new Date(now.getTime() - SERIES_DAYS_DEFAULT * DAY_MS_DEFAULT);
  const ids = rows.map((r) => r.id);
  const txs = await sumsRepo.windowForAccounts(userId, ids, since);
  const byAccount = new Map<string, typeof txs>();
  for (const t of txs) {
    if (t.bankAccountId === null) continue;
    const bucket = byAccount.get(t.bankAccountId) ?? [];
    bucket.push(t);
    byAccount.set(t.bankAccountId, bucket);
  }
  const cardsInfo = rows.flatMap((r) =>
    r.cards.map((c) => ({ id: c.id, since: currentCycleStart(r.billingCycleDay, now) })),
  );
  const cardSums: CardSums = new Map();
  for (const s of await sumsRepo.sumsByCard(userId, cardsInfo)) {
    if (!s.cardId) continue;
    const key = `${s.cardId}:${s.currency}`;
    const entry = cardSums.get(key) ?? { income: "0", expense: "0" };
    if (s.type === "INCOME") entry.income = s.sum;
    else entry.expense = s.sum;
    cardSums.set(key, entry);
  }
  return rows.map((row) =>
    accountToDto(
      row,
      computeSeries(row.currentBalance, byAccount.get(row.id) ?? [], now),
      cardSums,
    ),
  );
}

export type WindowTx = {
  bankAccountId: string | null;
  type: "INCOME" | "EXPENSE";
  amount: { toString(): string };
  occurredAt: Date;
};

/** cardId:currency -> { income, expense } sums, for a card's own derived `used`/`ownUsed`. */
export type CardSums = Map<string, { income: string; expense: string }>;

const SERIES_DAYS = 30;
const DAY_MS = 86_400_000;

/** Reconciled balance, one point per day (oldest→newest, ends at currentBalance), + % change. */
export function computeSeries(
  currentBalance: string,
  txs: WindowTx[],
  now: Date,
): { series: string[]; balanceChangePct: string | null } {
  const endOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS;
  const series: string[] = [];
  for (let i = SERIES_DAYS - 1; i >= 0; i--) {
    const boundary = endOfToday - i * DAY_MS;
    let bal = currentBalance;
    for (const t of txs) {
      if (t.occurredAt.getTime() >= boundary) {
        const amt = t.amount.toString();
        bal = t.type === "INCOME" ? subtractMoney(bal, amt) : addMoney(bal, amt);
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

export function cardToDto(
  card: BankAccount["cards"][number],
  accountCurrency: string,
  sums?: CardSums,
): accounts.Card {
  const ownSums = card.kind === "CREDIT" ? sums?.get(`${card.id}:${accountCurrency}`) : undefined;
  const ownUsed = ownSums ? moneyToString(subtractMoney(ownSums.expense, ownSums.income)) : "0";
  return {
    id: card.id,
    name: card.name,
    kind: card.kind,
    last4: card.last4,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    isActive: card.isActive,
    isPrimary: card.isPrimary,
    isVirtual: card.isVirtual,
    isAdditional: card.isAdditional,
    cardholderName: card.cardholderName,
    network: card.network,
    ownUsed,
    limits: card.limits.map((l) => {
      const s = sums?.get(`${card.id}:${l.currency}`);
      const used = subtractMoney(addMoney(l.usedInitial, s?.expense ?? "0"), s?.income ?? "0");
      return {
        id: l.id,
        currency: l.currency,
        limitAmount: moneyToString(l.limitAmount),
        used: moneyToString(used),
      };
    }),
  };
}

/** Maps a `BankAccount` aggregate + its read-model extras (series, card sums)
 * to the public `accounts.BankAccount` DTO — never an aggregate instance,
 * never a Prisma row, shaped only for this read (FR-003). */
export function accountToDto(
  account: BankAccount,
  series: { series: string[]; balanceChangePct: string | null },
  cardSums?: CardSums,
): accounts.BankAccount {
  const snap = account.snapshot();
  const cardsDto = snap.cards.map((c) => cardToDto(c, snap.currency, cardSums));
  const creditUsed = account.hasCreditPool ? account.creditUsed : "0";
  const primaryDto = cardsDto.find((c) => c.isPrimary);
  const creditPools: accounts.CreditPool[] = account.hasCreditPool
    ? [
        { currency: snap.currency, limit: account.creditLimit, used: creditUsed },
        ...(primaryDto?.limits ?? []).map((l) => ({
          currency: l.currency,
          limit: l.limitAmount,
          used: l.used,
        })),
      ]
    : [];
  return {
    id: snap.id,
    name: snap.name,
    type: snap.type,
    status: snap.status,
    currency: snap.currency,
    institution: snap.institution,
    institutionId: snap.institutionId,
    institutionName: snap.institutionName,
    accountNumber: snap.accountNumber,
    accountAlias: snap.accountAlias,
    initialBalance: moneyToString(snap.initialBalance),
    overdraftLimit: moneyToString(snap.overdraftLimit),
    balanceCeiling: snap.balanceCeiling === null ? null : moneyToString(snap.balanceCeiling),
    currentBalance: moneyToString(snap.currentBalance),
    creditLimit: account.creditLimit,
    creditUsed,
    creditPools,
    billingCycleDay: snap.billingCycleDay,
    paymentMethod: snap.paymentMethod,
    minimumPaymentPercent: snap.minimumPaymentPercent,
    balanceSeries: series.series,
    balanceChangePct: series.balanceChangePct,
    cards: cardsDto,
    createdAt: snap.createdAt.toISOString(),
    updatedAt: snap.updatedAt.toISOString(),
  };
}
