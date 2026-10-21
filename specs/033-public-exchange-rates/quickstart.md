# Quickstart: validating specs/033

## Prerequisites

- `pnpm install`; local Postgres with recorded rates (`pnpm dev` once with `CRONS_ENABLED=true`, or a
  copy of production's `exchange-rate` rows).
- API on :3001, landing on :4321 (`pnpm --filter @finance/landing dev`).

## 1. Public endpoint (FR-004, FR-016)

```bash
curl -si "http://localhost:3001/api/v1/public/exchange-rates?currency=CLF" | head -20
```

Expect `200`, `Cache-Control: public, max-age=300`, no `Set-Cookie`, `items`, `latest`, `first`.
`curl -s ".../exchange-rates"` without a cookie still answers `401` (the authed route is unchanged).

## 2. Built HTML (FR-005, FR-007, SC-002)

```bash
PUBLIC_API_URL=http://localhost:3001 pnpm --filter @finance/landing build
pnpm --filter @finance/landing test:build
```

Then open `apps/landing/dist/es/valor-uf/index.html` in a text editor: the value, its date, the
title/description, JSON-LD and the 30-day table are in the file. Same for the other three pages and
for `dist/es/index.html` (home block). `dist/sitemap-0.xml` lists the four URLs with the right pairs.

## 3. Without the API (FR-014, SC-007)

Stop the API and build again: the build succeeds and the pages show "sin valor disponible".
`EXCHANGE_RATES_REQUIRED=true pnpm --filter @finance/landing build` fails instead.

## 4. In a browser

- `/es/valor-uf/`: value matches the app's "Tipos de cambio" for today (SC-001).
- Type 3,5 in UF → pesos equal the app's conversion; type pesos → UF with 4 decimals (SC-003).
- Pick a date → value of that day, URL gains `?fecha=`; reload keeps it; a date before `first` →
  "sin dato para esa fecha"; `?fecha=2099-01-01` → today's value + notice.
- Switch 30 días / 1 año: chart and table change.
- "Crear cuenta" opens registration in the page language.
- `/en/dollar-rate/`: English copy and number format.

## 5. Lighthouse (SC-004)

Mobile, clean profile (incognito or `npx lighthouse`): 100/100/100 and ≥ 95 performance on the four
pages.
