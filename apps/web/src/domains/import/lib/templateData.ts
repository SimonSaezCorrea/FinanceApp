import type { TFunction } from "i18next";

import {
  imports,
  reference,
  transactions as transactionsContract,
  type accounts,
  type debts,
  type installments,
  type recurring,
  type savings,
  type transactions,
} from "@finance/contracts";

import type { Cell } from "./importParsing";
import { cardLabel, valueKey, type ListKey } from "./templateSpec";

/** Everything the user already has, as the API returns it. */
export interface ExistingData {
  /** Every account, inactive ones included: their movements still name them. */
  accounts: accounts.BankAccount[];
  transactions: transactions.Transaction[];
  debts: debts.Debt[];
  plans: installments.InstallmentPlan[];
  recurring: recurring.RecurringExpense[];
  goals: savings.SavingsGoal[];
  entries: savings.SavingsEntry[];
  categories: reference.Category[];
  /** Every billing period of every credit card account. */
  statements: accounts.CreditStatement[];
}

/** One pre-filled row: the record it came from and its cells keyed by column. */
export interface ExistingRow {
  id: string;
  cells: Record<string, Cell>;
}

export type ExistingRows = Record<imports.TemplateSheetKey, ExistingRow[]>;

/** Movement origins the Movimientos sheet carries. Everything else (a debt or
 * instalment payment, a savings contribution, a transfer leg, a statement
 * payment…) is written on its own sheet, or is bookkeeping the app creates by
 * itself and the template has no place for. */
const MOVEMENT_SOURCES = new Set([
  "MANUAL",
  "RECURRING",
  "FINANCE_CHARGE",
  // A plan's interest is an issuer charge on the card account: the plan is
  // exported without its rate, so re-importing it doesn't charge it twice.
  "INSTALLMENT_INTEREST",
]);

/** A stored instant as the date cell the template reads (a day at UTC midnight,
 * what `parseDate` takes back as that same day). An imported date is stored AT
 * UTC midnight, so its UTC day is the one the user typed — reading it in a zone
 * west of UTC would move it a day back. Anything else is a real instant: its
 * LOCAL day. */
function day(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  const utcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  return utcMidnight
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

const money = (value: string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

/**
 * The user's current data as rows of the Cuadra template (specs/027), so a
 * downloaded template can come pre-filled. Each row keeps the id of the record it
 * came from: `buildTemplate` writes it in the "ID Cuadra" column and the reader
 * skips such rows, so uploading the file again never creates them twice.
 *
 * Records are joined across sheets by generated references (D1, C1, R1, M1).
 *
 * Template v2: the Accounts, Cards and Statements sheets describe the structure,
 * so the same file can rebuild everything ("Reemplazar todo"). A statement paid
 * with "Pagar" carries its payment (date, amount, source account) instead of a
 * movement; a prepayment becomes a transfer to the card account.
 */
export function existingRows(data: ExistingData, t: TFunction): ExistingRows {
  const accountById = new Map(data.accounts.map((a) => [a.id, a]));
  const cardById = new Map(
    data.accounts.flatMap((a) =>
      (a.cards ?? []).map((c) => [c.id, cardLabel(a.name, c.last4)] as const),
    ),
  );
  const categoryById = new Map(
    data.categories
      .filter((c) => reference.isCategorySelectable(c))
      .map((c) => [c.id, t(`categories.${c.code}`, { defaultValue: c.code })]),
  );
  const accountName = (id: string | null) => (id ? (accountById.get(id)?.name ?? null) : null);
  const card = (id: string | null) => (id ? (cardById.get(id) ?? null) : null);
  const category = (id: string | null) => (id ? (categoryById.get(id) ?? null) : null);
  const label = (list: ListKey, value: string) => t(valueKey(list, value));

  const refsFor = <T extends { id: string }>(items: T[], prefix: string) =>
    new Map(items.map((item, i) => [item.id, `${prefix}${i + 1}`]));
  const debtRef = refsFor(data.debts, "D");
  const planRef = refsFor(data.plans, "C");
  const recurringRef = refsFor(data.recurring, "R");
  const goalRef = refsFor(data.goals, "M");

  const byDate = <T>(items: T[], at: (item: T) => string) =>
    [...items].sort((a, b) => at(a).localeCompare(at(b)));
  const txs = byDate(data.transactions, (tx) => tx.occurredAt);
  const txById = new Map(txs.map((tx) => [tx.id, tx]));

  const movements = txs
    .filter((tx) => MOVEMENT_SOURCES.has(transactionsContract.sourceOf(tx).kind))
    .map((tx): ExistingRow => {
      const account = tx.bankAccountId ? accountById.get(tx.bankAccountId) : undefined;
      return {
        id: tx.id,
        cells: {
          date: day(tx.occurredAt),
          type: label("movementType", tx.type),
          amount: money(tx.amount),
          // Empty = the account's own currency.
          currency: account && account.currency === tx.currency ? null : tx.currency,
          account: account?.name ?? null,
          card: card(tx.cardId),
          category: category(tx.categoryId),
          description: tx.description,
          observation: tx.observation,
          emisor: tx.emisor,
          receptor: tx.receptor,
          lugar: tx.lugar,
          financeCharge: tx.financeCharge ? label("yesNo", "YES") : null,
          recurring: tx.recurringExpenseId
            ? (recurringRef.get(tx.recurringExpenseId) ?? null)
            : null,
        },
      };
    });

  const legs = new Map<string, transactions.Transaction[]>();
  for (const tx of txs) {
    if (tx.transferGroupId)
      legs.set(tx.transferGroupId, [...(legs.get(tx.transferGroupId) ?? []), tx]);
  }
  const transfers = [...legs.entries()].flatMap(([groupId, pair]): ExistingRow[] => {
    const out = pair.find((tx) => tx.type === "EXPENSE");
    const into = pair.find((tx) => tx.type === "INCOME");
    if (!out || !into) return [];
    return [
      {
        id: groupId,
        cells: {
          date: day(out.occurredAt),
          fromAccount: accountName(out.bankAccountId),
          toAccount: accountName(into.bankAccountId),
          amount: money(out.amount),
          // Only when it differs: the two legs can be in different currencies.
          incomingAmount: into.amount === out.amount ? null : money(into.amount),
          description: out.description,
        },
      },
    ];
  });

  // A prepayment moved money from an account to the card: a transfer, in effect.
  for (const tx of txs) {
    if (!tx.prepaymentStatementId || !tx.prepaymentAccountId) continue;
    transfers.push({
      id: tx.id,
      cells: {
        date: day(tx.occurredAt),
        fromAccount: accountName(tx.bankAccountId),
        toAccount: accountName(tx.prepaymentAccountId),
        amount: money(tx.amount),
        incomingAmount: null,
        description: tx.description,
      },
    });
  }

  const debtRows = data.debts.map((d): ExistingRow => ({
    id: d.id,
    cells: {
      ref: debtRef.get(d.id) ?? null,
      direction: label("direction", d.direction),
      counterparty: d.counterparty,
      title: d.title,
      principal: money(d.principal),
      currency: d.currency,
      openedAt: day(d.openedAt),
      dueAt: day(d.dueAt),
      installments: d.totalInstallments,
      frequency: label("planFrequency", d.frequency),
      every: d.frequencyInterval,
      account: accountName(d.paymentAccountId),
      notes: d.notes,
    },
  }));
  // A debt payment is the movement it created.
  const debtPayments = txs
    .filter((tx) => tx.debtId && debtRef.has(tx.debtId))
    .map((tx): ExistingRow => ({
      id: tx.id,
      cells: {
        ref: debtRef.get(tx.debtId!) ?? null,
        date: day(tx.occurredAt),
        account: accountName(tx.bankAccountId),
        amount: money(tx.amount),
      },
    }));

  const planRows = data.plans.map((p): ExistingRow => ({
    id: p.id,
    cells: {
      ref: planRef.get(p.id) ?? null,
      title: p.title,
      startDate: day(p.startDate),
      totalPrincipal: money(p.totalPrincipal),
      installments: p.installmentCount,
      currency: p.currency,
      frequency: label("planFrequency", p.frequency),
      every: p.frequencyInterval,
      // The rate isn't part of the plan as the API returns it.
      interest: null,
      card: card(p.cardId),
      category: category(p.categoryId),
      account: accountName(p.paymentAccountId),
    },
  }));
  // Whether a credit card account's paid instalments gave their share of the pool
  // back: if its pool is exactly its opening debt plus its movements, they didn't
  // (the card payments that covered them are in the file as transfers).
  const ledgerMatchesPool = new Map(
    data.accounts
      .filter((a) => a.type === "CREDIT_CARD")
      .map((a) => {
        const net = txs
          .filter((tx) => tx.bankAccountId === a.id && tx.currency === a.currency)
          .reduce((sum, tx) => sum + (tx.type === "EXPENSE" ? 1 : -1) * Number(tx.amount), 0);
        const expected = Number(a.creditUsedInitial ?? "0") + net;
        return [a.id, Math.abs(expected - Number(a.creditUsed)) < 0.5] as const;
      }),
  );
  const cardAccountOf = new Map(
    data.accounts.flatMap((a) => (a.cards ?? []).map((c) => [c.id, a.id] as const)),
  );
  const planPayments = data.plans.flatMap((p) =>
    p.payments
      // A credit-card plan's instalment settled by paying its statement is rebuilt
      // with that statement; only one settled OUTSIDE the app is marked paid here.
      .filter(
        (payment) => payment.paidAt && (p.generatesMovementOnPay || !payment.creditStatementId),
      )
      .map((payment): ExistingRow => {
        const tx = payment.transactionId ? txById.get(payment.transactionId) : undefined;
        // A credit-card plan's instalment is paid by its statement: no account
        // and no amount, as the template asks.
        const ownMovement = p.generatesMovementOnPay;
        return {
          id: payment.id,
          cells: {
            ref: planRef.get(p.id) ?? null,
            sequence: payment.sequence,
            date: day(payment.paidAt),
            account: ownMovement ? accountName(tx?.bankAccountId ?? p.paymentAccountId) : null,
            amount: ownMovement ? money(payment.paidAmount ?? payment.amount) : null,
            freesCredit:
              !ownMovement && p.cardId && ledgerMatchesPool.get(cardAccountOf.get(p.cardId) ?? "")
                ? label("yesNo", "NO")
                : null,
          },
        };
      }),
  );

  const recurringRows = data.recurring.map((r): ExistingRow => ({
    id: r.id,
    cells: {
      ref: recurringRef.get(r.id) ?? null,
      label: r.label,
      amount: money(r.amount),
      currency: r.currency,
      frequency: label("recurrenceFrequency", r.frequency),
      every: r.interval,
      anchorDate: day(r.anchorDate),
      endDate: day(r.endDate),
      account: accountName(r.bankAccountId),
      card: card(r.cardId),
      category: category(r.categoryId),
      notes: r.notes,
    },
  }));

  const goalRows = data.goals.map((g): ExistingRow => ({
    id: g.id,
    cells: {
      ref: goalRef.get(g.id) ?? null,
      title: g.title,
      targetAmount: money(g.targetAmount),
      currency: g.currency,
      deadline: day(g.deadline),
      notes: g.notes,
    },
  }));
  const contributions = byDate(data.entries, (e) => e.contributedAt)
    .filter((e) => e.savingsGoalId && goalRef.has(e.savingsGoalId))
    .map((e): ExistingRow => ({
      id: e.id,
      cells: {
        ref: goalRef.get(e.savingsGoalId!) ?? null,
        date: day(e.contributedAt),
        amount: money(e.amount),
        account: accountName(e.bankAccountId),
      },
    }));

  // ── The structure: accounts, cards, billing periods ─────────────────────────
  const percent = (v: string | null) => (v === null || v === "" ? null : `${Number(v)}%`);
  const nonZero = (v: string | null | undefined) => (v && Number(v) !== 0 ? money(v) : null);
  const accountRows = data.accounts.map((a): ExistingRow => {
    const credit = a.type === "CREDIT_CARD";
    return {
      id: a.id,
      cells: {
        name: a.name,
        type: label("accountType", a.type),
        currency: a.currency,
        institution: a.institutionName ?? a.institution,
        accountNumber: a.accountNumber,
        openingBalance: credit ? null : money(a.initialBalance),
        creditLimit: credit ? money(a.creditLimit) : null,
        creditUsedInitial: credit ? nonZero(a.creditUsedInitial) : null,
        overdraftLimit: nonZero(a.overdraftLimit),
        balanceCeiling: money(a.balanceCeiling),
        minimumPaymentPercent: credit ? percent(a.minimumPaymentPercent) : null,
        status: a.status === "INACTIVE" ? label("accountStatus", "INACTIVE") : null,
      },
    };
  });
  // The first CREDIT card of an account is its primary one: it goes first.
  const cardRows = data.accounts.flatMap((a) =>
    [...(a.cards ?? [])]
      .sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary))
      .map((c): ExistingRow => {
        const own = c.isPrimary ? undefined : c.limits.find((l) => l.currency === a.currency);
        const extra = c.limits.find((l) => l.currency !== a.currency);
        return {
          id: c.id,
          cells: {
            account: a.name,
            kind: label("cardKind", c.kind),
            last4: c.last4,
            expiry: `${String(c.expiryMonth).padStart(2, "0")}/${c.expiryYear}`,
            name: c.name || null,
            network: c.network ? label("cardNetwork", c.network) : null,
            isVirtual: c.isVirtual ? label("yesNo", "YES") : null,
            isAdditional: c.isAdditional ? label("yesNo", "YES") : null,
            cardholderName: c.cardholderName,
            ownLimit: own ? money(own.limitAmount) : null,
            extraLimitCurrency: extra?.currency ?? null,
            extraLimit: extra ? money(extra.limitAmount) : null,
            isActive: c.isActive ? null : label("yesNo", "NO"),
          },
        };
      }),
  );
  const paymentOf = new Map(
    txs.filter((tx) => tx.paidStatementId).map((tx) => [tx.paidStatementId!, tx]),
  );
  const statementRows = [...data.statements]
    .filter((st) => st.closedAt)
    .sort((x, y) => x.closedAt!.localeCompare(y.closedAt!))
    .map((st): ExistingRow => {
      const account = accountById.get(st.accountId);
      const payment = paymentOf.get(st.id);
      return {
        id: st.id,
        cells: {
          account: account?.name ?? null,
          currency: account && account.currency === st.currency ? null : st.currency,
          periodStart: day(st.periodStart),
          closedAt: day(st.closedAt),
          dueDate: day(st.dueDate ?? st.closedAt),
          paidAt: day(st.paidAt),
          paidAmount: st.paidAt ? money(st.paidAmount) : null,
          paidFrom: payment ? accountName(payment.bankAccountId) : null,
        },
      };
    });

  return {
    accounts: accountRows,
    cards: cardRows,
    statements: statementRows,
    movements,
    transfers,
    debts: debtRows,
    debtPayments,
    plans: planRows,
    planPayments,
    recurring: recurringRows,
    goals: goalRows,
    contributions,
  };
}
