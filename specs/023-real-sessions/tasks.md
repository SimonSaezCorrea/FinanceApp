# Tasks: Sesiones y dispositivos reales

**Input**: plan.md, research.md, data-model.md, contracts/session-endpoints.md, quickstart.md
**Tests**: no se piden explícitamente en el spec — se generan igual que el resto del repo
(convención existente, `apps/api/test/{unit,integration,e2e}` mirroring `src/`), no por TDD
estricto sino porque es el estándar del proyecto.
**Convención de rutas de test**: unit → `test/unit/domains/<table>/<layer>/`; integration de
un handler → `test/integration/domains/<table>/application/`; integration de un adapter puro →
`test/integration/domains/<table>/infrastructure/`; e2e → `test/e2e/domains/<table>/`. Como
`session` no tiene `application/` propia (mismo trato que `passkey`), sus comandos/queries y
los tests de esos comandos/queries viven bajo `.../domains/user/...`.

## Phase 1: Setup

- [x] T001 Agregar dependencias `ua-parser-js` y `maxmind` a `apps/api/package.json`, `pnpm install`
- [x] T002 Agregar `GEOIP_DB_PATH` a `apps/api/.env.example` con comentario explicando que es
      opcional — sin ella (o sin archivo válido en esa ruta), las sesiones funcionan igual sin
      país (research.md R5, mismo patrón que el bloque S3 de adjuntos)
- [x] T003 Agregar modelo `Session` a `apps/api/prisma/schema.prisma` (`@@map("session")`,
      columnas de data-model.md, `@@index([userId])`, `@@index([expiresAt])`, relación
      `User.sessions Session[]` + su lado inverso `Session.user User @relation(...)`,
      `onDelete: Cascade` — el lado inverso es necesario para que `JwtAuthGuard` (T017)
      pueda leer `User.status` con un solo `include` en vez de una segunda consulta)
- [x] T004 `pnpm --filter @finance/api exec prisma generate` + `pnpm db:push` (confirmar con el
      usuario antes de ejecutar, norma de acciones sensibles)

## Phase 2: Foundational (bloquea todas las historias)

**Purpose**: toda sesión (de cualquier historia) depende de que el login YA cree la fila
`Session` y embeba `sid` en los tokens — sin esto no hay nada que listar, cerrar, ni revocar.

- [x] T005 [P] Crear `apps/api/src/domains/session/domain/session.entity.ts` (id, userId,
      deviceLabel, country, createdAt, lastUsedAt, expiresAt — entidad plana, mismo estilo que
      `passkey.entity.ts`)
- [x] T006 [P] Crear `apps/api/src/domains/session/domain/ports/session.repository.port.ts`:
      `create(plan): Promise<Session>`, `findById(id): Promise<Session|null>`,
      `findByIdOwned(userId, id): Promise<Session|null>`,
      `listActiveByUser(userId, now): Promise<Session[]>` (filtra `expiresAt > now`),
      `touch(id, {lastUsedAt, expiresAt}): Promise<void>`, `deleteOwned(userId, id): Promise<boolean>`,
      `deleteAllExceptForUser(userId, exceptId): Promise<number>`,
      `deleteExpired(before): Promise<number>`
- [x] T007 Crear `apps/api/src/domains/session/infrastructure/prisma-session.repository.ts`
      implementando el puerto de T006
- [x] T008 Crear `apps/api/src/domains/session/session.data.module.ts` (leaf: exporta el binding
      puerto→adapter, mismo patrón que `passkey.data.module.ts`)
- [x] T009 [P] Crear `apps/api/src/infra/config/geoip.config.ts`: `getGeoIpDbPath(config):
string | null` — lee `GEOIP_DB_PATH`, `null` si no está seteada (NUNCA `getOrThrow`, a
      diferencia de los demás secretos — esta es opcional por diseño)
- [x] T010 [P] Crear `apps/api/src/domains/user/application/device-info.ts`:
      `parseDeviceLabel(userAgent: string | undefined): string | null` usando `ua-parser-js`
      (ej. `"Chrome · Windows"`; `null` si no hay User-Agent o no se puede parsear nada útil)
- [x] T011 [P] Crear `apps/api/src/domains/user/application/geoip-lookup.ts`: clase
      `GeoIpLookup` — abre el reader de `maxmind` una sola vez (lazy, cacheado) contra
      `getGeoIpDbPath(config)`; `lookupCountry(ip: string | undefined): string | null` — nunca
      lanza (IP privada/reservada, archivo ausente, o cualquier fallo del lookup → `null`)
- [x] T012 Extender `apps/api/src/domains/user/application/token-issuer.ts`: `issue(user,
sessionId?)` ahora también acepta un `sessionId` opcional — si se pasa, lo usa como claim
      `sid` (reutilizar la sesión, caso refresh); si no, genera uno nuevo vía
      `generateRowId()`. `sid` se agrega al payload de AMBOS tokens (access y refresh).
      `TokenPair` gana `sessionId: string` y `sessionExpiresAt: Date` (calculado con `ms()`
      sobre el mismo `JWT_REFRESH_EXPIRES` que ya usa `expiresIn()`). `verifyRefresh()` devuelve
      también `sid` en su tipo de retorno.
- [x] T013 Crear `apps/api/src/domains/user/application/session-issuer.ts`: función
      `establishSession(tokenIssuer, sessionRepo, deviceInfo, geoIpLookup, user, opts:
{reuseSessionId?: string, userAgent?: string, ip?: string}): Promise<TokenPair>` — con
      `reuseSessionId` llama `tokenIssuer.issue(user, reuseSessionId)` y luego
      `sessionRepo.touch(reuseSessionId, {lastUsedAt: now, expiresAt})` (caso refresh, R6); sin
      él, llama `tokenIssuer.issue(user)` y `sessionRepo.create({...})` con `deviceLabel`/
      `country` resueltos de `userAgent`/`ip` (caso login nuevo) — el ÚNICO lugar que decide
      cuándo se crea vs. se reutiliza una fila
- [x] T014 Agregar `SessionNotFoundError` (404) a `apps/api/src/domains/user/domain/errors.ts`
- [x] T015 Importar `SessionDataModule` y proveer `GeoIpLookup` en
      `apps/api/src/domains/user/user.module.ts`
- [x] T016 Extender `AuthUser` (`apps/api/src/infra/auth/current-user.decorator.ts`) con
      `sessionId: string`
- [x] T017 Extender `apps/api/src/infra/auth/jwt-auth.guard.ts`: `AccessPayload` gana `sid`.
      La consulta existente (`prisma.user.findUnique(...)`) se REEMPLAZA por
      `prisma.session.findUnique({ where: { id: payload.sid }, include: { user: { select:
{ status: true } } } })` — sigue siendo UNA sola consulta, ahora partiendo de la
      sesión: si la fila no existe (cerrada/purgada) o `session.user.status === "DISABLED"`,
      `UnauthorizedException` (el segundo caso con `{code: "ACCOUNT_DISABLED"}` como hoy,
      research.md R2); `req.user` incluye `sessionId: payload.sid`
- [x] T018 Extender `LoginCommand`/`RegisterCommand`/`VerifyMfaLoginCommand`/
      `VerifyPasskeyLoginCommand` con un campo opcional `device?: {userAgent?: string, ip?:
string}` en su constructor
- [x] T019 `apps/api/src/domains/user/presentation/auth.controller.ts`: en `register`, `login`,
      `login/mfa-verify` y `login/passkey-verify`, construir el comando con
      `{userAgent: req.headers["user-agent"], ip: req.ip}` (agregar `@Req() req: Request` donde
      falte)
- [x] T020 Actualizar `RegisterHandler`/`LoginHandler`/`VerifyMfaLoginHandler`/
      `VerifyPasskeyLoginHandler` para llamar `establishSession(...)` (T013) en vez de
      `tokenIssuer.issue(...)` directamente — cada uno crea una sesión nueva
- [x] T021 Actualizar `RefreshTokenHandler`: extraer `sid` del refresh token entrante en
      `loadContext` (junto al `sub` que ya lee), llamar `establishSession(...,
{reuseSessionId: sid})`; si la sesión ya no existe (cerrada o purgada),
      `InvalidRefreshTokenError` (mismo error que hoy, sin código nuevo — contracts/
      session-endpoints.md)
- [x] T022 Actualizar `logout` en `auth.controller.ts`: antes de limpiar cookies, leer
      `REFRESH_COOKIE`, si decodifica con `tokenIssuer.verifyRefresh()` a un `sid` válido,
      `sessionRepo.deleteOwned(sub, sid)` (best-effort — cualquier fallo se ignora, `logout`
      siempre responde `204`)
- [x] T023 [P] Test unitario: `session-issuer.ts` — caso nuevo crea la fila con
      deviceLabel/country resueltos; caso `reuseSessionId` solo actualiza `lastUsedAt`/
      `expiresAt` sin crear una fila nueva, en
      `apps/api/test/unit/domains/user/application/session-issuer.spec.ts`
- [x] T024 [P] Test unitario: `JwtAuthGuard` — access token con `sid` de una sesión inexistente
      (cerrada) es rechazado aunque la firma/expiración del JWT sea válida, en
      `apps/api/test/unit/infra/auth/jwt-auth.guard.spec.ts` (crear el archivo si no existe
      ningún test previo del guard — si ya existe uno, extenderlo)
- [x] T025 [P] Test unitario: `TokenIssuer.issue(user, sessionId)` — reutiliza el `sid` pasado
      en vez de generar uno nuevo; sin `sessionId`, genera uno distinto cada vez, en
      `apps/api/test/unit/domains/user/application/token-issuer.spec.ts`

**Checkpoint**: infraestructura de sesiones lista — todo login crea/reutiliza una fila real, y
el guard ya puede revocar. Las historias de usuario pueden arrancar.

---

## Phase 3: User Story 1 — Ver mis sesiones activas (Priority: P1) 🎯 MVP

**Goal**: reemplazar `EXAMPLE_SESSIONS` por la lista real de sesiones del usuario, marcando
cuál es "este dispositivo".

**Independent Test**: loguearse dos veces (dos sesiones) → `GET /auth/sessions` muestra ambas,
con `isCurrent` correcto según desde cuál se consulta.

### Tests para US1

- [x] T026 [P] [US1] Test unitario: `ListSessionsHandler` — marca `isCurrent` comparando contra
      el `sessionId` del caller; excluye sesiones con `expiresAt` vencido (defensa en
      profundidad, FR-007), en
      `apps/api/test/unit/domains/user/application/queries/list-sessions.handler.spec.ts`
- [x] T027 [US1] Test de integración: crear 2 sesiones reales para un usuario vía el repo,
      listar y confirmar orden (actividad más reciente primero) y `isCurrent` correcto, en
      `apps/api/test/integration/domains/user/application/list-sessions.integration.spec.ts`
- [x] T028 [US1] Test e2e HTTP: login desde "dos navegadores" (dos requests de login
      distintas) → `GET /auth/sessions` desde cada una devuelve 2 filas, cada una marcando la
      propia como `isCurrent`, en `apps/api/test/e2e/domains/user/list-sessions.http.spec.ts`

### Implementación US1

- [x] T029 [US1] `packages/contracts/src/auth/index.ts`: agregar `sessionSchema`,
      `listSessionsResponseSchema` (data-model.md)
- [x] T030 [US1] Crear `apps/api/src/domains/user/application/queries/list-sessions.query.ts` +
      `.handler.ts` — lee `listActiveByUser`, mapea a DTO con `isCurrent`
- [x] T031 [US1] Agregar ruta `GET /auth/sessions` (guarded) a `auth.controller.ts`
- [x] T032 [US1] Frontend: `apps/web/src/domains/profile/api/sessionsApi.ts` — `list()`
- [x] T033 [US1] Frontend: `apps/web/src/domains/profile/hooks/useProfile.ts` —
      `useSessionsQuery()`
- [x] T034 [US1] Frontend: `apps/web/src/domains/profile/components/SecuritySection.tsx` —
      eliminar `EXAMPLE_SESSIONS`/el `useState` local de sesiones de ejemplo; renderizar
      `useSessionsQuery()` con la misma UI de fila ya existente (icono por tipo de
      dispositivo, "Este dispositivo · activo ahora" para `isCurrent`, país si no es `null`)
- [x] T035 [US1] i18n: agregar clave para "sin ubicación conocida" (país `null`) en
      `profile.security.sessions.*`, `es.json`/`en.json`
- [x] T036 [US1] Test frontend: `SecuritySection.test.tsx` — renderiza sesiones reales desde
      la query mockeada, marca la actual, muestra fallback cuando `country` es `null`

**Checkpoint**: US1 completa — la lista es real de punta a punta.

---

## Phase 4: User Story 2 — Cerrar una sesión individual (Priority: P2)

**Goal**: botón "Cerrar" por fila revoca esa sesión de inmediato sin afectar las demás.

**Independent Test**: con 2 sesiones activas, `DELETE /auth/sessions/:id` sobre la que no es
la actual → esa sesión deja de listarse y su próxima request autenticada da 401; la actual
sigue funcionando.

### Tests para US2

- [x] T037 [P] [US2] Test unitario: `CloseSessionHandler` — borra una sesión propia; una
      ajena o inexistente lanza `SessionNotFoundError`, en
      `apps/api/test/unit/domains/user/application/commands/close-session.handler.spec.ts`
- [x] T038 [US2] Test de integración: cerrar una sesión real y confirmar que un refresh
      posterior con el token de esa sesión falla (`InvalidRefreshTokenError`), en
      `apps/api/test/integration/domains/user/application/close-session.integration.spec.ts`
- [x] T039 [US2] Test e2e HTTP, en `apps/api/test/e2e/domains/user/close-session.http.spec.ts`:
      (a) 2 sesiones activas → `DELETE /auth/sessions/:id` sobre la NO actual → esa sesión
      desaparece de `GET /auth/sessions`; una request autenticada posterior CON el access
      token de la sesión cerrada da `401` de inmediato (sin esperar su expiración natural —
      regresión de research.md R2); la sesión actual sigue funcionando en todo momento;
      (b) **edge case explícito del spec**: cerrar la PROPIA sesión actual
      (`DELETE /auth/sessions/:id` con el `id` de la sesión desde la que se hace la
      request) también expulsa de inmediato — la siguiente request con ese mismo access
      token da `401` igual que cualquier otra sesión cerrada, sin trato especial

### Implementación US2

- [x] T040 [US2] Crear
      `apps/api/src/domains/user/application/commands/close-session.command.ts` + `.handler.ts`
      (ownership vía `findByIdOwned`, `deleteOwned`, `SessionNotFoundError` si no calza)
- [x] T041 [US2] Crear `apps/api/src/domains/user/presentation/dto/session-id.params.ts`
      (`z.object({ id: rowId })`)
- [x] T042 [US2] Agregar ruta `DELETE /auth/sessions/:id` (guarded, `ZodParamsPipe`) a
      `auth.controller.ts`
- [x] T043 [US2] Frontend: `sessionsApi.close(id)`
- [x] T044 [US2] Frontend: mutación `closeSession` en `useProfileMutations` (o donde vivan las
      demás mutaciones del perfil), invalida `["sessions"]` al completar
- [x] T045 [US2] Frontend: `SecuritySection.tsx` — el botón "Cerrar" de cada fila (salvo la
      actual, que no lo muestra) llama a la mutación real en vez del filtro local de estado
- [x] T046 [US2] Test frontend: cerrar una sesión (mutación mockeada) la quita de la lista

**Checkpoint**: US1 + US2 funcionan juntas — cerrar una sesión específica es real.

---

## Phase 5: User Story 3 — Cerrar todas las demás sesiones (Priority: P3)

**Goal**: un botón cierra todas las sesiones salvo la actual, sin autoexpulsar al usuario.

**Independent Test**: con 3 sesiones activas, "cerrar todas las demás" desde una dejа solo esa
activa; las otras dos dan 401 de inmediato.

### Tests para US3

- [x] T047 [P] [US3] Test unitario: `RevokeOtherSessionsHandler` — borra todas menos la
      `sessionId` del caller; con una sola sesión (la actual) es no-op (0 filas), en
      `apps/api/test/unit/domains/user/application/commands/revoke-other-sessions.handler.spec.ts`
- [x] T048 [US3] Test de integración: 3 sesiones reales, revocar-otras desde una → las otras 2
      desaparecen de la BD, la que ejecutó la acción sigue existiendo intacta, en
      `apps/api/test/integration/domains/user/application/revoke-other-sessions.integration.spec.ts`
- [x] T049 [US3] Test e2e HTTP: 3 logins (A, B, C) → `POST /auth/sessions/revoke-others` desde
      A → B y C dan `401` en su siguiente request; A sigue funcionando sin interrupción, en
      `apps/api/test/e2e/domains/user/revoke-other-sessions.http.spec.ts`

### Implementación US3

- [x] T050 [US3] Crear
      `apps/api/src/domains/user/application/commands/revoke-other-sessions.command.ts` +
      `.handler.ts` (`deleteAllExceptForUser(userId, callerSessionId)`)
- [x] T051 [US3] Agregar ruta `POST /auth/sessions/revoke-others` (guarded, `204`) a
      `auth.controller.ts`
- [x] T052 [US3] Frontend: `sessionsApi.revokeOthers()`
- [x] T053 [US3] Frontend: mutación `revokeOtherSessions`, invalida `["sessions"]`
- [x] T054 [US3] Frontend: `SecuritySection.tsx` — el botón "Cerrar todas" (ya existe en el
      placeholder, condicionado a `sessions.length > 1`) llama a la mutación real en vez del
      filtro local
- [x] T055 [US3] Test frontend: "cerrar todas" deja solo la sesión marcada `isCurrent`

**Checkpoint**: las 3 historias funcionan de punta a punta e independientemente.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T056 [P] Crear
      `apps/api/src/domains/user/application/commands/purge-expired-sessions.command.ts` +
      `.handler.ts` (`scope: "system"`, mismo patrón que `PurgeExpiredRecordsCommand` —
      `deleteExpired(now)`, retorna cuántas filas borró)
- [x] T057 Crear `apps/api/src/infra/cron/session-cleanup.cron.ts` — diario, mismo patrón que
      `IdempotencyCleanupCron` (horario distinto, ej. `EVERY_DAY_AT_4AM`, para no competir con
      la purga de idempotencia a las 3am)
- [x] T058 Registrar `SessionCleanupCron` en `apps/api/src/infra/cron/cron.module.ts`
- [x] T059 [P] Test unitario: `PurgeExpiredSessionsHandler`, en
      `apps/api/test/unit/domains/user/application/commands/purge-expired-sessions.handler.spec.ts`
- [x] T060 Test de integración: sembrar sesiones vencidas y vigentes, correr la purga contra
      Postgres real, confirmar que solo las vencidas desaparecen, en
      `apps/api/test/integration/domains/user/application/purge-expired-sessions.integration.spec.ts`
- [x] T061 [P] Actualizar `docs/PENDING.md`: quitar la nota de "Sesiones y dispositivos —
      datos de ejemplo, sin tracking real" (§3 o donde corresponda); documentar como
      limitación deliberada que cambiar la contraseña o desactivar MFA no revoca otras
      sesiones existentes (research.md R9)
- [x] T062 [P] Actualizar `CLAUDE.md`: dominio `session` en la lista de table-domains del
      backend (24 → 25), bullet propio con el resumen de la feature ya implementada (mover el
      resumen de esta spec desde "Current plan" a su lugar como amendment del bloque `auth`,
      siguiendo la convención de cierre de spec ya usada en specs 021/022)
- [x] T063 Actualizar `.specify/memory/constitution.md`: bump de versión (patch) anotando el
      dominio-tabla `session` nuevo y las dos dependencias nuevas (`ua-parser-js`, `maxmind`) —
      sin cambio de principio, solo Sync Impact Report
- [x] T064 Correr `specs/023-real-sessions/quickstart.md` de punta a punta manualmente (o vía
      los tests e2e ya escritos, que cubren exactamente esos pasos) y confirmar los 4 casos
      borde documentados ahí

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias, arranca de inmediato.
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA las 3 historias (ninguna sesión
  existe sin T005-T022).
- **User Stories (Phase 3-5)**: todas dependen de Foundational. US1 puede implementarse y
  demostrarse sola (MVP). US2 y US3 dependen de que exista al menos una fila `Session` (la
  crea Foundational), pero no dependen del código de US1 — son independientes entre sí.
- **Polish (Phase 6)**: depende de que las historias deseadas estén completas; T056-T060
  (purga) son independientes de cuáles historias se hayan hecho, ya que solo tocan filas
  vencidas que Foundational ya sabe crear.

### Parallel Opportunities

- T005, T006, T009, T010, T011 (Foundational, archivos distintos, sin dependencias entre sí)
  pueden correr en paralelo.
- T023, T024, T025 (tests de Foundational) en paralelo entre sí, después de T005-T022.
- Dentro de cada historia, sus tests `[P]` en paralelo; luego la implementación es
  mayormente secuencial (comando → ruta → frontend) por tocar capas dependientes.
- US1, US2 y US3 completas (Phases 3, 4, 5) podrían asignarse a personas distintas en
  paralelo una vez Foundational está listo — comparten `auth.controller.ts` y
  `SecuritySection.tsx`, así que en la práctica conviene secuencial para evitar conflictos de
  merge en esos dos archivos.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Setup + Foundational (T001-T025) — el trabajo pesado de esta feature vive acá.
2. User Story 1 (T026-T036) — lista real de sesiones.
3. **STOP y VALIDAR**: loguearse desde 2 navegadores, confirmar que ambos aparecen.
4. Demo/deploy si corresponde.

### Incremental Delivery

1. Setup + Foundational → toda sesión nueva ya queda registrada (aunque nada la muestre
   todavía).
2. - US1 → se puede VER (MVP).
3. - US2 → se puede cerrar una por una.
4. - US3 → se puede cerrar todas las demás de un golpe.
5. - Polish → purga automática, docs al día.
