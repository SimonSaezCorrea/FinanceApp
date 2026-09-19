# Implementation Plan: Renombrar passkeys y autocompletado condicional

**Branch**: `claude/pending-items-review-blf6wz` (spec dir `025-passkey-management`, sin branch git
propia — se sigue trabajando en la rama designada de esta sesión) | **Date**: 2026-09-19 | **Spec**:
[spec.md](./spec.md)

**Input**: Feature specification from `specs/025-passkey-management/spec.md`

## Summary

Dos extensiones chicas sobre el dominio `passkey` (specs/022, sin `presentation/` propia — sus
comandos/queries viven en `user`'s application layer): (1) `PATCH /auth/me/passkeys/:id` con
`{name}`, mismo patrón de `RemovePasskeyHandler` (ownership-scoped, `PasskeyNotFoundError` si no es
tuya o no existe); requiere un método nuevo en `PasskeyRepositoryPort` (`renameOwned`), ya que hoy
solo existe `deleteOwned`/`updateCounterAndLastUsedWithTx`, ninguno sirve para cambiar `name`. (2)
Autocompletado condicional en el login: el mecanismo de login "discoverable" (sin email,
`allowCredentials` sin definir, cuenta resuelta por `findByCredentialId` en `verify-passkey-login.
handler.ts`) YA es exactamente lo que la ceremonia condicional necesita del backend — cero cambios
de API. Solo cambia el frontend: el campo de email de `LoginRoute.tsx` gana `autoComplete="username
webauthn"` y, al montar la pantalla, se dispara `navigator.credentials.get({mediation:"conditional",
...})` (feature-detectado vía `PublicKeyCredential.isConditionalMediationAvailable()`, con un
`AbortController` propio para poder cancelarlo si el usuario envía el form de contraseña primero).

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node 20 (backend NestJS 11; frontend Vite + React 19) —
sin cambio.

**Primary Dependencies**: `@simplewebauthn/server` (ya usado, sin cambio de versión); frontend usa
únicamente APIs nativas del navegador (`navigator.credentials`, `PublicKeyCredential`) — sin
dependencia nueva en ninguno de los dos paquetes.

**Storage**: PostgreSQL vía Prisma. **Sin cambio de schema** — `Passkey.name` ya existe (specs/022);
esta feature solo agrega un MÉTODO de repositorio (`renameOwned`), no una columna.

**Testing**: Vitest — `apps/api/test/{unit,integration,e2e}`, `apps/web` con Vitest + Testing
Library.

**Target Platform**: Servidor Linux (API) + SPA (web) — sin cambio.

**Project Type**: Monorepo existente — extiende dos dominios ya existentes (`passkey`, `user` en el
backend; `auth`/`profile` en el frontend). No crea ningún dominio ni paquete nuevo.

**Performance Goals**: N/A — un `UPDATE` de una fila por su PK, y una llamada de navegador que ya
ocurre hoy de forma explícita (botón), ahora disparada distinto.

**Constraints**: La ceremonia condicional NUNCA debe interferir con el login por contraseña normal
— debe poder cancelarse limpiamente (un segundo `navigator.credentials.get()` concurrente sin
cancelar el primero lanza `InvalidStateError`).

**Scale/Scope**: 1 método nuevo de puerto + su adapter Prisma, 1 comando + handler nuevo, 1 endpoint
nuevo (`PATCH`), 1 schema de contrato nuevo, 1 método nuevo en `passkeyApi`, 1 mutación nueva +
pequeño cambio de UI en `PasskeySection.tsx`, cambios en `webauthn.ts`/`useAuth.tsx`/`LoginRoute.tsx`
para el autocompletado condicional. Cero tablas nuevas, cero migraciones.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Data gates (always applicable — see Principles II, VII y VIII):**

- [x] Toda entidad nueva declara formato de identificador — **N/A**: no se agrega entidad ni
      columna. `Passkey.id` ya es UUID v7 desde specs/016.
- [x] Todo endpoint de escritura nuevo declara idempotencia — **N/A parcial**: `PATCH
/auth/me/passkeys/:id` es un endpoint nuevo, pero renombrar NO mueve dinero ni tiene efecto
      acumulativo — es un `UPDATE` que sobreescribe `name` con el valor dado; reenviar el mismo
      request dos veces produce el mismo estado final (idempotente por naturaleza, forma (a) del
      principio VII: no hay contador ni delta que duplicar). No se agrega `Idempotency-Key` — no es
      una de las diez operaciones de specs/015 ni tiene ese riesgo.
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership —
      **N/A**: el único id que entra (`:id` del path) ya se verifica vía `renameOwned(userId, id,
name)`, ownership-scoped por diseño (mismo patrón que `deleteOwned`) — nunca confía en un id de
      otro usuario.

## Project Structure

### Documentation (this feature)

```text
specs/025-passkey-management/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md             # Phase 2 (/speckit-tasks — todavía no generado)
```

### Source Code (repository root)

```text
apps/api/src/domains/
├── passkey/
│   ├── domain/ports/passkey.repository.port.ts      # + renameOwned(...)
│   └── infrastructure/prisma-passkey.repository.ts  # + su implementación
└── user/
    ├── application/commands/
    │   ├── rename-passkey.command.ts                 # nuevo
    │   └── rename-passkey.handler.ts                 # nuevo, mirror de remove-passkey.handler.ts
    └── presentation/auth.controller.ts               # + PATCH /me/passkeys/:id

packages/contracts/src/auth/index.ts                  # + renamePasskeyRequestSchema

apps/api/test/
├── unit/domains/user/application/commands/rename-passkey.handler.spec.ts       # nuevo
├── integration/domains/passkey/infrastructure/rename.integration.spec.ts       # nuevo
└── e2e/domains/user/passkey-management.http.spec.ts                            # + caso PATCH

apps/web/src/
├── domains/auth/api/passkeyApi.ts               # + rename(id, name)
├── domains/profile/hooks/useProfile.ts          # + renamePasskey mutation
├── domains/profile/components/PasskeySection.tsx # + botón/edición inline de nombre
├── shared/lib/webauthn.ts                        # + toConditionalGetOptions (mediation:"conditional")
├── domains/auth/hooks/useAuth.tsx                # + tryConditionalPasskeyLogin
├── domains/auth/routes/LoginRoute.tsx            # + autoComplete + useEffect on-mount
└── i18n/{es,en}.json                             # + profile.security.passkey.rename*
```

**Structure Decision**: se extienden dominios/componentes ya existentes — no aplica ninguna
estructura genérica "Option 1/2/3".

## Complexity Tracking

_Sin violaciones — no aplica._

## Constitution Check (post-Phase 1 re-check)

Sin cambios respecto al gate inicial — `data-model.md` confirma que no se agrega entidad ni columna,
y que el único id de la ruta (`:id`) sigue verificado por ownership antes de mutar nada.
