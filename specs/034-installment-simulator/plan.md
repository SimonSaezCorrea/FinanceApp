# Implementation Plan: Simulador público de compra en cuotas en mifik.cl

**Branch**: `034-installment-simulator` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/034-installment-simulator/spec.md`

## Summary

Two static public pages (`/es/simulador-cuotas/`, `/en/installment-calculator/`) answer "¿cuánto pago
en N cuotas?" without an account: cuota fija (francés) or capital constante, stamp tax pre-filled
with the legal rate and editable, an optional fixed fee, CAE (DS 43: monthly IRR × 12), cash vs
instalments and a monthly table. All arithmetic lives in a new pure module,
`@finance/money/installment-simulation` (`decimal.js`), used at build to write a solved example
into the HTML and in the browser (loaded on idle) to recompute on every keystroke. The capital
constante system calls the app's own `equalPrincipalSchedule`. No API, no schema, no React on
arrival. Footer and home link to it; the CTA opens sign-up, or "Ir a la app" when signed in.
Research R1–R10.

## Technical Context

**Language/Version**: TypeScript, Node 22 (Astro 7).

**Primary Dependencies**: existing only: Astro 7 + `@astrojs/sitemap` (landing), `@finance/money`
(`decimal.js`, `equalPrincipalSchedule`, `currencyScale`), `@finance/i18n`. No new dependency.

**Storage**: N/A (nothing saved, FR-020).

**Testing**: Vitest: `packages/money` unit (schedule, stamp tax, CAE, validation, ≥ 10 reference
cases), landing unit (jsdom: page script, moved `typing`), landing `test:build` over `dist/`.

**Target Platform**: Cloudflare Pages (static), modern mobile browsers.

**Project Type**: web monorepo (`packages/money`, `apps/landing`).

**Performance Goals**: Lighthouse mobile ≥ 95 performance, 100 the rest, LCP ≤ 2 s (SC-003);
< 100 ms per keystroke (SC-004).

**Constraints**: result present in the HTML; no React/hydration on arrival; `decimal.js` loaded
after first paint; es/en parity; no em/en dashes in `landing.*`; works offline once loaded.

**Scale/Scope**: 2 pages + home block + footer link; ≤ 60 schedule rows.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                               | Status                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Money precision                      | PASS with **amendment**: every amount and rate in `decimal.js`, rounded to `currencyScale`, last instalment absorbs. Principle I names `equalPrincipalSchedule` as THE single split implementation; this adds a second SYSTEM (French), so the principle is amended (MINOR) to name `fixedPaymentSchedule` as the single French implementation, before the code lands (first task). Capital constante reuses `equalPrincipalSchedule`. |
| II. Per-user isolation                  | N/A: no endpoint, no user data.                                                                                                                                                                                                                                                                                                                                                                                                        |
| III. i18n parity                        | PASS: copy in `apps/landing/src/i18n/{es,en}.json` (`landing.simulator.*`, `landing.meta.installmentSimulator.*`), parity test.                                                                                                                                                                                                                                                                                                        |
| IV. Test-first                          | PASS: money tests (reference cases) written before the module; page tests before the script.                                                                                                                                                                                                                                                                                                                                           |
| V. SDD & living memory                  | PASS: this cycle; constitution + CLAUDE.md updated at close.                                                                                                                                                                                                                                                                                                                                                                           |
| VI. DDD/CQRS                            | N/A: no backend change.                                                                                                                                                                                                                                                                                                                                                                                                                |
| VII. Idempotency                        | N/A: no write endpoint.                                                                                                                                                                                                                                                                                                                                                                                                                |
| VIII. Identifiers                       | N/A: no new entity or id.                                                                                                                                                                                                                                                                                                                                                                                                              |
| Public site static, no React on arrival | PASS: build-time rendering + plain script.                                                                                                                                                                                                                                                                                                                                                                                             |

**Data gates:**

- [x] Toda entidad nueva declara formato de identificador: no hay entidades nuevas.
- [x] Todo endpoint de escritura nuevo declara su forma de idempotencia: no hay endpoints.
- [x] Toda FK aceptada desde el cuerpo de un request declara su verificación de ownership: no hay requests.

Post-design re-check: PASS (unchanged).

## Project Structure

### Documentation (this feature)

```text
specs/034-installment-simulator/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── installment-simulation.md
│   └── pages.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
packages/money/
├── package.json                              # + "./installment-simulation" subpath
└── src/
    ├── installmentSimulation.ts              # NEW: stampTaxRate, fixedPaymentSchedule, caePercent,
    │                                         #      validateSimulationInput, simulateInstallments
    └── installmentSimulation.test.ts         # NEW: reference cases (SC-001)

apps/landing/
├── astro.config.mjs                          # sitemap alternates: + simulator pair
├── src/
│   ├── lib/
│   │   ├── language.ts                       # + page "installmentSimulator"; RATE_SLUGS → LOCALIZED_SLUGS
│   │   └── typing.ts                         # MOVED from domains/rates/lib/typing.ts (+ its test)
│   ├── pages/[lang]/[simulator].astro        # NEW route (getStaticPaths per language slug)
│   ├── domains/simulator/                    # NEW domain
│   │   ├── components/
│   │   │   ├── SimulatorForm.astro           # inputs, system radios, stamp-tax notice
│   │   │   ├── SimulatorResults.astro        # summary, CAE, cash comparison (aria-live)
│   │   │   ├── SimulatorTable.astro          # monthly table
│   │   │   ├── SimulatorMethod.astro         # "cómo se calcula" + sources + disclaimer
│   │   │   ├── SimulatorCta.astro            # sign-up / "Ir a la app" slot
│   │   │   └── HomeSimulator.tsx             # home block (React at build only, like HomeRates)
│   │   ├── lib/
│   │   │   ├── defaults.ts                   # the default example input
│   │   │   ├── format.ts                     # amounts/percent per language (Intl over decimal strings)
│   │   │   └── *.test.ts
│   │   └── scripts/
│   │       ├── simulator.ts                  # field handling, lazy import, render results
│   │       └── simulator.test.ts
│   ├── domains/landing/components/Footer.astro   # + link
│   ├── domains/landing/pages/LandingPage.tsx     # + HomeSimulator on home
│   └── i18n/{es,en}.json                         # landing.simulator.*, landing.meta.installmentSimulator.*
└── test/build.test.ts                        # + simulator pages
```

**Structure Decision**: pure arithmetic in `packages/money` (shared, testable in Node, one
implementation per system); presentation as a new frontend domain `simulator` in `apps/landing`,
mirroring `domains/rates` (Astro components rendered at build + one plain script).

## Complexity Tracking

| Violation                                                                         | Why Needed                                                      | Simpler Alternative Rejected Because                                          |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Second schedule function next to `equalPrincipalSchedule` (Principle I amendment) | Chilean lenders quote cuota fija; the spec requires it (FR-004) | Using only capital constante would show numbers that never match a real offer |
