import type { savings } from "@finance/contracts";
import { moneyToString } from "@finance/money";

import { SavingsEntryGoalClosedError } from "./errors";

export interface SavingsEntryProps {
  id: string;
  userId: string;
  savingsGoalId: string | null;
  amount: string;
  currency: string;
  contributedAt: Date;
  /** Short label — what every list displays as the aporte's name. Required
   * by the handler for an ahorro-libre aporte (no goal to fall back on). */
  title: string | null;
  note: string | null;
  /** The real source account this contribution came from. */
  bankAccountId: string | null;
  /** Plain bookkeeping (not FK) — the real `Transaction.id` this contribution
   * generated, used to reverse/adjust it on edit/delete without an inverse
   * query. */
  transactionId: string | null;
  createdAt: Date;
}

/** A brand-new contribution, as planned by `SavingsEntry.planCreation` — no
 * `id`/`userId`/`createdAt` yet (the repository adapter assigns them on
 * insert, `userId` supplied separately to `create(userId, plan)`). */
export type PlannedSavingsEntry = Omit<SavingsEntryProps, "id" | "userId" | "createdAt">;

export type SavingsEntryPatch = Partial<{
  savingsGoalId: string | null;
  amount: string;
  currency: string;
  contributedAt: Date;
  title: string | null;
  note: string | null;
  bankAccountId: string | null;
  transactionId: string | null;
}>;

/**
 * `SavingsEntry` aggregate: a single contribution toward a savings goal (or
 * a freestanding one, `savingsGoalId` is optional) — now real money (specs/018):
 * every entry has a source `bankAccountId` and the `Transaction.id` it
 * created.
 *
 * `assertEditable`/`assertDeletable` freeze an entry belonging to a CLOSED
 * goal (`goalClosed`, resolved by the handler — this aggregate has no access
 * to the goal table) — same "freeze after an event" shape as
 * `InstallmentPlan.applyUpdate`'s billed-field guard. An entry with no goal
 * (ahorro libre) never freezes: `goalClosed` is simply always false for it.
 */
export class SavingsEntry {
  private constructor(private props: SavingsEntryProps) {}

  static fromPersistence(props: SavingsEntryProps): SavingsEntry {
    return new SavingsEntry({ ...props });
  }

  /** Factory Method (FR-008): plans a brand-new entry's persisted shape from
   * validated `CreateSavingsEntry` input — `id`/`createdAt` stay a
   * persistence concern. */
  static planCreation(input: {
    savingsGoalId?: string;
    amount: string;
    currency: string;
    contributedAt: Date;
    title?: string;
    note?: string;
    bankAccountId: string;
    transactionId: string;
  }): PlannedSavingsEntry {
    return {
      savingsGoalId: input.savingsGoalId ?? null,
      amount: input.amount,
      currency: input.currency,
      contributedAt: input.contributedAt,
      title: input.title ?? null,
      note: input.note ?? null,
      bankAccountId: input.bankAccountId,
      transactionId: input.transactionId,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get savingsGoalId(): string | null {
    return this.props.savingsGoalId;
  }
  get amount(): string {
    return this.props.amount;
  }
  get currency(): string {
    return this.props.currency;
  }
  get bankAccountId(): string | null {
    return this.props.bankAccountId;
  }
  get transactionId(): string | null {
    return this.props.transactionId;
  }

  /** `SAVINGS_GOAL_CLOSED` if `goalClosed` — the handler resolves this from
   * the entry's own `savingsGoalId` before calling in. */
  assertEditable(goalClosed: boolean): void {
    if (goalClosed) throw new SavingsEntryGoalClosedError();
  }

  /** Same rule as `assertEditable` — a closed goal's history is frozen for
   * deletion too, not just correction. */
  assertDeletable(goalClosed: boolean): void {
    if (goalClosed) throw new SavingsEntryGoalClosedError();
  }

  /** Applies a partial correction. `savingsGoalId: null` deliberately detaches
   * the contribution from any goal — same `!== undefined` convention every
   * other `applyUpdate` in this codebase uses to distinguish "not sent" from
   * "sent as null". */
  applyUpdate(patch: SavingsEntryPatch): void {
    if (patch.savingsGoalId !== undefined) this.props.savingsGoalId = patch.savingsGoalId;
    if (patch.amount !== undefined) this.props.amount = patch.amount;
    if (patch.currency !== undefined) this.props.currency = patch.currency;
    if (patch.contributedAt !== undefined) this.props.contributedAt = patch.contributedAt;
    if (patch.title !== undefined) this.props.title = patch.title;
    if (patch.note !== undefined) this.props.note = patch.note;
    if (patch.bankAccountId !== undefined) this.props.bankAccountId = patch.bankAccountId;
    if (patch.transactionId !== undefined) this.props.transactionId = patch.transactionId;
  }

  snapshot(): Readonly<SavingsEntryProps> {
    return this.props;
  }

  toContract(): savings.SavingsEntry {
    return {
      id: this.props.id,
      savingsGoalId: this.props.savingsGoalId,
      amount: moneyToString(this.props.amount),
      currency: this.props.currency,
      contributedAt: this.props.contributedAt.toISOString(),
      title: this.props.title,
      note: this.props.note,
      bankAccountId: this.props.bankAccountId,
      createdAt: this.props.createdAt.toISOString(),
    };
  }
}
