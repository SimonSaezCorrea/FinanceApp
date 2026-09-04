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
