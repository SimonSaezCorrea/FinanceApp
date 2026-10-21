# Data Model: Valor UF y dólar observado, públicos

No schema change and no migration. The feature reads the existing `exchange-rate` table (specs/030).

## ExchangeRate (existing, read-only here)

| Field       | Meaning                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| `currency`  | `USD` (dólar observado) or `CLF` (UF)                                        |
| `date`      | Chile calendar day the row answers for (`YYYY-MM-DD`)                        |
| `value`     | pesos per ONE unit, decimal string                                           |
| `valueDate` | day the source published `value`; `valueDate < date` ⇒ carried (`isCarried`) |

One row per `(currency, date)`; rows exist for every day since the first recording (carried rows
included), so "the value of day D" is the row with `date = D`.

## Derived values (page side, never stored)

- **Current value**: `latest[currency]` of the response.
- **Change**: `current.value − previous.value`, where `previous` is the row with the greatest
  `date < current.date`; absent when there is none. Percentage = change / previous × 100, two
  decimals. Equal values ⇒ "sin cambio".
- **Conversion**: `convertAmount(amount, rate, toCurrency)` from `@finance/money` (CLP 0 decimals,
  USD 2, CLF 4). Unit→pesos is exactly the app's suggestion (`amount × value`). The app has no
  pesos→unit conversion today; the page uses the same function with the inverse rate computed in
  `decimal.js` (`1 / value`, 20 significant digits), so SC-003's "same as the app" is measured on
  unit→pesos and pesos→unit is covered by its own unit tests.
- **First selectable day**: `first[currency]` of the response (additive field, see contract).

## Build snapshot (build-time only)

`RatesSnapshot = { today: string; latest: ExchangeRate | null; first: string | null; year:
ExchangeRate[] }` per currency, from one `GET /public/exchange-rates?currency=X&from=today−365&to=today`.

## Page entity (static)

| Page         | es                     | en                 |
| ------------ | ---------------------- | ------------------ |
| `ufValue`    | `/es/valor-uf/`        | `/en/uf-value/`    |
| `dollarRate` | `/es/dolar-observado/` | `/en/dollar-rate/` |

Each: title, description, canonical (no query), hreflang pair + x-default, JSON-LD, sitemap entry.
