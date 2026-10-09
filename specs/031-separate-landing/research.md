# Research: Separar el sitio público de la aplicación (031)

Decisiones técnicas que resuelven el "cómo" de la spec. Cada una con su motivo y las alternativas
descartadas. Estado del código al empezar (rama 030, commit `bf45415`): `apps/web` es una SPA Vite +
React 19 que sirve la landing (`domains/landing`, 5 páginas, `LandingLayout`, ilustraciones SVG en
React) y el acceso (`domains/auth`: `AuthPanel` sobre `SidePanel`, `LoginForm`, `RegisterForm`,
`UnderlineField`, `CheckCard`, `authRedirect`, `validation`), con carga diferida por ruta ya hecha
(entrada 538 KB min). El API (NestJS) acepta UN origen (`CORS_ORIGIN`) y deriva de él el
`expectedOrigin`/`rpId` de WebAuthn (`infra/config/passkey.config.ts`).

## R1 — Generador del sitio público: Astro estático

- **Decision**: nueva app `apps/landing` con **Astro** en modo estático (`output: "static"`), con la
  integración `@astrojs/react` usada **solo para renderizar en build** los componentes React actuales
  de la landing (secciones, ilustraciones, `HeroRidge`) y para el panel de acceso, que se hidrata
  bajo demanda (R7). Sin adaptador de servidor: el resultado es una carpeta de HTML/CSS/JS publicable
  en cualquier hosting estático.
- **Rationale**: entrega HTML completo por página (FR-002) y metadatos por página (FR-003) sin
  servidor; "cero JS por defecto" hace que el sitio no cargue React salvo donde se pide (FR-006,
  SC-002); reutiliza los componentes React existentes renderizándolos a HTML en build, en vez de
  reescribir el contenido.
- **Alternatives considered**: (a) prerender dentro de la misma SPA (vite-ssg / react-router
  `prerender`): resuelve el HTML pero la landing seguiría atada al build y al runtime de la app, y
  cada página hidrataría React entero; (b) Next.js con `output: export`: más pesado, hidrata todo por
  defecto, segundo framework React-céntrico sin ganancia; (c) reescribir todo en `.astro` sin React:
  descartado por duplicar 5 páginas y 4 ilustraciones que ya existen.

## R2 — Direcciones e idioma

- **Decision** (de la clarificación): rutas `/{lang}/…` con `lang ∈ {es, en}` y slugs en inglés
  (`/es/`, `/es/about`, `/es/privacy`, `/es/pricing`, `/es/faq`, ídem `/en/…`), generadas desde
  `src/pages/[lang]/…` con `getStaticPaths`. La **raíz `/`** es una página estática que redirige con
  `location.replace` según `navigator.languages` (inglés si el primero preferido empieza por `en`,
  si no español), con `<meta http-equiv="refresh">` a `/es/` para clientes sin JS, conservando la
  query (`?acceso=…&volver=…`). Las **direcciones antiguas** (`/precios`, `/nosotros`, `/privacidad`,
  `/preguntas`) son páginas de redirección que hacen `location.replace(destino + search + hash)` (así
  `#faq-minors` sobrevive) más `meta refresh` + `<link rel="canonical">` al destino. Cada página
  declara `hreflang` es/en y `x-default` = `/`.
- **Rationale**: un hosting estático no puede leer `Accept-Language` ni emitir 301 por sí mismo; las
  páginas de redirección funcionan en cualquiera y el `canonical` le dice a Google cuál es la buena.
  Una redirección HTTP 301 real se configura en el hosting (fuera de alcance) y queda anotada en
  `docs/PENDING.md` y en `contracts/routes.md`.
- **Alternatives considered**: `redirects` de Astro (pierde el `#ancla` en estático); español en la
  raíz sin prefijo (descartado en clarify).

## R3 — Código compartido: tres paquetes de fuente

- **Decision**: tres paquetes nuevos, **solo fuente** (sus `exports` apuntan a `src/*.ts(x)`; los
  compilan Vite y Astro, que ya entienden TS/TSX), como `@finance/config` hoy:
  1. **`@finance/ui`** (`packages/ui`): el design system. `styles/tokens.css` (los tokens `:root` /
     `[data-theme]` que hoy están en `apps/web/src/styles/index.css`), `tailwind-preset.ts` (el
     `theme.extend`, `darkMode`, `future`, plugins), `breakpoints.ts` (movido desde `apps/web`),
     `cn`, `useMediaQuery`, el tema (`ThemeProvider`/`useTheme`/script de pre-pintado) y los
     primitivos que el panel de acceso y la landing usan: `button` + `button-classes`, `brand-mark`,
     `overlay/` completo, los campos de formulario que usan los formularios de acceso (`field`,
     `input`, `label`, `FormTextField` y lo que importe), `theme-segmented`, `app-splash`. Lo que
     solo usa la app se queda en `apps/web/src/shared`.
  2. **`@finance/client`** (`packages/client`): el cliente HTTP (`apiClient` con su renovación de
     sesión ante 401, `ApiRequestError`), los ayudantes WebAuthn (`webauthn.ts`) y las llamadas de
     acceso (`authApi`, `passkeyApi`), con la URL base inyectada por cada app
     (`configureClient({ baseUrl })`) en vez de leer `import.meta.env.VITE_API_URL` dentro.
  3. **`@finance/i18n`** (`packages/i18n`): los catálogos es/en compartidos (todo lo que hoy está en
     `apps/web/src/i18n/{es,en}.json` **menos** `landing.*`) + `createI18n(lang, extra?)` + el test
     de paridad. Las claves `landing.*` pasan al catálogo propio de `apps/landing` (con su propio
     test de paridad), así la app deja de cargar los textos de la landing.
- **Rationale**: FR-008 exige una sola fuente de colores, tipografía y textos; `check:boundaries`
  prohíbe que una app importe de otra. Paquetes de fuente evitan un paso de build y mantienen el HMR.
  Separar `ui` (sin red) de `client` (red) evita que la landing arrastre el cliente HTTP a páginas
  que no lo usan.
- **Alternatives considered**: mover todo `apps/web/src/shared` a un paquete (mueve ~40 archivos que
  la landing no necesita); un solo paquete `ui` con red incluida; duplicar los tokens en la landing
  (viola FR-008).

## R4 — Dónde vive cada pieza de acceso

- **Decision**: `LoginForm`, `RegisterForm`, `AuthPanel`, `UnderlineField`, `CheckCard`,
  `validation`, `authRedirect` y sus tests **se mueven a `apps/landing/src/domains/auth/`** (la
  landing pasa a ser el único lugar donde se inicia sesión o se crea cuenta). La app conserva
  `useAuth` (sesión, `me`, cerrar sesión), `RequireAuth`, la gestión de llaves de acceso en Perfil y
  el paso de verificación de identidad, consumiendo `@finance/client`.
- **Rationale**: lo que solo usa una app vive en esa app; solo lo usado por ambas va a paquetes.
- **Alternatives considered**: un paquete `@finance/auth-ui` (sin segundo consumidor, sería
  indirección sin beneficio).

## R5 — Traspaso de sesión del sitio a la app

- **Decision**: no cambia el mecanismo. El panel llama a `api.<dominio>/auth/login` (o `register`,
  `mfa-verify`, `passkey-verify`) con `credentials: "include"`; el API emite sus cookies `httpOnly`
  `SameSite=Lax` (host-only del API, como hoy); la landing hace
  `location.assign(APP_URL + returnTo)`. La app, al cargar, pide `GET /auth/me` y el navegador envía
  las cookies. `returnTo` es solo una **ruta** de la app (empieza con `/`, no con `//`, sin esquema),
  validada por `safeReturnTo` en ambos lados; nunca una URL completa ni un token.
- **Rationale**: `cuadra.cl`, `app.cuadra.cl` y `api.cuadra.cl` comparten dominio registrable, son
  el mismo "sitio": las cookies `Lax` viajan en las peticiones con credenciales desde ambos orígenes.
  En local, `localhost` con distintos puertos también es el mismo sitio.
- **Alternatives considered**: token en la URL o en `postMessage` (filtra la sesión; viola FR-012);
  cookies con `Domain=.cuadra.cl` (innecesario: la cookie la usa el API, no la página).

## R6 — Orígenes permitidos y llaves de acceso

- **Decision**: `CORS_ORIGIN` pasa a aceptar una **lista separada por comas** (compatible con el
  valor único de hoy). Un helper nuevo `infra/config/origins.config.ts` la parsea y valida (URLs
  absolutas, sin barra final). `main.ts` pasa el arreglo a `enableCors`. WebAuthn: `expectedOrigin` =
  **ese arreglo** (`@simplewebauthn/server` acepta `string[]`); `rpId` = nueva variable opcional
  **`PASSKEY_RP_ID`**, por defecto el hostname del primer origen; al arrancar se valida que el host de
  cada origen sea igual al `rpId` o termine en `.${rpId}` (si no, falla el arranque: una llave no
  serviría en ese origen). Producción: `CORS_ORIGIN=https://cuadra.cl,https://app.cuadra.cl`,
  `PASSKEY_RP_ID=cuadra.cl`. Local: `http://localhost:4321,http://localhost:5173`, `rpId=localhost`.
- **Rationale**: FR-016/FR-018; una llave registrada con `rpId=cuadra.cl` vale en ambos subdominios.
- **Alternatives considered**: variables separadas `APP_ORIGIN`/`LANDING_ORIGIN` (dos fuentes que
  se desincronizan con CORS); `rpId` por subdominio (las llaves no servirían de un lado al otro).

## R7 — JavaScript del sitio público: script plano al cargar, React solo al abrir el panel

- **Decision**: lo que corre al cargar cualquier página pública es **script plano** de Astro
  (`<script>` empaquetado): menú del teléfono (un `<dialog>` nativo), selector de tema, alto del
  encabezado (`--landing-header`), comprobación de sesión (R8) y apertura del panel. Los botones que
  hoy usan `useOpenAuth` pasan a ser enlaces con `href="?acceso=login|registro"` +
  `data-access="login|registro"`; el script intercepta el clic y **recién ahí** hace
  `import()` del panel de acceso (React + `AuthPanel`), que se monta en un contenedor. Si la página
  se abre con `?acceso=…`, el panel se importa al cargar. Las secciones y las ilustraciones son React
  renderizado en build, **sin hidratar**.
- **Rationale**: SC-002 (≥80 % menos que hoy): sin React al cargar, la portada solo baja unos pocos KB
  de script; React (~60 KB gzip) se paga solo si se abre el panel.
- **Alternatives considered**: islas React `client:load` para el encabezado (cargaría React en todas
  las visitas); Preact (otro runtime y riesgo de incompatibilidad con Radix).
- **Note (constitución)**: el menú del teléfono es un `<dialog>` nativo, no el `Window` de la familia
  de overlays (que es React/Radix). Ver Complexity Tracking del plan.

## R8 — "Ir a la app" con sesión

- **Decision**: al cargar, el script del encabezado llama a `GET /api/v1/auth/me` con credenciales
  (vía `@finance/client`, que reintenta una vez tras `refresh` si responde 401), con **timeout de
  2 s**. 200 → reemplaza "Iniciar sesión / Crear cuenta" por "Ir a la app" (`APP_URL`). Cualquier
  otra cosa (401, red, timeout) → deja lo que ya estaba. El HTML estático trae siempre la versión sin
  sesión (sirve a buscadores y a quien no tiene sesión sin parpadeo); el cambio ocupa el mismo
  espacio para no mover el diseño.
- **Rationale**: FR-017 y su caso de error (la página nunca se bloquea).
- **Alternatives considered**: una cookie legible por JS que indique "hay sesión" (nueva superficie
  y se desincroniza al vencer la sesión).

## R9 — Tema e idioma entre sitios

- **Decision**: el mismo script de pre-pintado del tema (hoy en `apps/web/index.html`) vive en
  `@finance/ui/theme` y se inyecta en el `<head>` de ambas apps. Cada origen guarda su propio
  `localStorage` (los orígenes no lo comparten); la app ya sincroniza el tema guardado en la cuenta
  (`ThemeSync`), así que tras iniciar sesión manda la preferencia de la cuenta. El idioma del sitio lo
  da la dirección (`/es`, `/en`); el de la app, la cuenta.
- **Rationale**: cumple el caso borde de la spec sin compartir almacenamiento entre orígenes.

## R10 — Idioma de la cuenta al registrarse

- **Decision**: `registerRequestSchema` gana `locale` **opcional** (`localeSchema`); `RegisterHandler`
  lo usa como idioma inicial del `User` (si falta, `es`, como hoy). El panel envía el `lang` de la
  página. Iniciar sesión no lo toca (FR-010a).
- **Rationale**: cambio aditivo, compatible con clientes que no lo envían.

## R11 — Metadatos, mapa del sitio, imagen de vista previa

- **Decision**: `src/layouts/PageLayout.astro` recibe `{ lang, slug, titleKey, descriptionKey }` y
  emite `<title>`, `description`, `canonical` (`PUBLIC_SITE_URL` + ruta), `hreflang` es/en/x-default,
  `og:*` y `twitter:card=summary_large_image`. Título/descripción por página salen del catálogo de la
  landing (`landing.meta.<page>.title|description`, es/en). Imagen: **una por idioma**
  (`public/og/cuadra-es.png`, `…-en.png`, 1200×630), generada una vez desde un SVG con el script
  `apps/landing/scripts/og.mjs` (`@resvg/resvg-js`, devDependency) y versionada. Mapa del sitio con
  `@astrojs/sitemap` (con alternativas por idioma) y `public/robots.txt` que lo referencia.
- **Rationale**: FR-003/FR-005, SC-001.
- **Alternatives considered**: imagen generada por página en cada build (`satori`): más dependencias
  y build más lento por una ganancia marginal.

## R12 — La app deja de ser indexable y de servir páginas públicas

- **Decision**: `apps/web/index.html` lleva `<meta name="robots" content="noindex, nofollow">` (la
  SPA tiene un solo HTML, así cubre todas las direcciones) y pierde los `og:*`. **No** se agrega
  `robots.txt` con `Disallow` (impediría a Google leer el `noindex`). Router de la app: se quitan las
  páginas públicas; `/` muestra el Panel con sesión y, sin sesión, redirige con
  `location.replace(LANDING_URL + "/?acceso=login&volver=/")`; `/login` y `/register` redirigen
  igual; `RequireAuth` redirige a la landing con `volver` = ruta actual (con su query); cerrar sesión
  hace `location.assign(LANDING_URL + "/")`; una dirección inexistente sin sesión redirige al acceso
  (con sesión, la 404 de la app como hoy, ya sin la variante de landing). Variable nueva
  `VITE_LANDING_URL`.
- **Rationale**: FR-014, FR-015, FR-019, FR-020.

## R13 — Entorno local

- **Decision**: `pnpm dev` (turbo) levanta las tres apps: landing `http://localhost:4321` (Astro),
  app `http://localhost:5173` (Vite), API `http://localhost:3001`. Variables de la landing:
  `PUBLIC_API_URL`, `PUBLIC_APP_URL`, `PUBLIC_SITE_URL`; de la app: `VITE_API_URL`,
  `VITE_LANDING_URL`. Todo en `localhost` ⇒ mismo sitio para cookies y `rpId=localhost` para llaves.
- **Rationale**: FR-021 sin DNS ni certificados.

## R14 — Pruebas

- **Decision**: Vitest + Testing Library en `apps/landing` (los tests de `LoginForm`/`RegisterForm`
  se mueven con ellos, más tests nuevos de `safeReturnTo`, del redirect por idioma, de la redirección
  a la app tras el acceso y de la comprobación de sesión). Un test de build (`test:build`) que corre
  sobre `dist/` y verifica, para las 10 páginas: título/descripción presentes y únicos, `canonical`,
  `hreflang`, `og:image`, contenido principal en el HTML y que ninguna página referencia chunks de la
  app. API: unit de `origins.config` (lista, validación, `rpId`), e2e de registro con `locale`. App:
  tests de `RequireAuth`/router/cerrar sesión redirigiendo a la landing.
- **Rationale**: Principio IV; SC-001/SC-002/SC-007 verificables automáticamente.
