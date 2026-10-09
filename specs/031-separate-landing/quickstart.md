# Quickstart: validar la separación (031)

## Preparación

```bash
pnpm install
# apps/api/.env:     CORS_ORIGIN="http://localhost:4321,http://localhost:5173"   (PASSKEY_RP_ID se omite → localhost)
# apps/web/.env:     VITE_API_URL=http://localhost:3001/api/v1   VITE_LANDING_URL=http://localhost:4321
# apps/landing/.env: PUBLIC_API_URL=http://localhost:3001/api/v1 PUBLIC_APP_URL=http://localhost:5173
#                    PUBLIC_SITE_URL=http://localhost:4321
pnpm dev            # landing :4321, app :5173, api :3001
```

Cuenta demo: RUT del seed / `demo1234` (ver `apps/api/prisma/seed.ts`).

## Escenarios

| # | Pasos | Resultado esperado | Spec |
|---|---|---|---|
| 1 | `curl -s localhost:4321/es/pricing` (sin JS) | HTML con el `<h1>` de Precios, `<title>` propio, `canonical`, `hreflang` es/en/x-default, `og:image` | US1, FR-002/003 |
| 2 | Comparar `<title>` de las 10 páginas (`pnpm --filter @finance/landing test:build`) | 10 títulos distintos | SC-001 |
| 3 | Abrir `localhost:4321/es/` con DevTools → Network, sin abrir el panel | sin React ni chunks de la app; JS total ≤ 20 % del de hoy (medir antes/después) | FR-006, SC-002 |
| 4 | Abrir `localhost:4321/precios#x` | termina en `/es/pricing#x` | FR-004b |
| 5 | Abrir `localhost:4321/` con el navegador en inglés | termina en `/en/` | FR-004a |
| 6 | En `/es/`, "Iniciar sesión" → RUT + clave | panel se carga al abrirlo; al entrar, llega a `localhost:5173/` con sesión; ninguna URL tiene datos de sesión | US2 |
| 7 | Cuenta con segundo factor | el panel pide el código; al validarlo, llega a la app | US2 |
| 8 | Llave de acceso registrada en Perfil (app) → cerrar sesión → entrar con llave en la landing | entra | US6 |
| 9 | Registrarse desde `/en/` | llega a la app en inglés; Perfil muestra inglés | US3, FR-010a |
| 10 | Sin sesión, abrir `localhost:5173/accounts/<id>?tab=billing` | llega a la landing con el panel abierto; al entrar vuelve a esa misma URL | US4 |
| 11 | Abrir `localhost:5173/login` | panel de login de la landing | FR-014 |
| 12 | `…/?acceso=login&volver=//evil.com` y entrar | llega a `localhost:5173/` | FR-013 |
| 13 | Con sesión, abrir `localhost:4321/es/` | el encabezado dice "Ir a la app" | US5 |
| 14 | Detener el API y abrir `localhost:4321/es/` | la página carga completa con "Iniciar sesión" | US5 (error) |
| 15 | Cerrar sesión en la app | termina en la landing sin sesión | FR-015 |
| 16 | `curl -s localhost:5173/ \| grep robots` | `noindex, nofollow` | FR-019 |

## Comandos de verificación

```bash
pnpm check:boundaries
pnpm typecheck
pnpm --filter @finance/landing test && pnpm --filter @finance/landing build && pnpm --filter @finance/landing test:build
pnpm --filter @finance/web test
pnpm --filter @finance/api test:unit
pnpm --filter @finance/api exec vitest run test/e2e/<registro y llaves>
pnpm --filter @finance/ui test && pnpm --filter @finance/i18n test && pnpm --filter @finance/client test
```
