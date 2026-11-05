# Tasks: Verificación en dos pasos más completa

**Input**: Design documents from `/specs/040-mfa-options/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http.md, quickstart.md

**Tests**: REQUIRED (Constitution IV, test-first). Each story writes its failing tests before the code.

**Organization**: by user story (US1 → US2 → US3), each independently testable and shippable.

Paths: API code under `apps/api/src/`, API tests under `apps/api/test/`, contracts under
`packages/contracts/src/auth/`.

## Phase 1: Setup (schema)

- [x] T001 Add `MfaMethod`, `MfaCodePurpose`, `MfaCodeChannel` enums, `User.mfaMethod`/`User.mfaPendingMethod`, and models `TrustedDevice` (`@@map("trusted-device")`) and `MfaCode` (`@@map("mfa-code")`) per data-model.md in apps/api/prisma/schema.prisma
- [x] T002 Generate the migration with `pnpm db:migrate` (name `mfa_options`) and hand-edit apps/api/prisma/migrations/<ts>_mfa_options/migration.sql to add the backfill `UPDATE "user" SET "mfaMethod" = 'TOTP' WHERE "mfaEnabled"` and the partial unique index `CREATE UNIQUE INDEX "mfa-code_one_active_per_purpose" ON "mfa-code" ("userId", "purpose") WHERE "usedAt" IS NULL`; run `prisma generate`

## Phase 2: Foundational (blocking all stories)

- [x] T003 [P] Add contract shapes to packages/contracts/src/auth/index.ts: `mfaMethodSchema` (`"totp" | "email"`), `CurrentUser.mfaMethod` (nullable), login response `mfaMethod`/`codeSent`/`retryAfterSeconds` (additive), `verifyMfaLoginRequestSchema.rememberDevice` (optional, default false), `startMfaEnrollmentRequestSchema` `{ method? }` and its discriminated response, `confirmMfaEnrollmentResponseSchema.recoveryCodes` nullable, `stepUpMethodSchema` + `"email"`, `stepUpMethodsFor({ mfaMethod?, mfaEnabled?, passkeyCount })` (accepts the old `mfaEnabled` shape so `StepUpPanel` keeps compiling; `mfaMethod` wins when present), `stepUpRequestSchema` email variant, `regenerateRecoveryCodesResponseSchema`, `trustedDeviceSchema`/`listTrustedDevicesResponseSchema`, `mfaCodeSentResponseSchema`; with unit tests in packages/contracts/src/auth/index.test.ts (stepUpMethodsFor matrix, schema parsing)
- [x] T004 [P] Add the new error classes `MfaEmailNotVerifiedError` (409 `MFA_EMAIL_NOT_VERIFIED`), `MfaSameMethodError` (409 `MFA_SAME_METHOD`), `MfaCodeRateLimitedError` (429 `MFA_CODE_RATE_LIMITED`, carries `retryAfterSeconds`), `MfaNotEnabledError` (409 `MFA_NOT_ENABLED`), `TrustedDeviceNotFoundError` (404 `TRUSTED_DEVICE_NOT_FOUND`) in apps/api/src/domains/user/domain/errors.ts, and make `AllExceptionsFilter` include `retryAfterSeconds` in the error body when present (apps/api/src/infra/http/), with its unit test
- [x] T005 [P] Add `RECOVERY_CODES_REGENERATED`, `TRUSTED_DEVICE_ADDED` (with optional `detail` = device label) and `MFA_METHOD_CHANGED` to `AccountSecurityKind` in apps/api/src/domains/user/domain/events/account-security.event.ts and their es/en subject+body in apps/api/src/infra/email/templates/security-notice.ts and apps/api/src/infra/email/i18n/; extend apps/api/test/unit/infra/email tests for the three kinds
- [x] T006 Extend the `User` aggregate (apps/api/src/domains/user/domain/user.aggregate.ts + its Prisma mapping in apps/api/src/domains/user/infrastructure/) with `mfaMethod`, `mfaPendingMethod`, `mfaMethodOrDefault()` (null with `mfaEnabled` → `TOTP`) and expose `mfaMethod` in `toContract`; unit tests in apps/api/test/unit/domains/user/domain/user.aggregate.spec.ts

**Checkpoint**: schema, contracts, errors and events in place; nothing behaves differently yet.

## Phase 3: User Story 1 — Generar códigos de recuperación nuevos (P1) 🎯 MVP

**Goal**: 10 new recovery codes after a recent step-up, old ones dead in the same transaction, notice email.

**Independent Test**: with TOTP active, step up, regenerate; an old code fails at `login/mfa-verify`, a new one works, TOTP still works; without step-up → `STEP_UP_REQUIRED`.

### Tests (write first, must fail)

- [x] T007 [P] [US1] Unit test apps/api/test/unit/domains/user/application/commands/regenerate-recovery-codes.handler.spec.ts: requires recent step-up, refuses when MFA inactive (`MFA_NOT_ENABLED`), consumes the step-up in the same transaction and refuses (`STEP_UP_REQUIRED`, nothing written) when the conditional consume loses, deletes + creates in one transaction (fake ports record order), returns 10 codes, publishes `RECOVERY_CODES_REGENERATED`, does not touch the TOTP secret
- [x] T008 [P] [US1] E2E test apps/api/test/e2e/domains/user/mfa-recovery-codes-regenerate.http.spec.ts: step-up → `POST /auth/me/mfa/recovery-codes` → 10 codes; old code rejected at login, new accepted; TOTP still accepted; no step-up → 403; a second regenerate right after → 403 (step-up consumed); two concurrent regenerates → exactly one 200; notice in the email outbox; `GET /auth/me` shows `mfaRecoveryCodesRemaining: 10`

### Implementation

- [x] T009 [US1] Add `consumeWithTx(tx, userId, sessionId, stepUpAt)` to `SessionStepUpPort` (apps/api/src/domains/session/domain/ports/session-step-up.port.ts) and `PrismaSessionRepository` (conditional `updateMany`, returns whether 1 row changed) with an integration test in apps/api/test/integration/domains/session/; create `RegenerateRecoveryCodesCommand`/`RegenerateRecoveryCodesHandler` in apps/api/src/domains/user/application/commands/ (assertRecentStepUp, `generateRecoveryCodes`, bcrypt, one `$transaction`: consume step-up → `deleteAllForUserWithTx` + `createManyWithTx`; trusted-device forgetting is added in T023)
- [x] T010 [US1] Add `POST me/mfa/recovery-codes` to apps/api/src/domains/user/presentation/auth.controller.ts and register the handler in apps/api/src/domains/user/user.module.ts
- [x] T011 [P] [US1] Add `regenerateRecoveryCodes()` to packages/client/src/authApi.ts
- [x] T012 [US1] Create apps/web/src/domains/profile/components/RecoveryCodesPanel.tsx (codes shown once, copy all, download `.txt`, "guardé mis códigos" to close) and reuse it from MfaEnrollmentPanel's confirmation step
- [x] T013 [US1] In apps/web/src/domains/profile/components/SecuritySection.tsx: show remaining codes and a "Generar códigos nuevos" action wrapped in `useStepUp` (warning that old codes stop working), opening RecoveryCodesPanel; i18n keys `profile.security.mfa.recovery.*` in packages/i18n/src/es.json and en.json
- [x] T014 [P] [US1] Web tests in apps/web/src/domains/profile/components/SecuritySection.test.tsx (+ RecoveryCodesPanel.test.tsx): action hidden without MFA, step-up then codes shown once, remaining count

**Checkpoint**: US1 complete and shippable alone.

## Phase 4: User Story 2 — Recordar este dispositivo (P2)

**Goal**: a remembered browser skips only the second factor for 30 days, for its own account; list + remove; all forgotten on sensitive events.

**Independent Test**: remember → logout → login on same cookie skips MFA; other account or wrong password doesn't; removing or changing password restores the prompt.

### Tests (write first, must fail)

- [x] T015 [P] [US2] Unit tests apps/api/test/unit/domains/trusted-device/trusted-device.entity.spec.ts (30-day fixed expiry, belongs-to check) and apps/api/test/unit/domains/user/application/trusted-device-cookie.spec.ts (token entropy, SHA-256 hash, cookie options)
- [x] T016 [P] [US2] Integration test apps/api/test/integration/domains/trusted-device/prisma-trusted-device.repository.spec.ts: remember prunes to 10 (oldest out), findValidByTokenHash ignores expired, deleteOwned is scoped by userId, deleteAllForUserWithTx, purgeExpired
- [x] T017 [P] [US2] Unit tests for the login path in apps/api/test/unit/domains/user/application/commands/login.handler.spec.ts and verify-mfa-login.handler.spec.ts: valid own cookie → session without pending token; other account's / expired cookie → pending token; wrong password with a valid cookie → INVALID_CREDENTIALS and counter incremented; `rememberDevice` creates a device and publishes `TRUSTED_DEVICE_ADDED`
- [x] T018 [P] [US2] E2E test apps/api/test/e2e/domains/user/mfa-trusted-device.http.spec.ts: the spec's 8 scenarios over HTTP (cookie set/used, other account, expiry via clock, list with `isCurrent`, remove → prompt again, change password / reset password / disable MFA / regenerate codes each forget all, passkey login unaffected)

### Implementation

- [x] T019 [P] [US2] Create the `trusted-device` table-domain: apps/api/src/domains/trusted-device/domain/trusted-device.entity.ts, domain/ports/trusted-device.repository.port.ts, infrastructure/prisma-trusted-device.repository.ts, trusted-device.data.module.ts (leaf)
- [x] T020 [US2] Create apps/api/src/domains/user/application/trusted-device-cookie.ts (`randomBytes(32)` base64url, `sha256`, cookie name `mfa_trusted`, options reusing the session cookies' `secure` rule, `path=/api/v1/auth`, 30 days)
- [x] T021 [US2] LoginHandler (apps/api/src/domains/user/application/commands/login.handler.ts + login.command.ts): accept the cookie token; after a correct password with MFA active, a valid own device → establish the session directly and `touch` it; controller passes `req.cookies.mfa_trusted`
- [x] T022 [US2] VerifyMfaLoginHandler + controller: `rememberDevice` → `rememberWithTx` inside the existing transaction (device label from `device-info.ts`), set the cookie in apps/api/src/domains/user/presentation/auth.controller.ts, publish `TRUSTED_DEVICE_ADDED` after commit
- [x] T023 [US2] Forget all devices inside the existing transactions of ChangePasswordHandler, ResetPasswordHandler, DisableMfaHandler and RegenerateRecoveryCodesHandler (apps/api/src/domains/user/application/commands/) via `deleteAllForUserWithTx`; import `TrustedDeviceDataModule` in user.module.ts; update their unit tests
- [x] T024 [US2] Create `ListTrustedDevicesQuery` (apps/api/src/domains/user/application/queries/) and `RemoveTrustedDeviceCommand` (commands/), routes `GET me/mfa/trusted-devices` and `DELETE me/mfa/trusted-devices/:id` (`rowId` param) in auth.controller.ts; `isCurrent` from the request cookie
- [x] T025 [US2] Add a purge step for expired trusted devices to apps/api/src/infra/cron/maintenance.cron.ts (its own isolated step, like the others) with a `PurgeExpiredTrustedDevicesCommand`
- [x] T026 [P] [US2] Add `listTrustedDevices()`/`removeTrustedDevice(id)` and `rememberDevice` on `verifyMfaLogin` to packages/client/src/authApi.ts
- [x] T027 [US2] Landing access panel: "Recordar este dispositivo por 30 días" checkbox (unchecked) in the second-factor step of apps/landing/src/domains/auth/components/LoginForm.tsx, sent as `rememberDevice`; strings under `auth.*` in packages/i18n/src/{es,en}.json (the landing's access-panel catalog only loads `app/auth/brand/common/errors/theme`); test in LoginForm.test.tsx
- [x] T028 [US2] Create apps/web/src/domains/profile/components/TrustedDevicesList.tsx (label, remembered on, last use, "Este dispositivo" badge, "Quitar" with confirm) and mount it in SecuritySection.tsx when MFA is active; i18n `profile.security.mfa.devices.*`; tests TrustedDevicesList.test.tsx
- [x] T028a [US2] Add remembered devices to "Descargar mis datos": a `trustedDevices` entry in the JSON and a sheet in the Excel (apps/web/src/domains/profile/lib/personalData.ts and its tests)

**Checkpoint**: US1 + US2 working.

## Phase 5: User Story 3 — Código por correo (P3)

**Goal**: email code as an alternative second factor (activation, login, resend, step-up, method change).

**Independent Test**: activate by email, logout, login → code in outbox → enters; reused/expired/replaced code rejected; 5 wrong → locked; switch to TOTP and back.

### Tests (write first, must fail)

- [x] T029 [P] [US3] Unit tests apps/api/test/unit/domains/user/application/mfa-code-hash.spec.ts (HKDF key derivation stable, HMAC includes id, constant-time verify) and mfa-code-service.spec.ts (60 s and 5/h limits with `retryAfterSeconds`, sends only to a confirmed email, uses the channel sender port, provider failure logged not thrown)
- [x] T030 [P] [US3] Integration test apps/api/test/integration/domains/mfa-code/prisma-mfa-code.repository.spec.ts: issue replaces the active one, concurrent issue collides on the partial index (`issued: false`), consumeWithTx single-winner and refuses expired/used, countSince/lastIssuedAt, purgeStale
- [x] T031 [P] [US3] Unit tests for the method-aware handlers: verify-mfa-login.handler.spec.ts (email code consumed atomically, failure counts, recovery code still works), start-mfa-enrollment.handler.spec.ts and confirm-mfa-enrollment.handler.spec.ts (email requires confirmed email, method change requires step-up, same method refused, change keeps recovery codes / clears TOTP secret / forgets devices / publishes `MFA_METHOD_CHANGED`), verify-step-up.handler.spec.ts (email method; a recovery code `XXXX-XXXX` never completes a step-up)
- [x] T032 [P] [US3] E2E test apps/api/test/e2e/domains/user/mfa-email.http.spec.ts: spec scenarios 1–10 over HTTP with the in-memory outbox (activation, login with `mfaMethod:"email"`, resend limits, replaced code, lockout, recovery code, change TOTP↔email, step-up by email, email content has no financial data and is in the account language)

### Implementation

- [x] T033 [P] [US3] Create the `mfa-code` table-domain: apps/api/src/domains/mfa-code/domain/mfa-code.entity.ts, domain/ports/mfa-code.repository.port.ts, infrastructure/prisma-mfa-code.repository.ts, mfa-code.data.module.ts (leaf)
- [x] T034 [P] [US3] Create apps/api/src/domains/user/application/mfa-code-hash.ts (HKDF-SHA256 of `MFA_ENCRYPTION_KEY`, info `fik/mfa-code`; `hashCode(id, code)`, `verifyCode` with `timingSafeEqual`)
- [x] T035 [US3] Create the channel port `MfaCodeSender` + `EmailMfaCodeSender` and apps/api/src/infra/email/templates/mfa-code.ts (es/en, purpose-specific wording, "nadie de fik te lo pedirá", 10-minute validity, logo inline via the existing layout) with its i18n; `MfaCodeService.issueAndSend(user, purpose)` in apps/api/src/domains/user/application/mfa-code-service.ts
- [x] T036 [US3] StartMfaEnrollmentHandler/ConfirmMfaEnrollmentHandler: `{ method }`, email path (confirmed email required, ENROLL code), method change with active MFA (step-up required, `MFA_SAME_METHOD`), confirm by pending method; on change keep recovery codes, clear TOTP secret when moving to email, forget trusted devices, publish `MFA_METHOD_CHANGED`; controller body/response in auth.controller.ts
- [x] T037 [US3] LoginHandler: with method EMAIL and no trusted device, issue+send a LOGIN code after the password commit and return `mfaMethod`, `codeSent`, `retryAfterSeconds`; controller returns them
- [x] T038 [US3] VerifyMfaLoginHandler: branch by `mfaMethodOrDefault()` — EMAIL consumes the active LOGIN code inside the locked transaction; failures count on `mfaFailedAttempts`
- [x] T039 [US3] `ResendMfaLoginCodeCommand` + `POST login/mfa-resend` (pending cookie) and `SendStepUpEmailCodeCommand` + `POST sessions/step-up/email-code`; VerifyStepUpHandler accepts `{ method: "email", code }` (STEP_UP code, same counter) and uses the new `stepUpMethodsFor`
- [x] T040 [US3] Add an isolated purge step for used/expired MFA codes older than 7 days to apps/api/src/infra/cron/maintenance.cron.ts (`PurgeStaleMfaCodesCommand`)
- [x] T041 [P] [US3] packages/client/src/authApi.ts: `startMfaEnrollment(method)`, `resendMfaLoginCode()`, `sendStepUpEmailCode()`, step-up email variant
- [x] T042 [US3] Landing LoginForm second-factor step (strings under `auth.*`, errors under `errors.*`): copy by `mfaMethod` ("Te enviamos un código a tu correo"), "Reenviar código" with countdown from `retryAfterSeconds`, recovery-code hint; tests in LoginForm.test.tsx
- [x] T043 [US3] Web: MfaEnrollmentPanel.tsx method choice (app / correo, email disabled with reason + link when unconfirmed, "la app o la llave de acceso son más seguras" notice), email confirmation step with resend; "Cambiar método" in SecuritySection.tsx behind `useStepUp`; StepUpPanel.tsx email option with "Enviar código"; i18n `profile.security.mfa.*` + `errors.MFA_*`/`TRUSTED_DEVICE_NOT_FOUND`; tests for each component

**Checkpoint**: all three stories working.

## Phase 6: Polish & cross-cutting

- [x] T044 Run the scoped suites from quickstart.md (contracts, api unit, `pnpm test:integration:local` for user/trusted-device/mfa-code/session/email-token + e2e user, web profile, landing auth), `pnpm typecheck`, `turbo run lint`, `pnpm format:check`, `pnpm check:boundaries`, and `prisma migrate diff` (no difference); fix what fails
- [x] T044a Review apps/landing/src/legal/privacy-policy.{es,en}.md: if remembered devices (browser/system label, dates, the `mfa_trusted` cookie) aren't covered by the sessions/cookies wording, add them and bump `CURRENT_PRIVACY_POLICY_VERSION` (apps/api/src/domains/user/application/privacy-policy-version.ts)
- [x] T045 [P] Update docs/PENDING.md (Perfil §3b: the three items done; SMS discarded; WhatsApp left as a channel) and docs/{english,spanish}/ARCHITECTURE.md if they list table-domains
- [x] T046 Memory sync: CLAUDE.md (auth/session bullets: method, trusted devices, mfa-code, new endpoints, cookie, cron steps; plan pointer to "implementado") and .specify/memory/constitution.md (Principle VI/VIII table count 35 → 37, version bump + Sync Impact Report)
- [x] T047 Release note `packages/release-notes/releases/verificacion-en-dos-pasos/{es,en}.md` listing the feat commits; move ClickUp tasks 17tgmdxnu9f/9g/9h per the task flow

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 → US2 → US3 → Polish.
- US2's T023 edits RegenerateRecoveryCodesHandler (US1). US3's T036 forgets trusted devices (US2). Otherwise each story only adds.
- Within a story: tests first (fail) → domain/infra → handlers → controller → client → UI.

## Parallel Opportunities

- Phase 2: T003, T004, T005 in parallel; T006 after T001–T002.
- US1: T007 ∥ T008; T011 ∥ T009–T010.
- US2: T015 ∥ T016 ∥ T017 ∥ T018; T019 ∥ T020; T026 ∥ backend tasks.
- US3: T029 ∥ T030 ∥ T031 ∥ T032; T033 ∥ T034; T041 ∥ backend tasks.

## Implementation Strategy

MVP = Phase 1 + 2 + US1 (regenerate codes). Then US2, then US3, each closed with its tests green before
starting the next. Commit per story on `dev` (Conventional Commits, `feat(auth): …`).
