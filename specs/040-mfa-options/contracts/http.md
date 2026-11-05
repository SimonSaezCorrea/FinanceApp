# HTTP contract: 040 MFA options

All under `/api/v1/auth`. Schemas live in `@finance/contracts` (`auth` module). Errors are the usual
`{ error: { code, field? } }`.

## Changed

### `POST /login` (public)

Response gains, when `mfaRequired: true`:

```ts
{ mfaRequired: true; mfaMethod: "totp" | "email"; codeSent?: boolean; retryAfterSeconds?: number }
```

`codeSent` only for `email` (false when the resend limit or the email service blocked the send). With a
valid `mfa_trusted` cookie for this account → `{ mfaRequired: false, user }` directly. Old clients that
ignore the new fields keep working (same TOTP prompt; the field is additive).

### `POST /login/mfa-verify` (public, needs `mfa_pending_token` cookie)

Body: `{ code: string; rememberDevice?: boolean }` (default `false`). `code` = 6 digits (TOTP or email
code, by the account's method) or `XXXX-XXXX` recovery code. With `rememberDevice: true` on success, sets
`mfa_trusted` (httpOnly, 30 days). Errors unchanged: `INVALID_MFA_CODE`, `MFA_LOCKED` (429),
`UNAUTHORIZED`.

### `GET /me` → `CurrentUser`

Adds `mfaMethod: "totp" | "email" | null`. (`mfaRecoveryCodesRemaining` already exists.)

### `POST /me/mfa/enroll` (authed)

Body (optional): `{ method?: "totp" | "email" }` (absent = `totp`).

- `totp` → `{ method: "totp", qrCodeDataUrl, secret }` (as today).
- `email` → `{ method: "email", codeSent: true }` after sending an `ENROLL` code to the confirmed email.

With verification already active this is a **method change** and requires a recent step-up
(`STEP_UP_REQUIRED`, 403). New errors: `MFA_EMAIL_NOT_VERIFIED` (409), `MFA_SAME_METHOD` (409),
`MFA_CODE_RATE_LIMITED` (429, `retryAfterSeconds`), `EMAIL_UNAVAILABLE` (503).

### `POST /me/mfa/confirm` (authed)

Body `{ code }` (unchanged). Validates against the pending method. Activation → `{ recoveryCodes: string[] }`
(as today). Method change → `{ recoveryCodes: null }` (codes kept). Errors as today plus
`MFA_NOT_PENDING`.

### `POST /sessions/step-up` (authed)

Body adds `{ method: "email"; code: string }`. Allowed methods from `auth.stepUpMethodsFor({ mfaMethod,
passkeyCount })`.

## New

| Method & path                        | Auth                     | Body / response                                                                       | Idempotency (VII)                                                                                                              |
| ------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /login/mfa-resend`             | pending cookie           | → `{ codeSent: true }` or 429 `MFA_CODE_RATE_LIMITED` `{ retryAfterSeconds }`         | (b): one active code per (user, purpose), partial unique index; a resend replaces it                                           |
| `POST /sessions/step-up/email-code`  | session                  | → `{ codeSent: true }` / 429                                                          | (b), same index                                                                                                                |
| `POST /me/mfa/recovery-codes`        | session + recent step-up | → `{ recoveryCodes: string[] }` (10, shown once)                                      | (a): consumes the session's step-up (conditional UPDATE); a replay/concurrent call gets `STEP_UP_REQUIRED` and creates nothing |
| `GET /me/mfa/trusted-devices`        | session                  | → `{ items: { id, deviceLabel, createdAt, expiresAt, lastUsedAt, isCurrent }[] }`     | read                                                                                                                           |
| `DELETE /me/mfa/trusted-devices/:id` | session                  | 204. `:id` validated as `rowId`; ownership by `userId` in the query (404 if not mine) | (a): deleting twice → 404 the second time, no further effect                                                                   |

`isCurrent` = the row whose hash matches this browser's `mfa_trusted` cookie.

## Error codes (new)

`MFA_EMAIL_NOT_VERIFIED`, `MFA_SAME_METHOD`, `MFA_CODE_RATE_LIMITED`, `MFA_NOT_ENABLED`, `TRUSTED_DEVICE_NOT_FOUND`.
Each gets `errors.<CODE>` in es/en.

## Cookie

`mfa_trusted`: httpOnly, `Secure` per `requiresSecureCookies`, `SameSite=Lax`, `path=/api/v1/auth`,
`maxAge` 30 days. The API never clears it on a mismatch (a cookie whose row is gone, expired or belongs
to another account simply doesn't skip the second factor); it is overwritten on the next "remember".
