import type { auth } from "@finance/contracts";

import { UserDeactivatedEvent } from "./events/user-deactivated.event";
import { AccountDisabledError, MfaAlreadyEnabledError, MfaNotPendingError } from "./errors";

export type UserStatus = "ACTIVE" | "DISABLED";

export interface UserProps {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
  status: UserStatus;
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
}

export type ProfilePatch = Partial<{
  name: string;
  email: string;
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
   * dependency, so it isn't a repository port), the hash is handed in ready. */
  static planRegistration(input: { email: string; name?: string; passwordHash: string }): {
    email: string;
    name?: string;
    passwordHash: string;
  } {
    return { email: input.email.toLowerCase(), name: input.name, passwordHash: input.passwordHash };
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
    if (patch.email !== undefined) this.props.email = patch.email;
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
   * Starts (or restarts) an MFA enrollment: stores a fresh pending secret, replacing any
   * previous unconfirmed one (a refreshed/abandoned activation screen simply gets a new QR —
   * nothing was protecting the account with the old pending secret anyway). Rejected once MFA
   * is already active — this app has no "replace device" path, only disable-then-reactivate.
   */
  startMfaEnrollment(secret: string): void {
    if (this.props.mfaEnabled) throw new MfaAlreadyEnabledError();
    this.props.mfaSecret = secret;
  }

  /** Confirms a pending enrollment. Requires a secret from a prior `startMfaEnrollment` — the
   * TOTP code itself is validated by the calling handler (pure crypto, no aggregate state). */
  confirmMfaEnrollment(): void {
    if (this.props.mfaEnabled) throw new MfaAlreadyEnabledError();
    if (!this.props.mfaSecret) throw new MfaNotPendingError();
    this.props.mfaEnabled = true;
  }

  /** Invalidates the secret and resets the rate-limit counters — recovery codes are discarded
   * by the caller (a separate aggregate/table) in the same transaction. */
  disableMfa(): void {
    this.props.mfaEnabled = false;
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

  /** Soft-disable (FR-011: only the status flag changes, no other field/related
   * record is touched). Emits `UserDeactivatedEvent` only on a genuine
   * ACTIVE -> DISABLED transition (idempotent no-op otherwise, same spirit as
   * `BankAccount.setStatus`). */
  deactivate(): UserDeactivatedEvent | null {
    const wasActive = this.props.status === "ACTIVE";
    this.props.status = "DISABLED";
    return wasActive ? new UserDeactivatedEvent(this.props.id) : null;
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
      extraCurrencies: this.props.extraCurrencies,
      budgetAlertThreshold: this.props.budgetAlertThreshold,
      mfaEnabled: this.props.mfaEnabled,
      mfaRecoveryCodesRemaining,
    };
  }
}
