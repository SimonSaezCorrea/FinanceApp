# Tasks: Verificar el autenticador de las llaves de acceso contra el catálogo FIDO

**Input**: Design documents from `/specs/041-passkey-attestation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http.md, quickstart.md

**Tests**: included — Constitution Principle IV (test-first) applies to every story.

**Organization**: by user story (US1 P1 → US2 P2 → US3 P3), after the shared setup and foundation.

## Phase 1: Setup (schema)

- [x] T001 Add model `AuthenticatorModel` (`@@map("authenticator-model")`, fields per data-model.md, `aaguid @unique`), the nullable `passkey` columns `aaguid`/`authenticatorName`/`verifiedAt`/`compromisedAt`/`compromisedReason` (+ `@@index([aaguid])`), and `Session.passkeyId` (FK → `Passkey`, `onDelete: SetNull`, with the inverse relation on `Passkey`) in apps/api/prisma/schema.prisma
- [x] T002 Generate the migration `passkey_attestation` with `pnpm db:migrate` (expand only) in apps/api/prisma/migrations/<ts>_passkey_attestation/migration.sql and run `prisma generate`

## Phase 2: Foundational (blocking all stories)

- [x] T003 [P] Contract in packages/contracts/src/auth/index.ts: `passkeyStatusSchema` (`unverified|verified|compromised`), `passkeySchema` gains `status` (optional for older APIs → read as `unverified`), `authenticatorName` and `compromisedAt` (both nullable, optional), `passkeyRegistrationSuggestionRequestSchema` `{ response }` / response `{ suggestedName: string | null }`; unit tests in packages/contracts/src/auth/passkey.test.ts
- [x] T004 [P] Error classes `PasskeyAuthenticatorCompromisedError` (409 `PASSKEY_AUTHENTICATOR_COMPROMISED`) and `PasskeyCompromisedError` (403 `PASSKEY_COMPROMISED`) in apps/api/src/domains/user/domain/errors.ts; `errors.*` texts in packages/i18n/src/{es,en}.json
- [x] T005 [P] Create the `authenticator-model` table-domain: apps/api/src/domains/authenticator-model/domain/authenticator-model.ts (props, `compromisedStatusOf(statusReports)` per research R3 — latest report, the 5 compromise statuses), domain/ports/authenticator-model.repository.port.ts (`currentCatalog`, `replaceAll`, `findByAaguid`, `statements`, `compromisedAaguids`), infrastructure/prisma-authenticator-model.repository.ts (replace in one transaction only when the number is greater), authenticator-model.data.module.ts (leaf)
- [x] T006 [P] Unit test apps/api/test/unit/domains/authenticator-model/domain/authenticator-model.spec.ts (`compromisedStatusOf`: latest report wins, REVOKED and the 4 statuses count, `UPDATE_AVAILABLE` after a compromise clears it, empty reports = null) and integration test apps/api/test/integration/domains/authenticator-model/infrastructure/prisma-authenticator-model.repository.spec.ts (replaceAll swaps the set, refuses a number ≤ stored, findByAaguid, compromisedAaguids)
- [x] T007 Extend the `passkey` port/adapter (apps/api/src/domains/passkey/): `createWithTx` accepts `aaguid`/`authenticatorName`/`verifiedAt`; row props expose the new columns; `countUsable(userId)`; `markCompromisedWithTx(tx, reasonByAaguid, now)` returning `{ id, userId, name }[]` (conditional `verifiedAt IS NOT NULL AND compromisedAt IS NULL`); integration test in apps/api/test/integration/domains/passkey/
- [x] T008 Extend the `session` port/adapter: `SessionIssuer.establish` and `createWithTx` accept an optional `passkeyId`; `closeByPasskeysWithTx(tx, passkeyIds, now)` closes only open sessions; integration test in apps/api/test/integration/domains/session/
- [x] T009 Create apps/api/src/domains/user/application/authenticator-catalog.ts (`AuthenticatorCatalog`): `load()` puts the table's statements into `MetadataService.initialize({ statements, mdsServers: [], verificationMode: "permissive" })` and remembers the loaded catalog number; `ensureLoaded()` reloads when the stored number changed; `refresh()` downloads `https://mds3.fidoalliance.org/` (30 s timeout), verifies with `verifyMDSBlob` from `@simplewebauthn/server/helpers`, maps entries with an `aaguid` and replaces the table when the number is greater, then `load()`; loads on module init (no network) and, with crons on and an empty table, refreshes once in the background; unit tests with a fake fetch and a fake verifier in apps/api/test/unit/domains/user/application/authenticator-catalog.spec.ts (+ an import test that fails if `verifyMDSBlob`/`isoCBOR` disappear from `/helpers`)
- [x] T010 Register `AuthenticatorModelDataModule` and `AuthenticatorCatalog` in apps/api/src/domains/user/user.module.ts

## Phase 3: User Story 1 — Ver qué autenticador creó cada llave (P1) 🎯 MVP

**Goal**: a passkey with a verifiable attestation stores and shows its model; any other passkey works as today.

**Independent test**: register one passkey with a (simulated) verified attestation and one with `none`; the first shows its model and "Verificada", the second works unchanged.

- [x] T011 [P] [US1] Unit tests apps/api/test/unit/domains/user/application/passkey-attestation.spec.ts: verified only with x5c-backed format + catalog AAGUID; `none`/`apple`/zero AAGUID/unknown AAGUID → unverified; a library failure with attestation retries as `none` and saves unverified; a failure of the `none` retry → `PASSKEY_CHALLENGE_INVALID`
- [x] T012 [P] [US1] Unit tests for the handlers: confirm-passkey-registration.handler.spec.ts (saves model + verifiedAt when verified, nothing extra otherwise, `PASSKEY_ADDED` carries the model), start-passkey-registration (asks `attestationType: "direct"`), suggestion handler (catalog name from the AAGUID, null otherwise, no write)
- [x] T013 [US1] Create apps/api/src/domains/user/application/passkey-attestation.ts: `verifyRegistration(input)` → `{ verification, authenticator: { aaguid, name } | null }` per research R4/R5 (call `ensureLoaded()`, `verifyRegistrationResponse`, on failure with attestation re-encode the attestationObject as `fmt: "none"` with `isoCBOR` and retry once); `aaguidOf(response)` reading authenticatorData without verifying
- [x] T014 [US1] start-passkey-registration.handler.ts → `attestationType: "direct"`; confirm-passkey-registration.handler.ts uses `verifyRegistration` and saves `aaguid`/`authenticatorName`/`verifiedAt`; `AccountSecurityEvent` gains optional `model`, used by `PASSKEY_ADDED` (apps/api/src/domains/user/domain/events/account-security.event.ts + listener + apps/api/src/infra/email templates/i18n: "Modelo verificado: {model}.")
- [x] T015 [US1] `PasskeyRegistrationSuggestionQuery`/handler and `POST me/passkeys/register-suggestion` in apps/api/src/domains/user/presentation/auth.controller.ts; passkey DTO mapping (list + confirm) exposes `status`/`authenticatorName`/`compromisedAt` as read-only (FR-015: rename touches only the name — extend the rename-passkey unit test to assert model and status are unchanged)
- [x] T016 [P] [US1] E2E apps/api/test/e2e/domains/user/passkey-attestation.http.spec.ts: catalog rows seeded in `authenticator-model`, library verification stubbed like the existing passkey e2e; verified registration lists the model and `status: "verified"`; `none` registration lists `unverified`; suggestion returns the model name
- [x] T017 [P] [US1] Client: `passkeyApi.registerSuggestion(response)` in packages/client/src/ (where `passkeyApi` lives)
- [x] T018 [US1] Web apps/web/src/domains/profile/components/PasskeySection.tsx: after the ceremony call the suggestion and prefill the name (editable); each row shows the model and a "Verificada" badge; i18n `profile.security.passkey.status.*`, `profile.security.passkey.model`; tests in PasskeySection.test.tsx
- [x] T019 [P] [US1] "Descargar mis datos": model and status columns on the passkeys sheet (apps/web/src/domains/profile/lib/personalData.ts + test; JSON already carries the fields)

## Phase 4: User Story 2 — No registrar autenticadores comprometidos (P2)

**Goal**: a verified model that the catalog marks compromised can't be registered; a missing catalog never blocks.

**Independent test**: register with a (simulated) verified attestation of a compromised model → 409, nothing saved; with the catalog empty → saved unverified.

- [x] T020 [P] [US2] Unit tests in confirm-passkey-registration.handler.spec.ts: verified + compromised model → `PasskeyAuthenticatorCompromisedError`, no row; empty catalog → unverified, saved
- [x] T021 [US2] confirm-passkey-registration.handler.ts: refuse when `authenticator` is verified and its catalog row has `compromisedStatus`, whether or not the stored catalog is expired (FR-007: an expired copy still blocks registering a compromised model)
- [x] T022 [P] [US2] E2E in passkey-attestation.http.spec.ts: compromised model → 409 `PASSKEY_AUTHENTICATOR_COMPROMISED` and the list stays the same
- [x] T023 [US2] Web: PasskeySection shows `errors.PASSKEY_AUTHENTICATOR_COMPROMISED` with the suggestion to use another key; test

## Phase 5: User Story 3 — Dejar de aceptar llaves que pasan a comprometidas (P3)

**Goal**: the daily review marks verified passkeys of now-compromised models, closes their sessions, emails once, and they stop working.

**Independent test**: a verified passkey whose model becomes compromised; run the review → marked, its session closed, one email; login and step-up with it → 403; a second run changes nothing.

- [x] T024 [P] [US3] Unit tests apps/api/test/unit/domains/user/application/commands/review-compromised-passkeys.handler.spec.ts (marks only verified + unmarked, skips an expired catalog, closes sessions and publishes one `PASSKEY_COMPROMISED` per marked key, second run publishes nothing) and verify-passkey-login / verify-step-up-passkey specs (compromised → `PasskeyCompromisedError`; login records `passkeyId` on the session)
- [x] T025 [US3] `RefreshAuthenticatorCatalogCommand` (refresh, isolated failure) and `ReviewCompromisedPasskeysCommand`/handler (one transaction: `markCompromisedWithTx` → `closeByPasskeysWithTx`; events after commit) in apps/api/src/domains/user/application/commands/; a "FIDO catalog" step in apps/api/src/infra/cron/maintenance.cron.ts running both (+ its unit test)
- [x] T026 [US3] verify-passkey-login.handler.ts and verify-step-up-passkey.handler.ts refuse a compromised passkey (`PASSKEY_COMPROMISED`); login passes `passkeyId` to `SessionIssuer.establish`; verify-step-up.handler.ts and the web count only usable passkeys for `stepUpMethodsFor` (`countUsable`; web StepUpPanel filters `status !== "compromised"`)
- [x] T027 [US3] Security notice `PASSKEY_COMPROMISED` (kind in account-security.event.ts, es/en subject/body: names the key, asks to replace it, says its sessions were closed) in apps/api/src/infra/email/; templates test
- [x] T028 [P] [US3] E2E apps/api/test/e2e/domains/user/passkey-compromised.http.spec.ts: verified passkey seeded directly in the DB (no real authenticator in tests) + a session opened by a stubbed passkey login; mark the model compromised in `authenticator-model`; run the review → session 401, passkey login 403, one email, list shows `compromised`; rerun → no new email
- [x] T029 [US3] Web PasskeySection: "Comprometida" badge + explanation for compromised rows (rename/remove still offered); landing LoginForm shows `errors.PASSKEY_COMPROMISED`; tests

## Phase 6: Polish & cross-cutting

- [x] T030 Run quickstart.md's automated block (contracts, api unit, `pnpm test:integration:local` for authenticator-model/passkey/session/user + e2e user, web profile, landing auth), `pnpm typecheck`, `turbo run lint`, `pnpm format:check`, `pnpm check:boundaries`, migration drift check; fix what fails
- [x] T031 Privacy policy apps/landing/src/legal/privacy-policy.{es,en}.md: one line that a passkey's model is checked against the public FIDO Alliance catalog (downloaded; no data sent); bump `CURRENT_PRIVACY_POLICY_VERSION`
- [x] T032 [P] docs/PENDING.md (§3: attestation done with the chosen policy), docs/{english,spanish}/ARCHITECTURE.md (new table-domain note)
- [x] T033 Memory sync: CLAUDE.md (passkey bullet: attestation, `authenticator-model`, `session.passkeyId`, new endpoint/errors, maintenance step; 37 → 38 table-domains; plan pointer → implementado) and .specify/memory/constitution.md (38 tables, version bump + Sync Impact Report)
- [ ] T034 Release note packages/release-notes/releases/llaves-verificadas/{es,en}.md listing the feat commit; ClickUp task 17tgmdxnu9j → despliegue with a comment

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 → US2 → US3 → Polish.
- US2 depends on US1's verification (T013/T014). US3 depends on T007/T008 (foundation) and T013 (verified rows exist).
- Within a story, tests first (T011/T012, T020, T024) then implementation.

## Parallel Opportunities

- T003, T004, T005, T006 together (different packages/files).
- In US1: T011, T012, T016, T017, T019 in parallel once T013 exists.
- In US3: T024 and T028 tests before T025–T027.

## Implementation Strategy

MVP = Phase 1 + 2 + US1 (models shown, nothing rejected). US2 adds the registration gate, US3 the daily
review. Each story is committed only with its tests green.
