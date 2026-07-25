import type { auth } from "@finance/contracts";
import { moneyToString } from "@finance/money";

import { UserDeactivatedEvent } from "./events/user-deactivated.event";
import { AccountDisabledError } from "./errors";

export type UserStatus = "ACTIVE" | "DISABLED";

export interface UserProps {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
  status: UserStatus;
  preferredCurrency: auth.CurrentUser["preferredCurrency"];
  locale: auth.CurrentUser["locale"];
  dateFormat: auth.CurrentUser["dateFormat"];
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
  monthlyBudgetTarget: string | null;
  billingCycleStartDay: number | null;
  extraCurrencies: string[];
  budgetAlertThreshold: number | null;
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
  dateFormat: auth.CurrentUser["dateFormat"];
  theme: auth.CurrentUser["theme"];
  hideBalances: boolean;
  monthlyBudgetTarget: string | null;
  billingCycleStartDay: number | null;
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
  static planRegistration(input: {
    email: string;
    name?: string;
    passwordHash: string;
  }): { email: string; name?: string; passwordHash: string } {
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
      this.props.countryName = patch.countryId ? (patch.countryName ?? this.props.countryName) : null;
    }
    if (patch.addressStreet !== undefined) this.props.addressStreet = patch.addressStreet;
    if (patch.addressCity !== undefined) this.props.addressCity = patch.addressCity;
    if (patch.addressRegion !== undefined) this.props.addressRegion = patch.addressRegion;
    if (patch.addressPostalCode !== undefined) this.props.addressPostalCode = patch.addressPostalCode;
    if (patch.birthDate !== undefined) this.props.birthDate = patch.birthDate;
    if (patch.identifierType !== undefined) this.props.identifierType = patch.identifierType;
    if (patch.identifierValue !== undefined) this.props.identifierValue = patch.identifierValue;
    if (patch.phone !== undefined) this.props.phone = patch.phone;
  }

  applyPreferencesUpdate(patch: PreferencesPatch): void {
    if (patch.preferredCurrency !== undefined) this.props.preferredCurrency = patch.preferredCurrency;
    if (patch.locale !== undefined) this.props.locale = patch.locale;
    if (patch.dateFormat !== undefined) this.props.dateFormat = patch.dateFormat;
    if (patch.theme !== undefined) this.props.theme = patch.theme;
    if (patch.hideBalances !== undefined) this.props.hideBalances = patch.hideBalances;
    if (patch.monthlyBudgetTarget !== undefined) this.props.monthlyBudgetTarget = patch.monthlyBudgetTarget;
    if (patch.billingCycleStartDay !== undefined) this.props.billingCycleStartDay = patch.billingCycleStartDay;
    if (patch.extraCurrencies !== undefined) this.props.extraCurrencies = patch.extraCurrencies;
    if (patch.budgetAlertThreshold !== undefined) this.props.budgetAlertThreshold = patch.budgetAlertThreshold;
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

  toContract(): auth.CurrentUser {
    return {
      id: this.props.id,
      email: this.props.email,
      name: this.props.name,
      preferredCurrency: this.props.preferredCurrency,
      locale: this.props.locale,
      dateFormat: this.props.dateFormat,
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
      monthlyBudgetTarget: this.props.monthlyBudgetTarget
        ? moneyToString(this.props.monthlyBudgetTarget)
        : null,
      billingCycleStartDay: this.props.billingCycleStartDay,
      extraCurrencies: this.props.extraCurrencies,
      budgetAlertThreshold: this.props.budgetAlertThreshold,
    };
  }
}
