import type { debts } from "@finance/contracts";
import { moneyToString } from "@finance/money";

import {
  AllInstallmentsPaidError,
  DebtAlreadySettledError,
  DebtNotSettledError,
  NoPaymentsToUndoError,
} from "./errors";

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
  notes: string | null;
  settledAt: Date | null;
  totalInstallments: number;
  paidInstallments: number;
  installmentAmount: string | null;
  frequency: debts.Debt["frequency"];
  frequencyInterval: number;
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
  notes: string | null;
  totalInstallments: number;
  installmentAmount: string | null;
  frequency: debts.Debt["frequency"];
  frequencyInterval: number;
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
 *  - `settle()` marks it settled directly, no guard (mirrors the
 *    pre-migration `DebtsService.settle`, which never checked prior state).
 *  - `unsettle()` requires the debt to currently be settled
 *    (`DEBT_NOT_SETTLED` otherwise).
 *  - `registerPayment()` requires it to be neither already settled
 *    (`DEBT_ALREADY_SETTLED`) nor fully paid (`ALL_INSTALLMENTS_PAID`);
 *    reaching `totalInstallments` auto-settles it.
 *  - `undoPayment()` requires at least one payment to undo
 *    (`NO_PAYMENTS_TO_UNDO`); undoing the payment that had settled it also
 *    clears `settledAt`.
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
    notes?: string;
    totalInstallments: number;
    installmentAmount?: string;
    frequency: debts.Debt["frequency"];
    frequencyInterval: number;
  }): PlannedDebt {
    return {
      direction: input.direction,
      counterparty: input.counterparty,
      principal: input.principal,
      currency: input.currency,
      openedAt: input.openedAt,
      dueAt: input.dueAt ?? null,
      interestApr: input.interestApr ?? null,
      notes: input.notes ?? null,
      settledAt: null,
      totalInstallments: input.totalInstallments,
      paidInstallments: 0,
      installmentAmount: input.installmentAmount ?? null,
      frequency: input.frequency,
      frequencyInterval: input.frequencyInterval,
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

  /** Apply a partial patch to the debt's own scalar fields. */
  applyUpdate(patch: DebtPatch): void {
    if (patch.direction !== undefined) this.props.direction = patch.direction;
    if (patch.counterparty !== undefined) this.props.counterparty = patch.counterparty;
    if (patch.principal !== undefined) this.props.principal = patch.principal;
    if (patch.currency !== undefined) this.props.currency = patch.currency;
    if (patch.openedAt !== undefined) this.props.openedAt = patch.openedAt;
    if (patch.dueAt !== undefined) this.props.dueAt = patch.dueAt;
    if (patch.interestApr !== undefined) this.props.interestApr = patch.interestApr;
    if (patch.notes !== undefined) this.props.notes = patch.notes;
    if (patch.totalInstallments !== undefined)
      this.props.totalInstallments = patch.totalInstallments;
    if (patch.installmentAmount !== undefined)
      this.props.installmentAmount = patch.installmentAmount;
    if (patch.frequency !== undefined) this.props.frequency = patch.frequency;
    if (patch.frequencyInterval !== undefined)
      this.props.frequencyInterval = patch.frequencyInterval;
  }

  /** Marks the debt settled directly — no guard, mirrors the pre-migration
   * `DebtsService.settle`. */
  settle(): void {
    this.props.settledAt = new Date();
  }

  /** Reverts a settled debt back to open — `DEBT_NOT_SETTLED` if it wasn't
   * settled to begin with. */
  unsettle(): void {
    if (this.props.settledAt === null) throw new DebtNotSettledError();
    this.props.settledAt = null;
  }

  /** Registers one more paid installment — `DEBT_ALREADY_SETTLED` if already
   * settled, `ALL_INSTALLMENTS_PAID` if the schedule is already complete;
   * auto-settles once the last installment is registered. */
  registerPayment(): void {
    if (this.props.settledAt !== null) throw new DebtAlreadySettledError();
    if (this.props.paidInstallments >= this.props.totalInstallments) {
      throw new AllInstallmentsPaidError();
    }
    this.props.paidInstallments += 1;
    if (this.props.paidInstallments === this.props.totalInstallments) {
      this.props.settledAt = new Date();
    }
  }

  /** Reverts the most recent payment — `NO_PAYMENTS_TO_UNDO` if none were
   * registered; clears `settledAt` if the undone payment was the one that
   * had settled it. */
  undoPayment(): void {
    if (this.props.paidInstallments === 0) throw new NoPaymentsToUndoError();
    this.props.paidInstallments -= 1;
    if (this.props.settledAt !== null) this.props.settledAt = null;
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
      notes: this.props.notes,
      settledAt: this.props.settledAt ? this.props.settledAt.toISOString() : null,
      totalInstallments: this.props.totalInstallments,
      paidInstallments: this.props.paidInstallments,
      installmentAmount: this.props.installmentAmount
        ? moneyToString(this.props.installmentAmount)
        : null,
      frequency: this.props.frequency,
      frequencyInterval: this.props.frequencyInterval,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
