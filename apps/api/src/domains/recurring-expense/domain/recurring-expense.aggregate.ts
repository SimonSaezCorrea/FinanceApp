import type { recurring } from "@finance/contracts";
import { moneyToString } from "@finance/money";

export interface RecurringExpenseProps {
  id: string;
  userId: string;
  label: string;
  amount: string;
  currency: string;
  category: string | null;
  frequency: recurring.RecurrenceFrequency;
  interval: number;
  anchorDate: Date;
  bankAccountId: string | null;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RecurringExpensePatch = Partial<{
  label: string;
  amount: string;
  currency: string;
  category: string | null;
  frequency: recurring.RecurrenceFrequency;
  interval: number;
  anchorDate: Date;
  bankAccountId: string | null;
  active: boolean;
  notes: string | null;
}>;

/** A brand-new recurring expense, as planned by `RecurringExpense.planCreation`
 * — no `id`/`userId`/timestamps yet (the repository adapter assigns them on
 * insert, `userId` supplied separately to `create(userId, plan)`, same
 * convention as `debts`' `PlannedDebt`). */
export type PlannedRecurringExpense = Omit<
  RecurringExpenseProps,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

/** Next occurrence on/after `from`, stepping forward from the anchor by
 * frequency × interval. Pure domain computation — the same rule the
 * pre-migration `recurring.service.ts` exposed as a free function. */
export function nextDue(
  anchor: Date,
  frequency: recurring.RecurrenceFrequency,
  interval: number,
  from: Date,
): Date {
  const d = new Date(anchor.getTime());
  const step = Math.max(1, interval);
  let guard = 0;
  while (d.getTime() < from.getTime() && guard < 10_000) {
    if (frequency === "WEEKLY") d.setUTCDate(d.getUTCDate() + 7 * step);
    else if (frequency === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + step);
    else d.setUTCFullYear(d.getUTCFullYear() + step);
    guard++;
  }
  return d;
}

/** Start-of-day (UTC) for `now` — the reference point `nextDueAt` is computed
 * on/after. */
export function startOfTodayUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * `RecurringExpense` aggregate: a subscription/rent/periodic payment. Owns
 * the `nextDueAt` computation (`nextDue`, above) that used to live loose in
 * `recurring.service.ts` — the contract's `nextDueAt` is always derived,
 * never persisted. No settle-like state machine: `active`/`notes`/etc. are
 * plain scalar fields patched via `applyUpdate`, mirroring the pre-migration
 * `RecurringService.update`'s partial-patch behavior exactly (including that
 * toggling `active` is just another field in the patch, not a separate
 * invariant-guarded operation).
 */
export class RecurringExpense {
  private constructor(private props: RecurringExpenseProps) {}

  static fromPersistence(props: RecurringExpenseProps): RecurringExpense {
    return new RecurringExpense({ ...props });
  }

  /** Factory Method (FR-008): plans a brand-new recurring expense's persisted
   * shape from validated `CreateRecurringExpense` input — `id`/`createdAt`/
   * `updatedAt` stay a persistence concern. */
  static planCreation(input: {
    label: string;
    amount: string;
    currency: string;
    category?: string;
    frequency: recurring.RecurrenceFrequency;
    interval: number;
    anchorDate: Date;
    bankAccountId?: string;
    active?: boolean;
    notes?: string;
  }): PlannedRecurringExpense {
    return {
      label: input.label,
      amount: input.amount,
      currency: input.currency,
      category: input.category ?? null,
      frequency: input.frequency,
      interval: input.interval,
      anchorDate: input.anchorDate,
      bankAccountId: input.bankAccountId ?? null,
      active: input.active ?? true,
      notes: input.notes ?? null,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }

  /** Apply a partial patch to the recurring expense's own scalar fields. */
  applyUpdate(patch: RecurringExpensePatch): void {
    if (patch.label !== undefined) this.props.label = patch.label;
    if (patch.amount !== undefined) this.props.amount = patch.amount;
    if (patch.currency !== undefined) this.props.currency = patch.currency;
    if (patch.category !== undefined) this.props.category = patch.category;
    if (patch.frequency !== undefined) this.props.frequency = patch.frequency;
    if (patch.interval !== undefined) this.props.interval = patch.interval;
    if (patch.anchorDate !== undefined) this.props.anchorDate = patch.anchorDate;
    if (patch.bankAccountId !== undefined) this.props.bankAccountId = patch.bankAccountId;
    if (patch.active !== undefined) this.props.active = patch.active;
    if (patch.notes !== undefined) this.props.notes = patch.notes;
  }

  snapshot(): Readonly<RecurringExpenseProps> {
    return this.props;
  }

  toContract(today: Date): recurring.RecurringExpense {
    return {
      id: this.props.id,
      label: this.props.label,
      amount: moneyToString(this.props.amount),
      currency: this.props.currency,
      category: this.props.category,
      frequency: this.props.frequency,
      interval: this.props.interval,
      anchorDate: this.props.anchorDate.toISOString(),
      bankAccountId: this.props.bankAccountId,
      active: this.props.active,
      notes: this.props.notes,
      nextDueAt: nextDue(
        this.props.anchorDate,
        this.props.frequency,
        this.props.interval,
        today,
      ).toISOString(),
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
