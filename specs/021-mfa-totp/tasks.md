# Tasks: Autenticación en dos pasos (MFA con TOTP)

**Input**: plan.md, research.md, data-model.md, contracts/mfa-endpoints.md, quickstart.md
**Tests**: no se piden explícitamente en el spec — se generan tests unitarios/integración/e2e
igual que el resto del repo (convención existente, `apps/api/test/{unit,integration,e2e}`), no por
TDD estricto sino porque es el estándar del proyecto para cualquier dominio nuevo.

## Phase 1: Setup

- [x] T001 Agregar dependencias `otpauth` y `qrcode` (+ `@types/qrcode`) a `apps/api/package.json`, `pnpm install`
- [x] T002 Agregar `MFA_ENCRYPTION_KEY` y `MFA_PENDING_TOKEN_SECRET` a `apps/api/.env.example` y al `.env` local (dev), con comentario explicando el propósito de cada uno
- [x] T003 Agregar `User` +4 columnas (`mfaEnabled Boolean @default(false)`, `mfaSecretEncrypted String?`, `mfaFailedAttempts Int @default(0)`, `mfaLockedUntil DateTime?`) y modelo `MfaRecoveryCode` (`@@map("mfa-recovery-code")`, campos de data-model.md, `@@index([userId])`) en `apps/api/prisma/schema.prisma`
- [x] T004 `pnpm --filter @finance/api exec prisma generate` + `pnpm db:push` (confirmar con el usuario antes de ejecutar, per norma de acciones sensibles)

## Phase 2: Foundational (bloquea todas las historias)

- [x] T005 [P] Crear `apps/api/src/infra/config/mfa.config.ts` con `getMfaEncryptionKey(config: ConfigService): string` y `getMfaPendingTokenSecret(config: ConfigService): string` (ambos `getOrThrow`, mismo patrón que `cursor.config.ts`)
- [x] T006 [P] Crear `apps/api/src/domains/user/application/mfa-secret-cipher.ts`: funciones puras `encryptMfaSecret(plain: string, key: string): string` / `decryptMfaSecret(encrypted: string, key: string): string`, AES-256-GCM, formato `iv:authTag:ciphertext` (hex)
- [x] T007 [P] Crear `apps/api/src/domains/mfa-recovery-code/domain/mfa-recovery-code.entity.ts` (id, userId, codeHash, usedAt, createdAt — entidad plana, sin lógica de negocio propia más allá de representar la fila)
- [x] T008 [P] Crear `apps/api/src/domains/mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port.ts`: `createManyWithTx(tx, userId, codeHashes[])`, `countUnused(userId): Promise<number>`, `markUsedWithTx(tx, id): Promise<boolean>` (el `UPDATE ... WHERE usedAt IS NULL` atómico — retorna `false` si ya estaba usado), `findUnusedByUser(userId): Promise<{id, codeHash}[]>`, `deleteAllForUserWithTx(tx, userId)`
- [x] T009 Crear `apps/api/src/domains/mfa-recovery-code/infrastructure/prisma-mfa-recovery-code.repository.ts` implementando el puerto de T008
- [x] T010 Crear `apps/api/src/domains/mfa-recovery-code/mfa-recovery-code.data.module.ts` (leaf: exporta el binding puerto→adapter, sin importar otros dominios)
- [x] T011 [P] Agregar los 5 errores nuevos a `apps/api/src/domains/user/domain/errors.ts`: `MfaNotPendingError` (409), `InvalidMfaCodeError` (401), `MfaLockedError` (429 — ampliar el union type de `httpStatus` en la clase base `DomainError`), `MfaAlreadyEnabledError` (409), `MfaPendingTokenInvalidError` (401)
- [x] T012 Agregar a `apps/api/src/domains/user/application/token-issuer.ts`: `issueMfaPending(userId: string): {token, cookieOptions}` (firma con `MFA_PENDING_TOKEN_SECRET`, exp 5min, payload `{sub, purpose:"mfa-pending"}`) y `verifyMfaPending(token: string): {sub: string}` (lanza `MfaPendingTokenInvalidError` si inválido/expirado/purpose incorrecto)
- [x] T013 Importar `MfaRecoveryCodeDataModule` en `apps/api/src/domains/user/user.module.ts`

**Checkpoint**: infraestructura base lista — las historias de usuario pueden arrancar.

## Phase 3: User Story 1 — Activar MFA (Priority: P1) 🎯 MVP

**Goal**: usuario genera QR, confirma con código TOTP, recibe códigos de recuperación una vez.

**Independent Test**: `POST /auth/me/mfa/enroll` → `POST /auth/me/mfa/confirm` con código válido calculado desde el `secret` devuelto → `mfaEnabled: true` en `GET /auth/me`, 10 códigos únicos devueltos una sola vez.

### Tests para US1

- [x] T014 [P] [US1] Test unitario: `mfa-secret-cipher.ts` — encrypt→decrypt round-trip, formato inválido lanza, en `apps/api/test/unit/domains/user/application/mfa-secret-cipher.spec.ts`
- [x] T015 [P] [US1] Test unitario: `StartMfaEnrollmentHandler` — genera secreto, lo cifra, guarda sin activar; reemplaza un secreto pendiente anterior; rechaza si `mfaEnabled` ya true (`MfaAlreadyEnabledError`), en `apps/api/test/unit/domains/user/application/commands/start-mfa-enrollment.handler.spec.ts`
- [x] T016 [P] [US1] Test unitario: `ConfirmMfaEnrollmentHandler` — código válido activa + crea 10 `MfaRecoveryCode` hasheados; código inválido no activa (`InvalidMfaCodeError`); sin enroll previo (`MfaNotPendingError`); ya activo (`MfaAlreadyEnabledError`), en `apps/api/test/unit/domains/user/application/commands/confirm-mfa-enrollment.handler.spec.ts`
- [x] T017 [US1] Test de integración: enroll+confirm contra Postgres real — verifica que `mfaSecretEncrypted` queda cifrado en la fila y que las 10 filas `MfaRecoveryCode` existen con `usedAt: null`, en `apps/api/test/integration/domains/user/application/mfa-enrollment.integration.spec.ts`
- [x] T018 [US1] Test e2e HTTP: `POST /auth/me/mfa/enroll` → `POST /auth/me/mfa/confirm` (código calculado con `otpauth` en el test) → `GET /auth/me` refleja `mfaEnabled:true`/`mfaRecoveryCodesRemaining:10` **y confirma que la respuesta NO contiene `secret` ni `recoveryCodes`** (regresión FR-006/FR-016), en `apps/api/test/e2e/domains/user/mfa-enrollment.http.spec.ts`

### Implementación US1

- [x] T019 [US1] `packages/contracts/src/auth/index.ts`: agregar `startMfaEnrollmentResponseSchema`, `confirmMfaEnrollmentSchema`, `confirmMfaEnrollmentResponseSchema`; extender `CurrentUser` con `mfaEnabled`/`mfaRecoveryCodesRemaining`
- [x] T020 [P] [US1] Crear `apps/api/src/domains/user/application/commands/start-mfa-enrollment.command.ts` + `.handler.ts` (extiende `BaseCommandHandler`): genera secreto `otpauth`, genera QR con `qrcode`, cifra y guarda vía `PrismaUserRepository`
- [x] T021 [P] [US1] Crear `apps/api/src/domains/user/application/commands/confirm-mfa-enrollment.command.ts` + `.handler.ts`: valida código contra el secreto pendiente descifrado (`otpauth`, ventana ±1), genera 10 códigos (`XXXX-XXXX`), los hashea (bcrypt), persiste `mfaEnabled=true` + inserta `MfaRecoveryCode` — todo en un `prisma.$transaction` (dos agregados: `User` + `MfaRecoveryCode`, mismo patrón documentado que `PayCreditStatementHandler`)
- [x] T022 [US1] Extender `apps/api/src/domains/user/infrastructure/prisma-user.repository.ts`: cifrar `mfaSecretEncrypted` al guardar, descifrar al leer (usa `mfa-secret-cipher.ts` de T006 + `getMfaEncryptionKey` de T005)
- [x] T023 [US1] Extender `apps/api/src/domains/user/application/queries/get-me.handler.ts` para incluir `mfaEnabled` + `mfaRecoveryCodesRemaining` (vía `MfaRecoveryCodeRepositoryPort.countUnused`)
- [x] T024 [US1] Agregar rutas `POST /auth/me/mfa/enroll` y `POST /auth/me/mfa/confirm` (guarded) a `apps/api/src/domains/user/presentation/auth.controller.ts`
- [x] T025 [US1] Frontend: `apps/web/src/domains/profile/components/SecuritySection.tsx` — switch real leyendo `user.mfaEnabled`; nuevo panel `MfaEnrollmentPanel.tsx` (paso 1: QR + secreto en texto con copiar; paso 2: campo de 6 dígitos; paso 3: 10 códigos de recuperación con copiar-todo y aviso "no se vuelven a mostrar")
- [x] T026 [US1] i18n: agregar claves `profile.security.mfa.*` en `apps/web/src/i18n/es.json` + `en.json` (título, hints de cada paso, botones, aviso de recuperación)
- [x] T027 [US1] Test frontend: `SecuritySection.test.tsx` — activar el switch abre el panel; confirmar con código inválido muestra error sin activar; confirmar con éxito muestra los códigos y refleja `mfaEnabled:true`

**Checkpoint**: US1 completa y testeable de forma independiente — activación funciona de punta a punta.

---

## Phase 4: User Story 2 — Login con MFA activo (Priority: P2)

**Goal**: login con email+contraseña de un usuario con MFA activo exige un segundo paso antes de entregar sesión; rate-limit de intentos.

**Independent Test**: login de un usuario con MFA activo devuelve `{mfaRequired:true}` sin cookies de sesión; `POST /auth/login/mfa-verify` con código correcto entrega sesión; código incorrecto la rechaza; 5 incorrectos seguidos bloquean con 429.

### Tests para US2

- [x] T028 [P] [US2] Test unitario: `VerifyMfaLoginCommandHandler` — código válido resetea contador y entrega tokens; código inválido incrementa contador y lanza `InvalidMfaCodeError`; 5º inválido setea `mfaLockedUntil` y lanza `MfaLockedError`; con `mfaLockedUntil` vigente rechaza SIN evaluar el código, en `apps/api/test/unit/domains/user/application/commands/verify-mfa-login.handler.spec.ts`
- [x] T029 [P] [US2] Test unitario: `login.handler.ts` — usuario con `mfaEnabled:true` no emite tokens de sesión, emite `mfa_pending_token`; usuario sin MFA se comporta exactamente igual que antes (regresión), en `apps/api/test/unit/domains/user/application/commands/login.handler.spec.ts` (extender el existente)
- [x] T030 [US2] Test de integración: rate-limit contra Postgres real — 5 intentos concurrentes con código inválido, verificar que el contador avanza correctamente (mismo patrón de concurrencia que `debt`'s `findOneForUpdateWithTx`, specs/015), en `apps/api/test/integration/domains/user/application/mfa-login-rate-limit.integration.spec.ts`
- [x] T031 [US2] Test e2e HTTP: flujo completo login→mfa-verify con TOTP real calculado en el test; código incorrecto no entrega cookies; 5 incorrectos → 429 incluso con el código correcto después, en `apps/api/test/e2e/domains/user/mfa-login.http.spec.ts`

### Implementación US2

- [x] T032 [US2] `packages/contracts/src/auth/index.ts`: agregar `loginResponseSchema` (discriminated union `mfaRequired`), `verifyMfaLoginSchema`
- [x] T033 [US2] Extender `apps/api/src/domains/user/application/commands/login.handler.ts`: si `user.mfaEnabled`, no emitir tokens reales — retornar señal para que el controller emita `mfa_pending_token` en su lugar
- [x] T034 [US2] Crear `apps/api/src/domains/user/application/commands/verify-mfa-login.command.ts` + `.handler.ts`: lee `mfa_pending_token`, resuelve usuario, valida código (TOTP u/o recuperación — detecta formato: 6 dígitos vs `XXXX-XXXX`), auto-persiste contador en el camino de error (excepción documentada, ver research.md R8), emite tokens reales en éxito
- [x] T035 [US2] Extender `apps/api/src/domains/user/presentation/auth.controller.ts`: `POST /auth/login` setea cookie `mfa_pending_token` cuando corresponde (sin `access_token`/`refresh_token`); nueva ruta `POST /auth/login/mfa-verify` (SIN `JwtAuthGuard`) que limpia la cookie pendiente y setea las de sesión
- [x] T036 [US2] Frontend: `apps/web/src/domains/auth/hooks/useAuth.tsx` — `login()` retorna `{mfaRequired: boolean}`; nuevo método `verifyMfa(code: string)`
- [x] T037 [US2] Frontend: `apps/web/src/domains/auth/routes/LoginRoute.tsx` — segundo paso (un campo, acepta ambos formatos) cuando `mfaRequired`; muestra error de código inválido y de bloqueo (429) con mensaje distinto
- [x] T038 [US2] i18n: claves `login.mfa.*` (título del paso, placeholder, errores) en ambos catálogos
- [x] T039 [US2] Test frontend: `LoginRoute.test.tsx` — login con `mfaRequired:true` muestra el segundo paso; código inválido muestra error sin navegar; código válido navega a `/`

**Checkpoint**: US2 completa — el propósito central de la feature (proteger el login) ya funciona.

---

## Phase 5: User Story 3 — Desactivar MFA (Priority: P3)

**Goal**: reingresar contraseña desactiva MFA e invalida secreto + códigos de recuperación vigentes.

**Independent Test**: con MFA activo, `POST /auth/me/mfa/disable` con contraseña correcta deja `mfaEnabled:false`; reactivar genera códigos completamente nuevos (los viejos ya no existen).

### Tests para US3

- [x] T040 [P] [US3] Test unitario: `DisableMfaHandler` — contraseña correcta desactiva y borra `mfaSecretEncrypted`+contador+lock; contraseña incorrecta rechaza (`InvalidCurrentPasswordError`) sin tocar nada, en `apps/api/test/unit/domains/user/application/commands/disable-mfa.handler.spec.ts`
- [x] T041 [US3] Test de integración: desactivar borra TODAS las filas `MfaRecoveryCode` del usuario (`deleteAllForUserWithTx`), en `apps/api/test/integration/domains/user/application/mfa-disable.integration.spec.ts`
- [x] T042 [US3] Test e2e HTTP: activar → desactivar (password correcta) → login ya no pide segundo paso; reactivar → códigos de recuperación son DISTINTOS a los de la primera activación, en `apps/api/test/e2e/domains/user/mfa-disable.http.spec.ts`

### Implementación US3

- [x] T043 [US3] `packages/contracts/src/auth/index.ts`: agregar `disableMfaSchema`
- [x] T044 [US3] Crear `apps/api/src/domains/user/application/commands/disable-mfa.command.ts` + `.handler.ts`: valida contraseña (reusa lógica existente de `change-password`/`deactivate`), limpia los 4 campos MFA de `User` + borra recovery codes, todo en un `prisma.$transaction`
- [x] T045 [US3] Agregar ruta `POST /auth/me/mfa/disable` (guarded) a `auth.controller.ts`
- [x] T046 [US3] Frontend: en `SecuritySection.tsx`, apagar el switch abre `ConfirmModal` reingresando contraseña (mismo patrón exacto que `DangerZone.tsx`)
- [x] T047 [US3] i18n: claves `profile.security.mfa.disable.*`
- [x] T048 [US3] Test frontend: desactivar con contraseña incorrecta muestra error y mantiene el switch activo; con contraseña correcta lo apaga

**Checkpoint**: US3 completa — el ciclo activar/desactivar es reversible de verdad.

---

## Phase 6: User Story 4 — Login con código de recuperación (Priority: P4)

**Goal**: un código de recuperación sin usar sirve como segundo paso; una vez usado, no sirve más; el usuario ve cuántos le quedan.

**Independent Test**: usar un código de recuperación en `mfa-verify` entrega sesión; reintentar el MISMO código lo rechaza; `mfaRecoveryCodesRemaining` baja en 1.

**Nota**: la detección de formato y la validación contra `MfaRecoveryCodeRepositoryPort` ya se
construyeron en T034 (US2) como parte de "un único campo que acepta ambos" — esta fase es
principalmente de verificación explícita + la superficie de "cuántos me quedan" en el perfil.

### Tests para US4

- [x] T049 [P] [US4] Test unitario: `VerifyMfaLoginCommandHandler` con código de recuperación — formato `XXXX-XXXX` detectado, compara contra hashes vía bcrypt, marca usado atómicamente (`markUsedWithTx` retorna `false` en un reintento → tratado como inválido), en `apps/api/test/unit/domains/user/application/commands/verify-mfa-login-recovery.handler.spec.ts`
- [x] T050 [US4] Test de integración: dos requests concurrentes con el MISMO código de recuperación — exactamente una gana (`markUsedWithTx` atómico), en `apps/api/test/integration/domains/mfa-recovery-code/infrastructure/concurrent-use.integration.spec.ts`
- [x] T051 [US4] Test e2e HTTP: login con código de recuperación entrega sesión; reintentar el mismo código responde `INVALID_MFA_CODE`; `GET /auth/me` refleja el contador bajado en 1, en `apps/api/test/e2e/domains/user/mfa-recovery-login.http.spec.ts`

### Implementación US4

- [x] T052 [US4] Frontend: `apps/web/src/domains/profile/components/SecuritySection.tsx` — mostrar `mfaRecoveryCodesRemaining` cuando `mfaEnabled` (texto, sin exponer códigos)
- [x] T053 [US4] i18n: clave `profile.security.mfa.recoveryCodesRemaining`
- [x] T054 [US4] Test frontend: `SecuritySection` muestra el contador correcto con MFA activo

**Checkpoint**: las 4 historias completas — feature funcional de punta a punta.

---

## Phase 7: Polish & Cross-Cutting

- [x] T055 [P] Ejecutar `pnpm --filter @finance/api test:unit`, `test:integration`, `test:e2e` (acotados a los archivos de esta feature) y `pnpm --filter @finance/web test` (acotado a `SecuritySection`/`LoginRoute`) — corregir cualquier regresión
- [x] T056 [P] `pnpm --filter @finance/api typecheck` + `pnpm --filter @finance/web typecheck` + `pnpm check:boundaries`
- [x] T057 [P] `prettier --check` en los archivos tocados; `turbo run lint` acotado
- [x] T058 Ejecutar `specs/021-mfa-totp/quickstart.md` manualmente contra la API real (curl) para confirmar los 4 flujos de punta a punta
- [x] T059 Memory sync (mandatorio, Golden Rule 3 del `/sdd`): actualizar `CLAUDE.md` (marcar 021 como implementado, mover a la lista de planes previos) y `.specify/memory/constitution.md` si corresponde (bump de versión solo si surgió un principio nuevo — probablemente no, esta feature encaja en los principios existentes)
- [x] T060 Actualizar `docs/PENDING.md`: agregar como pendientes documentados MFA por email/SMS, "recordar este dispositivo", y regenerar códigos de recuperación sin desactivar/reactivar completo (compromiso explícito del usuario en el scoping de esta feature)

## Dependencies

- **Setup (T001-T004)** bloquea todo.
- **Foundational (T005-T013)** bloquea todas las historias de usuario.
- **US1 (T014-T027)** es el MVP — no depende de US2/US3/US4.
- **US2 (T028-T039)** depende de US1 (necesita un usuario con MFA ya activo para probar el login) pero es independientemente verificable una vez que US1 existe.
- **US3 (T040-T048)** depende de US1 (necesita algo que desactivar).
- **US4 (T049-T054)** depende de US1 (necesita códigos de recuperación existentes) y reutiliza la lógica de detección de formato ya construida en US2 (T034) — en la práctica, conviene implementar T034 pensando en ambos casos desde el inicio.
- **Polish (T055-T060)** al final, tras las 4 historias.

## Parallel Example

Dentro de Foundational, T005-T008 y T011 son archivos independientes → pueden ejecutarse en paralelo.
Dentro de US1, T020 y T021 tocan archivos distintos (`start-mfa-enrollment.*` vs
`confirm-mfa-enrollment.*`) → paralelizables entre sí, pero ambos dependen de T019 (contrato) y T006
(cipher).

## Implementation Strategy

**MVP = US1 solamente** (T001-T027): permite activar MFA de verdad y ver los códigos de
recuperación, aunque el login todavía no los exija (comportamiento sin cambios). Entrega valor
demostrable e independientemente testeable antes de tocar el flujo de login.

Orden recomendado de entrega incremental: Setup → Foundational → US1 → US2 (el corazón de la
feature) → US3 → US4 → Polish.
