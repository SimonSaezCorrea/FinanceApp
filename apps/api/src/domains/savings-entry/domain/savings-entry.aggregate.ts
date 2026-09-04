import type { savings } from "@finance/contracts";
import { moneyToString } from "@finance/money";

export interface SavingsEntryProps {
  id: string;
  userId: string;
  savingsGoalId: string | null;
  amount: string;
  currency: string;
  contributedAt: Date;
  note: string | null;
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
  note: string | null;
}>;

/**
 * `SavingsEntry` aggregate: a single contribution toward a savings goal (or
 * a freestanding one, `savingsGoalId` is optional).
 *
 * Was immutable once created — the pre-migration service never exposed
 * update/delete for entries either, which meant a contribution recorded by
 * mistake had NO way back (spec 015, US3: the one operation in the app that
 * moved money and had no correction path). `applyUpdate` closes that.
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
    note?: string;
  }): PlannedSavingsEntry {
    return {
      savingsGoalId: input.savingsGoalId ?? null,
      amount: input.amount,
      currency: input.currency,
      contributedAt: input.contributedAt,
      note: input.note ?? null,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
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
    if (patch.note !== undefined) this.props.note = patch.note;
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
      note: this.props.note,
      createdAt: this.props.createdAt.toISOString(),
    };
  }
}
