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

/**
 * `SavingsEntry` aggregate: a single contribution toward a savings goal (or
 * a freestanding one, `savingsGoalId` is optional). Immutable once created —
 * the pre-migration service never exposed update/delete for entries either.
 */
export class SavingsEntry {
  private constructor(private readonly props: SavingsEntryProps) {}

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
