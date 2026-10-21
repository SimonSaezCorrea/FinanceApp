# Tasks: Valor UF y dólar observado, públicos en mifik.cl

**Input**: Design documents from `specs/033-public-exchange-rates/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED (Constitution IV, Test-First). Each test task is written first and must fail
before its implementation task.

**Organization**: by user story (spec.md): US1 valor de hoy (P1), US2 conversor (P2), US3 historial
y fecha (P3), US4 pasar a fik (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4

---

## Phase 1: Setup (shared)

- [x] T001 Create the folder `apps/landing/src/domains/rates/{lib,components,scripts}` and an empty
      fixture `apps/landing/test/fixtures/rates-snapshot.json` (shape of `RatesSnapshot` in
      data-model.md: both currencies, ~400 rows each, one carried day, `first` set) used by unit
      tests, `test:build` and CI.

---

## Phase 2: Foundational (blocking all stories)

**Purpose**: the public read, the shared zod-free rules, the build-time loader and the routes.

### Tests first

- [x] T002 [P] Contracts test: `isCarried`/`rateOn` imported from the NEW zod-free module behave as
      before, and `listExchangeRatesResponseSchema` accepts and requires `first` — in
      `packages/contracts/src/exchange-rates/index.test.ts`.
- [x] T003 [P] API unit test: `ListExchangeRatesQueryHandler` fills `first` from the port
      (`firstDate` per currency, `null` on an empty table) — in
      `apps/api/test/unit/domains/exchange-rate/application/list-exchange-rates.handler.spec.ts`.
- [x] T004 [P] API integration test: `PrismaExchangeRateRepository.firstDate` returns the oldest
      `date` per currency — in
      `apps/api/test/integration/domains/exchange-rate/infrastructure/prisma-exchange-rate.repository.spec.ts`.
- [x] T005 [P] API e2e test: `GET /api/v1/public/exchange-rates?currency=CLF` without a cookie →
      200, `Cache-Control: public, max-age=300`, no `Set-Cookie`, `items`/`latest`/`first`;
      `GET /api/v1/exchange-rates` without a cookie still 401; a 401-day range → 400
      `EXCHANGE_RANGE_TOO_LARGE` — in `apps/api/test/e2e/domains/exchange-rate/public-exchange-rates.http.spec.ts`.
- [x] T006 [P] Landing unit test for the build loader: fixture via `EXCHANGE_RATES_SNAPSHOT`,
      `null` on timeout/non-2xx/invalid shape, throws when `EXCHANGE_RATES_REQUIRED=true` and it
      would return `null` — in `apps/landing/src/lib/exchangeRates.test.ts`.
- [x] T007 [P] Landing unit test: `pagePath` gives `/es/valor-uf/`, `/en/uf-value/`,
      `/es/dolar-observado/`, `/en/dollar-rate/` and leaves every other page unchanged — in
      `apps/landing/src/lib/language.test.ts`.

### Implementation

- [x] T008 Move `isCarried`, `rateOn`, `ExchangeRate`/`ExchangeCurrency` types and
      `EXCHANGE_RANGE_MAX_DAYS` into the zod-free `packages/contracts/src/exchange-rates/rules.ts`;
      re-export them from `index.ts`; add `first` to `listExchangeRatesResponseSchema`; add the
      `"./exchange-rate-rules"` export (src for Vite, dist for Node, like `./auth-rules`) in
      `packages/contracts/package.json`.
- [x] T009 Add `firstDate(currency)` to `ExchangeRateRepositoryPort`
      (`apps/api/src/domains/exchange-rate/domain/ports/exchange-rate.repository.port.ts`) and implement
      it in `infrastructure/prisma-exchange-rate.repository.ts` (`findFirst orderBy date asc`).
- [x] T010 Fill `first: { USD, CLF }` in
      `apps/api/src/domains/exchange-rate/application/queries/list-exchange-rates.handler.ts`.
- [x] T011 FIRST amend `.specify/memory/constitution.md` Principle II with the named exception (a
      public, read-only GET of global reference data with no `userId`, no cookies read; today only
      `GET /public/exchange-rates`), MINOR bump + Sync Impact Report. THEN create
      `apps/api/src/domains/exchange-rate/presentation/public-exchange-rates.controller.ts`
      (`@Get("public/exchange-rates")`, NO `JwtAuthGuard`, same `ZodValidationPipe` and query,
      `@Header("Cache-Control", "public, max-age=300")`, doc comment naming it the Principle II
      exception) and register it in `exchange-rate.module.ts`.
- [x] T012 Create the build loader `apps/landing/src/lib/exchangeRates.ts`: `loadRatesSnapshot()`
      → per currency `{ today, latest, first, year }` from
      `GET ${API_URL}/api/v1/public/exchange-rates?currency=X&from=today−365&to=today` (10 s timeout,
      validated shape), or the `EXCHANGE_RATES_SNAPSHOT` file; `null` on failure unless
      `EXCHANGE_RATES_REQUIRED=true` (then throw). Memoize per build.
- [x] T013 Extend `apps/landing/src/lib/language.ts`: `Page` gains `ufValue` and `dollarRate`, a
      per-language slug table for them (`valor-uf`/`uf-value`, `dolar-observado`/`dollar-rate`),
      `pagePath(lang, page)` uses it; export `RATE_PAGES` (page ↔ currency).
- [x] T014 Create `apps/landing/src/pages/[lang]/[rate].astro` with `getStaticPaths` producing the 4
      (lang, slug) pairs, loading the snapshot and rendering `PageLayout` with the page key (body
      filled by US1 components).
- [x] T015 [P] Add `landing.meta.{ufValue,dollarRate}.{title,description}` and the base
      `landing.rates.*` keys (headline, carried, change, noData, source, unavailable) in
      `apps/landing/src/i18n/es.json` and `en.json` (no em/en dashes; parity test passes).
- [x] T016 Sitemap: in `apps/landing/astro.config.mjs` add a `serialize` hook that rewrites the
      `links` of the 4 rate URLs to their real es ↔ en pair (from the same slug table, T013).

**Checkpoint**: endpoint live, contracts shared, routes build (empty body).

---

## Phase 3: User Story 1 — Ver el valor de hoy desde un buscador (P1) 🎯 MVP

**Goal**: the 4 pages show the value of the day, date, change, carried notice and source, in the
HTML and refreshed on arrival; home block; footer links.

**Independent Test**: build with the fixture; each page's HTML contains value, date, title,
description and JSON-LD; in a browser the value matches the app's "Tipos de cambio".

### Tests first

- [x] T017 [P] [US1] Unit test `rateChange(rows, current)` (amount, %, "sin cambio", none on the first
      day) in `apps/landing/src/domains/rates/lib/rateChange.test.ts`.
- [x] T018 [P] [US1] Unit test the arrival refresh (jsdom): newer row replaces `[data-rate-*]` (value,
      date, change, carried); same or older row leaves it; fetch failure/timeout leaves it; a tab
      that becomes visible on a later Chile day refreshes again (`visibilitychange`) — in
      `apps/landing/src/domains/rates/scripts/rates.test.ts`.
- [x] T019 [P] [US1] Build test assertions in `apps/landing/test/build.test.ts`: for the 4 pages —
      title/description per page, canonical without query, hreflang pair, the fixture's value and
      date in the HTML, carried notice when the fixture's latest is carried, JSON-LD
      `ExchangeRateSpecification`, source line, link to the other indicator; footer links on every
      page; home block on `/es/` and `/en/`; sitemap lists the 4 URLs with correct pairs.

### Implementation

- [x] T020 [P] [US1] Implement `apps/landing/src/domains/rates/lib/rateChange.ts`.
- [x] T021 [US1] `RateHeadline.astro` in `apps/landing/src/domains/rates/components/`: value
      (`formatMoney`, page locale), date, change, carried notice, source, `[data-rate-*]` hooks, and
      the "sin valor disponible" state when the snapshot is `null`.
- [x] T022 [US1] `RatePage.astro` (headline + JSON-LD `WebPage`/`ExchangeRateSpecification`/
      `BreadcrumbList` + link to the other indicator) and wire it into `[rate].astro`; meta
      title/description interpolate value and date when known (`PageLayout` accepts them).
- [x] T023 [US1] Arrival refresh in `apps/landing/src/domains/rates/scripts/rates.ts` (fetch latest
      week of the page's currency, 3 s timeout, compare by `date` then `valueDate`, rewrite hooks;
      again on `visibilitychange` when the Chile day changed since the last check);
      load it from `[rate].astro` and the home page.
- [x] T024 [US1] Home block `RatesHomeBlock.astro` (UF + dólar tiles, value, date, carried, link) next
      to the currencies strip — rendered from `apps/landing/src/pages/[lang]/index.astro` (or a slot
      in `HomePage.tsx`), same hooks so T023 refreshes it.
- [x] T025 [US1] Footer links to both pages in
      `apps/landing/src/domains/landing/components/Footer.astro` (labels in `landing.rates.nav.*`).

**Checkpoint**: MVP — publishable alone.

---

## Phase 4: User Story 2 — Convertir un monto (P2)

**Goal**: pesos ↔ unit converter with the current rate (or the chosen date's).

**Independent Test**: 3,5 UF → pesos equals `convertAmount("3.5", value, "CLP")`; pesos → UF has 4
decimals; invalid input shows no result.

- [x] T026 [P] [US2] Unit test `apps/landing/src/domains/rates/lib/converter.test.ts`: unit→pesos
      equals `convertAmount`; pesos→unit uses `1/value` and rounds to 2 (USD) / 4 (CLF); empty, zero,
      negative, non-numeric → no result; parses by page language: es "3,5" / "500.000" (`.`
      thousands, `,` decimal), en "3.5" / "500,000" (the reverse).
- [x] T027 [P] [US2] Unit test (jsdom) of the converter wiring in `rates.test.ts`: typing on either
      side fills the other; `decimal.js`/`@finance/money` is imported only on first input; the
      date-in-use label follows the chosen date.
- [x] T028 [US2] Implement `apps/landing/src/domains/rates/lib/converter.ts` (parse locale input,
      `convertAmount` via dynamic `import("@finance/money")`).
- [x] T029 [US2] `RateConverter.astro` (two labelled inputs, `inputmode="decimal"`, the date in use,
      `aria-live` result) + wiring in `scripts/rates.ts`; i18n `landing.rates.converter.*` (es/en).

---

## Phase 5: User Story 3 — Historial y valor de una fecha (P3)

**Goal**: 30-day/1-year chart and table; a date picker kept in `?fecha=`/`?date=`.

**Independent Test**: toggle periods; pick a date → its value; reload keeps it; before `first` →
"sin dato"; invalid param → today + notice.

- [x] T030 [P] [US3] Unit test `apps/landing/src/domains/rates/lib/rateChart.test.ts`: path for a
      series fits the viewBox, min/max labels, carried points marked, single-point and empty series.
- [x] T031 [P] [US3] Unit test `apps/landing/src/domains/rates/lib/rateDate.test.ts`: read/write the
      URL param per language, malformed/future/pre-`first` handling, lookup in the year series vs
      "needs fetch".
- [x] T032 [P] [US3] jsdom tests in `rates.test.ts`: period toggle renders the 1-year table from the
      JSON island; picking a date updates headline-for-date, converter and URL (`replaceState`);
      out-of-island date fetches one day; no row → "sin dato para esa fecha".
- [x] T033 [US3] Implement `lib/rateChart.ts` and `components/RateChart.astro` (two SVGs, radio
      segmented toggle working without script via `:has()`, accessible names and a text summary).
- [x] T034 [US3] `components/RateTable.astro` (30-day table in HTML, carried badge) + JSON island
      `#rates-year`; 1-year table rendered by `scripts/rates.ts`.
- [x] T035 [US3] Implement `lib/rateDate.ts` and the native date input (`min` = `first`, `max` =
      today Chile) with its wiring in `scripts/rates.ts`; i18n `landing.rates.history.*`,
      `landing.rates.date.*` (es/en).
- [x] T036 [US3] Extend `test/build.test.ts`: both SVGs, the 30-day table and the JSON island are in
      the HTML; the date input has `min`/`max`.

---

## Phase 6: User Story 4 — Pasar de la página a fik (P3)

- [x] T037 [P] [US4] Build test: each page has the CTA `<a href="?acceso=registro" data-access>` and
      its explanatory text — in `apps/landing/test/build.test.ts`.
- [x] T038 [US4] `components/RateCta.astro` (one or two sentences on how fik uses these values +
      "Crear cuenta"), i18n `landing.rates.cta.*` (es/en), placed in `RatePage.astro`.

---

## Phase 7: Polish & cross-cutting

- [x] T039 Scheduled rebuild `.github/workflows/landing-rates.yml`: `schedule: cron "20 0,12 * * *"` + `workflow_dispatch`; checkout `main`; build `@finance/landing` with the production
      `PUBLIC_*` env and `EXCHANGE_RATES_REQUIRED=true`; `wrangler pages deploy dist` from
      `apps/landing` (same command/secrets as `deploy.yml`); `concurrency: { group: deploy }`.
- [x] T040 CI: in `.github/workflows/ci.yml` set `EXCHANGE_RATES_SNAPSHOT=test/fixtures/rates-snapshot.json`
      on the landing build step before `test:build`.
- [x] T041 [P] Docs: `docs/DEPLOY.md` (the scheduled workflow, what happens if the API is down) and
      `docs/PENDING.md` (SEO card follow-ups: other tools/guides).
- [x] T042 Run scoped checks: `pnpm --filter @finance/contracts test`, api unit/integration/e2e of
      `exchange-rate`, `pnpm --filter @finance/landing test`, `build` + `test:build`, `typecheck`,
      `lint`, `format:check`, `check:boundaries`.
- [x] T043 Quickstart §1–§4 by hand against the local API; Lighthouse mobile on the 4 built pages
      (`astro preview`) — record results; check the 4 pages at 400px wide and in light and dark
      themes (token colors only, FR-015). Lighthouse on production goes to the SEO ClickUp card.
- [x] T044 Memory sync: constitution (complete T011's amendment with the scheduled landing rebuild)
      and `CLAUDE.md` (exchange-rate bullet,
      `apps/landing` bullet, env vars `EXCHANGE_RATES_SNAPSHOT`/`EXCHANGE_RATES_REQUIRED`, the new
      workflow, the per-language slug exception; plan pointer → implementado).

---

## Dependencies & Execution Order

- Setup (T001) → Foundational (T002–T016) → US1 (T017–T025) → US2, US3, US4 (independent of each
  other, all need US1's page shell) → Polish (T039–T044).
- Within each phase: tests first (must fail), then implementation.
- T002 fails until T008; T009 → T010 → T011 (constitution amendment before the controller);
  T013 → T014, T016.

## Parallel Opportunities

- Foundational tests T002–T007 together; T015 alongside T012–T014.
- US1: T017, T018, T019 together; T020 alongside T021.
- After US1: US2, US3 and US4 can proceed in parallel (different components; `scripts/rates.ts` is
  shared, so merge its sections in order US2 → US3).

## Implementation Strategy

**MVP** = Phases 1–3 (US1) + T039/T040: the value of the day indexed and fresh. Then US2 (converter,
second-biggest search), US3 (history/date), US4 (CTA), polish and memory sync.
