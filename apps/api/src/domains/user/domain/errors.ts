/**
 * Domain errors: thrown by the `User` aggregate/application handlers when an
 * invariant is violated — never a generic exception, never a duplicated check
 * in a controller (FR-002). The presentation layer relies on
 * `AllExceptionsFilter`'s duck-typed `isDomainError` (same as every other
 * migrated domain) to map `code`/`httpStatus`/`field` to the identical
 * response shape the pre-migration `AuthService`/`AuthController` produced
 * (FR-015) — including 401/409, which `accounts`/`transactions` didn't need.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: 400 | 401 | 404 | 409 = 400,
    public readonly field?: string,
  ) {
    super(code);
    this.name = new.target.name;
  }
}

export class EmailTakenError extends DomainError {
  constructor() {
    super("EMAIL_TAKEN", 409, "email");
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super("INVALID_CREDENTIALS", 401);
  }
}

export class AccountDisabledError extends DomainError {
  constructor() {
    super("ACCOUNT_DISABLED", 401);
  }
}

export class NoRefreshTokenError extends DomainError {
  constructor() {
    super("NO_REFRESH_TOKEN", 401);
  }
}

export class InvalidRefreshTokenError extends DomainError {
  constructor() {
    super("INVALID_REFRESH_TOKEN", 401);
  }
}

export class UnauthorizedError extends DomainError {
  constructor() {
    super("UNAUTHORIZED", 401);
  }
}

export class InvalidCurrentPasswordError extends DomainError {
  constructor() {
    super("INVALID_CURRENT_PASSWORD", 401);
  }
}
