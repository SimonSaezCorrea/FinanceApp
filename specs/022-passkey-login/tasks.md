# Tasks: Llave de acceso (Passkey / WebAuthn)

**Input**: plan.md, research.md, data-model.md, contracts/passkey-endpoints.md, quickstart.md
**Tests**: no se piden explícitamente en el spec — se generan igual que el resto del repo
(convención existente, `apps/api/test/{unit,integration,e2e}` mirroring `src/`), no por TDD
estricto sino porque es el estándar del proyecto.
**Convención de rutas de test** (aprendida de specs/021's `/speckit-analyze`, verificada contra el
disco): unit → `test/unit/domains/<table>/<layer>/`; integration de un handler →
`test/integration/domains/<table>/application/`; integration de un adapter puro →
`test/integration/domains/<table>/infrastructure/`; e2e → `test/e2e/domains/<table>/`.

## Phase 1: Setup

- [X] T001 Agregar dependencia `@simplewebauthn/server` a `apps/api/package.json`, `pnpm install`
- [X] T002 Agregar `PASSKEY_CHALLENGE_SECRET` a `apps/api/.env.example` y al `.env` local (dev), con comentario explicando el propósito (firma la cookie de desafío de 5 min, mismo mecanismo que `MFA_PENDING_TOKEN_SECRET`)
- [X] T003 Agregar tabla `Passkey` (`@@map("passkey")`, campos de data-model.md, `@@index([userId])`, relación `User.passkeys Passkey[]`) en `apps/api/prisma/schema.prisma`
- [X] T004 `pnpm --filter @finance/api exec prisma generate` + `pnpm db:push` (confirmar con el usuario antes de ejecutar, per norma de acciones sensibles)

## Phase 2: Foundational (bloquea todas las historias)

- [X] T005 [P] Crear `apps/api/src/infra/config/passkey.config.ts`: `getPasskeyChallengeSecret(config)` (`getOrThrow`, mismo patrón que `mfa.config.ts`), `getPasskeyExpectedOrigin(config)` (retorna `CORS_ORIGIN` tal cual), `getPasskeyRpId(config)` (`new URL(origin).hostname`)
- [X] T006 [P] Crear `apps/api/src/domains/passkey/domain/passkey.entity.ts` (id, userId, name, credentialId, publicKey, counter, transports, createdAt, lastUsedAt — entidad plana)
- [X] T007 [P] Crear `apps/api/src/domains/passkey/domain/ports/passkey.repository.port.ts`: `createWithTx(tx, plan)`, `findByUserId(userId)`, `findByCredentialId(credentialId)`, `findByIdOwned(userId, id)`, `updateCounterAndLastUsedWithTx(tx, id, counter, usedAt)`, `deleteOwned(userId, id): Promise<boolean>`
- [X] T008 Crear `apps/api/src/domains/passkey/infrastructure/prisma-passkey.repository.ts` implementando el puerto de T007
- [X] T009 Crear `apps/api/src/domains/passkey/passkey.data.module.ts` (leaf: exporta el binding puerto→adapter)
- [X] T010 [P] Crear `apps/api/src/domains/user/application/passkey-challenge-token.ts`: `issuePasskeyChallenge({challenge, userId}): string` / `verifyPasskeyChallenge(token): {challenge, userId: string|null}` (lanza `PasskeyChallengeInvalidError` si falta/expiró/firma inválida), usa `getPasskeyChallengeSecret`
- [X] T011 [P] Agregar `PasskeyChallengeInvalidError` (401) y `PasskeyNotFoundError` (404) a `apps/api/src/domains/user/domain/errors.ts`
- [X] T012 Importar `PasskeyDataModule` en `apps/api/src/domains/user/user.module.ts`

**Checkpoint**: infraestructura base lista — las historias de usuario pueden arrancar.

## Phase 3: User Story 1 — Registrar una llave de acceso (Priority: P1) 🎯 MVP

**Goal**: usuario inicia el registro, confirma con su dispositivo, le pone nombre, la llave queda guardada.

**Independent Test**: `POST /auth/me/passkeys/register-options` → `navigator.credentials.create()` en el navegador (o el simulador de `@simplewebauthn/server` en tests) → `POST /auth/me/passkeys/register-verify` con `{name, response}` → aparece en `GET /auth/me/passkeys`.

### Tests para US1

- [X] T013 [P] [US1] Test unitario: `passkey-challenge-token.ts` — issue→verify round-trip, token expirado/con firma inválida lanza `PasskeyChallengeInvalidError`, en `apps/api/test/unit/domains/user/application/passkey-challenge-token.spec.ts`
- [X] T014 [P] [US1] Test unitario: `StartPasskeyRegistrationHandler` — genera opciones válidas, emite la cookie de desafío, en `apps/api/test/unit/domains/user/application/commands/start-passkey-registration.handler.spec.ts`
- [X] T015 [P] [US1] Test unitario: `ConfirmPasskeyRegistrationHandler` — respuesta válida crea la `Passkey`; sin cookie de desafío lanza `PasskeyChallengeInvalidError`; respuesta que no verifica (firma/origen/rpId incorrectos) se rechaza sin crear fila, en `apps/api/test/unit/domains/user/application/commands/confirm-passkey-registration.handler.spec.ts`
- [X] T016 [US1] Test de integración: registro completo contra Postgres real usando el simulador de autenticador de `@simplewebauthn/server` (`generateRegistrationOptions`+respuesta simulada) — verifica que la fila `Passkey` queda con `credentialId`/`publicKey`/`counter` correctos, en `apps/api/test/integration/domains/user/application/passkey-registration.integration.spec.ts`
- [X] T017 [US1] Test e2e HTTP: `POST /auth/me/passkeys/register-options` → `POST /auth/me/passkeys/register-verify` (respuesta simulada) → `GET /auth/me/passkeys` refleja la llave con su nombre, en `apps/api/test/e2e/domains/user/passkey-registration.http.spec.ts`

### Implementación US1

- [X] T018 [US1] `packages/contracts/src/auth/index.ts`: agregar `passkeySchema`, `startPasskeyRegistrationResponseSchema`, `confirmPasskeyRegistrationRequestSchema`, `listPasskeysResponseSchema`
- [X] T019 [P] [US1] Crear `apps/api/src/domains/user/application/commands/start-passkey-registration.command.ts` + `.handler.ts`: genera opciones con `generateRegistrationOptions` (excluye `credentialId`s ya registrados del usuario vía `excludeCredentials`), emite la cookie de desafío
- [X] T020 [P] [US1] Crear `apps/api/src/domains/user/application/commands/confirm-passkey-registration.command.ts` + `.handler.ts`: lee la cookie, `verifyRegistrationResponse`, crea la `Passkey` con `name`/`credentialId`/`publicKey`/`counter` inicial
- [X] T021 [US1] Crear `apps/api/src/domains/user/application/queries/list-passkeys.query.ts` + `.handler.ts`
- [X] T022 [US1] Agregar rutas `POST /auth/me/passkeys/register-options`, `POST /auth/me/passkeys/register-verify`, `GET /auth/me/passkeys` (guarded) + manejo de la cookie de desafío (setear/limpiar) a `apps/api/src/domains/user/presentation/auth.controller.ts`
- [X] T023 [US1] Frontend: `apps/web/src/shared/lib/webauthn.ts` — helpers `bufferToBase64url`/`base64urlToBuffer` y `toCreateOptions(options)`/`serializeCreateResponse(credential)` (convierte el objeto de opciones/la respuesta del navegador entre JSON y `ArrayBuffer`)
- [X] T024 [US1] Frontend: `apps/web/src/domains/auth/api/passkeyApi.ts` (los 6 endpoints)
- [X] T025 [US1] Frontend: `apps/web/src/domains/profile/components/PasskeySection.tsx` — botón "Agregar llave" (llama `navigator.credentials.create()` con las opciones, pide el nombre, confirma), reemplaza el botón "Configurar" deshabilitado dentro de `SecuritySection.tsx`
- [X] T026 [US1] i18n: agregar claves `profile.security.passkey.*` en `apps/web/src/i18n/es.json` + `en.json` (ya existen `label`/`hint`/`configure` como placeholder — reemplazar por las reales: agregar, nombrar, éxito, error)
- [X] T027 [US1] Test frontend: `PasskeySection.test.tsx` — agregar una llave (mockeando `navigator.credentials.create`) pide nombre y la muestra en la lista; un error del navegador (usuario cancela) no agrega nada

**Checkpoint**: US1 completa y testeable de forma independiente — registrar una llave funciona de punta a punta.

---

## Phase 4: User Story 2 — Iniciar sesión con una llave de acceso (Priority: P2)

**Goal**: login público con email + llave de acceso, sin contraseña ni TOTP, con anti-enumeración.

**Independent Test**: con un usuario que ya registró una llave, `POST /auth/login/passkey-options {email}` → `navigator.credentials.get()` → `POST /auth/login/passkey-verify {email, response}` entrega sesión completa; con un email sin llaves, la primera llamada responde la MISMA forma y la segunda falla con `INVALID_CREDENTIALS`.

### Tests para US2

- [X] T028 [P] [US2] Test unitario: `StartPasskeyLoginHandler` — email con llaves genera `allowCredentials` con esas llaves y cookie con `userId` real; email sin llaves o inexistente genera `allowCredentials` vacío y cookie con `userId: null` — misma FORMA de respuesta en ambos casos, en `apps/api/test/unit/domains/user/application/commands/start-passkey-login.handler.spec.ts`
- [X] T029 [P] [US2] Test unitario: `VerifyPasskeyLoginHandler` — respuesta válida entrega tokens de sesión y NO toca nada relacionado a MFA; respuesta inválida, `userId: null` en la cookie, o contador retrocedido lanzan `InvalidCredentialsError` (nunca un código distinto entre casos), en `apps/api/test/unit/domains/user/application/commands/verify-passkey-login.handler.spec.ts`
- [X] T030 [US2] Test de integración: login completo contra Postgres real con el simulador de autenticador — verifica que `Passkey.counter`/`lastUsedAt` se actualizan tras un login exitoso, en `apps/api/test/integration/domains/user/application/passkey-login.integration.spec.ts`
- [X] T031 [US2] Test e2e HTTP: registrar una llave → login con ella entrega cookies de sesión sin pasar por `mfa_pending_token`; **con MFA (TOTP) también activo en la misma cuenta, el login con llave sigue sin pedir el código** (regresión FR-007); email desconocido en `passkey-options`/`passkey-verify` responde igual que uno conocido sin llaves, en `apps/api/test/e2e/domains/user/passkey-login.http.spec.ts`

### Implementación US2

- [X] T032 [US2] `packages/contracts/src/auth/index.ts`: agregar `startPasskeyLoginRequestSchema`, `startPasskeyLoginResponseSchema`, `verifyPasskeyLoginRequestSchema`
- [X] T033 [US2] Crear `apps/api/src/domains/user/application/commands/start-passkey-login.command.ts` + `.handler.ts`: resuelve el email (sin filtrar si existe), arma `allowCredentials` real o vacío, emite la cookie de desafío con `userId` real o `null`
- [X] T034 [US2] Crear `apps/api/src/domains/user/application/commands/verify-passkey-login.command.ts` + `.handler.ts`: lee la cookie; si `userId` es `null` o la verificación falla, `InvalidCredentialsError`; si es válida, actualiza `counter`/`lastUsedAt` y emite tokens vía `TokenIssuer.issue` (el mismo método que usa el login con contraseña — nunca `issueMfaPending`)
- [X] T035 [US2] Agregar rutas públicas `POST /auth/login/passkey-options`, `POST /auth/login/passkey-verify` (sin `JwtAuthGuard`) a `auth.controller.ts`, seteando las cookies de sesión igual que `login`/`mfa-verify`
- [X] T036 [US2] Frontend: `useAuth.tsx` — nuevo método `loginWithPasskey(email: string): Promise<void>` (arma opciones, llama `navigator.credentials.get()`, verifica, setea el usuario)
- [X] T037 [US2] Frontend: `LoginRoute.tsx` — nueva opción "Iniciar sesión con llave de acceso" que pide el email primero (mismo campo que el login con contraseña) y luego dispara la ceremonia; error de la ceremonia o del backend muestra el mismo mensaje que una contraseña incorrecta
- [X] T038 [US2] i18n: claves `auth.passkey.*` (botón, hint, error) en ambos catálogos
- [X] T039 [US2] Test frontend: `LoginRoute.test.tsx` — elegir "llave de acceso", completar con un `navigator.credentials.get` mockeado exitoso navega a `/`; uno que falla muestra el mismo error que una contraseña incorrecta

**Checkpoint**: US2 completa — el propósito central de la feature (entrar sin contraseña) funciona.

---

## Phase 5: User Story 3 — Gestionar las llaves registradas (Priority: P3)

**Goal**: ver la lista con nombre/fechas y eliminar individualmente.

**Independent Test**: con dos o más llaves registradas, eliminar una y confirmar que ya no aparece ni sirve para login, mientras la otra sigue intacta; eliminar la última no afecta el login con contraseña.

**Nota**: `GET /auth/me/passkeys` (T021) y la lista en `PasskeySection.tsx` (T025) ya se construyeron
en US1 porque el registro necesita mostrar la lista actualizada — esta fase se enfoca en **eliminar**.

### Tests para US3

- [X] T040 [P] [US3] Test unitario: `RemovePasskeyHandler` — elimina una llave propia; lanza `PasskeyNotFoundError` si no existe o pertenece a otro usuario, en `apps/api/test/unit/domains/user/application/commands/remove-passkey.handler.spec.ts`
- [X] T041 [US3] Test de integración: eliminar contra Postgres real — la fila desaparece y un login posterior con esa `credentialId` falla, en `apps/api/test/integration/domains/passkey/infrastructure/remove.integration.spec.ts`
- [X] T042 [US3] Test e2e HTTP: registrar dos llaves → eliminar una → `GET /auth/me/passkeys` solo muestra la otra → eliminar la última → login con email+contraseña sigue funcionando igual, en `apps/api/test/e2e/domains/user/passkey-management.http.spec.ts`

### Implementación US3

- [X] T043 [US3] Crear `apps/api/src/domains/user/application/commands/remove-passkey.command.ts` + `.handler.ts`
- [X] T044 [US3] Agregar ruta `DELETE /auth/me/passkeys/:id` (guarded) a `auth.controller.ts`
- [X] T045 [US3] Frontend: `PasskeySection.tsx` — botón eliminar por fila con confirmación (`ConfirmModal`, mismo patrón que desactivar MFA)
- [X] T046 [US3] i18n: claves `profile.security.passkey.remove.*`
- [X] T047 [US3] Test frontend: `PasskeySection.test.tsx` — eliminar una llave la quita de la lista; con una sola llave, eliminarla no muestra ninguna advertencia de "quedarás bloqueado" (no aplica, la contraseña siempre sigue ahí)

**Checkpoint**: las 3 historias completas — feature funcional de punta a punta.

---

## Phase 6: Polish & Cross-Cutting

- [X] T048 [P] Ejecutar `pnpm --filter @finance/api test:unit`, `test:integration`, `test:e2e` (acotados a los archivos de esta feature) y `pnpm --filter @finance/web test` (acotado a `PasskeySection`/`LoginRoute`) — corregir cualquier regresión
- [X] T049 [P] `pnpm --filter @finance/api typecheck` + `pnpm --filter @finance/web typecheck` + `pnpm check:boundaries`
- [X] T050 [P] `prettier --check`/`--write` en los archivos tocados
- [X] T051 Ejecutar `specs/022-passkey-login/quickstart.md` manualmente en el navegador (con un autenticador real: Windows Hello/Touch ID) para confirmar los 3 flujos de punta a punta — no automatizable por curl
- [X] T052 Memory sync (mandatorio, Golden Rule 3 del `/sdd`): actualizar `CLAUDE.md` (marcar 022 como implementado) y `docs/PENDING.md` (quitar/actualizar el punto 3 "Llave de acceso" — ya no es placeholder; documentar lo fuera de alcance: renombrar una llave, conditional UI, attestation)

## Dependencies

- **Setup (T001-T004)** bloquea todo.
- **Foundational (T005-T012)** bloquea todas las historias de usuario.
- **US1 (T013-T027)** es el MVP — no depende de US2/US3.
- **US2 (T028-T039)** depende de US1 (necesita una llave ya registrada para poder loguearse con
  ella) pero es independientemente verificable una vez que US1 existe.
- **US3 (T040-T047)** depende de US1 (la lista y `GET /auth/me/passkeys` ya existen desde ahí;
  esta fase solo agrega `DELETE`).
- **Polish (T048-T052)** al final, tras las 3 historias.

## Parallel Example

Dentro de Foundational, T005-T007, T010 y T011 son archivos independientes → paralelizables.
Dentro de US1, T019 y T020 tocan archivos distintos (`start-passkey-registration.*` vs
`confirm-passkey-registration.*`) → paralelizables entre sí, ambos dependen de T018 (contrato).

## Implementation Strategy

**MVP = US1 solamente** (T001-T027): permite registrar una llave de acceso real y verla en la
lista, aunque el login todavía no la use (comportamiento de login sin cambios). Entrega valor
demostrable e independientemente testeable antes de tocar el flujo de login.

Orden recomendado: Setup → Foundational → US1 → US2 (el corazón de la feature) → US3 → Polish.
