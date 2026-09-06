import type { debts } from "@finance/contracts";
import { moneyToString, toMoney } from "@finance/money";

import {
  AllInstallmentsPaidError,
  DebtAlreadySettledError,
  DebtNotSettledError,
  NoPaymentsToUndoError,
  TotalInstallmentsBelowPaidError,
} from "./errors";

/** What a successful `settle()`/`registerPayment()` moved on a real account —
 * `undoPayment()`/`unsettle()` read it back to reverse exactly that. */
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

  /** One instalment's worth — `installmentAmount` when the schedule declared
   * one, otherwise `principal` split evenly. Same figure the "Registrar
   * abono" panel already previews before confirming. */
  nextInstallmentAmount(): string {
    return moneyToString(
      this.props.installmentAmount ??
        toMoney(this.props.principal).dividedBy(this.props.totalInstallments),
    );
  }

  /** Everything still owed right now: the instalments not yet paid, at one
   * instalment's worth each. What `settle()` moves — whether this debt has
   * never had an instalment (a single payment) or is having its last one
   * paid off in one shot. */
  pendingAmount(): string {
    const remaining = this.props.totalInstallments - this.props.paidInstallments;
    return moneyToString(toMoney(this.nextInstallmentAmount()).times(Math.max(remaining, 0)));
  }

  /** Apply a partial patch to the debt's own scalar fields. */
  applyUpdate(patch: DebtPatch): void {
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
  }

  /** Marks the debt settled — `DEBT_ALREADY_SETTLED` if it already was,
   * rather than silently re-stamping `settledAt` to a fresh timestamp.
   * `payment`, when given, is the real movement this settle produced
   * (`pendingAmount()`'s worth, moved on `payment.accountId`) — recorded so
   * `unsettle()` can reverse it. Omitted by a caller with nothing to move
   * (kept optional so the aggregate's own unit tests can call this bare). */
  settle(payment?: DebtPaymentRecord): void {
    if (this.props.settledAt !== null) throw new DebtAlreadySettledError();
    this.props.settledAt = new Date();
    if (payment) this.recordPayment(payment);
  }

  /** Reverts a settled debt back to open — `DEBT_NOT_SETTLED` if it wasn't
   * settled to begin with. Returns whatever real movement `settle()` (or the
   * `registerPayment()` that auto-settled it) recorded, for the caller to
   * reverse — null when there was none. */
  unsettle(): ReversedPayment {
    if (this.props.settledAt === null) throw new DebtNotSettledError();
    this.props.settledAt = null;
    return this.takePaymentRecord();
  }

  /** Registers one more paid installment — `DEBT_ALREADY_SETTLED` if already
   * settled, `ALL_INSTALLMENTS_PAID` if the schedule is already complete;
   * auto-settles once the last installment is registered. `payment`, when
   * given, is the real movement this call produced (`nextInstallmentAmount()`'s
   * worth) — recorded so `undoPayment()` can reverse it. */
  registerPayment(payment?: DebtPaymentRecord): void {
    if (this.props.settledAt !== null) throw new DebtAlreadySettledError();
    if (this.props.paidInstallments >= this.props.totalInstallments) {
      throw new AllInstallmentsPaidError();
    }
    this.props.paidInstallments += 1;
    if (this.props.paidInstallments === this.props.totalInstallments) {
      this.props.settledAt = new Date();
    }
    if (payment) this.recordPayment(payment);
  }

  /** Reverts the most recent payment — `NO_PAYMENTS_TO_UNDO` if none were
   * registered; clears `settledAt` only when the undone payment is the one
   * that completed the schedule and thereby auto-settled it (a debt settled
   * manually while not fully paid is a separate fact this payment did not
   * cause). Returns whatever real movement that payment recorded, for the
   * caller to reverse — null when there was none. */
  undoPayment(): ReversedPayment {
    if (this.props.paidInstallments === 0) throw new NoPaymentsToUndoError();
    const completedTheSchedule = this.props.paidInstallments === this.props.totalInstallments;
    this.props.paidInstallments -= 1;
    if (completedTheSchedule && this.props.settledAt !== null) {
      this.props.settledAt = null;
    }
    return this.takePaymentRecord();
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
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
