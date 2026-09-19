# Implementation Plan: Revocar sesiones al cambiar credenciales

**Branch**: `claude/pending-items-review-blf6wz` (spec dir `024-revoke-sessions-on-change`, sin branch git propia — se sigue trabajando en la rama designada de esta sesión) | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/024-revoke-sessions-on-change/spec.md`

## Summary

Cuando `ChangePasswordHandler` (`POST /auth/me/password`, nota: el endpoint real es `POST`, no
`PATCH` como decía la redacción original de CLAUDE.md/el spec — corregido en este plan) o
`DisableMfaHandler` (`POST /auth/me/mfa/disable`) completan su cambio con éxito, deben además cerrar
—dentro de la MISMA transacción de Postgres— todas las demás sesiones activas del usuario, llamando
al mismo mecanismo que ya usa `POST /auth/sessions/revoke-others` (specs/023):
`SessionRepositoryPort.closeAllExceptForUser`. Hoy ese método NO tiene una variante `*WithTx`, así
que el primer paso es agregarla (`closeAllExceptForUserWithTx`) y usarla desde ambos handlers dentro
de su `persist()`. El `sid` de la sesión actual (`AuthUser.sessionId`, ya expuesto por
`JwtAuthGuard`/`@CurrentUser()` desde specs/023) llega hoy al controller pero no se reenvía a los
comandos de estos dos flujos — se agrega como tercer argumento del constructor de
`ChangePasswordCommand`/`DisableMfaCommand`, exactamente como ya hace `RevokeOtherSessionsCommand`.
En el frontend, `ChangePasswordDialog` y `DisableMfaModal` (`apps/web/src/domains/profile/
components/SecuritySection.tsx`) ganan un `FormNotice tone="warning"` (componente ya existente,
`shared/ui/form/FormNotice.tsx`) advirtiendo ANTES de confirmar que la acción cerrará las demás
sesiones — sin ningún aviso posterior (toast/contador), por decisión explícita del clarify.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node 20 (backend NestJS 11 + Express 5; frontend Vite +
React 19) — sin cambio de versión.

**Primary Dependencies**: `@nestjs/cqrs` (CommandBus/handlers ya existentes), Prisma 7 vía
`@prisma/adapter-pg` (`PrismaService`), `bcrypt` (ya usado por ambos handlers para verificar la
contraseña actual). Ninguna dependencia nueva.

**Storage**: PostgreSQL vía Prisma. **Sin cambio de schema** — la tabla `session` ya existe completa
(specs/023); esta feature solo agrega un MÉTODO de repositorio (`closeAllExceptForUserWithTx`), no
una columna ni una migración.

**Testing**: Vitest — `apps/api/test/{unit,integration,e2e}` (misma convención que specs/021/023);
`apps/web` con Vitest + Testing Library para los dos componentes de diálogo tocados.

**Target Platform**: Servidor Linux (API) + SPA servida por Vite/estático (web) — sin cambio.

**Project Type**: Monorepo pnpm/Turborepo existente — `apps/api` (NestJS) + `apps/web` (Vite/React).
Esta feature toca ambos, dentro de dominios ya existentes (`user`, `session` en el backend;
`profile` en el frontend) — no crea ningún dominio ni paquete nuevo.

**Performance Goals**: N/A — el `UPDATE ... WHERE userId = ? AND id != ? AND closedAt IS NULL` ya
corre hoy en el flujo manual de "Cerrar todas las demás" contra, como mucho, unas pocas decenas de
filas por usuario; envolverlo en la misma transacción que ya hace el cambio de contraseña/MFA no
cambia su costo.

**Constraints**: La revocación de sesiones y el cambio de contraseña/desactivación de MFA DEBEN
correr en una única `prisma.$transaction` (FR-007, decidido en clarify) — si el cierre de sesiones
falla, toda la transacción se revierte, incluida la nueva contraseña/el estado de MFA.

**Scale/Scope**: 2 comandos + 2 handlers modificados (no nuevos), 1 método nuevo en un puerto ya
existente + su adapter Prisma, 2 controller call-sites modificados (un argumento más cada uno), 2
componentes de diálogo en el frontend (agregar un `FormNotice`), 2 claves i18n nuevas (es/en). Cero
tablas nuevas, cero endpoints nuevos, cero migraciones.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Ningún gate de la constitución se ve involucrado de forma sustantiva — esta feature no introduce
entidad, endpoint ni FK de cuerpo nuevos; reutiliza en su totalidad el modelo `Session` y el
mecanismo de cierre de specs/023.

**Data gates (always applicable — see Principles II, VII y VIII):**

- [x] Toda entidad nueva declara formato de identificador — **N/A**: no se agrega ninguna entidad ni
      columna. `Session.id` ya es UUID v7 desde specs/016; esta feature no lo toca.
- [x] Todo endpoint de escritura nuevo declara idempotencia — **N/A**: no se agrega ningún endpoint
      nuevo. `POST /auth/me/password` y `POST /auth/me/mfa/disable` ya existen sin protección de
      `Idempotency-Key` (no mueven dinero, no están en la lista de las diez operaciones de specs/015)
      y esta feature no cambia esa forma — solo agrega un efecto colateral (cerrar sesiones) DENTRO de
      la misma transacción que el efecto que ya tenían. Un reintento del mismo request (ej. doble clic)
      sigue siendo seguro por la misma razón por la que ya lo era: cambiar la contraseña a la MISMA
      contraseña nueva es un no-op idempotente en los hechos, y `disableMfa` ya lanza si MFA no está
      activo (repetirlo tras el primer éxito falla en `loadContext`, no revoca sesiones dos veces de
      forma dañina — cerrar una sesión ya cerrada con `closedAt IS NULL` en el `WHERE` es en sí mismo
      un no-op).
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership —
      **N/A**: el único id nuevo que entra a los comandos (`currentSessionId`) NO viene del cuerpo del
      request — viene de `AuthUser.sessionId`, resuelto por `JwtAuthGuard` a partir del claim `sid` del
      access token ya validado (la misma fuente que usa `RevokeOtherSessionsCommand` hoy). Nunca es un
      valor que el cliente pueda inyectar por su cuenta.

## Project Structure

### Documentation (this feature)

```text
specs/024-revoke-sessions-on-change/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output (sin entidades nuevas — documenta el método de puerto)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (sin cambio de contrato HTTP público — documentado)
└── tasks.md             # Phase 2 output (/speckit-tasks — todavía no generado)
```

### Source Code (repository root)

Monorepo existente — **no se crea ningún dominio, paquete ni app nueva**. Archivos reales a tocar:

```text
apps/api/src/domains/
├── session/
│   ├── domain/ports/session.repository.port.ts     # + closeAllExceptForUserWithTx(...)
│   └── infrastructure/prisma-session.repository.ts  # + su implementación
└── user/
    ├── application/commands/
    │   ├── change-password.command.ts                # + currentSessionId
    │   ├── change-password.handler.ts                # + persist() transaccional
    │   ├── disable-mfa.command.ts                     # + currentSessionId
    │   └── disable-mfa.handler.ts                     # + 3ra WithTx dentro de su $transaction ya existente
    └── presentation/auth.controller.ts                # 2 call-sites: + user.sessionId

apps/api/test/
├── unit/domains/user/application/commands/
│   ├── change-password.handler.spec.ts                # + caso: revoca otras sesiones
│   └── disable-mfa.handler.spec.ts                    # + caso: revoca otras sesiones
├── integration/domains/user/application/
│   ├── change-password.integration.spec.ts            # nuevo (no existía uno dedicado, ver research.md)
│   └── mfa-disable.integration.spec.ts                # + caso: revoca otras sesiones
└── e2e/domains/user/
    ├── change-password.http.spec.ts                    # nuevo
    └── mfa-disable.http.spec.ts                        # + caso: revoca otras sesiones

apps/web/src/domains/profile/components/
└── SecuritySection.tsx           # ChangePasswordDialog + DisableMfaModal: + <FormNotice tone="warning">
apps/web/src/domains/profile/hooks/useProfile.ts   # changePassword/disableMfa: + invalidateQueries(["sessions"])
apps/web/src/i18n/{es,en}.json    # + profile.security.sessions.revokeOthersWarning
apps/web/src/domains/profile/components/SecuritySection.test.tsx   # + 2 casos (aviso visible en ambos diálogos)
```

**Structure Decision**: se extienden dos dominios ya existentes (`session`, `user` en `apps/api`) y
un componente ya existente (`SecuritySection` en `apps/web`) — no aplica ninguna de las estructuras
"Option 1/2/3" del template genérico; el monorepo ya tiene su propia estructura fija (ver
`CLAUDE.md`).

## Complexity Tracking

_Sin violaciones — no aplica._

## Constitution Check (post-Phase 1 re-check)

Sin cambios respecto al gate inicial: `data-model.md` confirma que no se agrega entidad, columna ni
endpoint, y que `currentSessionId` nunca viaja por el cuerpo de un request. Los tres ítems de "Data
gates" siguen **N/A** tal como se marcaron arriba. Ningún otro principio de la constitución
(aislamiento por usuario, dinero como decimal, etc.) aplica a esta feature — no mueve dinero ni lee
datos de otro usuario.
