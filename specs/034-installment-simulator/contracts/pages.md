# Contract: public pages

| Language | Address                       | Canonical | Alternate                                       |
| -------- | ----------------------------- | --------- | ----------------------------------------------- |
| es       | `/es/simulador-cuotas/`       | itself    | `/en/installment-calculator/` (`hreflang="en"`) |
| en       | `/en/installment-calculator/` | itself    | `/es/simulador-cuotas/` (`hreflang="es"`)       |

Both in `sitemap-*.xml` with each other as alternates. No query parameters are read or written.

## HTML a crawler reads (no script executed)

- `<title>` / meta description from `landing.meta.installmentSimulator.*`.
- `<h1>`, a lead paragraph, the form pre-filled with the default example (CLP 300.000, 6 cuotas,
  2% mensual, cuota fija, impuesto legal 0,396% = $1.188, sin comisión → cuota $53.770) AND its results already computed at build:
  cuota, total, intereses, costos, CAE, contado vs cuotas, and the full monthly table.
- "Cómo se calcula" section: cuota fija vs capital constante, impuesto de timbres (0,066% por mes,
  tope 0,8%, SII), CAE (DS 43, monthly rate × 12), with links to the sources; "simulación referencial"
  notice (FR-019).
- JSON-LD: `WebApplication` (`applicationCategory: "FinanceApplication"`, `offers.price: 0`) and
  `BreadcrumbList`.
- CTA block inside `[data-access-slot]` with `<template data-app-template>` ("Ir a la app").

## Script behaviour (`domains/simulator/scripts/simulator.ts`)

- Inputs group thousands while typing (`lib/typing.ts`); recompute on every `input` event, no submit.
- Loads `@finance/money/installment-simulation` on idle or first input; until then, the build-time
  result stays visible.
- Invalid field → `aria-invalid="true"`, message under it, results area shows "Completa los datos"
  instead of numbers (FR-014).
- Changing currency reinterprets the typed numbers (re-formatted to the new scale), never converts.
- Results summary in `aria-live="polite"` (payment + total only).

## Links into the page

- Footer of every page (both languages), next to the indicator links: `landing.simulator.nav`.
- Home: a block after the indicators block, linking to the page in the visitor's language.
