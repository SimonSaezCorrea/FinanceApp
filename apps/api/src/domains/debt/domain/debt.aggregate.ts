import type { debts } from "@finance/contracts";
import { equalPrincipalSchedule, moneyToString, toMoney } from "@finance/money";

import {
  AllInstallmentsPaidError,
  DebtAlreadySettledError,
  DebtNotSettledError,
  DebtNotWrittenOffError,
  DebtPaymentExceedsPendingError,
  DebtTotalBelowPaidError,
  DebtWrittenOffError,
  InvalidDebtPaymentAmountError,
  NoPaymentsToUndoError,
  TotalInstallmentsBelowPaidError,
} from "./errors";

/** What a successful `settle()`/`registerPayment()` moved on a real account —
 * `undoPayment()`/`unsettle()` read it back to reverse exactly that. */
/** A `@finance/money` decimal. */
type Money = ReturnType<typeof toMoney>;

export interface DebtPaymentRecord {
  transactionId: string;
  accountId: string;
  /** moneyString, in the ACCOUNT's currency. */
  amount: string;
}

/** What `undoPayment()`/`unsettle()` need reversed — null when the debt had
 * no real-money payment recorded to begin with (created before this feature,
 * or never paid). */
export type ReversedPayment = DebtPaymentRecord | null;

export interface DebtProps {
  id: string;
  userId: string;
  direction: debts.DebtDirection;
  counterparty: string;
  principal: string;
  currency: string;
  openedAt: Date;
  dueAt: Date | null;
  interestApr: string | null;
  /** Short label — what every list/detail view displays as the debt's name. */
  title: string | null;
  /** Free-text notes/observación, separate from `title`. */
  notes: string | null;
  settledAt: Date | null;
  totalInstallments: number;
  paidInstallments: number;
  installmentAmount: string | null;
  frequency: debts.Debt["frequency"];
  frequencyInterval: number;
  /** The payment panel's default suggestion — see the contract. */
  paymentAccountId: string | null;
  /** See `DebtPaymentRecord`. */
  lastPaymentTransactionId: string | null;
  lastPaymentAccountId: string | null;
  lastPaymentAmount: string | null;
  /** What has actually been paid, in the debt's currency. Null = never
   * written since the column exists; `paidSoFar()` derives it then. */
  paidAmount: string | null;
  /** Given up on ("no se pagará") — see `writeOff()`. */
  writtenOffAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DebtPatch = Partial<{
  direction: debts.DebtDirection;
  counterparty: string;
  principal: string;
  currency: string;
  openedAt: Date;
  dueAt: Date;
  interestApr: string | null;
  title: string | null;
  notes: string | null;
  totalInstallments: number;
  installmentAmount: string | null;
  frequency: debts.Debt["frequency"];
  frequencyInterval: number;
  paymentAccountId: string | null;
}>;

/** A brand-new debt, as planned by `Debt.planCreation` — no `id`/`userId`/
 * timestamps yet (the repository adapter assigns them on insert, `userId`
 * supplied separately to `create(userId, plan)`, same convention as
 * `installments`' `CreateInstallmentPlanPlan`). */
export type PlannedDebt = Omit<DebtProps, "id" | "userId" | "createdAt" | "updatedAt">;

/**
 * `Debt` aggregate: money owed between the user and a counterparty, either
 * direction (`OWED_TO_YOU`/`YOU_OWE`), optionally paid off across scheduled
 * installments. Owns the settle/unsettle/register-payment/undo-payment
 * invariants that used to live in `DebtsService`:
 *  - `settle()` requires the debt not to be already settled
 *    (`DEBT_ALREADY_SETTLED`) — the pre-migration `DebtsService.settle` had
 *    no guard and re-stamped `settledAt` on every call; a legitimate second
 *    click on an already-settled debt must not move that date.
 *  - `unsettle()` requires the debt to currently be settled
 *    (`DEBT_NOT_SETTLED` otherwise).
 *  - `registerPayment()` requires it to be neither already settled
 *    (`DEBT_ALREADY_SETTLED`) nor fully paid (`ALL_INSTALLMENTS_PAID`);
 *    reaching `totalInstallments` auto-settles it.
 *  - `undoPayment()` requires at least one payment to undo
 *    (`NO_PAYMENTS_TO_UNDO`); it clears `settledAt` only when THIS payment is
 *    the one that completed the schedule and thereby auto-settled it — a
 *    debt settled manually (`settle()`) while not fully paid is a fact of
 *    its own that an unrelated instalment payment must not undo.
 *  - `applyUpdate()` refuses a `totalInstallments` below what is already
 *    paid (`TOTAL_INSTALLMENTS_BELOW_PAID`) — a schedule may shrink, never
 *    past what already happened.
 */
export class Debt {
  private constructor(private props: DebtProps) {}

  static fromPersistence(props: DebtProps): Debt {
    return new Debt({ ...props });
  }

  /** Factory Method (FR-008): plans a brand-new debt's persisted shape from
   * validated `CreateDebt` input — `id`/`createdAt`/`updatedAt` stay a
   * persistence concern. */
  static planCreation(input: {
    direction: debts.DebtDirection;
    counterparty: string;
    principal: string;
    currency: string;
    openedAt: Date;
    dueAt?: Date;
    interestApr?: string;
    title?: string;
    notes?: string;
    totalInstallments: number;
    installmentAmount?: string;
    frequency: debts.Debt["frequency"];
    frequencyInterval: number;
    paymentAccountId?: string | null;
  }): PlannedDebt {
    return {
      direction: input.direction,
      counterparty: input.counterparty,
      principal: input.principal,
      currency: input.currency,
      openedAt: input.openedAt,
      dueAt: input.dueAt ?? null,
      interestApr: input.interestApr ?? null,
      title: input.title ?? null,
      notes: input.notes ?? null,
      settledAt: null,
      totalInstallments: input.totalInstallments,
      paidInstallments: 0,
      installmentAmount: input.installmentAmount ?? null,
      frequency: input.frequency,
      frequencyInterval: input.frequencyInterval,
      paymentAccountId: input.paymentAccountId ?? null,
      lastPaymentTransactionId: null,
      lastPaymentAccountId: null,
      lastPaymentAmount: null,
      paidAmount: "0",
      writtenOffAt: null,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get settledAt(): Date | null {
    return this.props.settledAt;
  }
  get paidInstallments(): number {
    return this.props.paidInstallments;
  }
  get totalInstallments(): number {
    return this.props.totalInstallments;
  }
  get direction(): debts.DebtDirection {
    return this.props.direction;
  }
  get currency(): string {
    return this.props.currency;
  }
  get writtenOffAt(): Date | null {
    return this.props.writtenOffAt;
  }

  /** The scheduled instalments' amounts: `installmentAmount` each when the
   * schedule declared one, otherwise `principal` split evenly in the
   * currency's minor unit (whole pesos: 64.990 in 3 is 21.663 + 21.663 +
   * 21.664). Never stored — derived from the debt's own terms. */
  private rows(): Money[] {
    const count = Math.max(this.props.totalInstallments, 1);
    if (this.props.installmentAmount !== null) {
      return Array.from({ length: count }, () => toMoney(this.props.installmentAmount!));
    }
    if (toMoney(this.props.principal).lte(0)) {
      return Array.from({ length: count }, () => toMoney(0));
    }
    return equalPrincipalSchedule({
      totalPrincipal: this.props.principal,
      installmentCount: count,
      currency: this.props.currency,
    }).map((r) => toMoney(r.payment));
  }

  /** Running totals of `rows()`: what has to be paid for each instalment to be covered. */
  private cumulative(): Money[] {
    let acc = toMoney(0);
    return this.rows().map((r) => (acc = acc.plus(r)));
  }

  /** Everything the debt asks for: the sum of its instalments. */
  totalAmount(): string {
    const cum = this.cumulative();
    return moneyToString(cum[cum.length - 1] ?? 0);
  }

  /** What has actually been paid. A debt no payment has touched since
   * `paidAmount` exists reads it from the old counter: the whole debt when it
   * was settled by a recorded payment (or every instalment counted), else the
   * schedule's first `paidInstallments` rows. */
  paidSoFar(): string {
    if (this.props.paidAmount !== null) return moneyToString(this.props.paidAmount);
    const settledByPayment =
      this.props.settledAt !== null &&
      (this.props.lastPaymentTransactionId !== null ||
        this.props.paidInstallments >= this.props.totalInstallments);
    if (settledByPayment) return this.totalAmount();
    const cum = this.cumulative();
    const n = Math.min(this.props.paidInstallments, cum.length);
    return moneyToString(n === 0 ? 0 : cum[n - 1]!);
  }

  /** Everything still owed: the total less what was paid, never negative.
   * What `settle()` moves. */
  pendingAmount(): string {
    const left = toMoney(this.totalAmount()).minus(toMoney(this.paidSoFar()));
    return moneyToString(left.isNegative() ? 0 : left);
  }

  /** What is left of the current instalment — the amount a payment suggests.
   * A short payment leaves the rest of its instalment here (21.663 paid on a
   * 21.664 instalment suggests 1 next); an overpayment eats into the next one. */
  nextInstallmentAmount(): string {
    const paid = toMoney(this.paidSoFar());
    const next = this.cumulative().find((c) => c.gt(paid));
    return moneyToString(next ? next.minus(paid) : 0);
  }

  /** Writes what was paid and keeps `paidInstallments` = the instalments it
   * fully covers, so the counter can never disagree with the money. */
  private setPaid(amount: Money): void {
    const paid = amount.isNegative() ? toMoney(0) : amount;
    this.props.paidAmount = moneyToString(paid);
    this.props.paidInstallments = this.cumulative().filter((c) => c.lte(paid)).length;
  }

  /** Apply a partial patch to the debt's own scalar fields. */
  applyUpdate(patch: DebtPatch): void {
    const paidBefore = toMoney(this.paidSoFar());
    if (patch.direction !== undefined) this.props.direction = patch.direction;
    if (patch.counterparty !== undefined) this.props.counterparty = patch.counterparty;
    if (patch.principal !== undefined) this.props.principal = patch.principal;
    if (patch.currency !== undefined) this.props.currency = patch.currency;
    if (patch.openedAt !== undefined) this.props.openedAt = patch.openedAt;
    if (patch.dueAt !== undefined) this.props.dueAt = patch.dueAt;
    if (patch.interestApr !== undefined) this.props.interestApr = patch.interestApr;
    if (patch.title !== undefined) this.props.title = patch.title;
    if (patch.notes !== undefined) this.props.notes = patch.notes;
    if (patch.totalInstallments !== undefined) {
      if (patch.totalInstallments < this.props.paidInstallments) {
        throw new TotalInstallmentsBelowPaidError();
      }
      this.props.totalInstallments = patch.totalInstallments;
    }
    if (patch.installmentAmount !== undefined)
      this.props.installmentAmount = patch.installmentAmount;
    if (patch.frequency !== undefined) this.props.frequency = patch.frequency;
    if (patch.frequencyInterval !== undefined)
      this.props.frequencyInterval = patch.frequencyInterval;
    if (patch.paymentAccountId !== undefined) this.props.paymentAccountId = patch.paymentAccountId;

    const scheduleChanged =
      patch.principal !== undefined ||
      patch.currency !== undefined ||
      patch.totalInstallments !== undefined ||
      patch.installmentAmount !== undefined;
    if (scheduleChanged && !paidBefore.isZero()) {
      // New terms can't ask for less than what already arrived.
      if (toMoney(this.totalAmount()).lt(paidBefore)) throw new DebtTotalBelowPaidError();
      this.setPaid(paidBefore);
    }
  }

  /** Marks the debt settled — `DEBT_ALREADY_SETTLED` if it already was,
   * rather than silently re-stamping `settledAt` to a fresh timestamp.
   * `payment`, when given, is the real movement this settle produced
   * (`pendingAmount()`'s worth, moved on `payment.accountId`) — recorded so
   * `unsettle()` can reverse it. Omitted by a caller with nothing to move
   * (kept optional so the aggregate's own unit tests can call this bare). */
  settle(payment?: DebtPaymentRecord): void {
    if (this.props.settledAt !== null) throw new DebtAlreadySettledError();
    if (this.props.writtenOffAt !== null) throw new DebtWrittenOffError();
    const amount = toMoney(payment?.amount ?? this.pendingAmount());
    this.setPaid(toMoney(this.paidSoFar()).plus(amount));
    this.props.settledAt = new Date();
    if (payment) this.recordPayment(payment);
  }

  /** Reverts a settled debt back to open — `DEBT_NOT_SETTLED` if it wasn't
   * settled to begin with. Returns whatever real movement `settle()` (or the
   * `registerPayment()` that auto-settled it) recorded, for the caller to
   * reverse — null when there was none. */
  unsettle(): ReversedPayment {
    if (this.props.settledAt === null) throw new DebtNotSettledError();
    const paid = toMoney(this.paidSoFar());
    this.props.settledAt = null;
    const reversed = this.takePaymentRecord();
    if (reversed) this.setPaid(paid.minus(toMoney(reversed.amount)));
    return reversed;
  }

  /** Registers one more paid installment — `DEBT_ALREADY_SETTLED` if already
   * settled, `ALL_INSTALLMENTS_PAID` if the schedule is already complete;
   * auto-settles once the last installment is registered. `payment`, when
   * given, is the real movement this call produced (`nextInstallmentAmount()`'s
   * worth) — recorded so `undoPayment()` can reverse it. */
  registerPayment(payment?: DebtPaymentRecord): void {
    if (this.props.settledAt !== null) throw new DebtAlreadySettledError();
    if (this.props.writtenOffAt !== null) throw new DebtWrittenOffError();
    const pending = toMoney(this.pendingAmount());
    if (pending.lte(0)) throw new AllInstallmentsPaidError();
    const amount = toMoney(payment?.amount ?? this.nextInstallmentAmount());
    if (amount.lte(0)) throw new InvalidDebtPaymentAmountError();
    if (amount.gt(pending)) throw new DebtPaymentExceedsPendingError();
    this.setPaid(toMoney(this.paidSoFar()).plus(amount));
    if (amount.eq(pending)) this.props.settledAt = new Date();
    if (payment) this.recordPayment(payment);
  }

  /** Reverts the most recent payment — `NO_PAYMENTS_TO_UNDO` if none were
   * registered; clears `settledAt` only when the undone payment is the one
   * that completed the schedule and thereby auto-settled it (a debt settled
   * manually while not fully paid is a separate fact this payment did not
   * cause). Returns whatever real movement that payment recorded, for the
   * caller to reverse — null when there was none. */
  undoPayment(): ReversedPayment {
    const paid = toMoney(this.paidSoFar());
    if (paid.lte(0)) throw new NoPaymentsToUndoError();
    const completedTheDebt = paid.gte(toMoney(this.totalAmount()));
    const reversed = this.takePaymentRecord();
    // Without a record (a payment from before they were recorded) only the
    // counter can go back: down to the previous instalment boundary.
    const previousBoundary = [...this.cumulative()].reverse().find((c) => c.lt(paid)) ?? toMoney(0);
    this.setPaid(reversed ? paid.minus(toMoney(reversed.amount)) : previousBoundary);
    if (completedTheDebt && this.props.settledAt !== null) {
      this.props.settledAt = null;
    }
    return reversed;
  }

  /** Gives up on what is still pending ("no se pagará"): it stops counting as
   * owed anywhere and no payment is accepted until `reinstate()`. Payments
   * already made stay. A settled debt has nothing left to give up on. */
  writeOff(): void {
    if (this.props.settledAt !== null) throw new DebtAlreadySettledError();
    if (this.props.writtenOffAt !== null) throw new DebtWrittenOffError();
    this.props.writtenOffAt = new Date();
  }

  /** Undoes `writeOff()`: the pending amount is owed again. */
  reinstate(): void {
    if (this.props.writtenOffAt === null) throw new DebtNotWrittenOffError();
    this.props.writtenOffAt = null;
  }

  private recordPayment(payment: DebtPaymentRecord): void {
    this.props.lastPaymentTransactionId = payment.transactionId;
    this.props.lastPaymentAccountId = payment.accountId;
    this.props.lastPaymentAmount = payment.amount;
  }

  /** Reads back and clears whatever `recordPayment` last stored — "take" so a
   * second undo/unsettle of the SAME payment can't reverse it twice. */
  private takePaymentRecord(): ReversedPayment {
    const { lastPaymentTransactionId, lastPaymentAccountId, lastPaymentAmount } = this.props;
    if (!lastPaymentTransactionId || !lastPaymentAccountId || !lastPaymentAmount) return null;
    this.props.lastPaymentTransactionId = null;
    this.props.lastPaymentAccountId = null;
    this.props.lastPaymentAmount = null;
    return {
      transactionId: lastPaymentTransactionId,
      accountId: lastPaymentAccountId,
      amount: lastPaymentAmount,
    };
  }

  snapshot(): Readonly<DebtProps> {
    return this.props;
  }

  toContract(): debts.Debt {
    return {
      id: this.props.id,
      direction: this.props.direction,
      counterparty: this.props.counterparty,
      principal: moneyToString(this.props.principal),
      currency: this.props.currency,
      openedAt: this.props.openedAt.toISOString(),
      dueAt: this.props.dueAt ? this.props.dueAt.toISOString() : null,
      interestApr: this.props.interestApr ? moneyToString(this.props.interestApr) : null,
      title: this.props.title,
      notes: this.props.notes,
      settledAt: this.props.settledAt ? this.props.settledAt.toISOString() : null,
      totalInstallments: this.props.totalInstallments,
      paidInstallments: this.props.paidInstallments,
      installmentAmount: this.props.installmentAmount
        ? moneyToString(this.props.installmentAmount)
        : null,
      frequency: this.props.frequency,
      frequencyInterval: this.props.frequencyInterval,
      paymentAccountId: this.props.paymentAccountId,
      lastPaymentTransactionId: this.props.lastPaymentTransactionId,
      lastPaymentAccountId: this.props.lastPaymentAccountId,
      lastPaymentAmount: this.props.lastPaymentAmount
        ? moneyToString(this.props.lastPaymentAmount)
        : null,
      paidAmount: this.paidSoFar(),
      writtenOffAt: this.props.writtenOffAt ? this.props.writtenOffAt.toISOString() : null,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
