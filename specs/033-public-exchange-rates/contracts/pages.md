# Contract: indicator pages and home block

## Routes

| Page key     | es                     | en                 | hreflang pair                  |
| ------------ | ---------------------- | ------------------ | ------------------------------ |
| `ufValue`    | `/es/valor-uf/`        | `/en/uf-value/`    | each other + `x-default` = `/` |
| `dollarRate` | `/es/dolar-observado/` | `/en/dollar-rate/` | each other + `x-default` = `/` |

Date parameter: `?fecha=YYYY-MM-DD` (es), `?date=YYYY-MM-DD` (en). Never in the canonical.

## What the built HTML MUST contain (checked by `test:build`)

- `<title>` and `<meta name="description">` from `landing.meta.{ufValue,dollarRate}.*`, including
  the value and its date when known.
- Headline: value formatted for the page language (`formatMoney`, es-CL / en-US), its date, the
  change (amount, %), the carried notice when `isCarried`, the source line.
- `[data-rate-value]`, `[data-rate-date]`, `[data-rate-change]`, `[data-rate-carried]` hooks for the
  arrival script.
- Two `<svg>` charts (30 days, 1 year), the 30-day `<table>` with a carried mark per row.
- `<script type="application/json" id="rates-year">` with the year series of that currency.
- Converter: two labelled numeric inputs (pesos ↔ unit), a native date input (`min` = `first`,
  `max` = today), the date in use shown next to the result.
- JSON-LD `WebPage`, `ExchangeRateSpecification`, `BreadcrumbList`.
- CTA with `<a href="?acceso=registro" data-access>`.
- Link to the other indicator page; footer links to both (all pages).
- Without a snapshot: the "sin valor disponible" state, no fake number, no JSON-LD rate.

## Home block (`/es/`, `/en/`)

Two compact tiles (UF, dólar): value, date, carried notice, link to its page; same `[data-rate-*]`
hooks and arrival refresh. Placed next to the existing currencies strip.

## Sitemap

The four URLs appear once each; their `xhtml:link` alternates point to the real pair (es ↔ en slug),
never to a non-existent URL.
