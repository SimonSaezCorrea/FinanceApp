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
    public readonly httpStatus: 400 | 401 | 404 | 409 | 429 = 400,
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

/**
 * Thrown when a preferences patch tries to remove a currency from
 * `extraCurrencies` that some record of the user's (account, movement,
 * instalment plan, debt, savings goal/entry, recurring expense or card
 * sub-limit) still uses (specs/020, FR-004a).
 */
export class CurrencyInUseError extends DomainError {
  constructor() {
    super("CURRENCY_IN_USE", 409, "extraCurrencies");
  }
}

/** MFA (specs/021): `confirm` called with no prior `enroll` (no pending secret to confirm). */
export class MfaNotPendingError extends DomainError {
  constructor() {
    super("MFA_NOT_PENDING", 409);
  }
}

/** MFA: a TOTP or recovery code failed validation, during enrollment confirm or login. */
export class InvalidMfaCodeError extends DomainError {
  constructor() {
    super("INVALID_MFA_CODE", 401, "code");
  }
}

/** MFA: rate-limit lockout in effect — every attempt is rejected without evaluating the code. */
export class MfaLockedError extends DomainError {
  constructor() {
    super("MFA_LOCKED", 429);
  }
}

/** MFA: `enroll`/`confirm` called while MFA is already active — no "replace device" path exists;
 * disable first (User Story 3), then re-enroll from scratch. */
export class MfaAlreadyEnabledError extends DomainError {
  constructor() {
    super("MFA_ALREADY_ENABLED", 409);
  }
}

/** MFA: the `mfa_pending_token` cookie is missing, expired, or fails signature verification. */
export class MfaPendingTokenInvalidError extends DomainError {
  constructor() {
    super("MFA_PENDING_TOKEN_INVALID", 401);
  }
}

/** Passkey (specs/022): the challenge cookie is missing, expired, or fails signature
 * verification — or the WebAuthn response itself doesn't verify against it. */
export class PasskeyChallengeInvalidError extends DomainError {
  constructor() {
    super("PASSKEY_CHALLENGE_INVALID", 401);
  }
}

/** Passkey: `DELETE /auth/me/passkeys/:id` on a passkey that doesn't exist or isn't the
 * caller's own. */
export class PasskeyNotFoundError extends DomainError {
  constructor() {
    super("PASSKEY_NOT_FOUND", 404);
  }
}

/** Session (specs/023): `DELETE /auth/sessions/:id` on a session that doesn't exist or
 * isn't the caller's own. */
export class SessionNotFoundError extends DomainError {
  constructor() {
    super("SESSION_NOT_FOUND", 404);
  }
}
