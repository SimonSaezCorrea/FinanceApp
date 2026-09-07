import type { savings } from "@finance/contracts";
import { moneyToString } from "@finance/money";

import {
  SavingsGoalAlreadyClosedError,
  SavingsGoalCurrencyLockedError,
  SavingsGoalNotClosedError,
  SavingsGoalNotCloseableError,
} from "./errors";

/** What a "retirar a cuenta" close moved on a real account — `reopen()` reads
 * it back to reverse exactly that. Mirrors `Debt`'s own
 * `DebtPaymentRecord`/`ReversedPayment` pair. */
export interface SavingsGoalWithdrawal {
  transactionId: string;
  accountId: string;
  /** moneyString, in the goal's own currency. */
  amount: string;
}

/** What `reopen()` needs reversed — null when the close didn't move real
 * money (`FREE_SAVINGS`/`TRANSFER_TO_GOAL`) or the goal had none to reverse. */
export type ReversedWithdrawal = SavingsGoalWithdrawal | null;

export interface SavingsGoalProps {
  id: string;
  userId: string;
  title: string;
  targetAmount: string;
  currency: string;
  deadline: Date | null;
  notes: string | null;
  /** `null` = automatic (deterministic hash of the id, `goalVisual.ts`). */
  color: savings.SavingsGoalColor | null;
  closedAt: Date | null;
  closeDestination: savings.SavingsGoalCloseDestination | null;
  /** Plain bookkeeping (not FKs) — only set for `WITHDRAW_TO_ACCOUNT`. */
  closeAccountId: string | null;
  closeTransactionId: string | null;
  closeAmount: string | null;
  /** Plain bookkeeping (not FK) — only set for `TRANSFER_TO_GOAL`, display-only. */
  closeTargetGoalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SavingsGoalPatch = Partial<{
  title: string;
  targetAmount: string;
  currency: string;
  deadline: Date | null;
  notes: string | null;
  color: savings.SavingsGoalColor | null;
}>;

/** A brand-new savings goal, as planned by `SavingsGoal.planCreation` — no
 * `id`/`userId`/timestamps yet (the repository adapter assigns them on
 * insert, `userId` supplied separately to `create(userId, plan)`, same
 * convention as `recurring`'s `PlannedRecurringExpense`). */
export type PlannedSavingsGoal = Omit<
  SavingsGoalProps,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

/**
 * `SavingsGoal` aggregate: a savings target the user is tracking, with a
 * two-state lifecycle — open (`closedAt === null`) or closed. `applyUpdate`
 * patches plain scalars; `close()`/`reopen()` own the lifecycle, mirroring
 * `Debt.settle()`/`unsettle()`'s reversible-payment-record pattern exactly
 * (see `SavingsGoalWithdrawal`/`ReversedWithdrawal`).
 *
 * `savedAmount`/`pace` (the ritmo/progreso figures) are NOT part of this
 * aggregate: they are derived from `SavingsEntry` history, which this
 * aggregate has no access to — computed by the query handler instead (see
 * `savings-goal-dto.mapper.ts`), same separation `BankAccount.creditUsed`
 * used before it became a persisted column.
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
    notes?: string;
    color?: savings.SavingsGoalColor;
  }): PlannedSavingsGoal {
    return {
      title: input.title,
      targetAmount: input.targetAmount,
      currency: input.currency,
      deadline: input.deadline ?? null,
      notes: input.notes ?? null,
      color: input.color ?? null,
      closedAt: null,
      closeDestination: null,
      closeAccountId: null,
      closeTransactionId: null,
      closeAmount: null,
      closeTargetGoalId: null,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get currency(): string {
    return this.props.currency;
  }
  get targetAmount(): string {
    return this.props.targetAmount;
  }
  get deadline(): Date | null {
    return this.props.deadline;
  }
  get closedAt(): Date | null {
    return this.props.closedAt;
  }

  /** Apply a partial patch to the goal's own scalar fields.
   * `hasEntries` (resolved by the handler, which alone knows the
   * `savings-entry` table) gates `currency`: once a goal has any real aporte,
   * changing its currency would silently orphan that history's meaning — the
   * app has no FX conversion anywhere else either. */
  applyUpdate(patch: SavingsGoalPatch, hasEntries: boolean): void {
    if (patch.title !== undefined) this.props.title = patch.title;
    if (patch.targetAmount !== undefined) this.props.targetAmount = patch.targetAmount;
    if (patch.currency !== undefined && patch.currency !== this.props.currency) {
      if (hasEntries) throw new SavingsGoalCurrencyLockedError();
      this.props.currency = patch.currency;
    }
    if (patch.deadline !== undefined) this.props.deadline = patch.deadline;
    if (patch.notes !== undefined) this.props.notes = patch.notes;
    if (patch.color !== undefined) this.props.color = patch.color;
  }

  /**
   * Closes the goal — `SAVINGS_GOAL_NOT_CLOSEABLE` unless `closeable` (the
   * handler computes this from `savedAmount`/`pace`/`deadline`, none of which
   * this aggregate has), `SAVINGS_GOAL_ALREADY_CLOSED` if already closed.
   * `withdrawal`, only for `WITHDRAW_TO_ACCOUNT`, is the real movement this
   * close produced — recorded so `reopen()` can reverse it.
   */
  close(
    closeable: boolean,
    input:
      | { destination: "WITHDRAW_TO_ACCOUNT"; closedAt: Date; withdrawal: SavingsGoalWithdrawal }
      | { destination: "FREE_SAVINGS"; closedAt: Date }
      | { destination: "TRANSFER_TO_GOAL"; closedAt: Date; targetGoalId: string },
  ): void {
    if (this.props.closedAt !== null) throw new SavingsGoalAlreadyClosedError();
    if (!closeable) throw new SavingsGoalNotCloseableError();
    this.props.closedAt = input.closedAt;
    this.props.closeDestination = input.destination;
    if (input.destination === "WITHDRAW_TO_ACCOUNT") {
      this.props.closeAccountId = input.withdrawal.accountId;
      this.props.closeTransactionId = input.withdrawal.transactionId;
      this.props.closeAmount = input.withdrawal.amount;
    } else if (input.destination === "TRANSFER_TO_GOAL") {
      this.props.closeTargetGoalId = input.targetGoalId;
    }
  }

  /** Reverts a closed goal back to open — `SAVINGS_GOAL_NOT_CLOSED` if it
   * wasn't closed. Returns the withdrawal to reverse (only ever non-null for
   * `WITHDRAW_TO_ACCOUNT`) — the `FREE_SAVINGS`/`TRANSFER_TO_GOAL` entry
   * reassignment is deliberately NOT undone here (see spec Assumptions). */
  reopen(): ReversedWithdrawal {
    if (this.props.closedAt === null) throw new SavingsGoalNotClosedError();
    const { closeDestination, closeAccountId, closeTransactionId, closeAmount } = this.props;
    this.props.closedAt = null;
    this.props.closeDestination = null;
    this.props.closeAccountId = null;
    this.props.closeTransactionId = null;
    this.props.closeAmount = null;
    this.props.closeTargetGoalId = null;
    if (closeDestination !== "WITHDRAW_TO_ACCOUNT") return null;
    if (!closeAccountId || !closeTransactionId || !closeAmount) return null;
    return { transactionId: closeTransactionId, accountId: closeAccountId, amount: closeAmount };
  }

  snapshot(): Readonly<SavingsGoalProps> {
    return this.props;
  }

  /** `savedAmount`/`pace` are supplied by the caller (derived from
   * `SavingsEntry` history) — this aggregate has no access to that table. */
  toContract(derived: { savedAmount: string; pace: string }): savings.SavingsGoal {
    return {
      id: this.props.id,
      title: this.props.title,
      targetAmount: moneyToString(this.props.targetAmount),
      currency: this.props.currency,
      deadline: this.props.deadline ? this.props.deadline.toISOString() : null,
      notes: this.props.notes,
      color: this.props.color,
      closedAt: this.props.closedAt ? this.props.closedAt.toISOString() : null,
      closeDestination: this.props.closeDestination,
      closeAccountId: this.props.closeAccountId,
      closeTargetGoalId: this.props.closeTargetGoalId,
      savedAmount: moneyToString(derived.savedAmount),
      pace: moneyToString(derived.pace),
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
