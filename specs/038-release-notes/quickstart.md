# Quickstart: Novedades (038)

1. Paquete: `pnpm --filter @finance/release-notes test` (parser, catálogo real, verificación con un repo
   git temporal: `feat` sin cubrir → falla nombrándolo; cubierto → pasa; solo `chore`/`docs` → pasa).
2. Estado actual: `node packages/release-notes/scripts/check.mjs --range 8af6853d..acae5486` → sale 0.
3. Sitio: `EXCHANGE_RATES_SNAPSHOT=test/fixtures/rates-snapshot.json pnpm --filter @finance/landing build`
   y `pnpm --filter @finance/landing test:build`: existen `/es/novedades/` y `/en/whats-new/` con la
   entrada del 2026-10-26, par de idioma, sitemap, pie y `llms.txt`.
4. App: `pnpm --filter @finance/web test src/domains/release-notes src/app` (punto con/sin visto; abrir
   marca visto).
5. API: `pnpm test:integration:local test/e2e/domains/user/release-notes.http.spec.ts` y unit del
   agregado/handler.
6. Escribir un registro nuevo: `pnpm release-notes:pending` → crear
   `packages/release-notes/releases/<fecha>-<slug>/{es,en}.md` → pegar `commits:` → commit `docs(release): …`.
