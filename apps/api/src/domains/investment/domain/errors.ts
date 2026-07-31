/**
 * Domain errors: thrown by the `Investment` aggregate/repository adapter when
 * an invariant is violated — never a generic exception, never a duplicated
 * check in a handler/controller (FR-002). Presentation maps `code` to the
 * identical HTTP status the pre-migration `InvestmentsService` threw
 * (FR-015): `NotFound` (404) via `NotFoundException`.
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

export class InvestmentNotFoundError extends DomainError {
  constructor() {
    super("INVESTMENT_NOT_FOUND", 404);
  }
}
