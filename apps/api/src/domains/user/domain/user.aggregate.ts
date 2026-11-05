import type { auth } from "@finance/contracts";

import { UserAccountDeletedEvent } from "./events/user-account-deleted.event";
import {
  AccountDisabledError,
  MfaAlreadyEnabledError,
  MfaNotPendingError,
  MfaSameMethodError,
} from "./errors";

/** The second-factor method as the database names it (specs/040). */
export type MfaMethod = "TOTP" | "EMAIL";

export type UserStatus = "ACTIVE" | "DISABLED";

export interface UserProps {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
  status: UserStatus;
  /** Set once (Ley 21.719 Art. 11 supresión) — never cleared. A non-null value means every
   * other PII field on this row was already scrubbed to null; financial rows elsewhere keep
   * this same `userId` on purpose (anonymized history, not personal data anymore). */
  deletedAt: Date | null;
  preferredCurrency: auth.CurrentUser["preferredCurrency"];
  locale: auth.CurrentUser["locale"];
  theme: auth.CurrentUser["theme"];
  createdAt: Date;
  countryId: string | null;
  countryName: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  birthDate: Date | null;
  identifierType: auth.CurrentUser["identifierType"];
  identifierValue: string | null;
  phone: string | null;
  hideBalances: boolean;
  extraCurrencies: string[];
  budgetAlertThreshold: number | null;
  /** Single source of truth for "does login require a second factor?" (specs/021). */
  mfaEnabled: boolean;
  /** Plaintext in the domain layer — cipher/decipher happens only at the Prisma adapter
   * boundary (mirrors the existing Prisma.Decimal<->string boundary conversion for money). A
   * non-null secret with mfaEnabled=false means enrollment is pending confirmation. */
  mfaSecret: string | null;
  mfaFailedAttempts: number;
  mfaLockedUntil: Date | null;
  /** Which second factor (specs/040). Optional so fixtures from before keep compiling; null/absent
   * with `mfaEnabled` reads as TOTP (rows from before the column). */
  mfaMethod?: MfaMethod | null;
  /** The method being set up — activation or change — until its first code is confirmed. */
  mfaPendingMethod?: MfaMethod | null;
  /** Wrong-password counter for login, same shape as the MFA one (see `recordLoginFailure`). */
  loginFailedAttempts: number;
  loginLockedUntil: Date | null;
  /** Mirror of the primary `user-email` row's `verifiedAt` (specs/032); null/absent =
   * unconfirmed. Optional so fixtures that predate it keep compiling. */
  emailVerifiedAt?: Date | null;
  /** The first-steps guide was finished or closed (it never shows again). */
  onboardingClosedAt?: Date | null;
  /** The newest Novedades version the person saw (spec 038, `1.2`); null/absent = none. */
  releaseNotesSeenVersion?: string | null;
}

/** `email` is not part of a profile edit (specs/032): it changes only by confirming a pending
 * address (`confirmPrimaryEmail`). */
export type ProfilePatch = Partial<{
  name: string;
  countryId: string | null;
  /** Resolved by the application layer (mirrors `accounts`' `institutionName`
   * lookup) — only meaningful when `countryId` is also present in the patch. */
  countryName: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  birthDate: Date | null;
  identifierType: auth.CurrentUser["identifierType"];
  identifierValue: string | null;
  phone: string | null;
}>;

export type PreferencesPatch = Partial<{
  preferredCurrency: auth.CurrentUser["preferredCurrency"];
  locale: auth.CurrentUser["locale"];
  theme: auth.CurrentUser["theme"];
  hideBalances: boolean;
  extraCurrencies: string[];
  budgetAlertThreshold: number | null;
}>;

/** Full years elapsed since birthDate (only the age is ever exposed, never the exact date). */
/** `"1.2"` → `[1, 2]`; anything else (null, a pre-version record id) → null. */
function parseReleaseVersion(value: string | null | undefined): [number, number] | null {
  const match = /^(\d{1,4})\.(\d{1,4})$/.exec(value ?? "");
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function calculateAge(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

/**
 * `User` aggregate: the authenticated account plus its profile/preferences.
 * Invariants ported over unchanged from `AuthService`:
 *  - a DISABLED account may never log in / refresh (`ACCOUNT_DISABLED`);
 *  - deactivation only ever flips the status flag, nothing else (FR-011).
 * No State/Strategy pattern is needed here (FR-008: recommended, not
 * mandatory) — this domain has a single simple ACTIVE/DISABLED flag, not a
 * multi-state lifecycle like `accounts`' `CreditStatement`.
 */
export class User {
  private constructor(private props: UserProps) {}

  static fromPersistence(props: UserProps): User {
    return new User({ ...props, extraCurrencies: [...props.extraCurrencies] });
  }

  /** Factory Method (FR-008): plans a brand-new user row — email is always
   * lower-cased, matching the pre-migration service. Password hashing is a
   * pure-crypto concern performed by the calling handler (bcrypt has no I/O
   * dependency, so it isn't a repository port), the hash is handed in ready.
   * `birthDate` is required at registration (not left for later in Profile) — the
   * guardian-consent age threshold can't be evaluated without it from day one.
   * `identifierValue` (the titular's own RUT) is required too — it's now the LOGIN
   * credential, so `identifierType` is always "RUT" (this app's MVP is Chile-only; never
   * asked of the caller, not part of the input). Normalization (no dots/dash) happens at the
   * Prisma adapter boundary, same split `mfaSecret` encryption already uses. */
  static planRegistration(input: {
    email: string;
    name: string;
    passwordHash: string;
    birthDate: Date;
    identifierValue: string;
    locale?: auth.CurrentUser["locale"];
  }): {
    email: string;
    name: string;
    passwordHash: string;
    birthDate: Date;
    identifierType: "RUT";
    identifierValue: string;
    locale: auth.CurrentUser["locale"];
  } {
    return {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: input.passwordHash,
      birthDate: input.birthDate,
      identifierType: "RUT",
      identifierValue: input.identifierValue,
      // The language of the page the account was created from (spec 031); Spanish otherwise,
      // the app's default market.
      locale: input.locale ?? "es",
    };
  }

  get id(): string {
    return this.props.id;
  }
  get email(): string | null {
    return this.props.email;
  }
  get name(): string | null {
    return this.props.name;
  }
  get passwordHash(): string | null {
    return this.props.passwordHash;
  }
  get status(): UserStatus {
    return this.props.status;
  }
  get mfaEnabled(): boolean {
    return this.props.mfaEnabled;
  }
  /** The pending (unconfirmed) or active secret — never exposed via `toContract()`. */
  get mfaSecret(): string | null {
    return this.props.mfaSecret;
  }
  get mfaFailedAttempts(): number {
    return this.props.mfaFailedAttempts;
  }
  get mfaLockedUntil(): Date | null {
    return this.props.mfaLockedUntil;
  }
  get mfaPendingMethod(): MfaMethod | null {
    return this.props.mfaPendingMethod ?? null;
  }
  /** The active second factor, or null without MFA. A row from before specs/040 (MFA on, no
   * method) used the authenticator app — the only method then. */
  mfaMethodOrDefault(): MfaMethod | null {
    if (!this.props.mfaEnabled) return null;
    return this.props.mfaMethod ?? "TOTP";
  }
  /** Read before `delete()` scrubs it — e.g. by `DeleteAccountHandler`, to hash it into the
   * account-deletion compliance log before it's gone. */
  get identifierValue(): string | null {
    return this.props.identifierValue;
  }
  get locale(): auth.CurrentUser["locale"] {
    return this.props.locale;
  }
  /** Whether the primary email is confirmed (specs/032): only then may it recover the password
   * or receive security notices. */
  get emailVerified(): boolean {
    return Boolean(this.props.emailVerifiedAt);
  }

  get onboardingClosed(): boolean {
    return Boolean(this.props.onboardingClosedAt);
  }

  get onboardingClosedAt(): Date | null {
    return this.props.onboardingClosedAt ?? null;
  }

  /** Closes the first-steps guide for good. Closing it again keeps the first date (Principle VII
   * form a: the replay changes nothing). Returns whether anything changed. */
  closeOnboarding(at: Date): boolean {
    if (this.props.onboardingClosedAt) return false;
    this.props.onboardingClosedAt = at;
    return true;
  }

  get releaseNotesSeenVersion(): string | null {
    return this.props.releaseNotesSeenVersion ?? null;
  }

  /** The person opened Novedades with `version` as the newest (spec 038). Only moves forward,
   * comparing numbers (`1.10` after `1.9`): repeating it, or an older version (a stale tab),
   * changes nothing (Principle VII form a). A stored value that isn't a version counts as nothing
   * seen. Returns whether it changed. */
  markReleaseNotesSeen(version: string): boolean {
    const current = parseReleaseVersion(this.props.releaseNotesSeenVersion);
    const next = parseReleaseVersion(version);
    if (!next) return false;
    if (current && (current[0] > next[0] || (current[0] === next[0] && current[1] >= next[1]))) {
      return false;
    }
    this.props.releaseNotesSeenVersion = version;
    return true;
  }

  /** The primary email becomes `address`, confirmed at `at` (specs/032): either the current one
   * confirmed in place, or a pending one promoted. The `user-email` rows move in the same
   * transaction (their own adapter). */
  confirmPrimaryEmail(address: string, at: Date): void {
    this.props.email = address;
    this.props.emailVerifiedAt = at;
  }

  /** Password recovery (specs/032): a new hash and the login lockout lifted — the lock exists to
   * stop guessing, and proving control of the confirmed email ends that. The second factor is
   * deliberately untouched (FR-020). */
  resetPassword(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
    this.props.loginFailedAttempts = 0;
    this.props.loginLockedUntil = null;
  }

  /** ACCOUNT_DISABLED — a deactivated account may not authenticate (login or
   * refresh), even holding an otherwise-valid credential/token. */
  assertActive(): void {
    if (this.props.status === "DISABLED") throw new AccountDisabledError();
  }

  changePasswordHash(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
  }

  applyProfileUpdate(patch: ProfilePatch): void {
    if (patch.name !== undefined) this.props.name = patch.name;
    if (patch.countryId !== undefined) {
      this.props.countryId = patch.countryId;
      this.props.countryName = patch.countryId
        ? (patch.countryName ?? this.props.countryName)
        : null;
    }
    if (patch.addressStreet !== undefined) this.props.addressStreet = patch.addressStreet;
    if (patch.addressCity !== undefined) this.props.addressCity = patch.addressCity;
    if (patch.addressRegion !== undefined) this.props.addressRegion = patch.addressRegion;
    if (patch.addressPostalCode !== undefined)
      this.props.addressPostalCode = patch.addressPostalCode;
    if (patch.birthDate !== undefined) this.props.birthDate = patch.birthDate;
    if (patch.identifierType !== undefined) this.props.identifierType = patch.identifierType;
    if (patch.identifierValue !== undefined) this.props.identifierValue = patch.identifierValue;
    if (patch.phone !== undefined) this.props.phone = patch.phone;
  }

  applyPreferencesUpdate(patch: PreferencesPatch): void {
    if (patch.preferredCurrency !== undefined)
      this.props.preferredCurrency = patch.preferredCurrency;
    if (patch.locale !== undefined) this.props.locale = patch.locale;
    if (patch.theme !== undefined) this.props.theme = patch.theme;
    if (patch.hideBalances !== undefined) this.props.hideBalances = patch.hideBalances;
    if (patch.extraCurrencies !== undefined) this.props.extraCurrencies = patch.extraCurrencies;
    if (patch.budgetAlertThreshold !== undefined)
      this.props.budgetAlertThreshold = patch.budgetAlertThreshold;
  }

  /**
   * Starts (or restarts) setting up a second factor (specs/040). Without MFA it is an activation;
   * with MFA active it is a METHOD CHANGE — the caller enforces the recent step-up that requires.
   * TOTP stores a fresh pending secret (the active method keeps working until confirmed: an EMAIL
   * account ignores the secret, and a TOTP account can't "change" to TOTP). Any earlier unconfirmed
   * setup is simply replaced.
   */
  startMfaEnrollment(method: MfaMethod, secret: string | null = null): void {
    if (this.props.mfaEnabled && this.mfaMethodOrDefault() === method) {
      throw new MfaSameMethodError();
    }
    if (method === "TOTP") {
      if (!secret) throw new MfaNotPendingError();
      this.props.mfaSecret = secret;
    }
    this.props.mfaPendingMethod = method;
  }

  /**
   * Confirms the pending setup once its first code checked out (the code itself is validated by
   * the handler). Returns whether this ACTIVATED MFA or CHANGED its method. Moving to EMAIL drops
   * the TOTP secret. A pending TOTP secret from before specs/040 (no pending method) still confirms.
   */
  confirmMfaEnrollment(): "ACTIVATED" | "CHANGED" {
    const pending =
      this.props.mfaPendingMethod ??
      (!this.props.mfaEnabled && this.props.mfaSecret ? "TOTP" : null);
    if (!pending) {
      if (this.props.mfaEnabled) throw new MfaAlreadyEnabledError();
      throw new MfaNotPendingError();
    }
    if (pending === "TOTP" && !this.props.mfaSecret) throw new MfaNotPendingError();
    const outcome = this.props.mfaEnabled ? "CHANGED" : "ACTIVATED";
    this.props.mfaEnabled = true;
    this.props.mfaMethod = pending;
    this.props.mfaPendingMethod = null;
    if (pending === "EMAIL") this.props.mfaSecret = null;
    return outcome;
  }

  /** Invalidates the secret and resets the rate-limit counters — recovery codes are discarded
   * by the caller (a separate aggregate/table) in the same transaction. */
  disableMfa(): void {
    this.props.mfaEnabled = false;
    this.props.mfaMethod = null;
    this.props.mfaPendingMethod = null;
    this.props.mfaSecret = null;
    this.props.mfaFailedAttempts = 0;
    this.props.mfaLockedUntil = null;
  }

  isMfaLocked(now: Date): boolean {
    return (
      this.props.mfaLockedUntil !== null && this.props.mfaLockedUntil.getTime() > now.getTime()
    );
  }

  /** Increments the failed-attempt counter and, once it reaches the threshold, locks the
   * account for `lockMinutes`. Threshold/duration are passed in (pure function of state, no
   * config dependency in the domain layer). */
  recordMfaFailure(threshold: number, lockMinutes: number, now: Date): void {
    this.props.mfaFailedAttempts += 1;
    if (this.props.mfaFailedAttempts >= threshold) {
      this.props.mfaLockedUntil = new Date(now.getTime() + lockMinutes * 60_000);
    }
  }

  recordMfaSuccess(): void {
    this.props.mfaFailedAttempts = 0;
    this.props.mfaLockedUntil = null;
  }

  /** Login by RUT + password is rate-limited exactly like the second factor: N consecutive
   * wrong passwords lock the account for a while, during which even the right one is refused. */
  isLoginLocked(now: Date): boolean {
    return (
      this.props.loginLockedUntil !== null && this.props.loginLockedUntil.getTime() > now.getTime()
    );
  }

  recordLoginFailure(threshold: number, lockMinutes: number, now: Date): void {
    this.props.loginFailedAttempts += 1;
    if (this.props.loginFailedAttempts >= threshold) {
      this.props.loginLockedUntil = new Date(now.getTime() + lockMinutes * 60_000);
    }
  }

  /** Returns whether anything changed, so a clean login doesn't write the row. */
  recordLoginSuccess(): boolean {
    if (this.props.loginFailedAttempts === 0 && this.props.loginLockedUntil === null) return false;
    this.props.loginFailedAttempts = 0;
    this.props.loginLockedUntil = null;
    return true;
  }

  /** Account deletion (Ley 21.719 Art. 11 supresión): scrubs every PII field to null and
   * flips the account permanently unreachable — but does NOT touch any other table.
   * Financial rows (BankAccount, Transaction, Debt, …) stay linked to this same `userId`
   * on purpose: once this row carries no identifying field, they're anonymized historical
   * data, not personal data anymore, and this app has a legitimate interest in keeping
   * that history intact rather than losing it. Security artifacts that WOULD let someone
   * back in (sessions/passkeys/recovery codes) are the caller's job to hard-delete in the
   * same transaction — this method only owns the `User` row itself. Idempotent: a second
   * call on an already-deleted account is a silent no-op (no new event), same spirit as
   * `BankAccount.setStatus`. */
  delete(): UserAccountDeletedEvent | null {
    if (this.props.deletedAt) return null;
    this.props.deletedAt = new Date();
    this.props.status = "DISABLED";
    this.props.email = null;
    this.props.emailVerifiedAt = null;
    this.props.name = null;
    this.props.passwordHash = null;
    this.props.phone = null;
    this.props.addressStreet = null;
    this.props.addressCity = null;
    this.props.addressRegion = null;
    this.props.addressPostalCode = null;
    this.props.birthDate = null;
    this.props.identifierType = null;
    this.props.identifierValue = null;
    this.props.countryId = null;
    this.props.countryName = null;
    this.props.mfaEnabled = false;
    this.props.mfaMethod = null;
    this.props.mfaPendingMethod = null;
    this.props.mfaSecret = null;
    this.props.mfaFailedAttempts = 0;
    this.props.mfaLockedUntil = null;
    this.props.loginFailedAttempts = 0;
    this.props.loginLockedUntil = null;
    return new UserAccountDeletedEvent(this.props.id);
  }

  snapshot(): Readonly<UserProps> {
    return this.props;
  }

  /** `mfaRecoveryCodesRemaining` is resolved by the caller (a separate table's port,
   * Constitution VI: this aggregate never queries `mfa-recovery-code` itself) — defaults to 0,
   * accurate for any caller whose flow guarantees no codes exist yet (register, a non-MFA
   * login). Callers that might already have MFA active (get-me, update-profile,
   * update-preferences) must pass the real count. */
  toContract(mfaRecoveryCodesRemaining = 0): auth.CurrentUser {
    return {
      id: this.props.id,
      email: this.props.email,
      name: this.props.name,
      preferredCurrency: this.props.preferredCurrency,
      locale: this.props.locale,
      theme: this.props.theme,
      memberSinceYear: this.props.createdAt.getFullYear(),
      countryId: this.props.countryId,
      countryName: this.props.countryName,
      addressStreet: this.props.addressStreet,
      addressCity: this.props.addressCity,
      addressRegion: this.props.addressRegion,
      addressPostalCode: this.props.addressPostalCode,
      birthDate: this.props.birthDate ? this.props.birthDate.toISOString().slice(0, 10) : null,
      age: calculateAge(this.props.birthDate),
      identifierType: this.props.identifierType,
      identifierValue: this.props.identifierValue,
      phone: this.props.phone,
      hideBalances: this.props.hideBalances,
      onboardingClosed: this.onboardingClosed,
      releaseNotesSeenVersion: this.releaseNotesSeenVersion,
      extraCurrencies: this.props.extraCurrencies,
      budgetAlertThreshold: this.props.budgetAlertThreshold,
      mfaEnabled: this.props.mfaEnabled,
      mfaMethod: (this.mfaMethodOrDefault()?.toLowerCase() ?? null) as auth.MfaMethod | null,
      mfaRecoveryCodesRemaining,
      emailVerified: this.emailVerified,
    };
  }
}
