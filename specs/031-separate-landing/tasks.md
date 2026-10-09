---
description: "Task list for 031 — separar el sitio público de la aplicación"
---

# Tasks: Separar el sitio público de la aplicación

**Input**: Design documents from `specs/031-separate-landing/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluidos — la constitución (Principio IV, TDD) los exige. Cada test se escribe ANTES de
su implementación y debe fallar primero.

**Organization**: por historia de usuario. Los paquetes compartidos y los orígenes del API son
fundacionales porque todas las historias de acceso dependen de ellos.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1…US6 según spec.md

## Path Conventions

Monorepo: `apps/landing/` (nuevo, Astro), `apps/web/` (la app), `apps/api/` (NestJS),
`packages/{ui,client,i18n}/` (nuevos, solo fuente), `packages/contracts/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: esqueletos de los proyectos nuevos y reglas del monorepo. Ningún comportamiento cambia.

- [x] T001 [P] Crear `packages/ui` como paquete de fuente: `package.json` (`name: "@finance/ui"`, `type: "module"`, `exports` → `./src/*` para `.ts/.tsx/.css`, scripts `test`/`typecheck`/`lint`, peerDependencies `react`, `react-dom`, `react-i18next`, `lucide-react`, `@radix-ui/react-dialog`, `tailwindcss`), `tsconfig.json` extendiendo `@finance/config`, `vitest.config.ts` (jsdom) y `src/index.ts` vacío
- [x] T002 [P] Crear `packages/client` (`@finance/client`) con la misma forma que T001 (sin dependencias de UI; `@finance/contracts` como dependencia) y `src/config.ts` exportando `configureClient({ baseUrl })` / `getBaseUrl()` que lanza si no se configuró
- [x] T003 [P] Crear `packages/i18n` (`@finance/i18n`) con la misma forma (dependencias `i18next`, `react-i18next`) y `src/index.ts` vacío
- [x] T004 Crear `apps/landing` (`@finance/landing`): `package.json` con `astro`, `@astrojs/react`, `@astrojs/sitemap`, `react`, `react-dom`, `react-i18next`, `i18next`, `@finance/{ui,client,i18n,contracts}`, devDeps `@resvg/resvg-js`, `@astrojs/check`, `vitest`, `jsdom`, `@testing-library/react`, `tailwindcss@3`, `autoprefixer`, `postcss`, `typescript`; scripts `dev` (`astro dev --port 4321`), `build` (`astro build`), `preview`, `test` (`vitest run`), `test:build` (`vitest run --config vitest.build.config.ts`), `typecheck` (`astro check`), `lint`; `astro.config.mjs` (`output: "static"`, `site: process.env.PUBLIC_SITE_URL`, `integrations: [react(), sitemap()]`), `tailwind.config.ts`, `postcss.config.cjs`, `tsconfig.json`, `vitest.config.ts`, `vitest.build.config.ts`, `.env.example` (`PUBLIC_API_URL`, `PUBLIC_APP_URL`, `PUBLIC_SITE_URL`) y `src/pages/es/index.astro` mínima para comprobar que `pnpm --filter @finance/landing build` funciona
- [x] T005 Enmendar YA `.specify/memory/constitution.md` (antes de mover nada, resuelve C1): Principio III con los catálogos en `packages/i18n/src/{es,en}.json` (compartido) y `apps/landing/src/i18n/{es,en}.json` (`landing.*`), cada uno con su test de paridad; "Target architecture" y "One-way dependencies" con `apps/landing` y `packages/{ui,client,i18n}`; bump MINOR + Sync Impact Report. Luego agregar reglas a `scripts/check-boundaries.mjs`: `apps/landing/src` no puede importar `@finance/(web|api)` ni `apps/`; `apps/web/src` no puede importar `@finance/landing` ni `apps/landing`; incluir `.astro` en las extensiones recorridas para `apps/landing`
- [x] T006 [P] Agregar `VITE_LANDING_URL=http://localhost:4321` a `apps/web/.env.example` y cambiar `CORS_ORIGIN` en `apps/api/.env.example` a `"http://localhost:4321,http://localhost:5173"` con un comentario que explique la lista y `PASSKEY_RP_ID` opcional; declarar `PUBLIC_API_URL`, `PUBLIC_APP_URL`, `PUBLIC_SITE_URL`, `VITE_LANDING_URL` en `turbo.json` (`build.env`)
- [ ] T007 `pnpm install` y verificar que `pnpm dev` levanta landing (:4321), web (:5173) y api (:3001)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: mover lo compartido a paquetes sin cambiar nada visible en la app, y que el API acepte
varios orígenes. **⚠️ Ninguna historia empieza antes de terminar esta fase.**

### Diseño y tema → `@finance/ui`

- [x] T008 Mover a `packages/ui/src/styles/tokens.css` los bloques de tokens (`:root`, `[data-theme="light"]`, `@media (prefers-color-scheme…)`) de `apps/web/src/styles/index.css`, dejando en la app un `@import "@finance/ui/styles/tokens.css";` y su CSS propio (utilidades `.reveal`, `.ridge-draw`, `scrollbar-gutter`, etc. que use solo la app o la landing se reparten según quién las use)
- [x] T009 Mover el `theme.extend`, `darkMode`, `future` y plugins de `apps/web/tailwind.config.ts` a `packages/ui/src/tailwind-preset.ts`; `apps/web/tailwind.config.ts` queda con `presets: [preset]` y `content` que incluya `../../packages/ui/src/**/*.{ts,tsx}`
- [x] T010 Mover `apps/web/breakpoints.ts` a `packages/ui/src/breakpoints.ts` (re-exportado), y `shared/lib/cn.ts`, `shared/lib/useMediaQuery.ts`, `theme/ThemeProvider.tsx`, `theme/useTheme.ts` (+ `ThemeProvider.test.tsx`) a `packages/ui/src/`; extraer el script de pre-pintado de `apps/web/index.html` a `packages/ui/src/theme/prePaint.ts` (string exportado) y usarlo desde un plugin `transformIndexHtml` en `apps/web/vite.config.ts`
- [x] T011 Mover a `packages/ui/src/components/` la clausura transitiva (todo lo que importan, salvo lo ya movido) de: `shared/ui/button.tsx`, `button-classes.ts`, `brand-mark.tsx`, `app-splash.tsx`, `theme-segmented.tsx`, `theme-toggle.tsx`, `form/FormNotice.tsx`, `form/FormSelectField.tsx`, `form/FormTextField.tsx`, `overlay/*` — con sus tests (`theme-segmented.test.tsx`, los casos de `ui.test.tsx` que les correspondan); exportarlos desde `packages/ui/src/index.ts`
- [x] T012 Codemod en `apps/web/src`: reemplazar cada import relativo a un archivo movido en T010–T011 por `@finance/ui` (o su subruta), y agregar `@finance/ui` a `apps/web/package.json`
- [x] T013 Configurar `apps/web/vite.config.ts` y `vitest.config.ts` para que resuelvan los paquetes de fuente (condición `source`/alias si hace falta) y correr `pnpm --filter @finance/ui test`

### Cliente HTTP → `@finance/client`

- [x] T014 Mover `apps/web/src/shared/lib/apiClient.ts` (+ tests), `shared/lib/webauthn.ts`, `domains/auth/api/authApi.ts` y `domains/auth/api/passkeyApi.ts` a `packages/client/src/`, reemplazando la lectura de `import.meta.env.VITE_API_URL` por `getBaseUrl()`; exportar desde `src/index.ts`
- [x] T015 En `apps/web/src/main.tsx` llamar `configureClient({ baseUrl: import.meta.env.VITE_API_URL })` antes de montar; codemod de imports en `apps/web/src` a `@finance/client`; setup de tests de la app configura el cliente

### Textos → `@finance/i18n` y catálogo de la landing

- [x] T016 Mover `apps/web/src/i18n/{es,en}.json` **completos** (incluidas las `landing.*`, que la landing vieja de la app usa hasta T057) a `packages/i18n/src/{es,en}.json`, y `parity.test.ts` a `packages/i18n/src/`; exportar `createI18n(lang, extraResources?)` y los catálogos desde `packages/i18n/src/index.ts`; `apps/web/src/i18n/index.ts` pasa a usar `createI18n`
- [x] T017 **Copiar** las claves `landing.*` (es/en) a `apps/landing/src/i18n/{es,en}.json` con su propio `parity.test.ts` (T057 las borra de `@finance/i18n` en el corte)

### Verificación de la fase de paquetes

- [x] T018 Correr `pnpm check:boundaries`, `pnpm --filter @finance/web typecheck`, `pnpm --filter @finance/web test`, `pnpm --filter @finance/web build` y los tests de los tres paquetes: todo verde y la app sin cambios visibles

### API: varios orígenes (TDD)

- [x] T019 [P] Test unitario en `apps/api/test/unit/infra/config/origins.config.spec.ts`: parsea `"a,b"` a arreglo, acepta el valor único de hoy, recorta espacios, rechaza URL con path/barra final/no-http, `rpId` por defecto = hostname del primer origen, `PASSKEY_RP_ID` explícito gana, y falla si algún origen no es el `rpId` ni subdominio de él (casos `cuadra.cl` + `app.cuadra.cl` ✓, `otro.cl` ✗, `localhost:4321` + `localhost:5173` ✓); más un e2e `apps/api/test/e2e/infra/cors.http.spec.ts`: un preflight/GET con `Origin` listado recibe `Access-Control-Allow-Origin` igual al origen y `Access-Control-Allow-Credentials: true`; con `Origin: https://evil.example` no recibe `Access-Control-Allow-Origin` (FR-018)
- [x] T020 Implementar `apps/api/src/infra/config/origins.config.ts` (`getAllowedOrigins(config)`, `getPasskeyRpId(config)`, validación que lanza al arrancar) y usarlo en `apps/api/src/main.ts` (`enableCors({ origin: getAllowedOrigins(config), credentials: true })`)

**Checkpoint**: paquetes listos, la app idéntica, el API acepta landing y app.

---

## Phase 3: User Story 1 - El sitio público se encuentra y se comparte bien (Priority: P1) 🎯 MVP

**Goal**: las 5 páginas × 2 idiomas como HTML estático con contenido y metadatos propios, sin React
al cargar; raíz y direcciones antiguas que redirigen.

**Independent Test**: `pnpm --filter @finance/landing build && pnpm --filter @finance/landing test:build`; quickstart escenarios 1–5.

### Tests for User Story 1 ⚠️

- [x] T021 [P] [US1] Test de build `apps/landing/test/build.test.ts` (corre sobre `dist/`): para cada una de las 10 páginas verifica `<html lang>`, `<title>` y `description` presentes y únicos entre todas, `canonical`, `hreflang` es/en/x-default, `og:image`, `og:locale`, que el `<h1>` esperado está en el HTML, que ningún `<script>`/`<link>` referencia React ni chunks de `apps/web`, y que existe el `<noscript>` que avisa que el panel de acceso requiere JavaScript; también que `dist/robots.txt` y `dist/sitemap-index.xml` existen y que el sitemap lista las 10 páginas
- [x] T022 [P] [US1] Tests unitarios en `apps/landing/src/lib/language.test.ts`: `pickLanguage(["en-US","es"]) === "en"`, `pickLanguage(["es-CL"]) === "es"`, `pickLanguage([]) === "es"`; y `legacyTarget("/precios") === "/es/pricing"` (más los otros tres)

### Implementation for User Story 1

- [x] T023 [P] [US1] Agregar `landing.meta.{home,about,privacy,pricing,faq}.{title,description}` y `landing.nav.*` faltantes a `apps/landing/src/i18n/{es,en}.json` (contenido actual de las páginas; títulos únicos según `contracts/page-metadata.md`)
- [x] T024 [US1] `apps/landing/src/i18n/index.ts`: `getI18n(lang)` que crea una instancia con `@finance/i18n` + catálogo de la landing y `I18nRoot` (React) que la provee, para renderizar componentes React en build; `apps/landing/src/lib/language.ts` (`LANGS`, `pickLanguage`, `legacyTarget`, `pagePath(lang, slug)`)
- [x] T025 [US1] **Copiar** (los originales siguen en la app hasta T057) `apps/web/src/domains/landing/{components,lib}` (HomeSections, HeroRidge, bits, illustrations, ridgeGeometry) a `apps/landing/src/domains/landing/` y adaptarlos: `Link` de react-router → `<a href={pagePath(lang, …)}>`, `useOpenAuth()` → enlaces `href="?acceso=registro"` con `data-access="registro"` (ídem login), sin `useNavigationType`/`useLocation`; las rutas de página (`AboutRoute`, `PrivacyRoute`, `PricingRoute`, `FaqRoute`, `LandingHomeRoute`) pasan a componentes de contenido sin layout (`AboutPage`, …) que reciben `lang`
- [x] T026 [US1] `apps/landing/src/layouts/PageLayout.astro`: `<head>` según `contracts/page-metadata.md` (title, description, canonical, hreflang, og:*, twitter, theme-color), script de pre-pintado de `@finance/ui/theme/prePaint`, fuentes Geist, `tokens.css`; cuerpo con enlace de salto a `#landing-main`, `Header.astro`, `<main id="landing-main">`, `Footer.astro`, contenedor `#access-root` vacío
- [x] T027 [US1] Componentes Astro en `apps/landing/src/domains/landing/components/`: `Header.astro` (tres formas de hoy: teléfono con botón de menú, `sm`–`lg` nav en fila desplazable, `lg+` una fila; marca; acciones de acceso con `data-access` en un contenedor `[data-access-slot]`; enlace al otro idioma), `MobileMenu.astro` (`<dialog>` nativo a pantalla completa con secciones, `ThemeSwitch` y acciones), `ThemeSwitch.astro` (Claro/Oscuro/Sistema, 44px), `Footer.astro` (eslogan + enlaces privacidad/precios/preguntas del idioma), y un `<noscript>` en `Header.astro` con el aviso `landing.access.noscript` (es/en) de que iniciar sesión requiere JavaScript; script `apps/landing/src/domains/landing/scripts/header.ts` (abre/cierra el `<dialog>`, aplica y guarda el tema en `localStorage` con la misma clave que la app, publica `--landing-header` con `ResizeObserver`)
- [x] T028 [US1] Páginas `apps/landing/src/pages/[lang]/{index,about,privacy,pricing,faq}.astro` con `getStaticPaths` sobre `LANGS`, cada una `PageLayout` + su componente de contenido envuelto en `I18nRoot` (render en build, sin `client:*`)
- [x] T029 [US1] `apps/landing/src/pages/index.astro` (raíz: `pickLanguage(navigator.languages)` → `location.replace("/"+lang+"/"+location.search+location.hash)`, `meta refresh` a `/es/`, hreflang x-default), páginas de redirección `precios.astro`, `nosotros.astro`, `privacidad.astro`, `preguntas.astro` (script que conserva search+hash, `meta refresh`, `canonical`) y `404.astro` con enlaces a ambas portadas
- [x] T030 [P] [US1] `apps/landing/scripts/og.mjs` (SVG con marca, eslogan y cordillera → PNG 1200×630 con `@resvg/resvg-js`) y generar `apps/landing/public/og/cuadra-{es,en}.png`; `public/favicon.svg` (copia del de la app), `public/robots.txt` según el contrato; configurar `sitemap()` con `i18n` y filtro que excluya raíz y redirecciones
- [ ] T031 [US1] Correr T021–T022 en verde; revisar en navegador las 10 páginas en claro/oscuro y teléfono/tablet/escritorio contra la landing actual — **automático en verde; navegador real NO verificado (sin herramienta de automatización)**

**Checkpoint**: sitio público completo y estático, sin panel de acceso todavía (los botones llevan a `?acceso=…` sin efecto).

---

## Phase 4: User Story 2 - Iniciar sesión desde el sitio público y llegar a la app (Priority: P1)

**Goal**: panel de acceso (contraseña, segundo factor, llave de acceso) que se carga al abrirse e
inicia sesión, luego redirige a la app con `volver`.

**Independent Test**: quickstart escenarios 6, 7 y 12.

### Tests for User Story 2 ⚠️

- [x] T032 [P] [US2] Tests de `packages/client/src/returnPath.test.ts`: `safeReturnPath("/accounts/1?tab=x#y")` se conserva; `"//evil.com"`, `"/\\evil.com"`, `"https://evil.com"`, `"javascript:…"`, `""`, `null`, rutas > 2048 → `"/"`; y `apps/landing/src/lib/returnTo.test.ts`: `appUrl("/x")` = `PUBLIC_APP_URL + "/x"` usando `safeReturnPath`
- [x] T033 [P] [US2] Mover `apps/web/src/domains/auth/components/LoginForm.test.tsx` a `apps/landing/src/domains/auth/components/` y adaptarlo: tras login/MFA/llave exitosos se llama `location.assign(appUrl(volver))` (mock), credenciales malas/bloqueo/red muestran los mismos errores y no redirigen; ninguna URL usada contiene token
- [x] T034 [P] [US2] Test `apps/landing/src/domains/landing/scripts/access.test.ts`: un clic en `[data-access="login"]` hace `import()` del panel y lo abre en login (sin navegar); con `?acceso=registro` en la URL se abre al cargar; sin interacción ni parámetro, el módulo del panel no se importa

### Implementation for User Story 2

- [x] T035 [US2] `apps/landing/src/lib/config.ts` (lee `PUBLIC_API_URL`, `PUBLIC_APP_URL`, `PUBLIC_SITE_URL`, falla en build si faltan) , `packages/client/src/returnPath.ts` (`safeReturnPath`, ÚNICA regla de ruta de retorno, usada por la landing y por la app) y `apps/landing/src/lib/returnTo.ts` (`appUrl`)
- [x] T036 [US2] **Copiar y adaptar** (los originales siguen en la app hasta T057) `AuthPanel.tsx`, `LoginForm.tsx`, `UnderlineField.tsx`, `CheckCard.tsx`, `lib/validation.ts` (+ tests) y lo usado de `lib/authRedirect.ts` desde `apps/web/src/domains/auth` a `apps/landing/src/domains/auth/`; `LoginForm` llama directo a `authApi`/`passkeyApi` de `@finance/client` (no a `useAuth`) y, al terminar, `location.assign(appUrl(safeReturnPath(volver)))`
- [x] T037 [US2] `apps/landing/src/domains/auth/mountAccessPanel.tsx`: `configureClient({ baseUrl: PUBLIC_API_URL })`, monta en `#access-root` un `I18nRoot` + `ThemeProvider` + `AuthPanel`, sincroniza `?acceso=`/`volver` con `history.replaceState`, y expone `open(mode)`
- [x] T038 [US2] `apps/landing/src/domains/landing/scripts/access.ts` (incluido desde `PageLayout.astro`): delega clics en `[data-access]` → `import("../../auth/mountAccessPanel")` y `open(mode)`; si la URL trae `acceso=login|registro`, lo importa al cargar
- [ ] T039 [US2] Correr T032–T034 en verde y probar en navegador login con contraseña, con segundo factor y con llave de acceso (con y sin RUT, y la sugerencia automática) contra el API local — **automático en verde; navegador real NO verificado (sin herramienta de automatización)**

**Checkpoint**: se puede entrar a la app desde el sitio público.

---

## Phase 5: User Story 3 - Crear cuenta desde el sitio público (Priority: P1)

**Goal**: registro adulto y con tutor desde el panel, con el idioma de la página guardado en la cuenta.

**Independent Test**: quickstart escenario 9 y registro con tutor.

### Tests for User Story 3 ⚠️

- [x] T040 [P] [US3] Test en `packages/contracts/src/auth/register.test.ts` (o el existente): `registerRequestSchema` acepta `locale: "en"`, acepta sin `locale`, rechaza `locale: "fr"`
- [x] T041 [P] [US3] E2E en `apps/api/test/e2e/domains/user/register-locale.http.spec.ts`: registrar con `locale: "en"` → `GET /auth/me` devuelve `locale: "en"`; sin `locale` → `"es"`
- [x] T042 [P] [US3] Mover `RegisterForm.test.tsx` a `apps/landing/src/domains/auth/components/` y extenderlo: envía `locale` igual al `lang` de la página; éxito → `location.assign(appUrl(volver))`; errores `IDENTIFIER_TAKEN`/`EMAIL_TAKEN` junto al campo como hoy; flujo de menor con tutor

### Implementation for User Story 3

- [x] T043 [US3] Agregar `locale: localeSchema.optional()` a `registerRequestSchema` en `packages/contracts/src/auth/index.ts` y reconstruir contracts
- [x] T044 [US3] Usar `command.locale ?? "es"` como idioma inicial en `apps/api/src/domains/user/application/commands/register.handler.ts` (y el comando/controlador que lo transporta) y en `User` al crear
- [x] T045 [US3] **Copiar y adaptar** (el original sigue en la app hasta T057) `RegisterForm.tsx` a `apps/landing/src/domains/auth/components/`, enviar `locale` (el `lang` de la página, recibido por `mountAccessPanel`) y redirigir a la app al terminar
- [ ] T046 [US3] Correr T040–T042 en verde; probar en navegador registro adulto y de menor con tutor desde `/es/` y `/en/` — **automático en verde; navegador real NO verificado (sin herramienta de automatización)**

**Checkpoint**: las tres historias P1 completas — sitio público funcional con acceso y registro.

---

## Phase 6: User Story 6 - Las llaves de acceso sirven en ambos lados (Priority: P2)

**Goal**: WebAuthn con `rpId` común y todos los orígenes aceptados.

**Independent Test**: quickstart escenario 8 y verificación de identidad en Perfil.

### Tests for User Story 6 ⚠️

- [x] T047 [P] [US6] Test unitario en `apps/api/test/unit/infra/config/passkey.config.spec.ts`: `getPasskeyExpectedOrigins` devuelve todos los orígenes de `CORS_ORIGIN`; `getPasskeyRpId` respeta `PASSKEY_RP_ID`
- [x] T048 [P] [US6] Ajustar los tests unitarios de `verify-passkey-login`, `confirm-passkey-registration` y `verify-step-up-passkey` (en `apps/api/test/unit/domains/user/…`) para esperar `expectedOrigin` como arreglo y `expectedRPID` desde la configuración

### Implementation for User Story 6

- [x] T049 [US6] Reescribir `apps/api/src/infra/config/passkey.config.ts` sobre `origins.config.ts`: `getPasskeyExpectedOrigins(config): string[]`, `getPasskeyRpId` re-exportado
- [x] T050 [US6] Actualizar `start-passkey-registration`, `confirm-passkey-registration`, `start-passkey-login`, `verify-passkey-login`, `start-step-up-passkey` y `verify-step-up-passkey` handlers en `apps/api/src/domains/user/application/commands/` para pasar el arreglo y el `rpId`
- [ ] T051 [US6] Correr la suite unit + e2e de passkeys del API; probar en navegador: registrar llave en la app (:5173), entrar con ella en la landing (:4321) y usarla en la verificación previa a cerrar otra sesión

---

## Phase 7: User Story 4 - Volver a donde iba (Priority: P2)

**Goal**: la app deja de tener páginas públicas y lleva todo acceso sin sesión a la landing con `volver`.

**Independent Test**: quickstart escenarios 10, 11, 15 y 16.

### Tests for User Story 4 ⚠️

- [x] T052 [P] [US4] Tests `apps/web/src/lib/landingUrl.test.ts`: `landingAccessUrl("login", "/accounts/1?tab=x")` = `VITE_LANDING_URL + "/?acceso=login&volver=%2Faccounts%2F1%3Ftab%3Dx"`; `volver` inválido se omite; `landingHomeUrl()`
- [x] T053 [P] [US4] Tests de la app en `apps/web/src/domains/auth/components/RequireAuth.test.tsx` y `apps/web/src/app/router.test.tsx`: sin sesión, una ruta protegida llama `location.replace(landingAccessUrl("login", ruta+query+hash))`; `/` sin sesión → acceso con `volver=/`, con sesión → Panel; `/login` y `/register` → panel correspondiente conservando `volver`; ruta inexistente sin sesión → acceso; con sesión → 404 de la app; cerrar sesión → `location.assign(landingHomeUrl())`; y `apps/web/src/app/indexHtml.test.ts` que lee `apps/web/index.html` y verifica `<meta name="robots" content="noindex, nofollow">` y la ausencia de `og:*` (FR-019)

### Implementation for User Story 4

- [x] T054 [US4] `apps/web/src/lib/landingUrl.ts` (`landingAccessUrl`, `landingHomeUrl`, lee `VITE_LANDING_URL`) usando `safeReturnPath` de `@finance/client` (T035), sin regla propia
- [x] T055 [US4] `apps/web/src/domains/auth/components/RequireAuth.tsx` redirige con `location.replace` a la landing (mostrando `AppSplash` mientras); `apps/web/src/domains/auth/routes/AuthRedirectRoute.tsx` redirige a la landing; `useAuth().logout` termina en `location.assign(landingHomeUrl())`
- [x] T056 [US4] `apps/web/src/app/HomeRoute.tsx` (sin variante de landing: Panel o redirección), `apps/web/src/app/NotFoundRoute.tsx` (sin `LandingLayout`; sin sesión redirige al acceso), `apps/web/src/app/router.tsx` y `lazyPages.ts` sin las rutas públicas (`/nosotros`, `/privacidad`, `/precios`, `/preguntas`) ni `LandingHomeRoute`
- [x] T057 [US4] Eliminar de la app lo que se movió y quedó sin uso: `apps/web/src/domains/landing/`, los componentes de acceso de `apps/web/src/domains/auth/components/` y `lib/authRedirect.ts`, `useOpenAuth`, y las claves `landing.*` de `packages/i18n/src/{es,en}.json` (ya viven en el catálogo de la landing); ninguna otra clave se borra (las `auth.*`, `errors.*`, `common.*` las usa el panel de la landing); `apps/web/index.html` con `<meta name="robots" content="noindex, nofollow">` y sin `og:*`
- [ ] T058 [US4] Correr T052–T053 y la suite completa de `apps/web`; probar en navegador los escenarios 10, 11, 15 y 16 del quickstart — **suite web 657/657 verde; navegador real NO verificado**

---

## Phase 8: User Story 5 - Con sesión iniciada, el sitio público ofrece "Ir a la app" (Priority: P3)

**Goal**: el encabezado cambia a "Ir a la app" si hay sesión, sin bloquear nunca la página.

**Independent Test**: quickstart escenarios 13 y 14.

### Tests for User Story 5 ⚠️

- [x] T059 [P] [US5] Test `apps/landing/src/domains/landing/scripts/session.test.ts`: `me` 200 → `[data-access-slot]` muestra "Ir a la app" con `href = PUBLIC_APP_URL`; 401 (incluido tras un `refresh` fallido), error de red o > 2 s → deja "Iniciar sesión / Crear cuenta"

### Implementation for User Story 5

- [x] T060 [US5] `apps/landing/src/domains/landing/scripts/session.ts` (usa `@finance/client` con `AbortSignal.timeout(2000)`) incluido desde `PageLayout.astro`; en `Header.astro` y `MobileMenu.astro` la versión "Ir a la app" va en un `<template>` del mismo ancho que la de acceso; claves `landing.nav.goToApp` es/en
- [ ] T061 [US5] Correr T059 en verde; probar en navegador con y sin sesión y con el API detenido — **automático en verde; navegador real NO verificado**

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T062 Medir SC-002: bytes de JS que descarga `/es/` sin abrir el panel (después) contra `/` de la SPA actual en `bf45415` (antes); y SC-003: LCP de las 5 páginas `/es/` con Lighthouse en perfil móvil (≤ 2 s) sobre `astro preview`; anotar todo en `specs/031-separate-landing/quickstart.md` — **SC-002 ≈ 0,9 %; SC-003 LCP 1,4–1,5 s (Lighthouse móvil sobre `astro preview`)**
- [x] T063 [P] Agregar a `docs/PENDING.md`: redirecciones HTTP reales (301 para direcciones antiguas, 302 por idioma en la raíz) a configurar en el hosting; API bajo el mismo dominio registrable; llaves de acceso de desarrollo con otro `rpId` deben registrarse de nuevo
- [x] T064 [P] Actualizar `.github/workflows/ci.yml`: build de `@finance/landing` (con `PUBLIC_*` de prueba) y `test:build`; incluir los paquetes nuevos en typecheck/test
- [x] T065 [P] Actualizar `docs/english/ARCHITECTURE.md` y `docs/spanish/ARCHITECTURE.md` con la tercera app, los tres paquetes y el traspaso de sesión
- [x] T066 Completar la enmienda de `.specify/memory/constitution.md` iniciada en T005: librerías aprobadas (Astro, `@astrojs/react`, `@astrojs/sitemap`, `@resvg/resvg-js` y `@astrojs/check` dev), variables de entorno (`CORS_ORIGIN` lista, `PASSKEY_RP_ID`, `VITE_LANDING_URL`, `PUBLIC_*`), excepción del `<dialog>` de la landing en "One overlay family", Sync Impact Report
- [x] T067 Actualizar `CLAUDE.md`: comandos (`pnpm --filter @finance/landing …`), arquitectura (landing, paquetes, traspaso de sesión, noindex), variables de entorno, enmienda del landing público (2026-09-23) marcada como superada por 031, plan actual = implementado
- [ ] T068 Verificación final: `pnpm check:boundaries`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm --filter @finance/landing test:build`, `pnpm format:check`, `pnpm audit --audit-level=high`; recorrer los 16 escenarios de `quickstart.md` — **hecho salvo: `pnpm test` del API acotado a unit + e2e tocados (integración/e2e completos requieren la BD), `format:check` falla solo por archivos preexistentes ajenos (`.agents/`, `.aider-desk/`, 2 specs del API con CRLF) y los 16 escenarios en navegador no se recorrieron**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup; bloquea todas las historias. T008–T018 en orden (cada movimiento compila antes del siguiente); T019–T020 (API) en paralelo con los movimientos de paquetes.
- **US1 (Phase 3)**: depende de Foundational.
- **US2 (Phase 4)**: depende de US1 (necesita `PageLayout`, encabezado y `#access-root`).
- **US3 (Phase 5)**: depende de US2 (comparte el panel).
- **US6 (Phase 6)**: depende de Foundational (T020); se puede hacer en paralelo con US1–US3, y se prueba de punta a punta después de US2.
- **US4 (Phase 7)**: depende de US2 (la app no puede mandar a la landing hasta que la landing tenga acceso).
- **US5 (Phase 8)**: depende de US1.
- **Polish (Phase 9)**: al final.

### Within Each User Story

- Tests primero y fallando → implementación → tests en verde → prueba en navegador.

### Parallel Opportunities

- T001, T002, T003 en paralelo; T006 en paralelo con T004–T005.
- T019 (test API) en paralelo con cualquier tarea de paquetes.
- En US1: T021, T022, T023 y T030 en paralelo.
- En US2: T032, T033, T034 en paralelo.
- En US3: T040, T041, T042 en paralelo.
- US6 completa en paralelo con US1–US3 (otro desarrollador o en otro momento).
- En Polish: T063, T064, T065 en paralelo.

---

## Parallel Example: User Story 1

```bash
Task: "T021 [US1] Test de build en apps/landing/test/build.test.ts"
Task: "T022 [US1] Tests de pickLanguage/legacyTarget en apps/landing/src/lib/language.test.ts"
Task: "T023 [US1] landing.meta.* es/en en apps/landing/src/i18n/{es,en}.json"
Task: "T030 [US1] Imágenes OG, favicon, robots y sitemap"
```

---

## Implementation Strategy

### MVP First

1. Setup + Foundational (la app queda idéntica, sobre paquetes).
2. US1: sitio público estático y publicable aunque el acceso todavía viva en la app.
3. **Validar**: test de build + revisión visual.

### Incremental Delivery

1. US1 → sitio público con SEO.
2. US2 + US3 → acceso y registro en el sitio público.
3. US6 → llaves en ambos lados.
4. US4 → la app deja de tener landing y manda a la nueva.
5. US5 → "Ir a la app".
6. Polish → medición, docs, constitución, CLAUDE.md.

Hasta US4, la landing nueva y la vieja (dentro de la app) conviven; el corte es T056–T057.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Hacer commit al cerrar cada fase.
- Los movimientos a paquetes (T010–T016) usan `git mv` para conservar historia. La landing y el acceso (T025, T036, T045) se COPIAN: la app los sigue usando hasta el corte (T056–T057), que borra los originales.
