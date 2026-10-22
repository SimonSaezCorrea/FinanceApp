# Tasks: Simulador público de compra en cuotas en mifik.cl

**Input**: Design documents from `specs/034-installment-simulator/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED (Constitution IV, test-first): each test task is written and seen failing before
its implementation task.

**Organization**: by user story (spec.md). Paths are repo-relative.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task.
- **[Story]**: US1–US5 from spec.md.

---

## Phase 1: Setup

- [x] T001 Amend Principle I in `.specify/memory/constitution.md` (MINOR bump to 2.8.0 + Sync Impact Report): name `fixedPaymentSchedule` in `@finance/money` as the ONE implementation of the cuota fija (French) system, same rounding rule as `equalPrincipalSchedule` (currency scale, last instalment absorbs); app aggregates keep `equalPrincipalSchedule`. Also record in the report that the simulator pages (`/es/simulador-cuotas/`, `/en/installment-calculator/`) are a second exception, after the indicator pages, to the public site's "English slugs in both languages" convention
- [x] T002 Add the `./installment-simulation` subpath to `packages/money/package.json` (`types` → `./dist/installmentSimulation.d.ts`, `import` → `./src/installmentSimulation.ts`, `default` → `./dist/installmentSimulation.js`), mirroring `./rate-format`; create an empty `packages/money/src/installmentSimulation.ts` exporting the types from data-model.md (`SimulationCurrency`, `SimulationSystem`, `SimulationInput`, `SimulationIssue`, `ScheduleRow` re-export, `SimulationResult`)
- [x] T003 Move `apps/landing/src/domains/rates/lib/typing.ts` and `typing.test.ts` to `apps/landing/src/lib/typing.ts` / `typing.test.ts` (git mv) and update its importers (`apps/landing/src/domains/rates/lib/converter.ts`, `apps/landing/src/domains/rates/scripts/rates.ts`, `rates.test.ts`); run `pnpm --filter @finance/landing test` to confirm nothing changed

---

## Phase 2: Foundational (blocks every story)

- [x] T004 Generalize per-language slugs in `apps/landing/src/lib/language.ts`: add page `"installmentSimulator"` to `PAGES`; rename `RATE_SLUGS` → `LOCALIZED_SLUGS` covering `ufValue`, `dollarRate` and `installmentSimulator` (`{ es: "simulador-cuotas", en: "installment-calculator" }`); `slugOf`/`pagePath` read it; keep `RATE_PAGES`/`isRatePage` for the indicator pages; update `[rate].astro`'s `getStaticPaths` to iterate `RATE_PAGES` keys over `LOCALIZED_SLUGS`; update `apps/landing/src/lib/language.test.ts` first (new page paths, both languages)
- [x] T005 Add the simulator pair (`/es/simulador-cuotas/` ↔ `/en/installment-calculator/`) to the sitemap alternates table in `apps/landing/astro.config.mjs` (rename `RATE_PAIRS` → `LOCALIZED_PAIRS`, keep the comment pointing at `LOCALIZED_SLUGS`)
- [x] T006 [P] Add the i18n skeleton in `apps/landing/src/i18n/es.json` and `en.json` (identical keys, no em/en dashes): `landing.meta.installmentSimulator.{title,description}`, `landing.simulator.{nav,title,lead}` and an empty-able structure for the keys added by later tasks; run the landing parity test

**Checkpoint**: the new page key resolves to both addresses; nothing renders yet.

---

## Phase 3: User Story 1 - Saber cuánto pago (Priority: P1) 🎯 MVP

**Goal**: price + cuotas + monthly rate → cuota fija, total pagado, intereses, live while typing,
offline, invalid data never shows numbers.

**Independent Test**: open `/es/simulador-cuotas/` without a session, type CLP 300.000 / 6 / 2% and
see cuota $53.558 (quickstart case 1); 0% splits 64.990 into 21.663 + 21.663 + 21.664.

### Tests for User Story 1 (write first, see them fail)

- [x] T007 [P] [US1] In `packages/money/src/installmentSimulation.test.ts`: `fixedPaymentSchedule` cases: quickstart 1 (CLP 300.000, 6, 0.02 → payments 53.558 ×5 + last absorbing, Σ principal = 300.000, last balance 0), 0% (64.990/3 → 21.663, 21.663, 21.664), 1 cuota (= P × 1.02), UF 100/24/0.005 at 4 decimals, USD 1.200/12/0.015 at 2 decimals; every row's `payment = principal + interest`
- [x] T008 [P] [US1] In the same file: `validateSimulationInput` returns `{field, code}` for empty price, price 0, 0 cuotas, 61 cuotas, non-integer cuotas, rate < 0, rate > 10, rate with > 4 decimals, price beyond 10^12 or the currency's scale; no issues for the default example
- [x] T009 [P] [US1] In the same file: `simulateInstallments` (system FIXED, no costs) returns `firstPayment`, `regularPayment`, `lastPayment`, `totalPaid`, `totalInterest`, `financed = price`; throws when the input has issues
- [x] T010 [P] [US1] `apps/landing/src/domains/simulator/lib/format.test.ts`: amounts per language (`es` → "$53.558", "UF 100,0000"; `en` → "$53,558", "US$1,200.00"), percents ("2,5 %" / "2.5%"), parsing typed values per language reusing the converter's rules
- [x] T011 [P] [US1] `apps/landing/src/domains/simulator/scripts/simulator.test.ts` (jsdom, fixture HTML from the components' markup): typing in price/cuotas/rate recomputes the summary on each `input` with no submit; the module loader is injected (like `rates.ts`'s `loadConverter`) and called once on idle or first input; an invalid field gets `aria-invalid="true"` + its message and the summary shows the "completa los datos" state; changing currency re-formats typed numbers without converting; the script never calls `fetch` nor touches `localStorage`/`sessionStorage` (FR-020)

### Implementation for User Story 1

- [x] T012 [US1] Implement in `packages/money/src/installmentSimulation.ts`: `fixedPaymentSchedule` (research R4: `c = P·i/(1−(1+i)^−n)` rounded to `currencyScale`, interest `round(balance × i)`, last = balance + interest; i = 0 → equal parts with last absorbing), `validateSimulationInput` (R5 limits), `simulateInstallments` for FIXED without costs; all `decimal.js`, `ROUND_HALF_EVEN`; make T007–T009 pass
- [x] T013 [P] [US1] `apps/landing/src/domains/simulator/lib/defaults.ts` (default example: CLP, "300000", 6, "2", FIXED, stamp tax = legal, fee "0"; US1's module ignores costs until T021, so through US1 the example's cuota is $53.558, and from US2 on it is $53.770 with the legal tax) and `lib/format.ts` (Intl `es-CL`/`en-US` over decimal strings, never `parseFloat` for arithmetic); make T010 pass
- [x] T014 [US1] `apps/landing/src/domains/simulator/components/SimulatorForm.astro`: labelled inputs (price with currency sign inside the field like `RateConverter.astro`, currency select CLP/UF/USD, cuotas, monthly rate %), `inputmode`, error slots wired with `aria-describedby`, 44 px targets, values from `defaults.ts`
- [x] T015 [US1] `apps/landing/src/domains/simulator/components/SimulatorResults.astro`: summary (cuota, total, intereses) rendered at build from `simulateInstallments(defaults)`, inside `aria-live="polite"` (payment + total only), plus the "completa los datos" state hidden by default
- [x] T016 [US1] `apps/landing/src/pages/[lang]/[simulator].astro`: FIRST confirm with a build that Astro generates every page of both `[lang]/[rate].astro` and `[lang]/[simulator].astro` (same-level dynamic routes) without a collision warning; if it warns or drops pages, use two static files instead (`apps/landing/src/pages/es/simulador-cuotas.astro`, `apps/landing/src/pages/en/installment-calculator.astro`) rendering a shared `domains/simulator/components/SimulatorPage.astro`. Then: `getStaticPaths` from `LOCALIZED_SLUGS.installmentSimulator`; `PageLayout` with title/description from `landing.meta.installmentSimulator.*`; `h1` (`HERO_TITLE`), lead, form + results; loads `domains/simulator/scripts/simulator.ts`
- [x] T017 [US1] `apps/landing/src/domains/simulator/scripts/simulator.ts`: `initSimulator()` reads fields with `lib/typing.ts` (group thousands while typing, caret kept), validates and recomputes on every input, lazy-imports `@finance/money/installment-simulation` on `requestIdleCallback` (fallback `setTimeout`) or first input, renders summary/errors; never fetches anything; make T011 pass
- [x] T018 [US1] Fill `landing.simulator.form.*`, `landing.simulator.results.*`, `landing.simulator.errors.*` in both catalogs (US1 copy: field labels, hints, error per code, "pagas lo mismo que al contado" sentence used by tasa 0)

**Checkpoint**: US1 works end to end on its own (quickstart cases 1, 3, 6, 7, 8, 10).

---

## Phase 4: User Story 2 - Costo real: impuesto, comisión y CAE (Priority: P2)

**Goal**: legal stamp tax pre-filled and editable with a notice, optional fixed fee, both financed,
CAE per DS 43.

**Independent Test**: quickstart case 2 (impuesto 0,396% → $1.188, financiado $301.188, CAE > 24%);
removing the tax lowers the CAE; editing it shows the notice and "Usar la tasa legal".

### Tests for User Story 2

- [x] T019 [P] [US2] In `packages/money/src/installmentSimulation.test.ts`: `stampTaxRate` (1 → "0.066", 6 → "0.396", 12 → "0.792", 13 and 60 → "0.8"); `caePercent` (no interest/no costs → "0.00"; quickstart 1 → "24.00" within rounding of the definition; one payment of 1.02×P → "24.00"; monotonic: adding costs raises it); `simulateInstallments` with tax + fee: `stampTax = round(price × rate)`, `financed = price + tax + fee`, Σ row `costs` = costs exactly, CAE uses D = price
- [x] T020 [P] [US2] In `apps/landing/src/domains/simulator/scripts/simulator.test.ts`: tax field follows cuotas until edited; once edited, changing cuotas keeps it and the "difiere de la tasa legal" notice shows; "Usar la tasa legal" restores and hides it; empty tax = 0; fee changes total and CAE

### Implementation for User Story 2

- [x] T021 [US2] Implement `stampTaxRate`, `caePercent` (bisection on the monthly rate in [0, 1] with `decimal.js`, accumulated discount factor, |f| < 1e-10 or 200 iterations, CAE = i × 12 × 100 at 2 decimals) and costs financing + per-row `costs` split (research R3) in `packages/money/src/installmentSimulation.ts`; make T019 pass
- [x] T022 [US2] Extend `SimulatorForm.astro` with the stamp-tax field (pre-filled legal %, notice + "Usar la tasa legal" button, hidden by default) and the optional fee field; extend `SimulatorResults.astro` with costs total and CAE + its one-line explanation
- [x] T023 [US2] Extend `scripts/simulator.ts` with `touchedStampTax` state, legal-rate follow, notice/restore and fee handling; make T020 pass
- [x] T024 [US2] Fill `landing.simulator.costs.*` and `landing.simulator.cae.*` in both catalogs

**Checkpoint**: US1 + US2 independently verifiable.

---

## Phase 5: User Story 3 - Sistemas y detalle mes a mes (Priority: P2)

**Goal**: switch FIXED/CONSTANT with the difference shown; monthly table that sums exactly.

**Independent Test**: quickstart case 5; table columns sum to the shown totals in both systems.

### Tests for User Story 3

- [x] T025 [P] [US3] In `packages/money/src/installmentSimulation.test.ts`: CONSTANT calls `equalPrincipalSchedule` (same rows as calling it directly with `aprPerPeriod` = monthly rate and the currency); `firstPayment > lastPayment`; `otherSystemTotal`/`systemDifference` = this total − the other system's; every row has `balance`, last balance = 0; Σ principal = financed, Σ payment = totalPaid in both systems
- [x] T026 [P] [US3] In `scripts/simulator.test.ts`: the system radios switch the summary (first/last payment for CONSTANT, the difference sentence) and re-render the table rows

### Implementation for User Story 3

- [x] T027 [US3] Add CONSTANT system, `balance` per row and the other-system comparison to `simulateInstallments` in `packages/money/src/installmentSimulation.ts`; make T025 pass
- [x] T028 [US3] `apps/landing/src/domains/simulator/components/SimulatorTable.astro`: `<table>` with `<caption>`, `scope` headers (N°, capital, interés, costos, cuota, saldo), rows rendered at build from the default example, totals row; horizontal scroll inside its own box on a phone (never the page); system radios (native `fieldset`/`radio`) added to `SimulatorForm.astro`
- [x] T029 [US3] Extend `scripts/simulator.ts` to render the table rows and the system switch; make T026 pass; fill `landing.simulator.system.*` and `landing.simulator.table.*` in both catalogs

**Checkpoint**: US1–US3 verifiable.

---

## Phase 6: User Story 4 - Contado vs cuotas (Priority: P3)

**Goal**: cash vs instalments with extra in amount and %, "sin interés de verdad" vs "solo costos",
optional cash price.

**Independent Test**: quickstart cases 3, 4 and 9.

- [x] T030 [P] [US4] In `packages/money/src/installmentSimulation.test.ts`: `cashComparison` kinds `SAME` (0%, no costs), `COSTS_ONLY` (0%, with tax), `MORE` (interest); `extra = totalPaid − cashPrice`, `extraPercent` 2 decimals; cash price defaults to price; validation `aboveCashLimit` when cash price > price
- [x] T031 [P] [US4] In `scripts/simulator.test.ts`: optional cash-price field changes the comparison; each kind shows its sentence
- [x] T032 [US4] Implement `cashComparison` + `cashPrice` validation in `packages/money/src/installmentSimulation.ts`; make T030 pass
- [x] T033 [US4] Add the cash-price field to `SimulatorForm.astro` and the comparison block to `SimulatorResults.astro`; extend `scripts/simulator.ts`; make T031 pass; fill `landing.simulator.cash.*` in both catalogs

---

## Phase 7: User Story 5 - Encontrar la herramienta y pasar a la app (Priority: P3)

**Goal**: footer + home links, language switch, method/sources/disclaimer in the HTML, JSON-LD, CTA
with "Ir a la app" when signed in, sitemap.

**Independent Test**: `test:build` finds title, description, canonical, hreflang pair, sitemap
entries, the solved example and the method section in the HTML without scripts; footer/home links;
CTA template present.

- [x] T034 [P] [US5] Extend `apps/landing/test/build.test.ts` first: both simulator pages exist with unique title/description, canonical, `hreflang` to each other, appear in the sitemap with each other as alternates, contain the solved default example with the legal stamp tax (cuota $53.770 in Spanish, $53,770 in English, and its CAE) and the method section with links to the SII and LeyChile sources, JSON-LD `WebApplication` + `BreadcrumbList`, a `[data-access-slot]` with `template[data-app-template]`, no React runtime; every page's footer links to the simulator in its language; the home contains the simulator block
- [x] T035 [P] [US5] `apps/landing/src/domains/simulator/components/SimulatorMethod.astro`: "Cómo se calcula" (cuota fija vs capital constante, stamp tax 0,066%/mes tope 0,8% with SII link, CAE per DS 43 with LeyChile link, costs financed and computed on the price), "simulación referencial" notice (FR-019)
- [x] T036 [P] [US5] `apps/landing/src/domains/simulator/components/SimulatorCta.astro`: sign-up `<a href="?acceso=registro" data-access="registro">` inside `[data-access-slot]` with `<template data-app-template>` "Ir a la app" (same mechanism as `Header.astro`, swapped by `scripts/session.ts`); ensure the page loads the session script like other pages do
- [x] T037 [US5] Wire method, CTA and JSON-LD (`WebApplication`, `applicationCategory: "FinanceApplication"`, `offers.price: 0`, `inLanguage`; `BreadcrumbList`) into `[simulator].astro`; link to the other-language page via `PageLayout`'s alternates
- [x] T038 [P] [US5] Footer link: add `{ page: "installmentSimulator", key: "landing.simulator.nav" }` next to the indicator links in `apps/landing/src/domains/landing/components/Footer.astro`
- [x] T039 [P] [US5] Home block: `apps/landing/src/domains/simulator/components/HomeSimulator.tsx` (React at build only, like `HomeRates`), placed after the rates block in `apps/landing/src/domains/landing/pages/LandingPage.tsx`; short pitch + the default example's cuota + link
- [x] T040 [US5] Fill `landing.simulator.method.*`, `landing.simulator.cta.*`, `landing.simulator.home.*`, `landing.meta.installmentSimulator.*` final copy in both catalogs; build with the fixture and make T034 pass

---

## Phase 8: Polish & Cross-Cutting

- [x] T041 [P] Edge cases from spec.md in `scripts/simulator.test.ts`: pasted "$ 300.000", "1,89" rate in Spanish / "1.89" in English, costs larger than the price (renders the full CAE figure, no cap, without breaking the layout), 60 cuotas at 10% (table readable), currency switch with typed values
- [x] T042 Performance check: in a test, `simulateInstallments` for 60 cuotas in both systems with costs completes in < 20 ms in Node (SC-004 headroom; the on-phone check is T044 with DevTools CPU throttling 4x); confirm the page's initial JS stays small (build output: the simulator chunk is loaded lazily, no `decimal.js` in the entry script)
- [x] T043 Run `pnpm --filter @finance/money test typecheck`, `pnpm --filter @finance/landing test typecheck lint`, the landing build with `EXCHANGE_RATES_SNAPSHOT=test/fixtures/rates-snapshot.json` + `test:build`, `pnpm format:check`, `pnpm check:boundaries`
- [x] T044 Manual quickstart in the browser (`pnpm --filter @finance/landing dev`) and local Lighthouse mobile on both pages (SC-003) and per-keystroke latency with DevTools CPU throttling 4x (< 100 ms, SC-004); record results in the plan summary. **Done 2026-10-22**: Lighthouse mobile (13.5.0, `astro preview`) on both pages: Performance 100, Accessibility 100, SEO 100, Best practices 96 (only the console error of the session probe to the local API, which was not running), LCP 1,7 s, CLS 0, TBT 0 ms. NOT done: typing in a real browser with CPU throttling (no browser automation here); Node timing covers it (60 cuotas, both systems, < 20 ms)
- [x] T045 Memory sync: `CLAUDE.md` (landing bullet: simulator pages and the naming per layer: page key `installmentSimulator`, domain/i18n `simulator`, slugs `simulador-cuotas`/`installment-calculator`; `@finance/money/installment-simulation`, `LOCALIZED_SLUGS`, moved `lib/typing.ts`; plan pointer → implementado with what was verified) and confirm the constitution amendment from T001; add `docs/PENDING.md` follow-ups if any

---

## Dependencies & Execution Order

- Setup (T001–T003) → Foundational (T004–T006) → US1 (MVP) → US2 → US3 → US4 → US5 → Polish.
- US2–US4 extend the same module and components as US1, so they run after it in order; within a
  story, the [P] test tasks run together, then the implementation in listed order.
- US5's T034/T035/T036/T038/T039 are independent of each other and only need the page from US1.
- T001 (constitution amendment) MUST land before T012 (first code of the French schedule).

## Parallel Example: User Story 1

```text
T007, T008, T009, T010, T011   # all tests, different files or independent describe blocks
then T012 ‖ T013               # money module and landing libs
then T014 → T015 → T016 → T017 → T018
```

## Implementation Strategy

1. MVP = Phases 1–3: a working public simulator with cuota fija (shippable alone).
2. Add US2 (costs + CAE), the key differentiator, then US3 (systems + table).
3. US4 and US5 complete the SEO surface (cash comparison, links, metadata, CTA).
4. Polish + memory sync; deploy through `dev` → `main` as usual.
