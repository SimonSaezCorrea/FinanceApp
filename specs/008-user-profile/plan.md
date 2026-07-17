# Implementation Plan: Perfil de Usuario

**Branch**: `008-user-profile` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-user-profile/spec.md`

## Summary

Añadir una vista de Perfil (`/profile`) accesible desde el bloque de usuario del sidebar, que permite
ver información y estadísticas de la cuenta, editar nombre/email, cambiar contraseña, configurar
preferencias persistidas por usuario (moneda principal, idioma, formato de fecha, tema — este último
ya existente, ahora también sincronizado al backend), mostrar controles de 2FA/notificaciones fieles
al diseño pero inertes, y desactivar la propia cuenta (soft-disable, sin borrado de datos). El `User`
de Prisma se extiende con los campos de preferencia + estado + fecha de creación; el dominio `auth`
(backend) se extiende con los endpoints de perfil (no se crea un dominio nuevo, ya que todo gira en
torno al mismo `User` que `auth` ya posee); el frontend gana un nuevo dominio `profile` que mirror-ea
el resto (`api/hooks/components/routes`).

## Technical Context

**Language/Version**: TypeScript 5 / Node 20 (ya establecido en el monorepo)

**Primary Dependencies**: NestJS 10 + Prisma 6 (`apps/api`); Vite + React 18 + TanStack Query + react-router-dom (`apps/web`); zod (`@finance/contracts`); bcryptjs (ya usado en `auth.service.ts` para hash de contraseña)

**Storage**: PostgreSQL vía Prisma (`apps/api` es el único dueño de la DB); `prisma db push` (no hay carpeta de migrations en este repo)

**Testing**: Vitest (unit para `auth.service`/`profile` logic; component tests para el formulario de Perfil, mirror de `ui.test.tsx`)

**Target Platform**: Web (SPA), navegador moderno

**Project Type**: Web application (monorepo `apps/api` + `apps/web` + `packages/*`, ya establecido)

**Performance Goals**: Sin requisitos nuevos de performance — mismo perfil de carga que el resto de la SPA (queries de perfil son lecturas puntuales por PK, no listados).

**Constraints**: Password re-entry obligatorio antes de desactivar cuenta (FR-009); una cuenta deshabilitada no debe conservar acceso más allá de su siguiente acción autenticada (FR-010) — implica que el guard de auth valide el estado de la cuenta en cada request, no solo la firma del JWT.

**Scale/Scope**: 1 vista nueva, ~6 endpoints nuevos/editados en el dominio `auth`, 5 campos nuevos en `User`, 1 primitivo UI nuevo (`Switch`).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Principio I (Money Precision)**: No aplica dinero nuevo — `preferredCurrency` es solo un código ISO 4217 de 3 letras (mismo patrón que `BankAccount.currency`), no un monto. ✅ PASS.
- **Principio II (Per-User Data Isolation)**: Todos los endpoints nuevos operan exclusivamente sobre `@CurrentUser` (`userId` del JWT); no se acepta ningún `id` de usuario por parámetro. La verificación de contraseña actual (password change, deactivate) es una capa adicional de autorización, no un reemplazo del scoping por usuario. ✅ PASS.
- **Principio III (i18n Parity)**: Todo string nuevo se agrega a `es.json` y `en.json` bajo claves idénticas (FR-013 / SC-005). ✅ PASS — se verificará en implement.
- **Principio IV (Test-First / TDD)**: Vitest ya está configurado (a diferencia de cuando se ratificó 1.0.0); se escriben specs para `auth.service` (password change, deactivate, preferences) antes de implementar, seguido de tests de componente para el formulario de Perfil. ✅ PASS.
- **Principio V (SDD)**: Este mismo ciclo spec → plan → tasks → analyze → implement. ✅ PASS.
- **Arquitectura (domain-first, one-way deps)**: Se extiende el dominio `auth` existente (no se crea un dominio "users" separado — `User` ya es propiedad de `auth`); el frontend gana `domains/profile` mirror de dominios existentes. No se rompe `apps → packages`, `api ↛ web`. ✅ PASS.
- **Persistencia (kebab-case `@@map`)**: `User` ya mapea a `user`; los campos nuevos son columnas de la misma tabla, no requieren `@@map` adicional. ✅ PASS.

No violations.

## Project Structure

### Documentation (this feature)

```text
specs/008-user-profile/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/api/prisma/schema.prisma        # User gains: preferredCurrency, locale, dateFormat, theme,
                                      # status (UserStatus), createdAt
apps/api/src/domains/auth/
├── auth.controller.ts               # + PATCH /auth/me, POST /auth/me/password,
│                                     #   PATCH /auth/me/preferences, POST /auth/me/deactivate
├── auth.service.ts                  # + updateProfile, changePassword, updatePreferences, deactivate
├── auth.repository.ts               # + update(id, data)
└── auth.service.spec.ts             # + specs for the above (TDD, Vitest)

apps/api/src/infra/auth/
└── jwt-auth.guard.ts                # + reject when user.status === DISABLED (DB check per request)

packages/contracts/src/auth/index.ts # + updateProfileRequestSchema, changePasswordRequestSchema,
                                      #   updatePreferencesRequestSchema, deactivateRequestSchema;
                                      #   currentUserSchema gains preferredCurrency/locale/
                                      #   dateFormat/theme/memberSinceYear

apps/web/src/domains/profile/        # NEW domain, mirrors existing domains
├── api/profileApi.ts
├── hooks/useProfile.ts              # stats via existing accounts/transactions APIs (dashboard-style
│                                     # frontend aggregation, no new backend aggregation endpoint)
├── components/
│   ├── ProfileCard.tsx              # avatar+name+email+plan badge+stats+"Editar perfil"
│   ├── PreferencesSection.tsx       # tema, moneda, idioma, formato fecha
│   ├── SecuritySection.tsx          # cambiar contraseña, 2FA (inerte)
│   ├── NotificationsSection.tsx     # 3 switches (inertes)
│   └── DangerZone.tsx               # cerrar sesión, eliminar cuenta (+ ConfirmDialog con password)
└── routes/ProfileRoute.tsx

apps/web/src/shared/ui/switch.tsx    # NEW primitive (knob switch), mirrors segmented.tsx style
apps/web/src/theme/ThemeProvider.tsx # syncs mode to backend preference in addition to localStorage
apps/web/src/app/AppLayout.tsx       # user block in sidebar becomes a NavLink to /profile
apps/web/src/app/router.tsx          # + { path: "/profile", element: protect(<ProfileRoute />) }
apps/web/src/i18n/{es,en}.json       # + profile.* keys
```

**Structure Decision**: Monorepo existente, sin proyectos nuevos. Se extiende el dominio `auth`
(backend) en vez de crear un dominio `users`/`profile` separado, porque `User` ya es su entidad y no
hay otra responsabilidad que justifique un módulo aparte. En el frontend sí se crea `domains/profile`
(nuevo, como cualquier otro dominio de `apps/web`) porque ahí el criterio de organización es por
vista/ruta, no por entidad de datos.

## Complexity Tracking

_No violations — sección no aplica._
