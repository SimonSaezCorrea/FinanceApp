/**
 * Domain errors: thrown when an invariant is violated — never a generic
 * exception, never a duplicated check in a handler/controller (FR-002).
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

/** 404, never 403: the API doesn't confirm that someone else's contribution
 * exists (Constitution Principle II — an identifier is not authorization). */
export class SavingsEntryNotFoundError extends DomainError {
  constructor() {
    super("SAVINGS_ENTRY_NOT_FOUND", 404);
  }
}

/** A contribution's goal is currently closed — its history is frozen until
 * the goal is reopened, same spirit as `InstallmentPlanBilledError`. */
export class SavingsEntryGoalClosedError extends DomainError {
  constructor() {
    super("SAVINGS_GOAL_CLOSED", 409);
  }
}

/** The source/destination account's currency differs from the aporte's own
 * (or the goal's) — this app has no FX conversion anywhere. */
export class SavingsEntryCurrencyMismatchError extends DomainError {
  constructor() {
    super("SAVINGS_ENTRY_CURRENCY_MISMATCH", 409);
  }
}

/** A `CREDIT_CARD` account has no cash of its own to move — same rule a
 * debt/instalment payment already applies to a credit source/destination. */
export class SavingsEntryFromCreditAccountError extends DomainError {
  constructor() {
    super("SAVINGS_ENTRY_FROM_CREDIT_ACCOUNT", 409);
  }
}

/** An ahorro-libre aporte (no `savingsGoalId`) has nothing else to name it by
 * — a goal-linked one can fall back on the goal's own title, this can't. */
export class SavingsEntryTitleRequiredError extends DomainError {
  constructor() {
    super("SAVINGS_ENTRY_TITLE_REQUIRED", 400, "title");
  }
}
