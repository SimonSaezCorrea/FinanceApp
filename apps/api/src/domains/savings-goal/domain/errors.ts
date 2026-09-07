/**
 * Domain errors: thrown when an invariant is violated — never a generic
 * exception, never a duplicated check in a handler/controller (FR-002).
 * Presentation maps `code` to the identical HTTP status the pre-migration
 * `SavingsService` threw (FR-015): `NotFound` (404) via `NotFoundException`.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: 400 | 404 | 409 = 400,
    public readonly field?: string,
  ) {
    super(code);
    this.name = new.target.name;
  }
}

export class SavingsGoalNotFoundError extends DomainError {
  constructor() {
    super("SAVINGS_GOAL_NOT_FOUND", 404);
  }
}

/** Closing is only ever offered when the goal is cumplida or vencida — the
 * handler computes this from `savedAmount`/`pace`/`deadline` and passes it
 * to `SavingsGoal.close()`. */
export class SavingsGoalNotCloseableError extends DomainError {
  constructor() {
    super("SAVINGS_GOAL_NOT_CLOSEABLE", 409);
  }
}

export class SavingsGoalAlreadyClosedError extends DomainError {
  constructor() {
    super("SAVINGS_GOAL_ALREADY_CLOSED", 409);
  }
}

export class SavingsGoalNotClosedError extends DomainError {
  constructor() {
    super("SAVINGS_GOAL_NOT_CLOSED", 409);
  }
}

/** This app has no FX conversion anywhere — once a goal has a real aporte,
 * its currency can't be changed out from under that history. */
export class SavingsGoalCurrencyLockedError extends DomainError {
  constructor() {
    super("SAVINGS_GOAL_CURRENCY_LOCKED", 409, "currency");
  }
}

/** A "traspasar a otra meta" close must target an OPEN goal of the user's
 * own — a closed one, the same one being closed, or one that doesn't exist
 * (never 403; see Principle II) are all refused, but a foreign/nonexistent id
 * throws `SavingsGoalNotFoundError` instead — this is for one that exists
 * and simply isn't eligible. */
export class SavingsGoalTargetNotOpenError extends DomainError {
  constructor() {
    super("SAVINGS_GOAL_TARGET_NOT_OPEN", 409, "targetGoalId");
  }
}

/** No FX conversion — the transfer target must share the closing goal's
 * currency. */
export class SavingsGoalTargetCurrencyMismatchError extends DomainError {
  constructor() {
    super("SAVINGS_GOAL_TARGET_CURRENCY_MISMATCH", 409, "targetGoalId");
  }
}
