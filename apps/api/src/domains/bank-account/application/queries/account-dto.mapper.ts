import type { accounts, installments } from "@finance/contracts";
import { addMoney, moneyToString, subtractMoney, toMoney } from "@finance/money";

import type { TransactionSumsRepositoryPort } from "../../../transaction/domain/ports/transaction-sums.repository.port";
import type { BankAccount } from "../../domain/bank-account.aggregate";

const SERIES_DAYS_DEFAULT = 30;
const DAY_MS_DEFAULT = 86_400_000;

/** Minimal shape `accountsToDtos` needs from a plan — just `InstallmentPlanRepositoryPort.list`. */
export interface PlanDebtSource {
  list(userId: string): Promise<{ toContract(): installments.InstallmentPlan }[]>;
}

/** Attaches a per-day balance series + per-card usage sums to every row and
 * maps each to its public DTO — shared by `ListAccountsQueryHandler` and
 * `GetAccountQueryHandler` so both read paths shape identically. */
export async function accountsToDtos(
  sumsRepo: TransactionSumsRepositoryPort,
  userId: string,
  rows: BankAccount[],
  plansRepo: PlanDebtSource,
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
  // No `since` window: `creditUsed` is a persisted, never-time-scoped total (2026-07-25
  // amendment) — a card's own contribution must add up against that same all-time total,
  // not a billing-cycle slice of it, or its tile's usage bar disagrees with the account's.
  const cardsInfo = rows.flatMap((r) => r.cards.map((c) => ({ id: c.id, since: null })));
  const cardSums: CardSums = new Map();
  for (const s of await sumsRepo.sumsByCard(userId, cardsInfo)) {
    if (!s.cardId) continue;
    const key = `${s.cardId}:${s.currency}`;
    const entry = cardSums.get(key) ?? { income: "0", expense: "0" };
    if (s.type === "INCOME") entry.income = s.sum;
    else entry.expense = s.sum;
    cardSums.set(key, entry);
  }
  const creditCardIds = new Set(
    rows.flatMap((r) => r.cards.filter((c) => c.kind === "CREDIT").map((c) => c.id)),
  );
  const planDebt = await planDebtByCard(plansRepo, userId, creditCardIds);
  return rows.map((row) =>
    accountToDto(
      row,
      computeSeries(row.currentBalance, byAccount.get(row.id) ?? [], now),
      cardSums,
      planDebt,
    ),
  );
}

/**
 * `cardId:currency -> Σ remainingAmount` of every CREDIT-card instalment plan on
 * that card. A plan's purchase is excluded from `sumsByCard` (spec 014 — it would
 * double the pool against the per-instalment tracking that already happens via
 * billing periods), so without this a card carrying only an instalment plan would
 * show `ownUsed: "0"` while the account's persisted `creditUsed` still reflects the
 * plan's full outstanding debt. `remainingAmount` already nets out paid instalments
 * and carry-overs (FR-021a), so this is the correct "still owed" figure to add back.
 */
async function planDebtByCard(
  plansRepo: PlanDebtSource,
  userId: string,
  creditCardIds: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const plans = await plansRepo.list(userId);
  const debt = new Map<string, string>();
  for (const row of plans) {
    const plan = row.toContract();
    // Only a CREDIT card leaves its plan's debt untracked by any real movement
    // (spec 014). Any other card pays each instalment as a real expense already
    // counted in `sumsByCard` — adding `remainingAmount` there would double it.
    if (!plan.cardId || !creditCardIds.has(plan.cardId)) continue;
    const key = `${plan.cardId}:${plan.currency}`;
    debt.set(key, addMoney(debt.get(key) ?? "0", plan.remainingAmount));
  }
  return debt;
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
  planDebt?: ReadonlyMap<string, string>,
): accounts.Card {
  const ownSums = card.kind === "CREDIT" ? sums?.get(`${card.id}:${accountCurrency}`) : undefined;
  const ownUsedFromTxs = ownSums ? subtractMoney(ownSums.expense, ownSums.income) : "0";
  const ownUsed = moneyToString(
    addMoney(ownUsedFromTxs, planDebt?.get(`${card.id}:${accountCurrency}`) ?? "0"),
  );
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
      const used = subtractMoney(
        addMoney(
          addMoney(l.usedInitial, s?.expense ?? "0"),
          planDebt?.get(`${card.id}:${l.currency}`) ?? "0",
        ),
        s?.income ?? "0",
      );
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
  planDebt?: ReadonlyMap<string, string>,
): accounts.BankAccount {
  const snap = account.snapshot();
  const creditUsed = account.hasCreditPool ? account.creditUsed : "0";
  const rawCardsDto = snap.cards.map((c) => cardToDto(c, snap.currency, cardSums, planDebt));
  // The PRIMARY card has no ledger of its own — its limit already just mirrors the
  // account's (`creditLimit`/`creditUsed`), never a separate `CardLimit` row. Its
  // `ownUsed` must mirror the same way: everything an ADDITIONAL card can't claim
  // for itself (its own purchases, its own instalment plans) belongs to the
  // primary by definition — a finance charge (no card by design) or a period's
  // carried-over shortfall (a fact about the STATEMENT, not any card) would
  // otherwise vanish from every card's tile while still sitting in `creditUsed`.
  const cardsDto = account.hasCreditPool
    ? rawCardsDto.map((c) => {
        if (!c.isPrimary) return c;
        const othersOwnUsed = rawCardsDto
          .filter((other) => other.kind === "CREDIT" && !other.isPrimary)
          .reduce((sum, other) => addMoney(sum, other.ownUsed), "0");
        return { ...c, ownUsed: subtractMoney(creditUsed, othersOwnUsed) };
      })
    : rawCardsDto;
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
    billingCycleType: snap.billingCycleType,
    paymentMethod: snap.paymentMethod,
    paymentDueDay: snap.paymentDueDay,
    paymentDueCycleType: snap.paymentDueCycleType,
    minimumPaymentPercent: snap.minimumPaymentPercent,
    balanceSeries: series.series,
    balanceChangePct: series.balanceChangePct,
    cards: cardsDto,
    createdAt: snap.createdAt.toISOString(),
    updatedAt: snap.updatedAt.toISOString(),
  };
}
