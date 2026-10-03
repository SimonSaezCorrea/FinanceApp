/**
 * Domain errors for the `category` catalogue — thrown when a request body names a
 * category that can't be used, never a generic exception.
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

/** The id names no catalogue row. 400, not 404: the resource being written is the
 * movement/plan/series, and it is one of its fields that is wrong. */
export class CategoryNotFoundError extends DomainError {
  constructor() {
    super("CATEGORY_NOT_FOUND", 400, "categoryId");
  }
}

/** A real category, but not one the user may pick here: a system one, or one of
 * the other movement type (an income category on an expense). */
export class CategoryNotAllowedError extends DomainError {
  constructor() {
    super("CATEGORY_NOT_ALLOWED", 400, "categoryId");
  }
}
