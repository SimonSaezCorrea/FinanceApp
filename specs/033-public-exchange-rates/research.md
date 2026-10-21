# Research: Valor UF y dólar observado, públicos en mifik.cl

Decisions taken while planning specs/033. Each one: decision, rationale, alternatives.

## R1 — How the HTML carries the value of the day (FR-005, FR-006)

**Decision**: the public site stays plain static files. The landing build reads the rates once
(build-time `fetch` of the new public endpoint, R3) and writes the value of the day, the 30-day
table, both charts and a JSON island with the last year into the HTML. A new scheduled workflow
(`.github/workflows/landing-rates.yml`) rebuilds and uploads ONLY the landing from `main` twice a
day, after the API's 08:00 and 20:00 recording ticks (cron `20 0,12 * * *` UTC = 08:20/20:20 or
09:20/21:20 Chile depending on DST). On arrival, a small script asks for the latest value (R5).

**Rationale**: keeps spec 031's "static files publishable on any host" and adds no runtime piece in
front of the page. Two builds a day keep what a crawler reads ≤ 1 day old (FR-006); the arrival
refresh covers the rest. A separate workflow (not a `schedule` in `deploy.yml`) because `deploy.yml`
takes its baseline from the run-name of its last successful run: a scheduled landing-only run there
would move that baseline and could skip a pending API/web deploy. It shares the `deploy`
concurrency group so it never uploads in the middle of a release.

**Alternatives**:

- _Cloudflare Pages Function on these routes rewriting the HTML (HTMLRewriter + edge cache)_: always
  fresh, but one more runtime dependency on every request and a Function per route (home included);
  rejected for a value that changes at most a few times a day.
- _`schedule:` inside `deploy.yml`_: rejected for the baseline reason above.
- _Client-only rendering_: violates FR-005 (crawlers must read the value without running code).

## R2 — When the API can't be reached at build time (FR-014)

**Decision**: the build-time loader (`src/lib/exchangeRates.ts`) returns `null` on any failure
(timeout 10 s, non-2xx, invalid shape) and the pages render their "sin valor disponible" state; the
arrival script fills them in when it can. The scheduled workflow sets
`EXCHANGE_RATES_REQUIRED=true`, which turns that failure into a build error — so a scheduled run
never replaces a good deployment with an empty one. A normal deploy (code change) keeps building.
Tests and CI read a fixture instead through `EXCHANGE_RATES_SNAPSHOT=<path to JSON>`.

**Rationale**: a code deploy must not depend on the API being up; a data refresh must not make
things worse than they were.

**Alternatives**: always failing the build without data (blocks unrelated deploys); always building
(the 20:20 run during an API outage would publish an empty page for 12 h).

## R3 — The public read (FR-004, FR-016)

**Decision**: a new controller in the `exchange-rate` table-domain, `PublicExchangeRatesController`,
`GET /api/v1/public/exchange-rates` with NO guard, same query (`listExchangeRatesQuerySchema`), same
`ListExchangeRatesQuery`/handler and same response shape as the authed `GET /exchange-rates` (which
does not change). It sets `Cache-Control: public, max-age=300` and never reads cookies.
`currency` is optional, the range limit (400 days) applies. The response gains an ADDITIVE field
`first: { USD: string | null, CLF: string | null }` (oldest `date` of each currency, new repository
method `firstDate`), returned by both routes; the app ignores it, so old and new clients keep working
during a deploy (CLAUDE.md's deploy rule).

**Rationale**: one handler ⇒ the public page and the app read exactly the same rows (FR-004). A
separate route makes the exception to Principle II explicit and named instead of silently removing a
guard from an existing route. The table has no `userId` and the handler touches nothing else
(FR-016). The query is bounded (≤ 400 rows, index `(currency, date)`), so it needs no new rate
limiting; the API sits behind Cloudflare.

**Alternatives**: dropping `JwtAuthGuard` from `GET /exchange-rates` (blurs which routes are public);
a static JSON file uploaded with the site (no fresher than the HTML, defeats R5).

**Constitution**: Principle II says every HTTP entry point is guarded. Existing public routes
(`GET /auth/session`, `/auth/login`, password reset…) are auth flows. This one is the first public
READ of data; it is recorded as a named exception (global reference data with no `userId`) in the
constitution at the close of the cycle (MINOR bump).

## R4 — Shared rules without zod on the page (FR-003, FR-010)

**Decision**: new zod-free entry point `@finance/contracts/exchange-rate-rules` exporting
`isCarried`, `rateOn`, `EXCHANGE_RANGE_MAX_DAYS` and the `ExchangeRate`/`ExchangeCurrency` types
(moved there and re-exported from `exchange-rates/index.ts`, so the app is unchanged). The converter
calls `@finance/money`'s `convertAmount` — the exact function the app uses — loaded with a dynamic
`import()` on the first keystroke so `decimal.js` (~12 KB gzip) never weighs on the first paint.

**Rationale**: SC-003 asks for identical results; sharing the function is the only honest way. The
precedent is `@finance/contracts/auth-rules` (spec 031) for the same reason.

**Alternatives**: reimplementing the rounding in the page (would drift from the app).

## R5 — Refresh on arrival (clarify Q1)

**Decision**: `scripts/rates.ts` (plain TS, no React) runs after paint: `GET /public/exchange-rates
?currency=<X>&from=<yesterday-7d>&to=<today>` (3 s timeout). If the newest row is newer than the one
in the HTML (by `date`, then `valueDate`), it rewrites the headline (value, date, carried notice,
change) and the converter's default rate. The charts and tables are left as built (they lag at most
until the next scheduled build); failure leaves the page untouched. The home block uses the same
script with both currencies.

## R6 — Charts without React (FR-008, SC-004)

**Decision**: a pure function `lib/rateChart.ts` turns a series into an SVG path (`viewBox`, area +
line, min/max labels) at BUILD time; the page carries two pre-rendered SVGs (30 days, 1 year) and a
two-option segmented control that toggles which one is shown (a `<fieldset>` of radios, works
without script, styled with `:has()`). The 30-day table is in the HTML; the 1-year table is
rendered by the script from the JSON island only when "1 año" is chosen (keeps the DOM small).
Carried days are marked in the table (badge) and drawn as hollow points in the 30-day chart.

**Alternatives**: Recharts (React, hydrated — breaks spec 031's "no React on arrival"); a chart lib
from CDN (weight, CSP).

## R7 — Date picker and URL (FR-009, clarify Q4)

**Decision**: a native `<input type="date">` with `min` = first registered day of that currency
(known at build) and `max` = today (Chile). Choosing a day writes `?fecha=YYYY-MM-DD` (`?date=` in
English) with `history.replaceState` and shows its row: from the JSON island when inside the last
year, otherwise one `GET /public/exchange-rates?currency&from=day&to=day`. A day with no row ⇒ "sin
dato para esa fecha". On load, a malformed, future or pre-history parameter shows today's value
with a short notice. The canonical URL never carries the parameter.

**Rationale**: the native picker is accessible, localized by the browser and costs no JS bundle.
The app's `DateField` is React.

## R8 — URLs and alternates (clarify Q2)

**Decision**: `Page` gains `ufValue` and `dollarRate`, and `pagePath` takes per-language slugs for
them (`valor-uf`/`uf-value`, `dolar-observado`/`dollar-rate`); every other page keeps one slug.
Astro route `src/pages/[lang]/[rate].astro` with `getStaticPaths` producing the four combinations.
`PageLayout` already builds canonical/hreflang from `pagePath`, so the alternates come out right.
`@astrojs/sitemap`'s i18n option pairs pages by replacing the language segment, which would pair
`/es/valor-uf/` with a non-existent `/en/valor-uf/`: its `serialize` hook rewrites the `links` of
these four URLs from the same slug table (checked by `test:build`).

## R9 — Structured data (FR-007)

**Decision**: each page carries JSON-LD `WebPage` + `ExchangeRateSpecification`
(`currency: "CLF"|"USD"`, `currentExchangeRate: UnitPriceSpecification { price, priceCurrency:
"CLP", validFrom: valueDate }`) + `BreadcrumbList` (fik › indicador). Values come from the build.

## R10 — Copy, source and CTA (FR-012)

**Decision**: source line "Fuente: Banco Central de Chile, vía mindicador.cl" with a link to
mindicador.cl. CTA block reuses the site's access link (`<a href="?acceso=registro" data-access>`),
which already opens registration in the page language. All copy under `landing.rates.*` and
`landing.meta.{ufValue,dollarRate}.*` in es/en (parity test); no em/en dashes (landing rule).
