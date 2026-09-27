import { addMoney, moneyToString, subtractMoney, sumMoney, toMoney } from "@finance/money";

import { imports } from "@finance/contracts";

import { Debt, type DebtProps, type PlannedDebt } from "../../debt/domain/debt.aggregate";
import {
  InstallmentPlan,
  type InstallmentPlanProps,
} from "../../installment-plan/domain/installment-plan.aggregate";
import {
  RecurringExpense,
  type PlannedRecurringExpense,
} from "../../recurring-expense/domain/recurring-expense.aggregate";
import {
  SavingsGoal,
  type PlannedSavingsGoal,
} from "../../savings-goal/domain/savings-goal.aggregate";
import { balanceDelta, cashDelta } from "../../transaction/domain/balance-delta";
import type { AccountContext, CardLimitContext } from "../../transaction/domain/movement-policy";
import { MovementPolicy } from "../../transaction/domain/movement-policy";
import { TransferPolicy } from "../../transaction/domain/transfer-policy";
import type { ImportCard } from "./import-plan";
import { TEMPLATE_CODES, TemplateRowRejectedError } from "./errors";

type Sheet = imports.TemplateSheetKey;
type Status = 400 | 404 | 409;

/** An account the user owns, with what the rules need. */
export interface TemplateAccount {
  context: AccountContext;
  currency: string;
  status: "ACTIVE" | "INACTIVE";
}

/** A card the user owns, with its account and (for CREDIT) its own sub-limit. */
export interface TemplateCard extends ImportCard {
  accountId: string;
  /** A CREDIT card's own limits in currencies OTHER than its account's (e.g. the
   * USD one of a CLP card), by currency code, with what each has already used. A
   * movement in one of these currencies goes against that limit, never the pool. */
  otherLimits: Record<
    string,
    { limit: CardLimitContext; usage: { income: string; expense: string } }
  >;
}

/**
 * Everything the loader resolved about the ids the request names. Only the
 * user's OWN accounts and cards are in these maps (Principle II): an id that
 * isn't here is someone else's or doesn't exist — both "not found".
 */
export interface TemplateLookup {
  accounts: Map<string, TemplateAccount>;
  cards: Map<string, TemplateCard>;
  /** `"<categoryId>|<INCOME|EXPENSE>"` → the refusal code, for categories that
   * can't be used for that movement type. Absent = fine. */
  categoryErrors: Map<string, { code: string; status: Status }>;
}

/** One movement to insert, including transfer legs and the movements a payment
 * or a contribution generates. Links to rows that don't exist yet (a debt, a
 * plan, a savings entry) are named by `link` and filled in by the handler after
 * it creates them. */
export interface TemplateMovementWrite {
  id: string;
  accountId: string;
  type: "INCOME" | "EXPENSE";
  amount: string;
  currency: string;
  occurredAt: Date;
  description: string | null;
  observation: string | null;
  emisor: string | null;
  receptor: string | null;
  lugar: string | null;
  categoryId: string | null;
  /** A category the server assigns (debt payments, contributions, plan interest). */
  systemCategory: "DEBTS" | "SAVINGS" | "INTEREST" | null;
  cardId: string | null;
  financeCharge: boolean;
  /** Draws on a credit card pool — linked to the account's open billing period. */
  drawsOnCredit: boolean;
  transferGroupId: string | null;
  link:
    | { kind: "debt"; index: number }
    | { kind: "plan"; index: number }
    | { kind: "contribution"; goalIndex: number; contributionIndex: number }
    | { kind: "recurring"; index: number }
    | null;
}

export interface TemplateDebtWrite {
  plan: PlannedDebt;
  /** In the order they were applied (by date). */
  payments: { transactionId: string; accountId: string; amount: string }[];
}

export interface TemplatePlanWrite {
  plan: ReturnType<typeof InstallmentPlan.planCreation>;
  /** Payments to record on the created plan, in the order they were applied. */
  payments: {
    sequence: number;
    amount: string | null;
    paidAt: Date;
    transactionId: string | null;
  }[];
}

export interface TemplateGoalWrite {
  plan: PlannedSavingsGoal;
  contributions: {
    transactionId: string;
    accountId: string;
    amount: string;
    currency: string;
    contributedAt: Date;
  }[];
}

export interface TemplatePlanResult {
  counts: imports.TemplateSheetCounts;
  issues: (imports.TemplateIssue & { status: Status })[];
  accounts: imports.TemplateAccountEffect[];
  movements: TemplateMovementWrite[];
  /** Same order and indexes as the request's sheets — `link.index` points here.
   * A `null` is a row that was refused (only ever in `collect` mode: in `throw`
   * mode the refusal already threw). */
  debts: (TemplateDebtWrite | null)[];
  plans: (TemplatePlanWrite | null)[];
  /** Same order and indexes as the request's Recurring sheet (`null` = refused). */
  recurring: (PlannedRecurringExpense | null)[];
  goals: TemplateGoalWrite[];
}

export interface TemplatePlanOptions {
  /** `collect`: gather every issue (preview). `throw`: the first one throws a
   * `TemplateRowRejectedError` (commit — all or nothing). */
  mode: "collect" | "throw";
  /** Mints row ids — `generateRowId` in production, a counter in tests. */
  newId: () => string;
  now: Date;
}

const SHEET_ORDER = new Map(imports.TEMPLATE_SHEET_KEYS.map((k, i) => [k, i]));
const text = (value: string | undefined): string | null => value?.trim() || null;
const normRef = (value: string): string => value.trim().toLocaleLowerCase();

/** A single thing that moves money on one account, placed on the timeline. */
interface MoneyEvent {
  date: Date;
  sheet: Sheet;
  row: number;
  /** Order of creation — keeps a transfer's outgoing leg before its incoming one. */
  seq: number;
  accountId: string;
  kind: "movement" | "simple" | "transferOut" | "transferIn" | "credit";
  type: "INCOME" | "EXPENSE";
  amount: string;
  card: TemplateCard | null;
  /** For `movement`: the card's own limit in the movement's currency, if any —
   * the account-currency one, or a foreign-currency one (then `currency` differs
   * from the account's). */
  cardLimit?: CardLimitContext | null;
  currency?: string;
  financeCharge: boolean;
  /** For `credit`: the signed change to the pool. */
  creditDelta: string;
  /** For `transferOut`: the destination (TransferPolicy needs both ends). */
  toAccountId?: string;
  amountIn?: string;
  /** The movement this event writes, if any — flagged when it draws on credit. */
  write?: TemplateMovementWrite;
}

class Issues {
  readonly list: (imports.TemplateIssue & { status: Status })[] = [];
  constructor(private readonly mode: "collect" | "throw") {}

  add(sheet: Sheet, row: number, code: string, status: Status = 400, field?: string): void {
    if (this.mode === "throw") throw new TemplateRowRejectedError(code, status, sheet, row);
    this.list.push({ code, sheet, row, status, ...(field ? { field } : {}) });
  }

  /** Runs a rule that throws a domain error; records it instead. */
  guard(sheet: Sheet, row: number, fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (error) {
      const coded = asCoded(error);
      if (!coded) throw error; // not a domain rule: a real bug, surfaced as-is
      this.add(sheet, row, coded.code, coded.status);
      return false;
    }
  }
}

function asCoded(error: unknown): { code: string; status: Status } | null {
  if (
    error instanceof Error &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { httpStatus?: unknown }).httpStatus === "number"
  ) {
    const { code, httpStatus } = error as unknown as { code: string; httpStatus: Status };
    return { code, status: httpStatus };
  }
  return null;
}

/**
 * Plans a whole template import (specs/027) as if every row were entered by hand,
 * without touching the database: pure, so every rule is unit-testable.
 *
 *  1. Each row is checked on its own (ownership via `lookup`, currencies,
 *     references between sheets, payment counts and sequences).
 *  2. Every money effect — movements, transfer legs, debt and plan payments,
 *     credit-card plan purchases, contributions — goes on a timeline per account,
 *     ordered by date → sheet → row, and is validated with the SAME rules as a
 *     hand-made movement (`MovementPolicy`, `TransferPolicy`) against a running
 *     balance/credit pool. The running figures start from today's balance, or —
 *     when the account's mode is `INCLUDED` (its balance already reflects this
 *     history) — from today's balance minus what the import adds.
 *  3. Debts, plans and goals are built with their own aggregate's `planCreation`
 *     and their payments applied with the aggregate's own methods, so the
 *     outcome is exactly the one the manual flow would produce.
 *
 * A credit-card plan's purchase is NOT checked against the credit limit — the
 * manual flow doesn't either (research R12). An instalment of such a plan marked
 * paid in the template moves no money and gives its share of the pool back: it
 * was settled outside the app and will never be billed (research R7).
 */
export function planTemplateImport(
  req: imports.TemplateImportRequest,
  lookup: TemplateLookup,
  options: TemplatePlanOptions,
): TemplatePlanResult {
  const issues = new Issues(options.mode);
  const { newId } = options;
  const events: MoneyEvent[] = [];
  const movements: TemplateMovementWrite[] = [];
  let seq = 0;
  const push = (event: Omit<MoneyEvent, "seq">) => events.push({ ...event, seq: seq++ });

  const counts = Object.fromEntries(
    imports.TEMPLATE_SHEET_KEYS.map((k) => [k, req[k].length]),
  ) as imports.TemplateSheetCounts;

  /** The account, or an issue: unknown/foreign → not found, inactive → refused. */
  const account = (sheet: Sheet, row: number, id: string): TemplateAccount | null => {
    const found = lookup.accounts.get(id);
    if (!found) {
      issues.add(sheet, row, "ACCOUNT_NOT_FOUND", 404);
      return null;
    }
    if (found.status !== "ACTIVE") {
      issues.add(sheet, row, TEMPLATE_CODES.ACCOUNT_INACTIVE);
      return null;
    }
    return found;
  };
  const card = (sheet: Sheet, row: number, id: string): TemplateCard | null => {
    const found = lookup.cards.get(id);
    if (!found) issues.add(sheet, row, "CARD_NOT_FOUND", 404);
    return found ?? null;
  };
  const categoryOk = (sheet: Sheet, row: number, id: string | undefined, type: string) => {
    if (!id) return true;
    const refusal = lookup.categoryErrors.get(`${id}|${type}`);
    if (refusal) issues.add(sheet, row, refusal.code, refusal.status);
    return !refusal;
  };
  const sameCurrency = (sheet: Sheet, row: number, a: string, b: string) => {
    if (a === b) return true;
    issues.add(sheet, row, TEMPLATE_CODES.CURRENCY_MISMATCH);
    return false;
  };
  const movement = (
    fields: Omit<TemplateMovementWrite, "id" | "drawsOnCredit"> & { id?: string },
  ): TemplateMovementWrite => {
    const write = { id: fields.id ?? newId(), drawsOnCredit: false, ...fields };
    movements.push(write);
    return write;
  };
  const blank = {
    observation: null,
    emisor: null,
    receptor: null,
    lugar: null,
    categoryId: null,
    systemCategory: null,
    cardId: null,
    financeCharge: false,
    transferGroupId: null,
    link: null,
  } as const;

  /** Unique references per sheet; the index of each kept one. */
  const refIndex = <T extends { ref?: string; row: number }>(sheet: Sheet, rows: T[]) => {
    const map = new Map<string, number>();
    rows.forEach((r, i) => {
      if (!r.ref) return; // a recurring series only needs one when movements point at it
      const key = normRef(r.ref);
      if (map.has(key)) issues.add(sheet, r.row, TEMPLATE_CODES.DUPLICATE_REF, 400, "ref");
      else map.set(key, i);
    });
    return map;
  };

  // Recurring series first: movements may name the one they pay.
  const recurringRefs = refIndex("recurring", req.recurring);
  const recurring: (PlannedRecurringExpense | null)[] = req.recurring.map((r) => {
    if (r.bankAccountId && !account("recurring", r.row, r.bankAccountId)) return null;
    if (r.cardId && !card("recurring", r.row, r.cardId)) return null;
    if (!categoryOk("recurring", r.row, r.categoryId, "EXPENSE")) return null;
    let planned: PlannedRecurringExpense | null = null;
    issues.guard("recurring", r.row, () => {
      planned = RecurringExpense.planCreation({
        label: r.label,
        amount: r.amount,
        currency: r.currency,
        categoryId: r.categoryId,
        frequency: r.frequency,
        interval: r.interval,
        anchorDate: new Date(r.anchorDate),
        endDate: r.endDate ? new Date(r.endDate) : null,
        bankAccountId: r.bankAccountId,
        cardId: r.cardId,
        active: true,
        notes: r.notes,
      });
    });
    return planned;
  });

  // ── Movements ───────────────────────────────────────────────────────────────
  for (const m of req.movements) {
    const acct = account("movements", m.row, m.bankAccountId);
    if (!acct) continue;
    let recurringIndex: number | undefined;
    if (m.recurringRef) {
      recurringIndex = recurringRefs.get(normRef(m.recurringRef));
      if (recurringIndex === undefined) {
        issues.add("movements", m.row, TEMPLATE_CODES.UNKNOWN_REF, 400, "recurringRef");
        continue;
      }
    }
    let used: TemplateCard | null = null;
    const financeCharge = m.financeCharge ?? false;
    // A currency other than the account's is only possible on a credit card
    // account, against a card's own limit in that currency (its USD one, say).
    const currency = m.currency ?? acct.currency;
    const foreign = currency !== acct.currency;
    if (m.cardId) {
      used = card("movements", m.row, m.cardId);
      if (!used) continue;
      if (used.accountId !== m.bankAccountId) {
        issues.add("movements", m.row, "CARD_ACCOUNT_MISMATCH");
        continue;
      }
    } else if (
      acct.context.type === "CREDIT_CARD" &&
      !financeCharge &&
      (m.type === "EXPENSE" || foreign)
    ) {
      // A statement rarely says which plastic: the primary card, as the
      // statement importer does — also for a foreign-currency payment, which
      // settles a card's own limit and so must name one.
      used =
        [...lookup.cards.values()].find(
          (c) => c.accountId === m.bankAccountId && c.kind === "CREDIT" && c.isPrimary,
        ) ?? null;
    }
    const foreignLimit = foreign ? used?.otherLimits[currency] : undefined;
    if (foreign && (!foreignLimit || financeCharge)) {
      issues.add("movements", m.row, TEMPLATE_CODES.CURRENCY_MISMATCH, 400, "currency");
      continue;
    }
    if (!categoryOk("movements", m.row, m.categoryId, m.type)) continue;
    const write = movement({
      ...blank,
      accountId: m.bankAccountId,
      type: m.type,
      amount: m.amount,
      currency,
      occurredAt: new Date(m.occurredAt),
      description: text(m.description),
      observation: text(m.observation),
      emisor: text(m.emisor),
      receptor: text(m.receptor),
      lugar: text(m.lugar),
      categoryId: m.categoryId ?? null,
      cardId: used?.id ?? null,
      financeCharge,
      link: recurringIndex === undefined ? null : { kind: "recurring", index: recurringIndex },
    });
    push({
      date: write.occurredAt,
      sheet: "movements",
      row: m.row,
      accountId: m.bankAccountId,
      kind: "movement",
      type: m.type,
      amount: m.amount,
      card: used,
      cardLimit: foreignLimit ? foreignLimit.limit : used?.kind === "CREDIT" ? used.limit : null,
      currency,
      financeCharge,
      creditDelta: "0",
      write,
    });
  }

  // ── Transfers ───────────────────────────────────────────────────────────────
  for (const t of req.transfers) {
    const from = account("transfers", t.row, t.fromAccountId);
    const to = account("transfers", t.row, t.toAccountId);
    if (!from || !to) continue;
    const ok = issues.guard("transfers", t.row, () =>
      TransferPolicy.validate(
        {
          fromBankAccountId: t.fromAccountId,
          toBankAccountId: t.toAccountId,
          amountOut: t.outgoingAmount,
          amountIn: t.incomingAmount,
        },
        { id: from.context.id, type: from.context.type },
        { id: to.context.id, type: to.context.type },
      ),
    );
    if (!ok) continue;
    const transferGroupId = newId();
    const occurredAt = new Date(t.occurredAt);
    const shared = { ...blank, occurredAt, description: text(t.description), transferGroupId };
    movement({
      ...shared,
      accountId: t.fromAccountId,
      type: "EXPENSE",
      amount: t.outgoingAmount,
      currency: from.currency,
    });
    movement({
      ...shared,
      accountId: t.toAccountId,
      type: "INCOME",
      amount: t.incomingAmount,
      currency: to.currency,
    });
    const base = { date: occurredAt, sheet: "transfers" as const, row: t.row, card: null };
    push({
      ...base,
      accountId: t.fromAccountId,
      kind: "transferOut",
      type: "EXPENSE",
      amount: t.outgoingAmount,
      financeCharge: false,
      creditDelta: "0",
      toAccountId: t.toAccountId,
      amountIn: t.incomingAmount,
    });
    push({
      ...base,
      accountId: t.toAccountId,
      kind: "transferIn",
      type: "INCOME",
      amount: t.incomingAmount,
      financeCharge: false,
      creditDelta: "0",
    });
  }

  // ── Debts and their payments ────────────────────────────────────────────────
  const debtRefs = refIndex("debts", req.debts);
  const debts: ((TemplateDebtWrite & { sim: Debt; row: number }) | null)[] = req.debts.map((d) => {
    if (d.paymentAccountId && !account("debts", d.row, d.paymentAccountId)) return null;
    const plan = Debt.planCreation({
      direction: d.direction,
      counterparty: d.counterparty,
      principal: d.principal,
      currency: d.currency,
      openedAt: new Date(d.openedAt),
      dueAt: d.dueAt ? new Date(d.dueAt) : undefined,
      title: d.title,
      notes: d.notes,
      totalInstallments: d.totalInstallments,
      frequency: d.frequency,
      frequencyInterval: d.frequencyInterval,
      paymentAccountId: d.paymentAccountId ?? null,
    });
    const sim = Debt.fromPersistence({
      ...plan,
      id: "sim",
      userId: "sim",
      createdAt: options.now,
      updatedAt: options.now,
    } as DebtProps);
    return { plan, payments: [], sim, row: d.row };
  });
  const debtPayments = [...req.debtPayments].sort(
    (a, b) => Date.parse(a.paidAt) - Date.parse(b.paidAt) || a.row - b.row,
  );
  for (const p of debtPayments) {
    const index = debtRefs.get(normRef(p.debtRef));
    if (index === undefined) {
      issues.add("debtPayments", p.row, TEMPLATE_CODES.UNKNOWN_REF, 400, "debtRef");
      continue;
    }
    const debt = debts[index];
    if (!debt) continue; // the debt row itself was refused
    const acct = account("debtPayments", p.row, p.accountId);
    if (!acct) continue;
    const paidAt = new Date(p.paidAt);
    if (paidAt < debt.plan.openedAt) {
      issues.add("debtPayments", p.row, TEMPLATE_CODES.PAYMENT_BEFORE_START, 400, "paidAt");
      continue;
    }
    if (acct.context.type === "CREDIT_CARD") {
      issues.add("debtPayments", p.row, "DEBT_PAYMENT_FROM_CREDIT_ACCOUNT");
      continue;
    }
    if (!sameCurrency("debtPayments", p.row, acct.currency, debt.plan.currency)) continue;
    if (debt.sim.paidInstallments >= debt.sim.totalInstallments) {
      issues.add("debtPayments", p.row, TEMPLATE_CODES.TOO_MANY_PAYMENTS);
      continue;
    }
    const amount = debt.sim.nextInstallmentAmount();
    if (p.amount && !toMoney(p.amount).equals(toMoney(amount))) {
      issues.add("debtPayments", p.row, TEMPLATE_CODES.PAYMENT_AMOUNT_MISMATCH, 400, "amount");
      continue;
    }
    debt.sim.registerPayment();
    const type = debt.plan.direction === "OWED_TO_YOU" ? "INCOME" : "EXPENSE";
    const snap = debt.sim.snapshot();
    const write = movement({
      ...blank,
      accountId: p.accountId,
      type,
      amount,
      currency: acct.currency,
      occurredAt: paidAt,
      description: snap.title
        ? `${snap.counterparty} · ${snap.title} · ${snap.paidInstallments}/${snap.totalInstallments}`
        : `${snap.counterparty} · ${snap.paidInstallments}/${snap.totalInstallments}`,
      systemCategory: "DEBTS",
      link: { kind: "debt", index },
    });
    debt.payments.push({ transactionId: write.id, accountId: p.accountId, amount });
    push({
      date: paidAt,
      sheet: "debtPayments",
      row: p.row,
      accountId: p.accountId,
      kind: "simple",
      type,
      amount,
      card: null,
      financeCharge: false,
      creditDelta: "0",
      write,
    });
  }

  // ── Instalment plans and their payments ─────────────────────────────────────
  const planRefs = refIndex("plans", req.plans);
  type PlanState = TemplatePlanWrite & {
    sim: InstallmentPlan;
    creditAccountId: string | null;
    row: number;
  };
  const plans: (PlanState | null)[] = req.plans.map((p) => {
    let used: TemplateCard | null = null;
    if (p.cardId) {
      used = card("plans", p.row, p.cardId);
      if (!used) return null;
    }
    const kind = used?.kind ?? null;
    const creditAccountId = kind === "CREDIT" ? used!.accountId : null;
    if (creditAccountId) {
      const acct = account("plans", p.row, creditAccountId);
      if (!acct || !sameCurrency("plans", p.row, acct.currency, p.currency)) return null;
    }
    if (p.paymentAccountId && !account("plans", p.row, p.paymentAccountId)) return null;
    if (
      !issues.guard("plans", p.row, () =>
        InstallmentPlan.assertPaymentAccountAllowed(kind, p.paymentAccountId ?? null),
      )
    ) {
      return null;
    }
    if (!categoryOk("plans", p.row, p.categoryId, "EXPENSE")) return null;
    const plan = InstallmentPlan.planCreation({
      title: p.title,
      totalPrincipal: p.totalPrincipal,
      installmentCount: p.installmentCount,
      startDate: new Date(p.startDate),
      currency: p.currency,
      frequency: p.frequency,
      frequencyInterval: p.frequencyInterval,
      aprPerPeriod: p.aprPerPeriod,
      cardId: p.cardId ?? null,
      categoryId: p.categoryId ?? null,
      paymentAccountId: p.paymentAccountId ?? null,
    });
    const sim = InstallmentPlan.fromPersistence({
      ...plan,
      id: "sim",
      userId: "sim",
      payments: plan.payments.map((s) => ({
        id: `sim-${s.sequence}`,
        sequence: s.sequence,
        dueDate: s.dueDate,
        amount: s.amount,
        paidAt: null,
        paidAmount: null,
        carriedOverAmount: "0",
        transactionId: null,
        creditStatementId: null,
      })),
      createdAt: options.now,
      updatedAt: options.now,
    } as InstallmentPlanProps);

    const index = req.plans.indexOf(p);
    if (creditAccountId && used) {
      // Same two charges as creating the plan by hand: the purchase (with its
      // card, tied to the plan) and — when the schedule costs more than the
      // price — the interest as an issuer charge. Neither is limit-checked (R12).
      const occurredAt = plan.startDate;
      const purchase = movement({
        ...blank,
        accountId: creditAccountId,
        type: "EXPENSE",
        amount: p.totalPrincipal,
        currency: p.currency,
        occurredAt,
        description: p.title,
        categoryId: p.categoryId ?? null,
        cardId: used.id,
        link: { kind: "plan", index },
      });
      push({
        date: occurredAt,
        sheet: "plans",
        row: p.row,
        accountId: creditAccountId,
        kind: "credit",
        type: "EXPENSE",
        amount: p.totalPrincipal,
        card: null,
        financeCharge: false,
        creditDelta: p.totalPrincipal,
        write: purchase,
      });
      const scheduled = sumMoney(plan.payments.map((s) => s.amount));
      const interest = subtractMoney(scheduled, p.totalPrincipal);
      if (toMoney(interest).greaterThan(0)) {
        const amount = moneyToString(interest);
        // An issuer charge bills in its own period, so it is NOT tied to the plan.
        movement({
          ...blank,
          accountId: creditAccountId,
          type: "EXPENSE",
          amount,
          currency: p.currency,
          occurredAt,
          description: p.title,
          systemCategory: "INTEREST",
          financeCharge: true,
        });
        push({
          date: occurredAt,
          sheet: "plans",
          row: p.row,
          accountId: creditAccountId,
          kind: "credit",
          type: "EXPENSE",
          amount,
          card: null,
          financeCharge: true,
          creditDelta: amount,
        });
      }
    }
    return { plan, payments: [], sim, creditAccountId, row: p.row };
  });
  const planPayments = [...req.planPayments].sort(
    (a, b) =>
      Date.parse(a.paidAt) - Date.parse(b.paidAt) || a.sequence - b.sequence || a.row - b.row,
  );
  const seen = new Set<string>();
  for (const p of planPayments) {
    const index = planRefs.get(normRef(p.planRef));
    if (index === undefined) {
      issues.add("planPayments", p.row, TEMPLATE_CODES.UNKNOWN_REF, 400, "planRef");
      continue;
    }
    const plan = plans[index];
    if (!plan) continue;
    const key = `${index}|${p.sequence}`;
    if (seen.has(key) || p.sequence > plan.plan.installmentCount) {
      issues.add("planPayments", p.row, TEMPLATE_CODES.INVALID_SEQUENCE, 400, "sequence");
      continue;
    }
    const paidAt = new Date(p.paidAt);
    if (paidAt < plan.plan.startDate) {
      issues.add("planPayments", p.row, TEMPLATE_CODES.PAYMENT_BEFORE_START, 400, "paidAt");
      continue;
    }

    if (plan.creditAccountId) {
      // Settled outside the app: no movement, never billed, pool given back (R7).
      if (p.accountId || p.amount) {
        issues.add("planPayments", p.row, TEMPLATE_CODES.PLAN_PAYMENT_FIELDS);
        continue;
      }
      let paid = "0";
      const ok = issues.guard("planPayments", p.row, () => {
        paid = plan.sim.payInstallment(p.sequence, null, paidAt, null).paidAmount;
      });
      if (!ok) continue;
      seen.add(key);
      plan.payments.push({ sequence: p.sequence, amount: null, paidAt, transactionId: null });
      push({
        date: paidAt,
        sheet: "planPayments",
        row: p.row,
        accountId: plan.creditAccountId,
        kind: "credit",
        type: "INCOME",
        amount: paid,
        card: null,
        financeCharge: false,
        creditDelta: subtractMoney("0", paid),
      });
      continue;
    }

    if (!p.accountId || !p.amount) {
      issues.add("planPayments", p.row, TEMPLATE_CODES.PLAN_PAYMENT_FIELDS);
      continue;
    }
    const acct = account("planPayments", p.row, p.accountId);
    if (!acct) continue;
    if (acct.context.type === "CREDIT_CARD") {
      issues.add("planPayments", p.row, "INSTALLMENT_PAYMENT_FROM_CREDIT_ACCOUNT");
      continue;
    }
    if (!sameCurrency("planPayments", p.row, acct.currency, plan.plan.currency)) continue;
    const transactionId = newId();
    const amount = p.amount;
    const ok = issues.guard("planPayments", p.row, () => {
      plan.sim.payInstallment(p.sequence, amount, paidAt, transactionId);
    });
    if (!ok) continue;
    seen.add(key);
    plan.payments.push({ sequence: p.sequence, amount, paidAt, transactionId });
    const write = movement({
      ...blank,
      id: transactionId,
      accountId: p.accountId,
      type: "EXPENSE",
      amount,
      currency: acct.currency,
      occurredAt: paidAt,
      description: `${plan.plan.title} · ${p.sequence}/${plan.plan.installmentCount}`,
      categoryId: plan.plan.categoryId,
      link: { kind: "plan", index },
    });
    push({
      date: paidAt,
      sheet: "planPayments",
      row: p.row,
      accountId: p.accountId,
      kind: "simple",
      type: "EXPENSE",
      amount,
      card: null,
      financeCharge: false,
      creditDelta: "0",
      write,
    });
  }
  // ── Savings goals and contributions ─────────────────────────────────────────
  const goalRefs = refIndex("goals", req.goals);
  const goals: TemplateGoalWrite[] = req.goals.map((g) => ({
    plan: SavingsGoal.planCreation({
      title: g.title,
      targetAmount: g.targetAmount,
      currency: g.currency,
      deadline: g.deadline ? new Date(g.deadline) : undefined,
      notes: g.notes,
    }),
    contributions: [],
  }));
  for (const c of req.contributions) {
    const goalIndex = goalRefs.get(normRef(c.goalRef));
    if (goalIndex === undefined) {
      issues.add("contributions", c.row, TEMPLATE_CODES.UNKNOWN_REF, 400, "goalRef");
      continue;
    }
    const acct = account("contributions", c.row, c.bankAccountId);
    if (!acct) continue;
    const goal = goals[goalIndex];
    if (!sameCurrency("contributions", c.row, acct.currency, goal.plan.currency)) continue;
    const contributedAt = new Date(c.contributedAt);
    const write = movement({
      ...blank,
      accountId: c.bankAccountId,
      type: "EXPENSE",
      amount: c.amount,
      currency: acct.currency,
      occurredAt: contributedAt,
      description: `Aporte a «${goal.plan.title}»`,
      systemCategory: "SAVINGS",
      link: { kind: "contribution", goalIndex, contributionIndex: goal.contributions.length },
    });
    goal.contributions.push({
      transactionId: write.id,
      accountId: c.bankAccountId,
      amount: c.amount,
      currency: acct.currency,
      contributedAt,
    });
    push({
      date: contributedAt,
      sheet: "contributions",
      row: c.row,
      accountId: c.bankAccountId,
      kind: "simple",
      type: "EXPENSE",
      amount: c.amount,
      card: null,
      financeCharge: false,
      creditDelta: "0",
      write,
    });
  }

  // ── The timeline: every money effect, validated in order per account ────────
  events.sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      SHEET_ORDER.get(a.sheet)! - SHEET_ORDER.get(b.sheet)! ||
      a.row - b.row ||
      a.seq - b.seq,
  );

  const effectOf = (e: MoneyEvent, ctx: AccountContext): { cash: string; credit: string } => {
    switch (e.kind) {
      case "movement":
        return {
          cash: cashDelta(e.type, e.amount, ctx, e.card),
          credit: MovementPolicy.contribution(
            { type: e.type, amount: e.amount, financeCharge: e.financeCharge },
            ctx,
            e.card,
            e.cardLimit ?? null,
          ),
        };
      case "credit":
        return { cash: "0", credit: e.creditDelta };
      default:
        return { cash: balanceDelta(e.type, e.amount), credit: "0" };
    }
  };

  // Pass 1: what the import adds to each account, to know where `INCLUDED`
  // accounts start from.
  const net = new Map<string, { cash: string; credit: string }>();
  for (const e of events) {
    const ctx = lookup.accounts.get(e.accountId)!.context;
    const effect = effectOf(e, ctx);
    const acc = net.get(e.accountId) ?? { cash: "0", credit: "0" };
    net.set(e.accountId, {
      cash: addMoney(acc.cash, effect.cash),
      credit: addMoney(acc.credit, effect.credit),
    });
  }
  const modes = new Map(req.balanceModes.map((m) => [m.accountId, m.mode]));
  const modeOf = (id: string): imports.BalanceMode => modes.get(id) ?? "INCLUDED";

  // Pass 2: validate against the running figures.
  const running = new Map<string, AccountContext>();
  for (const [id, n] of net) {
    const ctx = lookup.accounts.get(id)!.context;
    const included = modeOf(id) === "INCLUDED";
    running.set(id, {
      ...ctx,
      currentBalance: included ? subtractMoney(ctx.currentBalance, n.cash) : ctx.currentBalance,
      creditUsed: included ? subtractMoney(ctx.creditUsed, n.credit) : ctx.creditUsed,
    });
  }
  // Running usage of each card's own limit, per currency: a card's USD limit and
  // its CLP one are separate caps.
  const cardUsage = new Map<string, { income: string; expense: string }>();
  const usageKey = (e: MoneyEvent) => `${e.card!.id}|${e.currency}`;
  const initialUsage = (e: MoneyEvent) => {
    const accountCurrency = lookup.accounts.get(e.accountId)!.currency;
    return e.currency === accountCurrency
      ? { ...e.card!.usage }
      : { ...e.card!.otherLimits[e.currency!]!.usage };
  };
  for (const e of events) {
    const ctx = running.get(e.accountId)!;
    const ok = issues.guard(e.sheet, e.row, () => {
      if (e.kind === "movement") {
        const usage = e.card
          ? (cardUsage.get(usageKey(e)) ?? initialUsage(e))
          : { income: "0", expense: "0" };
        MovementPolicy.validate(
          {
            type: e.type,
            bankAccountId: e.accountId,
            cardId: e.card?.id ?? null,
            amount: e.amount,
            currency: e.currency!,
            financeCharge: e.financeCharge,
          },
          ctx,
          e.card,
          e.cardLimit ?? null,
          usage,
        );
      } else if (e.kind === "transferOut") {
        const to = lookup.accounts.get(e.toAccountId!)!.context;
        TransferPolicy.validate(
          {
            fromBankAccountId: e.accountId,
            toBankAccountId: e.toAccountId!,
            amountOut: e.amount,
            amountIn: e.amountIn!,
          },
          { id: ctx.id, type: ctx.type, currentBalance: ctx.currentBalance },
          { id: to.id, type: to.type },
        );
      } else if (e.kind === "simple") {
        MovementPolicy.assertWithinPrepaidBalance(e, ctx);
        MovementPolicy.assertWithinOverdraft(e, ctx);
        MovementPolicy.assertWithinCeiling(e, ctx);
      }
    });
    if (!ok) continue;
    const effect = effectOf(e, ctx);
    ctx.currentBalance = addMoney(ctx.currentBalance, effect.cash);
    ctx.creditUsed = addMoney(ctx.creditUsed, effect.credit);
    if (e.write && e.kind === "movement" && Number(effect.credit) !== 0) {
      e.write.drawsOnCredit = true;
    }
    if (e.kind === "movement" && e.card && e.cardLimit) {
      const usage = cardUsage.get(usageKey(e)) ?? initialUsage(e);
      if (e.type === "EXPENSE") usage.expense = addMoney(usage.expense, e.amount);
      else usage.income = addMoney(usage.income, e.amount);
      cardUsage.set(usageKey(e), usage);
    }
  }

  const accounts: imports.TemplateAccountEffect[] = [...net.entries()].map(([id, n]) => {
    const acct = lookup.accounts.get(id)!;
    const mode = modeOf(id);
    const included = mode === "INCLUDED";
    return {
      accountId: id,
      currency: acct.currency,
      mode,
      netCash: moneyToString(n.cash),
      netCredit: moneyToString(n.credit),
      balanceAfter: moneyToString(
        included ? acct.context.currentBalance : addMoney(acct.context.currentBalance, n.cash),
      ),
      creditUsedAfter: moneyToString(
        included ? acct.context.creditUsed : addMoney(acct.context.creditUsed, n.credit),
      ),
    };
  });

  return {
    counts,
    issues: issues.list,
    accounts,
    movements,
    debts,
    plans,
    recurring,
    goals,
  };
}
