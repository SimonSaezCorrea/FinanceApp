# Implementation Plan: Separar el sitio público de la aplicación

**Branch**: `031-separate-landing` | **Date**: 2026-10-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/031-separate-landing/spec.md`

## Summary

El sitio público sale de la SPA `apps/web` a una app nueva **`apps/landing`** (Astro estático, en
`cuadra.cl`), con HTML completo y metadatos por página en `/es/…` y `/en/…`, sin cargar React al
abrir una página: solo script plano para menú, tema, encabezado y "Ir a la app", y el panel de
acceso (React) se importa recién cuando se abre. El panel inicia sesión o registra contra el API
(`api.cuadra.cl`) y redirige a `app.cuadra.cl` con la ruta de retorno; las cookies `httpOnly`
`SameSite=Lax` de siempre hacen el traspaso porque los tres orígenes son el mismo sitio. Lo
compartido pasa a tres paquetes de fuente (`@finance/ui`, `@finance/client`, `@finance/i18n`). El
API acepta varios orígenes y un `rpId` de dominio padre para las llaves de acceso, y el registro
guarda el idioma de la página. La app queda no indexable y redirige todo acceso sin sesión a la
landing. Detalle de cada decisión: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 6 (Node 20) — mismo toolchain del monorepo.

**Primary Dependencies**: nuevas en `apps/landing`: **Astro** (última estable al implementar),
**`@astrojs/react`**, **`@astrojs/sitemap`**; dev: **`@resvg/resvg-js`** (genera la imagen de vista
previa una vez). Reutiliza React 19, react-i18next, Tailwind 3.4, Radix Dialog, lucide-react.
API: sin dependencias nuevas (`@simplewebauthn/server` ya acepta `expectedOrigin: string[]`).

**Storage**: sin cambios de esquema. Solo el contrato de registro gana `locale` opcional.

**Testing**: Vitest + Testing Library (landing, app, paquetes); Vitest unit/e2e en API; test de
build sobre `apps/landing/dist`.

**Target Platform**: navegadores modernos (sitio estático + SPA) y Node 20 (API).

**Project Type**: monorepo web: 3 apps (`api`, `web`, `landing`) + paquetes compartidos.

**Performance Goals**: portada sin abrir el panel ≤ 20 % del JS que descarga hoy (SC-002);
contenido visible < 2 s en móvil típico (SC-003).

**Constraints**: hosting estático para la landing (sin servidor); API, app y landing bajo el mismo
dominio registrable; ningún dato de sesión en la URL.

**Scale/Scope**: 5 páginas × 2 idiomas, 4 redirecciones antiguas, 1 raíz; ~15 archivos movidos a
paquetes; 7 componentes de acceso movidos a la landing.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio              | Estado         | Nota                                                                                                                                                                        |
| ---------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Money precision     | N/A            | No toca dinero.                                                                                                                                                             |
| II. Per-user isolation | ✅             | Sin datos nuevos; el API restringe orígenes con credenciales (FR-018).                                                                                                      |
| III. i18n parity       | ✅ (enmienda)  | Dos catálogos con paridad testeada: `@finance/i18n` (compartido) y `apps/landing` (`landing.*`). El texto del principio nombra rutas de `apps/web` → enmienda de redacción. |
| IV. TDD                | ✅             | Tests primero por historia (R14).                                                                                                                                           |
| V. SDD + memoria       | ✅             | Este ciclo; constitución y CLAUDE.md se actualizan al cerrar.                                                                                                               |
| VI. Backend DDD+CQRS   | ✅             | Solo `user` (registro) e `infra/config`; sin dominio nuevo.                                                                                                                 |
| VII. Idempotencia      | ✅             | Sin endpoints de escritura nuevos; `POST /auth/register` gana un campo opcional, mecanismo sin cambio.                                                                      |
| VIII. Identificadores  | ✅             | Sin entidades nuevas.                                                                                                                                                       |
| Monorepo / boundaries  | ✅ (enmienda)  | Se agrega una app y tres paquetes; `check:boundaries` gana reglas `landing ↛ web/api` y `web ↛ landing`.                                                                    |
| Domain-first           | ✅             | `apps/landing/src/domains/{landing,auth}`; `src/pages` es el ruteo de Astro.                                                                                                |
| Breakpoint stages      | ✅             | `breakpoints.ts` pasa a `@finance/ui` como única fuente para ambas apps.                                                                                                    |
| One overlay family     | ⚠️ justificado | Panel de acceso sigue en `SidePanel`; el menú del teléfono de la landing es `<dialog>` nativo (ver Complexity Tracking).                                                    |
| Librerías aprobadas    | ✅ (enmienda)  | Astro, `@astrojs/react`, `@astrojs/sitemap`, `@resvg/resvg-js` (dev) se registran.                                                                                          |

**Data gates:**

- [x] Toda entidad nueva declara formato de identificador — no hay entidades nuevas.
- [x] Todo endpoint de escritura nuevo declara su forma de idempotencia — no hay endpoints nuevos.
- [x] Toda FK aceptada desde el cuerpo declara dónde se verifica su ownership — no hay FKs nuevas.

**Post-design re-check**: sin cambios respecto de arriba.

## Project Structure

### Documentation (this feature)

```text
specs/031-separate-landing/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── routes.md          # direcciones públicas, redirecciones, parámetros de acceso, retorno
│   ├── api-config.md      # CORS_ORIGIN (lista), PASSKEY_RP_ID, registro con locale
│   └── page-metadata.md   # metadatos por página, hreflang, OG, sitemap, noindex de la app
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
apps/landing/                         # NUEVA — Astro estático (cuadra.cl)
├── astro.config.mjs                  # react(), sitemap(i18n), site = PUBLIC_SITE_URL
├── tailwind.config.ts                # presets: [@finance/ui/tailwind-preset]
├── public/{robots.txt, favicon.svg, og/cuadra-{es,en}.png}
├── scripts/og.mjs                    # genera las imágenes OG (resvg)
├── src/
│   ├── layouts/PageLayout.astro      # <head>: meta, hreflang, OG, pre-pintado de tema; header/footer
│   ├── pages/
│   │   ├── index.astro               # raíz → /es/ o /en/ (R2)
│   │   ├── precios.astro, nosotros.astro, privacidad.astro, preguntas.astro   # redirecciones
│   │   ├── 404.astro
│   │   └── [lang]/{index,about,privacy,pricing,faq}.astro
│   ├── domains/
│   │   ├── landing/                  # movido de apps/web: components/, illustrations/, lib/
│   │   │   ├── components/Header.astro, Footer.astro, MobileMenu.astro, ThemeSwitch.astro
│   │   │   └── scripts/{header,session,access}.ts   # script plano (R7, R8)
│   │   └── auth/                     # movido de apps/web: LoginForm, RegisterForm, AuthPanel…
│   │       └── mountAccessPanel.tsx  # entrada que se importa bajo demanda
│   ├── i18n/{es,en}.json, parity.test.ts, index.ts   # landing.* (incluye landing.meta.*)
│   └── lib/{config.ts, returnTo.ts}
└── test/build.test.ts                # verifica dist/ (R14)

apps/web/                             # la app (app.cuadra.cl)
├── index.html                        # + robots noindex, − og:*
└── src/
    ├── app/{router.tsx, HomeRoute.tsx, NotFoundRoute.tsx, lazyPages.ts}   # sin landing
    ├── domains/landing/              # ELIMINADO (movido)
    ├── domains/auth/                 # queda useAuth, RequireAuth (redirige a landing), AuthRedirectRoute
    ├── shared/                       # sin los archivos movidos a @finance/ui / @finance/client
    └── lib/landingUrl.ts             # landingAccessUrl(mode, returnTo)

packages/ui/                          # NUEVO — @finance/ui (fuente)
├── src/{styles/tokens.css, tailwind-preset.ts, breakpoints.ts, cn.ts, useMediaQuery.ts}
├── src/theme/{ThemeProvider.tsx, useTheme.ts, prePaint.ts}
└── src/components/{button, button-classes, brand-mark, app-splash, theme-segmented, field, input, label, form/…, overlay/…}

packages/client/                      # NUEVO — @finance/client (fuente)
└── src/{apiClient.ts, webauthn.ts, authApi.ts, passkeyApi.ts, config.ts}

packages/i18n/                        # NUEVO — @finance/i18n (fuente)
└── src/{es.json, en.json, index.ts (createI18n), parity.test.ts}

apps/api/src/
├── main.ts                           # enableCors({ origin: allowedOrigins })
├── infra/config/origins.config.ts    # NUEVO: parse/validate CORS_ORIGIN, rpId
├── infra/config/passkey.config.ts    # expectedOrigin = string[]; rpId = PASSKEY_RP_ID
└── domains/user/application/commands/register.handler.ts   # locale inicial

packages/contracts/src/auth/index.ts  # registerRequestSchema.locale opcional
scripts/check-boundaries.mjs          # + reglas landing/web
```

**Structure Decision**: monorepo existente + `apps/landing` y tres paquetes de fuente. La landing
conserva domain-first (`src/domains/{landing,auth}`) y usa `src/pages` como ruteo propio de Astro.

## Fases de implementación (orden)

1. **Paquetes** (sin cambio visible): crear `@finance/ui`, `@finance/client`, `@finance/i18n`; mover
   archivos desde `apps/web` y actualizar imports de la app (codemod). La app sigue igual; sus tests,
   typecheck y build pasan antes de seguir.
2. **API**: orígenes múltiples, `rpId`, `locale` en registro (TDD).
3. **Landing** (US1): app Astro, páginas, metadatos, redirecciones, sitemap, OG, encabezado con
   script plano. Test de build.
4. **Acceso en la landing** (US2, US3, US6): mover formularios y panel, montaje bajo demanda,
   redirección a la app, `locale` al registrar.
5. **App** (US4): quitar landing, redirecciones a la landing, `noindex`, cerrar sesión.
6. **"Ir a la app"** (US5).
7. **Cierre**: medición SC-002, docs (`PENDING.md`: 301 en hosting), constitución + CLAUDE.md.

## Complexity Tracking

| Violation                                                                                            | Why Needed                                                                                                   | Simpler Alternative Rejected Because                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menú del teléfono de la landing como `<dialog>` nativo en vez del `Window` de la familia de overlays | Abre al cargar cualquier página; usar `Window` exige React + Radix en todas las visitas, lo que anula SC-002 | Hidratar React al cargar (≈60 KB gzip extra en cada visita) contradice el objetivo de la feature; el panel de acceso, que sí es React, conserva `SidePanel` |
| Tercera app en el monorepo                                                                           | El sitio público necesita build estático y despliegue propio                                                 | Prerender dentro de la SPA mantiene la landing atada al runtime y al build de la app (research R1)                                                          |
