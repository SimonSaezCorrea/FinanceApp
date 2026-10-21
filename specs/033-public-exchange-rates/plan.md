# Implementation Plan: Valor UF y dólar observado, públicos en mifik.cl

**Branch**: `033-public-exchange-rates` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/033-public-exchange-rates/spec.md`

## Summary

Four public pages (`/es/valor-uf/`, `/es/dolar-observado/`, `/en/uf-value/`, `/en/dollar-rate/`) and
a home block show the UF and the dólar observado in pesos: value of the day, change, carried notice,
30-day/1-year chart and table, a date picker kept in the URL, a pesos ↔ unit converter and a sign-up
CTA. The site stays static: the landing build reads the rates from a NEW public read-only endpoint
(`GET /public/exchange-rates`, same handler as the app's) and writes them into the HTML; a scheduled
workflow rebuilds the landing twice a day; a small script refreshes the headline on arrival. No
schema change, no React on arrival (research.md R1–R10).

## Technical Context

**Language/Version**: TypeScript, Node 22 (Astro 7 needs ≥ 22.12)

**Primary Dependencies**: existing only — Astro 7 + `@astrojs/sitemap` (landing), NestJS 11 +
`@nestjs/cqrs` (api), `@finance/money` (`convertAmount`, `formatMoney`), `@finance/contracts`
(new zod-free entry `exchange-rate-rules`). No new dependency.

**Storage**: PostgreSQL `exchange-rate` table (specs/030), read only; no migration.

**Testing**: Vitest — api unit (handler `first`, controller headers) + e2e (public route without a
cookie, authed route still 401); contracts unit (moved rules); landing unit (jsdom: snapshot loader,
chart path, change/conversion/date logic, arrival refresh, URL param) + `test:build` over `dist/`.

**Target Platform**: Cloudflare Pages (static) + the API on EC2 behind Cloudflare; GitHub Actions
schedule.

**Project Type**: web monorepo (apps/api, apps/landing, packages/contracts).

**Performance Goals**: Lighthouse mobile ≥ 95 performance (the gate, SC-004); LCP aimed at the
site's ≤ 2 s (2,5 s is only Google's "good" threshold); first paint never waits on the API;
converter's `decimal.js` loaded on first input.

**Constraints**: value in the HTML (crawlers); ≤ 1 day stale in the HTML; no React/hydration on
arrival; es/en parity; no em/en dashes in `landing.*`.

**Scale/Scope**: 4 pages + home block; ≤ 366 rows of JSON per page (~3 KB gzip).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                                  | Status                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Money precision                                         | PASS — conversion via `@finance/money`'s `convertAmount`, values travel as decimal strings.                                                                                                                                                                                                                                                                    |
| II. Per-user isolation                                     | **NAMED EXCEPTION** — `GET /public/exchange-rates` has no guard. It reads only a table with no `userId` (global reference data), reveals nothing about any account, writes nothing. The constitution is amended FIRST (task T011, before the controller) to name this exception, so the code never lands against the principle. The authed route is unchanged. |
| III. i18n parity                                           | PASS — all copy in `apps/landing/src/i18n/{es,en}.json` (`landing.rates.*`, `landing.meta.*`), parity test.                                                                                                                                                                                                                                                    |
| IV. Test-first                                             | PASS — tests listed per task before implementation.                                                                                                                                                                                                                                                                                                            |
| V. SDD & living memory                                     | PASS — this cycle; CLAUDE.md + constitution updated at close.                                                                                                                                                                                                                                                                                                  |
| VI. DDD/CQRS, one table one domain                         | PASS — new Facade in `exchange-rate/presentation/`, reuses its query/handler; adapter gains `firstDate` (only adapter of that table).                                                                                                                                                                                                                          |
| VII. Idempotency                                           | N/A — no write endpoint.                                                                                                                                                                                                                                                                                                                                       |
| VIII. Identifiers                                          | N/A — no new entity or id.                                                                                                                                                                                                                                                                                                                                     |
| Tech constraints (public site static, no React on arrival) | PASS — build-time rendering + plain scripts.                                                                                                                                                                                                                                                                                                                   |

**Data gates:**

- [x] Toda entidad nueva declara formato de identificador — no hay entidades nuevas.
- [x] Todo endpoint de escritura nuevo declara idempotencia — no hay endpoints de escritura.
- [x] Toda FK aceptada desde el cuerpo de un request declara su ownership — no hay FKs en requests.

Post-design re-check: unchanged (PASS with the one justified exception).

## Project Structure

### Documentation (this feature)

```text
specs/033-public-exchange-rates/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── public-exchange-rates.md
│   └── pages.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/
├── package.json                                # + "./exchange-rate-rules" export
└── src/exchange-rates/
    ├── rules.ts                                # NEW zod-free: isCarried, rateOn, types, constants
    └── index.ts                                # re-exports rules; response gains `first`

apps/api/src/domains/exchange-rate/
├── domain/ports/exchange-rate.repository.port.ts   # + firstDate(currency)
├── infrastructure/prisma-exchange-rate.repository.ts
├── application/queries/list-exchange-rates.handler.ts  # fills `first`
├── presentation/public-exchange-rates.controller.ts    # NEW, no guard, Cache-Control
└── exchange-rate.module.ts                             # registers it

apps/landing/
├── astro.config.mjs                            # sitemap serialize: real es/en pairs
├── src/lib/language.ts                         # pages ufValue/dollarRate, per-language slugs
├── src/lib/exchangeRates.ts                    # NEW build-time loader (fetch | fixture | null)
├── src/pages/[lang]/[rate].astro               # NEW, 4 static paths
├── src/domains/rates/
│   ├── lib/{rateChange,rateChart,rateDate,converter}.ts   # NEW pure logic
│   ├── components/{RatePage,RateHeadline,RateChart,RateTable,RateConverter,RatesHomeBlock}.astro
│   └── scripts/rates.ts                        # NEW arrival refresh, period toggle, date, converter
├── src/domains/landing/components/Footer.astro # links to both pages
├── src/domains/landing/pages/HomePage.tsx      # home block slot (or rendered from index.astro)
├── src/i18n/{es,en}.json                       # landing.rates.*, landing.meta.{ufValue,dollarRate}
└── test/build.test.ts                          # new assertions

.github/workflows/
├── landing-rates.yml                           # NEW scheduled landing rebuild (twice a day)
└── ci.yml                                      # landing build reads a fixture snapshot
```

**Structure Decision**: a new frontend domain `src/domains/rates/` in the landing (Astro components

- plain scripts, no React), a new Facade in the existing `exchange-rate` table-domain of the API, and
  one zod-free contracts entry. Nothing in `apps/web` changes.

## Complexity Tracking

| Violation                            | Why Needed                                                                                         | Simpler Alternative Rejected Because                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Principle II: an unguarded HTTP read | Visitors without an account must read the rates, and the page must refresh on arrival (clarify Q1) | Build-time-only data (no public route) cannot refresh on arrival; removing the guard from the app's route hides which routes are public |
| New scheduled workflow               | The HTML must stay ≤ 1 day old (FR-006) without a runtime in front of the page                     | A Pages Function per route adds a runtime dependency to every request; a schedule in `deploy.yml` would move its deploy baseline        |
