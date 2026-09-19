# Implementation Plan: Sesiones y dispositivos reales

**Branch**: `023-real-sessions` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-real-sessions/spec.md`

## Summary

Reemplaza el placeholder `EXAMPLE_SESSIONS` de `SecuritySection` con sesiones reales.
El modelo estateless de JWT (access+refresh sin ningún claim de identidad de sesión) no
permite hoy revocar un dispositivo específico — esta feature introduce un claim `sid`
(session id) en ambos tokens, respaldado por una fila `Session` nueva cuya sola
existencia ES la sesión activa (cerrarla = borrar la fila, sin soft-delete ni
historial). `JwtAuthGuard` extiende su chequeo por-request existente (hoy solo
`User.status`) para también verificar que la sesión siga viva, logrando revocación
"de inmediato" real y no solo en el próximo refresh. Dispositivo/navegador se parsean
del User-Agent una sola vez al crear la sesión; país aproximado se resuelve por IP contra
un archivo GeoLite2 local, opcional — sin él, la feature funciona igual sin ese dato
(mismo patrón "inerte sin configurar" que ya usan los adjuntos S3).

## Technical Context

**Language/Version**: TypeScript 5 / Node 20 (sin cambios)

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs`, Prisma 7, `@nestjs/jwt` (todo
existente). Nuevas, solo en `apps/api`: **`ua-parser-js`** (parseo de User-Agent →
`deviceLabel`), **`maxmind`** (lector de archivos `.mmdb` GeoLite2, sin llamadas de
red). Sin dependencias nuevas en `apps/web`.

**Storage**: PostgreSQL vía Prisma — tabla nueva `session` (ver data-model.md). Archivo
`.mmdb` opcional en disco, ruta configurable (`GEOIP_DB_PATH`), nunca en la base de
datos.

**Testing**: Vitest, mismo split `test:unit`/`test:integration`/`test:e2e` que el resto
del repo. `test:unit` sin conexión a BD (fake ports); `test:integration` contra Postgres
real; `test:e2e` HTTP a través del Facade.

**Target Platform**: Sin cambios (API Node/Express detrás de NestJS; SPA Vite/React).

**Project Type**: Web application (monorepo `apps/api` + `apps/web`, sin cambios de
estructura).

**Performance Goals**: Sin objetivos nuevos — `GET /auth/sessions` es una lista acotada
por usuario (normalmente unos pocos dispositivos), sin paginación necesaria.

**Constraints**: El lookup de país NO debe agregar latencia de red al login (R5 — solo
lectura local de archivo `.mmdb`, nunca una llamada HTTP externa). La verificación de
sesión en `JwtAuthGuard` reemplaza la consulta a BD que ya corre por request — sigue
siendo UNA sola consulta Prisma, no dos: se consulta `Session` (por `sid`) con un
`include` de su `User.status`, en vez de consultar `User` sola como hoy. Mismo costo por
request que el chequeo actual, no uno adicional.

**Scale/Scope**: 3 endpoints nuevos + 1 extendido (`logout`) + 1 extendido internamente
(`refresh`, sin cambio de contrato), 1 tabla nueva, 1 cron nuevo, 1 dependencia de
parseo + 1 de geolocalización local.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Data gates (always applicable — see Principles II, VII and VIII):**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de
      Identificadores. → `Session.id` es UUID v7 (`@default(uuid(7))`), validado en el
      borde vía `rowId` en `DELETE /auth/sessions/:id` (data-model.md).
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia
      satisface. → `DELETE /auth/sessions/:id` y `POST /auth/sessions/revoke-others` son
      forma **(a) máquina de estados terminal**: borrar una fila que ya no existe (doble
      click, reintento) es un no-op idéntico al primer resultado — DELETE es
      naturalmente idempotente sobre un recurso identificado por id, sin necesitar
      `Idempotency-Key` (a diferencia de un POST que mueve dinero, esto no tiene un
      efecto acumulable que un reintento pueda duplicar). No mueven balance, cupo ni
      cuotas, así que quedan fuera del alcance obligatorio de forma (b)/(c) que el
      Principio VII reserva para escrituras de dinero.
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su
      ownership. → Ninguna de las dos escrituras acepta una FK en el body; `:id` en
      `DELETE /auth/sessions/:id` es un path param verificado por pertenencia
      (`userId` de la fila == `CurrentUser().id`) antes de borrar — 404 si no calza
      (nunca 403, Principio II).

## Project Structure

### Documentation (this feature)

```text
specs/023-real-sessions/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── session-endpoints.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
apps/api/
├── prisma/schema.prisma                         # + model Session (table "session")
├── src/
│   ├── domains/
│   │   └── session/                              # NEW table-domain (no presentation/)
│   │       ├── domain/
│   │       │   ├── session.entity.ts
│   │       │   └── ports/session.repository.port.ts
│   │       ├── infrastructure/prisma-session.repository.ts
│   │       └── session.data.module.ts            # leaf, composed into user.module.ts
│   ├── domains/user/
│   │   ├── application/
│   │   │   ├── device-info.ts                    # NEW: ua-parser-js wrapper → deviceLabel
│   │   │   ├── geoip-lookup.ts                    # NEW: maxmind wrapper → country | null
│   │   │   ├── commands/
│   │   │   │   ├── login.handler.ts               # extended: creates Session
│   │   │   │   ├── register.handler.ts            # extended: creates Session
│   │   │   │   ├── verify-mfa-login.handler.ts     # extended: creates Session
│   │   │   │   ├── verify-passkey-login.handler.ts # extended: creates Session
│   │   │   │   ├── refresh-token.handler.ts        # extended: reuses Session by sid
│   │   │   │   ├── close-session.command.ts        # NEW
│   │   │   │   ├── close-session.handler.ts        # NEW
│   │   │   │   ├── revoke-other-sessions.command.ts # NEW
│   │   │   │   └── revoke-other-sessions.handler.ts # NEW
│   │   │   ├── queries/
│   │   │   │   ├── list-sessions.query.ts          # NEW
│   │   │   │   └── list-sessions.handler.ts        # NEW
│   │   │   └── token-issuer.ts                     # extended: issue(user, sessionId?)
│   │   ├── domain/errors.ts                        # + SessionNotFoundError
│   │   ├── presentation/
│   │   │   ├── auth.controller.ts                  # + GET/DELETE/POST /auth/sessions*
│   │   │   └── dto/session-id.params.ts             # NEW
│   │   └── user.module.ts                          # imports SessionDataModule
│   └── infra/
│       ├── auth/
│       │   ├── jwt-auth.guard.ts                   # extended: per-request session check
│       │   └── current-user.decorator.ts            # + sessionId on AuthUser
│       ├── config/geoip.config.ts                   # NEW: getGeoIpDbPath (optional)
│       └── cron/session-cleanup.cron.ts             # NEW, mirrors idempotency-cleanup
└── test/{unit,integration,e2e}/...                  # mirrors src/, per-layer

packages/contracts/src/auth/index.ts                 # + sessionSchema, listSessionsResponseSchema

apps/web/src/domains/profile/
├── components/SecuritySection.tsx                   # EXAMPLE_SESSIONS replaced by real query
├── hooks/useProfile.ts                               # + useSessionsQuery, session mutations
└── (no new components — same row shape already built for the placeholder)
```

**Structure Decision**: sigue el patrón "una tabla = un dominio" ya establecido
(`session` como dominio-tabla nuevo sin `presentation/`, compuesto en `user` — mismo
tratamiento que `passkey`/`mfa-recovery-code`, research.md R3). Sin apps/paquetes
nuevos; todo el cambio de frontend es sustituir el placeholder por datos reales sobre
componentes que ya existen.

## Complexity Tracking

_Sin violaciones — no aplica._
