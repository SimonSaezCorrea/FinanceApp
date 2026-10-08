# Implementation Plan: Perfil como ajustes por secciones con resumen de protección

**Branch**: `029-profile-settings-redesign` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/029-profile-settings-redesign/spec.md`

## Summary

Perfil deja de ser una columna de siete acordeones y pasa a ser **ajustes por secciones** con rutas
propias bajo `/profile` (`personal`, `security`, `preferences`, `privacy`, índice = Resumen). Un
`ProfileLayout` decide la forma por el **ancho de su contenedor**: dos paneles (navegación agrupada
con línea de estado + sección activa) o una columna (vista inicial con identidad, Resumen sin ajustes
rápidos y lista; cada sección como pantalla con "volver"). El **Resumen** muestra la protección en tres etapas
(contraseña → llave de acceso → dos pasos) con siguiente paso realizable, la completitud de datos
sobre 3 (sin foto), hasta 3 sesiones abiertas y ajustes rápidos de tema y ocultar saldos. Toda la
lógica de estado vive en funciones puras testeadas (`profileStatus.ts`). Se eliminan los
placeholders inertes, el tema pasa a Claro/Oscuro/Sistema con un componente compartido, "Eliminar
cuenta" va a Datos y privacidad, y una edición sin guardar pide confirmación al navegar. **Solo
frontend: cero cambios de API, esquema o contrato.**

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20 (monorepo pnpm + Turborepo)

**Primary Dependencies**: React 19, react-router v8 (rutas anidadas, `useBlocker`), TanStack Query,
Tailwind CSS 3.4, react-i18next, Lucide; primitivos propios de `shared/ui` (`Button`, `Badge`,
`Card`, `Switch`, `SearchableSelect`, overlay `ConfirmModal`, `states`). **Sin dependencias nuevas.**

**Storage**: N/A (sin cambios de datos; todo derivado de queries existentes)

**Testing**: Vitest + Testing Library (jsdom) en `apps/web`; `i18n/parity.test.ts` para es/en

**Target Platform**: SPA web (escritorio, tablet, teléfono), navegadores modernos

**Project Type**: Web application (monorepo `apps/api` + `apps/web`); esta feature toca solo
`apps/web`

**Performance Goals**: ninguna query nueva; el Resumen reutiliza las mismas queries que Seguridad
(caché compartida). Cambiar de sección no remonta la identidad ni la navegación.

**Constraints**: Principio III (paridad es/en), IV (TDD), breakpoints/anchos de contenedor según
`CLAUDE.md`, áreas táctiles ≥ 44 px (FR-025), sin `beforeunload` (clarificación 2)

**Scale/Scope**: 1 vista, 5 secciones, ~12 componentes tocados, ~1 módulo de lógica nuevo

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio                   | Aplica       | Evaluación                                                                                                                 |
| --------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| I. Money Precision          | No           | El Resumen no muestra ni calcula montos                                                                                    |
| II. Per-User Data Isolation | Sí (lectura) | Solo consume queries ya escopeadas por `userId` en el API; no hay lecturas nuevas                                          |
| III. i18n Parity            | Sí           | Toda clave nueva en es y en; claves de placeholders borradas en ambos; `parity.test.ts` lo verifica                        |
| IV. Test-First / TDD        | Sí           | Tests de `profileStatus` y de rutas se escriben antes de la implementación (ver research R10)                              |
| V. SDD & Living Memory      | Sí           | Cambio de routing (`/profile/*`) y convención de forma por contenedor → actualizar `CLAUDE.md` y la constitución al cerrar |
| VI. Backend DDD + CQRS      | No           | Sin cambios en `apps/api`                                                                                                  |
| VII. Idempotencia           | No           | Ningún endpoint de escritura nuevo; las escrituras existentes no cambian                                                   |
| VIII. Identificadores       | No           | Ninguna entidad nueva                                                                                                      |

**Data gates (always applicable — see Principles II, VII and VIII):**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de Identificadores. — No hay entidades nuevas.
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface. — No hay endpoints nuevos.
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership. — No hay requests nuevos.

**Resultado:** PASA. Sin violaciones; Complexity Tracking vacío.

**Re-check post-diseño (Phase 1):** PASA. El diseño confirma cero cambios de API/esquema; la única
superficie pública nueva son las rutas del navegador ([contracts/profile-routes.md](./contracts/profile-routes.md)).

## Project Structure

### Documentation (this feature)

```text
specs/029-profile-settings-redesign/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── profile-routes.md
├── checklists/
│   └── requirements.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/src/
├── app/
│   └── router.tsx                         # /profile → rutas hijas + comodín
├── shared/
│   ├── lib/
│   │   ├── useElementWidth.ts             # + PROFILE_PANES_MIN_WIDTH
│   │   └── webauthn.ts                    # + isPasskeySupported()
│   └── ui/
│       └── theme-segmented.tsx            # NUEVO: Claro/Oscuro/Sistema (44 px)
├── domains/
│   ├── landing/components/LandingLayout.tsx   # MenuThemeSwitch → ThemeSegmented
│   └── profile/
│       ├── lib/
│       │   ├── profileStatus.ts           # NUEVO: etapas, siguiente paso, completitud, sesiones, estado por sección
│       │   └── profileStatus.test.ts      # NUEVO
│       ├── lib/profileSections.ts         # NUEVO: definición de secciones/grupos/rutas
│       ├── routes/
│       │   ├── ProfileLayout.tsx          # NUEVO: forma por ancho, navegación, Outlet
│       │   ├── ProfileRoutes.test.tsx     # NUEVO: rutas, formas, guard, acciones del resumen
│       │   ├── SummaryRoute.tsx           # NUEVO (índice)
│       │   ├── PersonalRoute.tsx          # NUEVO (envuelve PersonalInfoSection)
│       │   ├── SecurityRoute.tsx          # NUEVO (envuelve SecuritySection)
│       │   ├── PreferencesRoute.tsx       # NUEVO (Preferencias + monedas extra + ocultar saldos)
│       │   ├── PrivacyRoute.tsx           # NUEVO (consentimientos + eliminar cuenta)
│       │   └── ProfileRoute.tsx           # ELIMINADO (lo reemplaza ProfileLayout)
│       └── components/
│           ├── ProfileSectionNav.tsx      # NUEVO: lista agrupada con estado (panel y vista inicial)
│           ├── ProfileIdentity.tsx        # NUEVO (sustituye ProfileCard)
│           ├── ProtectionCard.tsx         # NUEVO: etapas + siguiente paso
│           ├── ProfileSummary.tsx         # NUEVO: protección, datos, sesiones, ajustes rápidos
│           ├── ComingSoonNote.tsx         # NUEVO
│           ├── PersonalInfoSection.tsx    # sin acordeón; ?edit=; dirty + useBlocker
│           ├── SecuritySection.tsx        # sin acordeón; anclas #password/#two-factor/#passkeys/#sessions
│           ├── PreferencesSection.tsx     # tema con ThemeSegmented; sin acordeón
│           ├── FinancialCustomizationSection.tsx  # sin acordeón (dentro de Preferencias)
│           ├── ConsentHistorySection.tsx  # dentro de Privacidad
│           ├── DangerZone.tsx             # dentro de Privacidad
│           ├── AccountStatusSection.tsx   # ELIMINADO
│           ├── NotificationsSection.tsx   # ELIMINADO
│           ├── DataPrivacySection.tsx     # ELIMINADO
│           └── ProfileCard.tsx            # ELIMINADO (→ ProfileIdentity)
└── i18n/{es,en}.json                      # profile.sections/groups/summary/status/comingSoon; borrar claves de placeholders
```

**Structure Decision**: web application; solo `apps/web`, dominio `profile` (domain-first, como el
resto del frontend). Las rutas de sección son componentes delgados que componen las secciones
existentes; la lógica derivada se concentra en `profileStatus.ts`.

## Phase 0 / Phase 1 outputs

- [research.md](./research.md): R1–R10 (rutas, forma por contenedor, lógica pura, soporte de llaves,
  sin endpoints, tema compartido, guard de edición, anclas, eliminaciones, tests).
- [data-model.md](./data-model.md): modelos de vista derivados (sin esquema).
- [contracts/profile-routes.md](./contracts/profile-routes.md): direcciones, parámetros y anclas.
- [quickstart.md](./quickstart.md): comandos de verificación y 11 escenarios manuales.

## Complexity Tracking

Sin violaciones de la constitución.
