import { z } from "zod";

import { isValidRut } from "./rut";
import { rowId } from "../common/row-id";
import { identifierTypeSchema } from "../reference";

export * from "./rut";

/** Auth domain contracts (seed; expanded during US2 auth migration). */

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const registerRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  /** Ley 21.719 Art. 16 reinforced consent: this app's financial data (balances, movements,
   * debts) is "situación socioeconómica", sensitive under Art. 2 letra g) — a bundled generic
   * "I accept the terms" checkbox isn't enough. Must be exactly `true` (an unchecked/omitted
   * checkbox fails validation outright, never silently defaults). */
  sensitiveDataConsent: z.literal(true),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** One consent the user granted, as shown back to them (e.g. a "mis consentimientos" screen). */
export const consentTypeSchema = z.enum(["SENSITIVE_DATA_PROCESSING"]);
export const consentRecordSchema = z.object({
  id: rowId,
  type: consentTypeSchema,
  policyVersion: z.string(),
  grantedAt: z.string(),
  revokedAt: z.string().nullable(),
});
export type ConsentRecord = z.infer<typeof consentRecordSchema>;
export const listConsentsResponseSchema = z.array(consentRecordSchema);
export type ListConsentsResponse = z.infer<typeof listConsentsResponseSchema>;

/** Moneda principal del usuario. El MVP opera en Chile con tres monedas: peso,
 * dólar y `CLF` (el código ISO 4217 de la UF, que la app nunca convierte a pesos). */
export const preferredCurrencySchema = z.enum(["CLP", "USD", "CLF"]);
/** Any ISO 4217 alpha code from the reference `Currency` list (not restricted like the primary currency). */
export const currencyCodeSchema = z.string().trim().length(3);
export const localeSchema = z.enum(["es", "en"]);
export const themeSchema = z.enum(["dark", "light", "system"]);

export const currentUserSchema = z.object({
  id: rowId,
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  preferredCurrency: preferredCurrencySchema,
  locale: localeSchema,
  theme: themeSchema,
  memberSinceYear: z.number(),
  countryId: rowId.nullable(),
  countryName: z.string().nullable(),
  addressStreet: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressRegion: z.string().nullable(),
  addressPostalCode: z.string().nullable(),
  /** ISO date string ("YYYY-MM-DD"), for hydrating the edit form. The main Profile view only
   * ever renders the derived `age` below — hiding the exact date is a UI choice, not an API one. */
  birthDate: z.string().nullable(),
  /** Full years elapsed since birthDate, or null if unset. Computed on-read. */
  age: z.number().nullable(),
  identifierType: identifierTypeSchema.nullable(),
  identifierValue: z.string().nullable(),
  phone: z.string().nullable(),
  /** Masks monetary amounts on the Panel, an account's own balance and Ahorros when true
   * (specs/020) — never Movimientos, Deudas, Recurrentes or Cuotas/Facturación. */
  hideBalances: z.boolean(),
  /** Extra currencies the user wants tracked, on top of preferredCurrency (any ISO 4217 code from
   * the reference `Currency` list — not restricted to the primary three) — also the universe
   * offered by every "pick a currency for a new record" selector in the app. Selection only — no
   * live FX. A currency can't be removed while any of the user's own records still use it. */
  extraCurrencies: z.array(currencyCodeSchema),
  /** % of a monthly budget target at which to warn the user. Stored for the Notifications UI
   * only — no real alert is sent, and no budget-target field exists to compute it against. */
  budgetAlertThreshold: z.number().int().min(1).max(100).nullable(),
  /** Whether login requires a TOTP (or recovery code) second factor (specs/021). */
  mfaEnabled: z.boolean(),
  /** How many single-use recovery codes are still unused — never the codes themselves, which
   * are shown exactly once, at activation confirmation. Always 0 when mfaEnabled is false. */
  mfaRecoveryCodesRemaining: z.number().int().min(0),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const updateProfileRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().email().optional(),
    countryId: rowId.nullable().optional(),
    addressStreet: z.string().trim().max(200).nullable().optional(),
    addressCity: z.string().trim().max(120).nullable().optional(),
    addressRegion: z.string().trim().max(120).nullable().optional(),
    addressPostalCode: z.string().trim().max(20).nullable().optional(),
    birthDate: z.coerce.date().nullable().optional(),
    identifierType: identifierTypeSchema.nullable().optional(),
    identifierValue: z.string().trim().max(30).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
  })
  .refine(
    (data) =>
      data.identifierType !== "RUT" || !data.identifierValue || isValidRut(data.identifierValue),
    { message: "invalid_rut", path: ["identifierValue"] },
  );
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const updatePreferencesRequestSchema = z.object({
  preferredCurrency: preferredCurrencySchema.optional(),
  locale: localeSchema.optional(),
  theme: themeSchema.optional(),
  hideBalances: z.boolean().optional(),
  extraCurrencies: z.array(currencyCodeSchema).optional(),
  budgetAlertThreshold: z.number().int().min(1).max(100).nullable().optional(),
});
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequestSchema>;

/** Ley 21.719 Art. 11 supresión. The account can never log in again either way — `keepHistory`
 * is the user's own explicit choice, made at deletion time, never a default:
 * - `false` (hard delete): every row this user owns, across every table, is deleted (the
 *   existing `onDelete: Cascade` on every `userId` FK does the actual removal).
 * - `true` (anonymize): only this `User` row is scrubbed of PII (see `User.delete()`'s
 *   doc-comment) — financial history stays, under the same userId, for the user's own
 *   statistics/history. Security artifacts (sessions/passkeys/recovery codes) are hard-deleted
 *   either way — they only ever exist to let someone log back in.
 * Replaces the old `deactivateRequestSchema`, which never actually deleted anything. */
export const deleteAccountRequestSchema = z.object({
  password: z.string().min(1),
  keepHistory: z.boolean(),
});
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

// ---- MFA (specs/021) ----

/** `POST /auth/login`'s response shape. With MFA active, no session is issued yet — only a
 * `mfa_pending_token` cookie (set by the controller, not part of this body) — and `user` is
 * omitted entirely rather than sent partial/placeholder data. */
export const loginResponseSchema = z.discriminatedUnion("mfaRequired", [
  z.object({ mfaRequired: z.literal(true) }),
  z.object({ mfaRequired: z.literal(false), user: currentUserSchema }),
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Single field, either a 6-digit TOTP or an `XXXX-XXXX` recovery code — the server tells them
 * apart by format (FR-007), the client never chooses a path. Used both to confirm an enrollment
 * (TOTP only, in practice) and to complete a pending login's second factor. */
export const mfaCodeSchema = z.string().trim().min(6).max(20);

export const startMfaEnrollmentResponseSchema = z.object({
  qrCodeDataUrl: z.string(),
  /** Plaintext secret, shown ONLY in this response, as the manual-entry alternative to
   * scanning the QR — never exposed again after enrollment is confirmed. */
  secret: z.string(),
});
export type StartMfaEnrollmentResponse = z.infer<typeof startMfaEnrollmentResponseSchema>;

export const confirmMfaEnrollmentRequestSchema = z.object({ code: mfaCodeSchema });
export type ConfirmMfaEnrollmentRequest = z.infer<typeof confirmMfaEnrollmentRequestSchema>;

export const confirmMfaEnrollmentResponseSchema = z.object({
  /** The 10 recovery codes, in plaintext, shown exactly once — never returned by any other
   * endpoint or response afterward. */
  recoveryCodes: z.array(z.string()),
});
export type ConfirmMfaEnrollmentResponse = z.infer<typeof confirmMfaEnrollmentResponseSchema>;

export const disableMfaRequestSchema = z.object({ password: z.string().min(1) });
export type DisableMfaRequest = z.infer<typeof disableMfaRequestSchema>;

export const verifyMfaLoginRequestSchema = z.object({ code: mfaCodeSchema });
export type VerifyMfaLoginRequest = z.infer<typeof verifyMfaLoginRequestSchema>;

// ---- Passkeys / WebAuthn (specs/022) ----

/** Never exposes `credentialId`/`publicKey` — those are verification details, not UI data. */
export const passkeySchema = z.object({
  id: rowId,
  name: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type Passkey = z.infer<typeof passkeySchema>;

/** The options object is whatever `@simplewebauthn/server` generates — its exact shape is fixed
 * by the WebAuthn standard, not by this contract; passed straight to
 * `navigator.credentials.create()`/`.get()` in the browser. */
export const startPasskeyRegistrationResponseSchema = z.object({ options: z.unknown() });
export type StartPasskeyRegistrationResponse = z.infer<
  typeof startPasskeyRegistrationResponseSchema
>;

/** `response` is `navigator.credentials.create()`'s own return value, serialized to JSON by the
 * frontend's own base64url helpers (never validated shape-wise here — the WebAuthn library does
 * that server-side). */
export const confirmPasskeyRegistrationRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  response: z.unknown(),
});
export type ConfirmPasskeyRegistrationRequest = z.infer<
  typeof confirmPasskeyRegistrationRequestSchema
>;

export const listPasskeysResponseSchema = z.array(passkeySchema);
export type ListPasskeysResponse = z.infer<typeof listPasskeysResponseSchema>;

/** specs/025 — same validation as the name chosen at registration time. */
export const renamePasskeyRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type RenamePasskeyRequest = z.infer<typeof renamePasskeyRequestSchema>;

/** `email` omitted = discoverable/"usernameless" login: the browser offers any resident passkey
 * for this site on its own, with no typed email at all. */
export const startPasskeyLoginRequestSchema = z.object({ email: z.string().email().optional() });
export type StartPasskeyLoginRequest = z.infer<typeof startPasskeyLoginRequestSchema>;

/** Always the same shape whether or not the email has any passkeys (FR-005a, no
 * user-enumeration) — `options.allowCredentials` is simply empty in that case. */
export const startPasskeyLoginResponseSchema = z.object({ options: z.unknown() });
export type StartPasskeyLoginResponse = z.infer<typeof startPasskeyLoginResponseSchema>;

export const verifyPasskeyLoginRequestSchema = z.object({
  response: z.unknown(),
});
export type VerifyPasskeyLoginRequest = z.infer<typeof verifyPasskeyLoginRequestSchema>;

// ---- Sessions / devices (specs/023) ----

/** `isCurrent` is never stored — it's derived per-request by comparing each row against
 * the `sid` of the access token making the call (data-model.md). */
export const sessionSchema = z.object({
  id: rowId,
  deviceLabel: z.string().nullable(),
  country: z.string().nullable(),
  /** Best-effort, less reliable than `country` (carrier NAT/mobile often resolves to
   * the ISP's own city) — shown as an extra detail, never load-bearing. */
  city: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  /** `null` = open/active. Set once a session stops being usable (explicit close,
   * revoke-others, logout, or natural time expiry) — a closed session stays visible,
   * marked as such, for a retention window before it's purged for good
   * (amendment 2026-09-19, supersedes the original no-history design). */
  closedAt: z.string().nullable(),
  isCurrent: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

export const listSessionsResponseSchema = z.array(sessionSchema);
export type ListSessionsResponse = z.infer<typeof listSessionsResponseSchema>;
