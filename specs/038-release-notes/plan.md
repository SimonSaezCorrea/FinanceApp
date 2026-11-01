# Implementation Plan: Novedades — registro de cambios de cada despliegue

**Branch**: `038-release-notes` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/038-release-notes/spec.md`

## Summary

Un paquete fuente nuevo, **`@finance/release-notes`**, es la única fuente: un registro por
despliegue en `packages/release-notes/releases/<YYYY-MM-DD>-<slug>/{es,en}.md` (frontmatter
`title`/`summary`, y en `es.md` la lista `commits`; cuerpo con `## Nuevo|Mejoras|Correcciones|Cambios|Seguridad`
y viñetas), más un parser puro con validación propia (sin dependencias) que lo convierte en datos. El **sitio público**
(`apps/landing`) construye `/es/novedades/` y `/en/whats-new/` desde esos datos (Astro estático, sin
React), los enlaza en la columna _fik_ del pie, el sitemap y `/llms.txt`. La **app** (`apps/web`) lee los
mismos archivos con un glob perezoso de Vite: el id más reciente sale de los nombres de carpeta (sin
cargar nada), y la vista `/whats-new` carga el contenido al abrirse. **API**: `User.releaseNotesSeenId`
(migración expand-only) + `POST /auth/me/release-notes/seen` `{releaseId}` (idempotente, solo avanza),
expuesto en `CurrentUser.releaseNotesSeenId`. **Garantía**: `packages/release-notes/scripts/check.mjs`
(Node puro, sin dependencias) compara los `feat`/`fix` sin merges de un rango con los commits cubiertos y
falla nombrándolos; corre en `.husky/pre-push` al empujar a `main` y en un job propio de `ci.yml` en push a
`main` (siempre, aunque el `gate` salte el resto), de modo que Deploy no ocurre si falla.

## Technical Context

**Language/Version**: TypeScript 6, Node 22

**Primary Dependencies**: Astro 7 (landing), React 19 + Vite + TanStack Query (web), NestJS 11 + Prisma 7
(api), zod 4 (contrato). Sin dependencias nuevas.

**Storage**: Postgres — una columna nueva `user.releaseNotesSeenId TEXT NULL`. Los registros viven en el
repo (archivos Markdown).

**Testing**: Vitest (paquete, landing unit + build, web, api unit/e2e).

**Target Platform**: sitio estático en Cloudflare Pages, SPA, API en EC2.

**Project Type**: monorepo web (3 apps + paquetes).

**Performance Goals**: las páginas públicas sin JS de interfaz; la app no carga el contenido de los
registros hasta abrir Novedades.

**Constraints**: expand-only (la app despliega antes que el API: `releaseNotesSeenId` opcional en el
contrato y un 404 al marcar visto se ignora); la verificación no puede bloquear el despliegue actual.

**Scale/Scope**: ~1 registro por despliegue (decenas al año).

## Constitution Check

- **I. Dinero**: no aplica.
- **II. Aislamiento**: el endpoint usa `@CurrentUser`; solo escribe la fila del propio usuario. No hay FK
  en el cuerpo. ✅
- **III. i18n**: textos nuevos en `packages/i18n` (es/en, `releaseNotes.*`, `nav.whatsNew`) y en
  `apps/landing/src/i18n` (`landing.releaseNotes.*`, `landing.meta.releaseNotes.*`); sin rayas en
  `landing.*`. Los registros mismos se escriben en ambos idiomas y la construcción exige los dos. ✅
- **IV. Test-first**: parser, verificación, agregado y endpoint con tests. ✅
- **V. SDD**: esta spec; la sincronización de memoria la hace el coordinador. ✅
- **VI. DDD/CQRS**: comando `MarkReleaseNotesSeenCommand` + handler en `user` (tabla `user`, su único
  adapter); sin dominio nuevo (no hay tabla nueva). ✅
- **VII. Idempotencia**: forma (a) — el valor solo avanza (`max`): repetir o marcar uno más antiguo no
  escribe nada. No mueve dinero. ✅
- **VIII. Identificadores**: `releaseId` es un identificador de negocio (no PK), validado en el borde con
  su propio patrón (`^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 80). ✅

**Data gates**: entidad nueva: ninguna (columna). Escritura nueva: `POST /auth/me/release-notes/seen`,
forma (a). FK en cuerpo: ninguna.

## Project Structure

### Documentation (this feature)

```text
specs/038-release-notes/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/api.md, contracts/release-file.md, contracts/check-cli.md
└── tasks.md
```

### Source Code

```text
packages/release-notes/            # NUEVO, fuente única
├── package.json, tsconfig.json, eslint.config.mjs, vitest.config.ts
├── releases/2026-10-26-guias-chile/{es,en}.md
├── src/parse.ts                   # frontmatter + cuerpo + inline → Release (zod)
├── src/catalog.ts                 # glob ansioso (landing, build)
├── src/lazy.ts                    # glob perezoso (web): ids sin cargar + loader por idioma
├── src/index.ts
├── scripts/check.mjs              # verificación de cobertura (CLI + funciones exportadas)
└── test/{parse,catalog,check}.test.ts
apps/landing/src/
├── lib/language.ts                # page "releaseNotes", LOCALIZED_SLUGS novedades/whats-new
├── pages/[lang]/[releaseNotes]/index.astro
├── domains/releases/lib/render.ts # tokens inline → HTML (con brandHtml)
├── domains/landing/components/Footer.astro, domains/llms/lib/build.ts
└── astro.config.mjs (LOCALIZED_PAIRS)
apps/web/src/
├── domains/release-notes/{hooks,routes,components,lib}
├── app/AppLayout.tsx (acceso + punto), app/router.tsx, app/lazyPages.ts
apps/api/
├── prisma/schema.prisma, prisma/migrations/20261026000000_release_notes_seen/migration.sql
└── src/domains/user/... (aggregate, repo, command/handler, controller)
packages/contracts/src/auth/index.ts, packages/client/src/authApi.ts
.husky/pre-push, .github/workflows/ci.yml, package.json (scripts)
```

**Structure Decision**: un paquete fuente compartido (como `@finance/i18n`), importado por ruta. El
sitio y la app leen exactamente los mismos archivos con el mismo parser.

## Complexity Tracking

Sin violaciones.
