import type { installments } from "@finance/contracts";
import { equalPrincipalSchedule, moneyToString } from "@finance/money";

import { InstallmentPaymentNotFoundError } from "./errors";

export interface InstallmentPaymentProps {
  id: string;
  sequence: number;
  dueDate: Date;
  amount: string;
  paidAt: Date | null;
}

export interface InstallmentPlanProps {
  id: string;
  userId: string;
  title: string;
  totalPrincipal: string;
  installmentCount: number;
  startDate: Date;
  currency: string;
  frequency: installments.InstallmentFrequency;
  frequencyInterval: number;
  notes: string | null;
  payments: InstallmentPaymentProps[];
  createdAt: Date;
  updatedAt: Date;
}

export type InstallmentPlanPatch = Partial<{
  title: string;
  currency: string;
  frequency: installments.InstallmentFrequency;
  frequencyInterval: number;
  notes: string | null;
}>;

/** A brand-new plan's payments, as planned by `planCreation` — no `id` yet
 * (the repository adapter assigns it on insert). */
export type PlannedPayment = { sequence: number; dueDate: Date; amount: string };

/**
 * `InstallmentPlan` aggregate: a purchase paid off in scheduled installments
 * (`InstallmentPayment` children). Owns the schedule-generation invariant
 * (equal-principal amortization via `@finance/money`, due dates stepped by
 * frequency x interval) and the pay/unpay invariant (a payment must exist on
 * this plan to be marked paid/unpaid — `INSTALLMENT_PAYMENT_NOT_FOUND`
 * otherwise). Marking paid/unpaid is intentionally idempotent (mirrors the
 * pre-migration `InstallmentsRepository.markPaid`/`markUnpaid`, which just set
 * `paidAt` regardless of its previous value) — this domain has no
 * "already paid" error.
 */
export class InstallmentPlan {
  private constructor(private props: InstallmentPlanProps) {}

  static fromPersistence(props: InstallmentPlanProps): InstallmentPlan {
    return new InstallmentPlan({ ...props, payments: props.payments.map((p) => ({ ...p })) });
  }

  /**
   * Factory Method (FR-008): plans a brand-new plan's schedule — equal
   * principal per installment (optionally with simple interest via
   * `aprPerPeriod`), due dates stepped `frequency x frequencyInterval` from
   * `startDate`. Returns plain data the infrastructure adapter inserts; `id`
   * assignment stays a persistence concern (Prisma's `@default(cuid())`).
   */
  static planCreation(input: {
    title: string;
    totalPrincipal: string;
    installmentCount: number;
    startDate: Date;
    currency: string;
    frequency: installments.InstallmentFrequency;
    frequencyInterval: number;
    aprPerPeriod?: string;
    notes?: string | null;
  }): {
    title: string;
    totalPrincipal: string;
    installmentCount: number;
    startDate: Date;
    currency: string;
    frequency: installments.InstallmentFrequency;
    frequencyInterval: number;
    notes: string | null;
    payments: PlannedPayment[];
  } {
    const schedule = equalPrincipalSchedule({
      totalPrincipal: input.totalPrincipal,
      installmentCount: input.installmentCount,
      aprPerPeriod: input.aprPerPeriod,
    });
    const payments: PlannedPayment[] = schedule.map((row) => ({
      sequence: row.sequence,
      dueDate: addPeriod(
        input.startDate,
        row.sequence - 1,
        input.frequency,
        input.frequencyInterval,
      ),
      amount: row.payment,
    }));
    return {
      title: input.title,
      totalPrincipal: input.totalPrincipal,
      installmentCount: input.installmentCount,
      startDate: input.startDate,
      currency: input.currency,
      frequency: input.frequency,
      frequencyInterval: input.frequencyInterval,
      notes: input.notes ?? null,
      payments,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get title(): string {
    return this.props.title;
  }
  get totalPrincipal(): string {
    return moneyToString(this.props.totalPrincipal);
  }
  get installmentCount(): number {
    return this.props.installmentCount;
  }
  get startDate(): Date {
    return this.props.startDate;
  }
  get currency(): string {
    return this.props.currency;
  }
  get frequency(): installments.InstallmentFrequency {
    return this.props.frequency;
  }
  get frequencyInterval(): number {
    return this.props.frequencyInterval;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get payments(): readonly InstallmentPaymentProps[] {
    return this.props.payments;
  }

  /** Apply a partial patch to the plan's own scalar fields — the schedule
   * (payments) is immutable once created, same as the pre-migration
   * `InstallmentsService.update` (which never touched `payments`). */
  applyUpdate(patch: InstallmentPlanPatch): void {
    if (patch.title !== undefined) this.props.title = patch.title;
    if (patch.currency !== undefined) this.props.currency = patch.currency;
    if (patch.frequency !== undefined) this.props.frequency = patch.frequency;
    if (patch.frequencyInterval !== undefined)
      this.props.frequencyInterval = patch.frequencyInterval;
    if (patch.notes !== undefined) this.props.notes = patch.notes;
  }

  private findPaymentOrThrow(sequence: number): InstallmentPaymentProps {
    const payment = this.props.payments.find((p) => p.sequence === sequence);
    if (!payment) throw new InstallmentPaymentNotFoundError();
    return payment;
  }

  /** Marks a scheduled payment paid — `INSTALLMENT_PAYMENT_NOT_FOUND` if no
   * payment with that sequence exists on this plan. */
  markPaymentPaid(sequence: number): void {
    const payment = this.findPaymentOrThrow(sequence);
    payment.paidAt = new Date();
  }

  /** Clears a scheduled payment's paid status — same not-found invariant as
   * `markPaymentPaid`. */
  markPaymentUnpaid(sequence: number): void {
    const payment = this.findPaymentOrThrow(sequence);
    payment.paidAt = null;
  }

  snapshot(): Readonly<InstallmentPlanProps> {
    return this.props;
  }

  toContract(): installments.InstallmentPlan {
    return {
      id: this.props.id,
      title: this.props.title,
      totalPrincipal: moneyToString(this.props.totalPrincipal),
      installmentCount: this.props.installmentCount,
      startDate: this.props.startDate.toISOString(),
      currency: this.props.currency,
      frequency: this.props.frequency,
      frequencyInterval: this.props.frequencyInterval,
      notes: this.props.notes,
      payments: this.props.payments.map((p) => ({
        id: p.id,
        sequence: p.sequence,
        dueDate: p.dueDate.toISOString(),
        amount: moneyToString(p.amount),
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      })),
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}

function addPeriod(
  date: Date,
  n: number,
  freq: installments.InstallmentFrequency,
  interval: number,
): Date {
  const d = new Date(date);
  const step = n * interval;
  switch (freq) {
    case "DAILY":
      d.setDate(d.getDate() + step);
      break;
    case "WEEKLY":
      d.setDate(d.getDate() + step * 7);
      break;
    case "YEARLY":
      d.setFullYear(d.getFullYear() + step);
      break;
    default:
      d.setMonth(d.getMonth() + step);
  }
  return d;
}
