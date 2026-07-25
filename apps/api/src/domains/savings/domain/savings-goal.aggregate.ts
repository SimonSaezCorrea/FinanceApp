import type { savings } from "@finance/contracts";
import { moneyToString } from "@finance/money";

export interface SavingsGoalProps {
  id: string;
  userId: string;
  title: string;
  targetAmount: string;
  currency: string;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SavingsGoalPatch = Partial<{
  title: string;
  targetAmount: string;
  currency: string;
  deadline: Date | null;
}>;

/** A brand-new savings goal, as planned by `SavingsGoal.planCreation` — no
 * `id`/`userId`/timestamps yet (the repository adapter assigns them on
 * insert, `userId` supplied separately to `create(userId, plan)`, same
 * convention as `recurring`'s `PlannedRecurringExpense`). */
export type PlannedSavingsGoal = Omit<SavingsGoalProps, "id" | "userId" | "createdAt" | "updatedAt">;

/**
 * `SavingsGoal` aggregate: a savings target the user is tracking. No
 * settle-like state machine — every field is a plain scalar patched via
 * `applyUpdate`, mirroring the pre-migration `SavingsService.updateGoal`'s
 * partial-patch behavior exactly.
 */
export class SavingsGoal {
  private constructor(private props: SavingsGoalProps) {}

  static fromPersistence(props: SavingsGoalProps): SavingsGoal {
    return new SavingsGoal({ ...props });
  }

  /** Factory Method (FR-008): plans a brand-new savings goal's persisted
   * shape from validated `CreateSavingsGoal` input — `id`/`createdAt`/
   * `updatedAt` stay a persistence concern. */
  static planCreation(input: {
    title: string;
    targetAmount: string;
    currency: string;
    deadline?: Date;
  }): PlannedSavingsGoal {
    return {
      title: input.title,
      targetAmount: input.targetAmount,
      currency: input.currency,
      deadline: input.deadline ?? null,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }

  /** Apply a partial patch to the goal's own scalar fields. */
  applyUpdate(patch: SavingsGoalPatch): void {
    if (patch.title !== undefined) this.props.title = patch.title;
    if (patch.targetAmount !== undefined) this.props.targetAmount = patch.targetAmount;
    if (patch.currency !== undefined) this.props.currency = patch.currency;
    if (patch.deadline !== undefined) this.props.deadline = patch.deadline;
  }

  snapshot(): Readonly<SavingsGoalProps> {
    return this.props;
  }

  toContract(): savings.SavingsGoal {
    return {
      id: this.props.id,
      title: this.props.title,
      targetAmount: moneyToString(this.props.targetAmount),
      currency: this.props.currency,
      deadline: this.props.deadline ? this.props.deadline.toISOString() : null,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
