# Tasks: Tipos de cambio y conversión estimada USD↔CLP, UF

**Input**: Design documents from `/specs/030-exchange-rates/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: REQUIRED — Constitution Principle IV (TDD). Within each story, test tasks come first and MUST fail before the implementation task that makes them pass.

**Organization**: by user story (US1 historial diario · US2 pagar/prepagar USD con monto estimado · US3 equivalente en pesos · US4 traspaso USD→CLP). US2 también implementa lo que la spec 028 US2 dejó pendiente (decisión del plan, research R7): la facturación en otra moneda hoy no se puede pagar.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Add `model ExchangeRate` (`id` uuid(7), `currency` VarChar(3), `date` Date, `value` Decimal(18,4), `valueDate` Date, `createdAt`, `updatedAt`, `@@unique([currency, date])`, `@@index([currency, date(sort: Desc)])`, `@@map("exchange-rate")`) exactly as in data-model.md, in apps/api/prisma/schema.prisma
- [x] T002 Run `pnpm db:push` and `pnpm --filter @finance/api exec prisma generate`; confirm the table exists and that the 028 columns this feature relies on are already in the schema (`CreditStatement.currency`, `CreditStatement.settlementTransactionId`, `Transaction.settlesStatementId`) — if any is missing, add it to apps/api/prisma/schema.prisma before continuing
- [x] T003 [P] Add the i18n scaffolding (es + en, identical keys) for the new area in apps/web/src/i18n/es.json and apps/web/src/i18n/en.json: `nav.exchangeRates`, `exchangeRates.title`, `exchangeRates.today`, `exchangeRates.carried`, `exchangeRates.estimated`, `exchangeRates.valueOn`, `exchangeRates.usd`, `exchangeRates.uf`, `errors.EXCHANGE_RANGE_TOO_LARGE`, `errors.INVALID_DATE_RANGE`, `errors.STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS` (skip any key that already exists); `apps/web/src/i18n/parity.test.ts` must stay green

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: no user story work begins until this phase is complete.

- [x] T004 [P] Write failing unit tests for `convertAmount(amount, rate, toCurrency)` — US$100 × 950 → CLP "95000"; US$50,41 × 979,85 rounds to a whole peso (`currencyScale` CLP 0); a CLP→USD conversion rounds to 2 decimals; rate "0" or negative throws; never uses floats (assert a case where `number` arithmetic would drift) — in packages/money/src/index.test.ts
- [x] T005 Implement T004: `convertAmount` in packages/money/src/index.ts, using `decimal.js` and `currencyScale` (the single conversion implementation — server and web both import it, research R6)
- [x] T006 [P] Write failing contract tests: `exchangeRateSchema` parses `{currency, date, value, valueDate}`; rejects `currency` outside `USD|CLF`, non-positive `value`, `valueDate > date`; `isCarried(rate)` is `valueDate < date`; `rateOn(rows, "2026-10-04")` returns the row with the greatest `date <=` the one asked, `null` when none, and ignores other currencies when `currency` is passed; `listExchangeRatesQuerySchema` defaults and rejects `from > to` and ranges over 400 days — in packages/contracts/src/exchange-rates/index.test.ts
- [x] T007 Implement T006 in packages/contracts/src/exchange-rates/index.ts (`exchangeRateSchema`, `isCarried`, `rateOn`, `listExchangeRatesQuerySchema`, `listExchangeRatesResponseSchema { items, latest: { USD, CLF } }`, `EXCHANGE_RANGE_MAX_DAYS = 400`), export it from packages/contracts/src/index.ts, and rebuild with `pnpm --filter @finance/contracts build`
- [x] T008 [P] Create the domain layer of the new table-domain: `ExchangeRate` entity (props, `isCarried()`), `ExchangeRateRepositoryPort` (`upsert`, `findLatest(currency)`, `findRange(currency?, from, to)`, `lastDate(currency)`, `count()`), and `domain/errors.ts` (`ExchangeRangeTooLargeError` 400, `InvalidDateRangeError` 400) in apps/api/src/domains/exchange-rate/domain/exchange-rate.entity.ts, apps/api/src/domains/exchange-rate/domain/ports/exchange-rate.repository.port.ts and apps/api/src/domains/exchange-rate/domain/errors.ts
- [x] T009 [P] Write failing adapter integration tests (real Postgres, helper in apps/api/test/integration/support/repositories.ts): `upsert` twice for the same `(currency, date)` leaves ONE row and the second call can raise `valueDate`; `findLatest` returns the newest row per currency; `findRange` is ordered by date desc and bounded; `lastDate` is null on an empty table — in apps/api/test/integration/domains/exchange-rate/infrastructure/prisma-exchange-rate.repository.spec.ts
- [x] T010 Implement T009: `PrismaExchangeRateRepository` (the only file in this domain allowed to import `@prisma/client`) in apps/api/src/domains/exchange-rate/infrastructure/prisma-exchange-rate.repository.ts, plus the leaf apps/api/src/domains/exchange-rate/exchange-rate.data.module.ts (exports only the port→adapter binding); add the repository to `test/integration/support/repositories.ts` and a `fakeExchangeRateRepository()` to apps/api/test/unit/support/fake-ports.ts
- [x] T011 [P] Web data layer: `exchangeRatesApi.list(params)` in apps/web/src/domains/exchange-rates/api/exchangeRatesApi.ts and the hooks `useExchangeRates(params)` and `useLatestRates()` (TanStack Query; stale time 10 min — values change at most hourly) in apps/web/src/domains/exchange-rates/hooks/useExchangeRates.ts, plus `useRateOn(currency, isoDate)` which fetches a 60-day window ending at `isoDate` and applies the contract's `rateOn`
- [x] T064 Constitution amendment BEFORE any UF conversion code (blocks T051/T053): amend the MVP-scope clause (c) "the UF is a unit of account, not a spendable currency... gets no approximate CLP hint" in .specify/memory/constitution.md so that a UF amount MAY appear in the single estimated "≈ todo en CLP" net-worth total (labelled as an estimate, with the UF value date) now that a registered UF value exists, while a UF account still shows no per-account CLP hint and UF is never offered as a payment/transfer suggestion; bump the version (MINOR) and add a Sync Impact Report entry
- [x] T033 [P] Failing web unit tests for the suggestion logic `useSuggestedAmount` (a hook over `convertAmount` + `useRateOn`): suggests `USD × rate(date of payment)`; changing the dollars or the payment date re-suggests while the pesos are untouched; once the user edits the pesos it stops re-suggesting and NEVER touches the dollars; with no rate it returns an empty suggestion — in apps/web/src/domains/accounts/hooks/useSuggestedAmount.test.ts (moved to Foundational so US4 stays independent of US2)
- [x] T042 Web: `useSuggestedAmount({ amount, fromCurrency, toCurrency, date })` — returns `{ suggested, rate, rateDate, carried, markEdited() }` — makes T033 pass — in apps/web/src/domains/accounts/hooks/useSuggestedAmount.ts (moved to Foundational so US4 stays independent of US2)

**Checkpoint**: conversion math, contract, table and web data layer exist; no behavior is visible yet.

---

## Phase 3: User Story 1 — Historial diario del dólar y la UF (Priority: P1) 🎯 MVP

**Goal**: cada día queda registrado el dólar y la UF (real o arrastrado), y la persona los consulta en una pantalla "Tipos de cambio".

**Independent Test**: dejar correr un tic con la fuente simulada y consultar `GET /exchange-rates` y la pantalla: hay un valor por día, incluidos fines de semana (arrastrado); con la fuente caída no se inventa nada y el valor real posterior reemplaza al arrastrado (quickstart §1–3).

### Tests for User Story 1 ⚠️

- [x] T012 [P] [US1] Failing unit tests for `MindicadorSource` (the HTTP adapter behind an `ExchangeRateSourcePort`): parses `GET /api` into `{USD: {valueDate, value}, CLF: {...}}` taking the UTC date part of `fecha`; parses a yearly series from `GET /api/dolar/{year}` and `GET /api/uf/{year}`, including entries dated in the future; non-2xx, invalid JSON, a missing indicator and a timeout each throw `ExchangeRateSourceUnavailableError` (never return partial data) — in apps/api/test/unit/domains/exchange-rate/application/mindicador-source.spec.ts
- [x] T013 [P] [US1] Failing unit tests for `RecordExchangeRatesHandler` with fake source/repo: (a) first run on an empty table seeds the last 365 days from the yearly series of the CURRENT and the PREVIOUS year (the window crosses a year boundary), each day taking the latest published value `<=` that day and DISCARDING series entries dated after the day being filled (the UF series carries future dates, which would violate `valueDate <= date`); (b) a weekday run stores `(today, value, valueDate)` per currency; (c) when the source's latest `valueDate` is older than today the row is stored with that older `valueDate` (carried); (d) when both of today's rows already have `valueDate == today` it does nothing (no source call); (e) source failure writes nothing and does not throw; (f) the 20:00 tick with a failed source and no row for today copies the last known row (carried), while an earlier tick does not; (g) a later successful run replaces a carried row (`valueDate` rises to today); (h) gaps between the last stored day and today are filled — in apps/api/test/unit/domains/exchange-rate/application/record-exchange-rates.handler.spec.ts
- [x] T014 [P] [US1] Failing unit tests for `ListExchangeRatesQueryHandler`: returns `items` desc and `latest` per currency regardless of range; `from > to` → `INVALID_DATE_RANGE`; > 400 days → `EXCHANGE_RANGE_TOO_LARGE`; default window is the last 30 days — in apps/api/test/unit/domains/exchange-rate/application/list-exchange-rates.handler.spec.ts
- [x] T015 [P] [US1] Failing integration test: `RecordExchangeRatesHandler` against the real adapter run twice concurrently for the same day leaves exactly one row per currency (form (b) idempotency, Principle VII) — in apps/api/test/integration/domains/exchange-rate/application/record-exchange-rates.spec.ts
- [x] T016 [P] [US1] Failing e2e: `GET /exchange-rates` requires a session (401 without), validates the query (400 codes), answers `{ items, latest }`; there is no write route (POST/PATCH/DELETE → 404) — in apps/api/test/e2e/domains/exchange-rate/exchange-rates.http.spec.ts
- [x] T017 [P] [US1] Failing web tests for `ExchangeRatesRoute`: shows today's USD and UF with their value date and a "dato arrastrado" badge when `valueDate < date`; picking a past date shows that day's value, also when it lies outside the loaded range (the jump issues its own one-day query); a date before the first stored row shows "sin dato para esa fecha" instead of an empty or wrong value; the range selector changes the requested window; empty state when there are no rows; loading and error states keep the page header — in apps/web/src/domains/exchange-rates/routes/ExchangeRatesRoute.test.tsx

### Implementation for User Story 1

- [x] T018 [US1] Define `ExchangeRateSourcePort` and `ExchangeRateSourceUnavailableError`, then implement `MindicadorSource` with native `fetch` + `AbortSignal.timeout(10000)` (mirror `GeoIpLookup`'s style; base URL `https://mindicador.cl/api`, overridable by an optional `EXCHANGE_RATE_SOURCE_URL` env var used by tests) — makes T012 pass — in apps/api/src/domains/exchange-rate/application/exchange-rate-source.ts and apps/api/src/domains/exchange-rate/infrastructure/mindicador-source.ts
- [x] T019 [US1] Create `RecordExchangeRatesCommand` (`scope: "system"`, the named exception to per-user scoping, carries `now` and a `isLastTickOfDay` flag) and `RecordExchangeRatesHandler` implementing the rules of T013 (seed 365 days when empty, gap fill, upsert, no-op when complete, carry-forward only on the last tick, never throw on source failure, `Logger` warn/log per research R12) — makes T013/T015 pass — in apps/api/src/domains/exchange-rate/application/commands/record-exchange-rates.command.ts and record-exchange-rates.handler.ts
- [x] T020 [US1] Create `ListExchangeRatesQuery` and `ListExchangeRatesQueryHandler` (extends `BaseQueryHandler`) — makes T014 pass — in apps/api/src/domains/exchange-rate/application/queries/list-exchange-rates.query.ts and list-exchange-rates.handler.ts
- [x] T021 [US1] Create `ExchangeRatesController` (`GET /exchange-rates`, `JwtAuthGuard`, query validated with `ZodValidationPipe(listExchangeRatesQuerySchema)`) and the orchestration module `exchange-rate.module.ts` importing the data leaf and registering both handlers + `MindicadorSource` under its port token; register the module in apps/api/src/app.module.ts — makes T016 pass — in apps/api/src/domains/exchange-rate/presentation/exchange-rates.controller.ts, apps/api/src/domains/exchange-rate/exchange-rate.module.ts and apps/api/src/app.module.ts
- [x] T022 [US1] Create the thin `ExchangeRateCron` (`@Cron("0 8-20 * * *", { timeZone: "America/Santiago" })`, computes `isLastTickOfDay` from the Santiago hour, dispatches the command) and register it in apps/api/src/infra/cron/exchange-rate.cron.ts and apps/api/src/infra/cron/cron.module.ts
- [x] T023 [P] [US1] Web: `RateChart` (Recharts line, USD and UF as separate small charts since their scales differ ~40×, tokens only, no hardcoded hex) and `RateTable` (date, value, "arrastrado" badge, date jump control built on `DateField` that queries the chosen day on its own and shows "sin dato" when there is none) in apps/web/src/domains/exchange-rates/components/RateChart.tsx and apps/web/src/domains/exchange-rates/components/RateTable.tsx
- [x] T024 [US1] Web: `ExchangeRatesRoute` (header, two "today" cards with value date + carried badge, range selector 30 días / 1 año, chart, table) — makes T017 pass — in apps/web/src/domains/exchange-rates/routes/ExchangeRatesRoute.tsx; register `/exchange-rates` with `handle({ title: "nav.exchangeRates" })` in apps/web/src/app/router.tsx and add the sidebar item to the "Tu dinero" group (and the phone "Más" sheet) in apps/web/src/app/AppLayout.tsx
- [x] T025 [US1] Run the US1 tests (unit, integration, e2e for `exchange-rate`, web `exchange-rates` + `i18n`) and walk quickstart §1–3 against the real mindicador.cl; all green

**Checkpoint**: US1 delivers the daily history and its screen on its own.

---

## Phase 4: User Story 2 — Pagar o prepagar una facturación USD con monto estimado (Priority: P1)

**Goal**: pagar y prepagar una facturación en otra moneda desde una cuenta en pesos, con los pesos sugeridos (editables) a partir del valor del día. Implementa además lo que 028 US2 dejó pendiente (research R7/R8).

**Independent Test**: facturación USD cerrada de US$50,41 pagada desde una cuenta CLP: dólares prellenados, pesos sugeridos con el valor de la fecha del pago, editar los pesos no cambia los dólares, y lo registrado es lo confirmado; el prepago del período USD abierto funciona igual (quickstart §4–5).

### Tests for User Story 2 ⚠️

- [x] T026 [P] [US2] Failing unit tests for `PayCreditStatementHandler` on a foreign-currency statement paid from a CLP account: without `chargedAmount` → `STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS`; with it, creates an EXPENSE of `chargedAmount` in the source currency (category `STATEMENT_PAYMENT`) and an INCOME settlement of `amount` in the statement currency on the credit account with the account's PRIMARY card, which must hold a `CardLimit` in that currency (when several cards have a limit in it the primary one is always chosen; when the primary has none → `CARD_LIMIT_NOT_FOUND`, 409, nothing written) and `settlesStatementId`; never touches `creditUsed`; a short payment carries the rest to the OPEN period of the SAME currency; paying more than is owed → `PAYMENT_EXCEEDS_REMAINING`; a source account in the statement's own currency needs one amount only; a payment in the account's own currency is unchanged — in apps/api/test/unit/domains/credit-statement/application/commands/pay-credit-statement.handler.spec.ts
- [x] T027 [P] [US2] Failing integration tests: the whole payment (two movements, source balance, statement, carry-over, idempotency mark) commits or rolls back together; AND concurrency — 3 simultaneous payments with DIFFERENT idempotency keys against a USD statement whose remaining covers only one: exactly one succeeds, the rest fail with `PAYMENT_EXCEEDS_REMAINING`/`STATEMENT_ALREADY_PAID`, and the USD usage and the source balance reconcile to the unit, and every movement that existed before the payment is unchanged (FR-015) (the statement is re-read with `findByIdForUpdateWithTx` inside the `$transaction`, 019 R8 precedent) — in apps/api/test/integration/domains/credit-statement/application/pay-credit-statement.transaction.spec.ts
- [x] T028 [P] [US2] Failing unit tests for `PrepayOpenPeriodHandler` on an OPEN period in another currency: requires `chargedAmount` when currencies differ, creates the same pair of movements as T026, raises `prepaidAmount` of the USD period only, never changes `creditUsed`, never closes the period, serializes concurrent prepayments on the row lock, and a prepago in the account currency behaves exactly as before — in apps/api/test/unit/domains/credit-statement/application/commands/prepay-open-period.handler.spec.ts
- [x] T029 [P] [US2] Failing unit tests: `UpdateStatementPaymentHandler` on a foreign statement updates both movements (`amount`, `chargedAmount`), the source balance and the carry-over, never `creditUsed` — in apps/api/test/unit/domains/credit-statement/application/commands/update-statement-payment.handler.spec.ts
- [x] T030 [P] [US2] Failing unit tests: update/remove of a transaction that has `settlesStatementId` answers `TRANSACTION_LINKED_TO_STATEMENT` (409) — in apps/api/test/unit/domains/transaction/application/commands/update-transaction.handler.spec.ts and apps/api/test/unit/domains/transaction/application/commands/remove-transaction.handler.spec.ts
- [x] T031 [P] [US2] Failing contract tests: `prepayCreditStatementSchema` accepts an optional `chargedAmount` (moneyString), still requires `amount` — in packages/contracts/src/accounts/credit-statement.test.ts
- [x] T032 [P] [US2] Failing e2e: `POST …/pay` and `POST …/prepay` on a USD statement with `amount` + `chargedAmount` succeed; without `chargedAmount` → 400 `STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS`; a replay with the same `Idempotency-Key` returns the same result with no duplicate movement — in apps/api/test/e2e/domains/credit-statement/multi-currency-billing.http.spec.ts
- [x] T034 [P] [US2] Failing web tests for `PayStatementPanel`: for a USD statement paid from a CLP account it shows both fields (dólares a liquidar prellenados con lo adeudado, pesos debitados sugeridos "estimado · <fecha>"), sends `amount` + `chargedAmount` exactly as shown/confirmed (an untouched suggestion is sent as displayed, nothing is recomputed on submit), shows the source balance after using the pesos amount, leaves the pesos empty and still allows paying when no rate exists, and in `intent="prepay"` calls the prepay endpoint — in apps/web/src/domains/accounts/components/PayStatementPanel.test.tsx
- [x] T035 [P] [US2] Failing web tests for `BillingSection`: a closed foreign-currency period shows "Pagar", an open foreign period shows "Prepagar" (both open `PayStatementPanel`), and an account-currency period's actions are unchanged — in apps/web/src/domains/accounts/components/BillingSection.test.tsx

### Implementation for User Story 2

- [x] T036 [US2] Extend `prepayCreditStatementSchema` with `chargedAmount: moneyString.optional()` (T031) in packages/contracts/src/accounts/index.ts and rebuild contracts
- [x] T037 [US2] Implement `PayCreditStatementHandler` for another currency (makes T026/T027 pass): thread `chargedAmount` through the command and the controller body mapping, require it when currencies differ, create the EXPENSE + settlement INCOME in one `$transaction`, store `settlementTransactionId` in `payTowards`, re-read the statement with `findByIdForUpdateWithTx` INSIDE the transaction and recompute remaining there, keep `creditUsed` untouched for foreign statements — in apps/api/src/domains/credit-statement/application/commands/pay-credit-statement.command.ts, pay-credit-statement.handler.ts, apps/api/src/domains/credit-statement/domain/credit-statement.aggregate.ts and apps/api/src/domains/credit-statement/presentation/credit-statements.controller.ts
- [x] T038 [US2] Implement the foreign branch of `PrepayOpenPeriodHandler` (makes T028 pass), reusing the settlement-income construction of T037 through one shared helper so pay and prepay cannot drift — in apps/api/src/domains/credit-statement/application/commands/prepay-open-period.command.ts, prepay-open-period.handler.ts and a new apps/api/src/domains/credit-statement/application/foreign-settlement.ts (also the one place that resolves the settlement card: the primary card's `CardLimit` in the statement currency, else `CardLimitNotFoundError` 409 added in apps/api/src/domains/credit-statement/domain/errors.ts with its `errors.CARD_LIMIT_NOT_FOUND` es+en keys)
- [x] T039 [US2] Implement T029 in apps/api/src/domains/credit-statement/application/commands/update-statement-payment.handler.ts (and `chargedAmount` through its command/controller path)
- [x] T040 [US2] Implement T030: `UpdateTransactionHandler`/`RemoveTransactionHandler` reject a movement with `settlesStatementId` (`TransactionLinkedToStatementError`, 409, error added in apps/api/src/domains/transaction/domain/errors.ts) — in apps/api/src/domains/transaction/application/commands/update-transaction.handler.ts and remove-transaction.handler.ts
- [x] T041 [US2] Add the `errors.TRANSACTION_LINKED_TO_STATEMENT` and `errors.CARD_LIMIT_NOT_FOUND` i18n keys if missing and the panel copy for this story (`accounts.pay.usdToPay`, `accounts.pay.pesosDebited`, `accounts.pay.estimatedHint` "estimado · {{date}}", `accounts.pay.noRate`, `accounts.pay.prepayTitle`), es + en identical, in apps/web/src/i18n/es.json and en.json
- [x] T043 [US2] Web: implement `PayStatementPanel` for a statement in another currency (statement currency instead of `account.currency` everywhere it formats money, second "Monto debitado en <moneda origen>" field fed by `useSuggestedAmount`, `intent: "pay" | "prepay"`, balance-after preview from the pesos amount) — makes T034 pass — in apps/web/src/domains/accounts/components/PayStatementPanel.tsx; add `accountsApi.prepayStatement` `chargedAmount` plumbing in apps/web/src/domains/accounts/api/accountsApi.ts and apps/web/src/domains/accounts/hooks/useAccounts.ts (invalidate accounts, statements, transactions)
- [x] T044 [US2] Web: remove the `if (isForeign(s)) return none` early return in `PeriodAction` — a foreign closed period gets "Pagar", a foreign open period gets "Prepagar" (opening `PayStatementPanel` with the right intent); the account-currency open period keeps the existing `TransactionCreateModal` prepay — makes T035 pass — in apps/web/src/domains/accounts/components/BillingSection.tsx
- [x] T045 [P] [US2] Web: `EditStatementPaymentPanel` gains the debited-amount field for a foreign statement (no suggestion on correction: it shows what was recorded) in apps/web/src/domains/accounts/components/EditStatementPaymentPanel.tsx; and `TransactionDetailPanel` shows the origin "Liquidación de facturación" with a "Ver facturación" link and hides Editar/Eliminar for `settlesStatementId` rows (add the `sourceOf` case and its i18n if 028 left it out) in apps/web/src/domains/transactions/components/TransactionDetailPanel.tsx
- [x] T046 [US2] Run the US2 tests (credit-statement unit/integration/e2e, transaction unit, contracts, web accounts + transactions + i18n) and walk quickstart §4–5; all green

**Checkpoint**: a USD statement can be paid or prepaid with a suggested, editable peso amount.

---

## Phase 5: User Story 3 — Equivalente aproximado en pesos de las cuentas USD (Priority: P2)

**Goal**: cada cuenta en USD muestra "≈ $… (estimado)" y el patrimonio neto agrega un total estimado en pesos.

**Independent Test**: cuenta con US$1.000 y dólar a $950 muestra "≈ $950.000 (estimado, valor del <fecha>)"; una cuenta en pesos no muestra nada; con ocultar saldos el equivalente se oculta; el patrimonio muestra cifras por moneda y un total aparte (quickstart §6).

### Tests for User Story 3 ⚠️

- [ ] T047 [P] [US3] Failing web tests for `ApproxAmount` (shared component): renders "≈ $950.000" with an "estimado · {{date}}" label and a carried marker when the rate is carried; renders nothing when there is no rate or when the currency is CLP; masks the figure when "ocultar saldos" is on — in apps/web/src/shared/ui/approx-amount.test.tsx
- [ ] T048 [P] [US3] Failing unit tests for `estimatedTotalClp(netsByCurrency, rates)` in apps/web/src/domains/accounts/lib/netWorth.test.ts: sums the CLP net plus each other currency converted at its latest rate (USD and CLF), rounds once at the end, returns `null` when any non-zero currency has no rate, ignores currencies whose net is "0", and leaves `netWorthByCurrency`'s per-currency result untouched
- [ ] T049 [P] [US3] Failing web tests: a USD `AccountVisualCard`/`AccountCard` shows the equivalent and a CLP one does not; the account detail balance KPI shows it for a USD account; the net worth widgets (`NetWorthCard`, `AccountsSummary`) show the "≈ todo en CLP (estimado)" total next to the per-currency figures and hide it without rates — in apps/web/src/domains/accounts/components/AccountVisualCard.test.tsx, apps/web/src/domains/accounts/routes/AccountsRoute.test.tsx and apps/web/src/domains/dashboard/components/NetWorthCard.test.tsx

### Implementation for User Story 3

- [ ] T050 [US3] Create `ApproxAmount` (props `amount`, `currency`; reads `useLatestRates`; uses `convertAmount`; wraps the figure in `MaskedAmount`) — makes T047 pass — in apps/web/src/shared/ui/approx-amount.tsx
- [ ] T051 [US3] Add `estimatedTotalClp` — makes T048 pass — in apps/web/src/domains/accounts/lib/netWorth.ts
- [ ] T052 [US3] Wire `ApproxAmount` under the balance of USD accounts in apps/web/src/domains/accounts/components/AccountVisualCard.tsx, apps/web/src/domains/accounts/components/AccountCard.tsx and the balance KPI of apps/web/src/domains/accounts/routes/AccountDetailRoute.tsx
- [ ] T053 [US3] Wire the estimated total into apps/web/src/domains/dashboard/components/NetWorthCard.tsx and apps/web/src/domains/accounts/components/AccountsSummary.tsx (separate line "≈ todo en CLP (estimado)" with the rate date; per-currency figures unchanged) — makes T049 pass; add `exchangeRates.estimatedTotal` and `exchangeRates.approxOn` i18n (es + en) in apps/web/src/i18n/es.json and en.json
- [ ] T054 [US3] Run the US3 tests (web `accounts`, `dashboard`, `shared`, `i18n`) and walk quickstart §6; all green

---

## Phase 6: User Story 4 — Traspaso USD → CLP con monto sugerido (Priority: P2)

**Goal**: al traspasar de una cuenta USD a una CLP los pesos de destino se sugieren con el valor del día y son editables; los dólares de origen son la base.

**Independent Test**: traspaso de US$100 de una cuenta USD a una CLP: pesos sugeridos; editarlos no cambia los dólares; se registran exactamente los montos confirmados; entre cuentas de la misma moneda no aparece sugerencia (quickstart §7).

### Tests for User Story 4 ⚠️

- [ ] T055 [P] [US4] Failing web tests for `TransferFields`: with a USD origin and a CLP destination, typing the origin amount fills the destination with `convertAmount` of the rate for the movement's date and labels it "estimado · <fecha>"; editing the destination stops the suggestion and never changes the origin amount; changing the date re-suggests while the destination is untouched; same-currency transfers and any pair other than USD→CLP (e.g. CLP→USD) show no suggestion; the submit payload carries exactly the displayed/confirmed `amountOut`/`amountIn` (FR-013) — in apps/web/src/domains/transactions/components/TransferFields.test.tsx

### Implementation for User Story 4

- [ ] T056 [US4] Use `useSuggestedAmount` (T042) in `TransferFields` for the destination amount ONLY when the origin account is USD and the destination account is CLP (FR-011 and the spec cover just this direction; any other currency pair shows no suggestion); the origin amount the person types is the base (clarify Q4) and the destination is the editable suggestion — makes T055 pass — in apps/web/src/domains/transactions/components/TransferFields.tsx and apps/web/src/domains/transactions/components/TransactionFormPanel.tsx
- [ ] T057 [US4] Run the US4 tests (web `transactions`, `i18n`) and walk quickstart §7; all green

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T058 [P] Seed: add recent USD and UF rows (a few weeks, with weekend rows carried) to apps/api/prisma/seed.ts so a fresh `pnpm db:reset` already shows history and suggestions; confirm the seeded credit card account has a USD limit and an open USD period (028 seed) and add a closed USD statement if none exists
- [ ] T059 [P] Docs: record the amendment of the "no conversion" rule and the new domain in docs/english/ARCHITECTURE.md and docs/spanish/ARCHITECTURE.md (exchange-rate domain, cron schedule, suggestion-only rule); update docs/PENDING.md (028 US3 still pending; FX source is a third-party dependency); mark specs/028-multi-currency-billing/tasks.md T031–T041 as absorbed by 030 (append "— absorbed by specs/030, T026–T040" to each)
- [ ] T060 [P] Add the optional `EXCHANGE_RATE_SOURCE_URL` to apps/api/.env.example with a comment (default `https://mindicador.cl/api`)
- [ ] T061 Quickstart validation: walk specs/030-exchange-rates/quickstart.md §1–8 end to end against the local stack and real mindicador.cl, including the source-down case (§2) and the no-rate case (§8); fix anything that does not match
- [ ] T062 Run `pnpm typecheck`, `pnpm --filter @finance/money test`, `pnpm --filter @finance/contracts test`, `pnpm --filter @finance/api test:unit`, `test:integration` and `test:e2e` scoped to `exchange-rate`, `credit-statement`, `transaction`, `pnpm --filter @finance/web test` scoped to `exchange-rates`, `accounts`, `transactions`, `dashboard`, `shared`, `i18n`, `pnpm check:boundaries`, `pnpm exec prettier --check` and `turbo run lint` on the touched files
- [ ] T063 Memory sync (Principle V): constitution amendment (PATCH/MINOR bump, Sync Impact Report: the 30th table-domain `exchange-rate`, the rule "the app may SUGGEST a conversion, never compare or persist one the person did not confirm", the system cron, the foreign-currency pay/prepay) in .specify/memory/constitution.md, review the CardDetailPanel "topes por moneda" notice wording and the stale "no FX source" lines it quotes (there is now a reference value, still not the issuer's), and add a `exchange-rate` domain bullet + amendments to the `credit-statement` and `transaction` bullets + "Current plan" status in CLAUDE.md

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → stories.** Phase 2 blocks everything.
- **US1** needs only Phase 2. It is the MVP and also what fills the table every other story reads.
- **US2** needs Phase 2 and `useRateOn` (T011); its backend (T026–T040) is independent of US1's cron, but its web part needs rates to exist (seed in T058 or a US1 run).
- **US3** and **US4** need only Phase 2 (`useLatestRates`, `useRateOn`, `convertAmount`); both are web-only and independent of each other and of US2. `useSuggestedAmount` (T042, now Foundational) serves US2 and US4. **T064 (UF constitution amendment) must land before T051/T053.**
- **Polish** last.

Within a story: tests (fail) → contracts → domain → application → infrastructure/presentation → web → run.

## Parallel Opportunities

- Phase 2: T004 ‖ T006 ‖ T008 ‖ T009 ‖ T011.
- US1 tests T012–T017 all parallel; T023 (chart/table) parallel with the backend tasks.
- US2 tests T026–T035 all parallel; T045 parallel with T043/T044.
- US3 tests T047–T049 parallel; US3 and US4 can be developed by different people at the same time.
- After Phase 2, US1, US2-backend, US3 and US4 touch disjoint files and can proceed in parallel.

## Implementation Strategy

1. **MVP = Phase 1 + 2 + US1**: the daily history and its screen; deployable on its own, and it starts accumulating rates.
2. **Next increment = US2** (the highest-pain item: paying a USD statement). It is the largest block because it completes work spec 028 left undone; ship it behind the same release as US1 if possible.
3. **Then US3 and US4** (web-only, small).
4. Leave **028 US3** (transferring an overdue USD statement to pesos) out; it remains in `specs/028-multi-currency-billing/tasks.md` (T043–T058).
5. Close with Polish (seed, docs, validation, constitution + CLAUDE.md).
