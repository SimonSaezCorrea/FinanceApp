<!--
Sync Impact Report — 2026-08-15 (amendment 1.39.0)
- Version change: 1.38.1 → 1.39.0 (MINOR: new `InstitutionKind` value + two whole sectors of
  reference data; no principle removed or redefined).
- `InstitutionKind` gains **COOPERATIVE** (a cooperative takes members' deposits and lends without
  being a bank). The catalogue, which covered only the prepaid register (TPEEM), now also seeds the
  credit-only issuers (TCEEM) and the cooperatives (BCCOO), all read off the CMF's own vigente lists.
- Reinforces "A catalogue is data": three entities hold BOTH licences (Tenpo, Inversiones LP,
  Tricard) and stay ONE row with two products — `kind` says what the entity is, the product table
  says what it sells.
- **Codes:** entities that receive no transfers have no institutional code (only Coopeuch, 672).
  Their key is their RUT prefixed `RUT-`, which states the fact instead of inventing a regulator
  code. Any future catalogue MUST do the same rather than guess.
- Data correction: 697 Inversiones LP S.A. is **La Polar**, not "Lider Bci" as an earlier external
  report claimed — verified against Tarjeta La Polar's own terms.
- Templates requiring updates: none.
- Follow-up TODOs: `OVERDRAFT_LINE` + renaming `CREDIT_LINE`; multi-country (PSP, CBU/CVU alias).
-->

<!--
Sync Impact Report — 2026-08-15 (amendment 1.38.1)
- Version change: 1.38.0 → 1.38.1 (PATCH: one nullable link + its UI; no principle added or changed).
- `InstallmentPlan.cardId` (nullable FK → `CardAccount`, `onDelete: SetNull` — deleting a card must
  never delete the debt it created) records which card a purchase in instalments was made with;
  optional, since a plan can equally be a bank loan. Enables "Cuotas activas" on `CardDetailPanel`,
  documented until now as not derivable.
- Templates requiring updates: none. Follow-up TODOs: unchanged (TCEEM registry, cooperatives).
-->

<!--
Sync Impact Report — 2026-08-15 (amendment 1.38.0)
- Version change: 1.37.0 → 1.38.0 (MINOR: new enforceable rule + new descriptive card/institution
  fields; no principle removed or redefined).
- Banking-domain norms gain **"The user recognises the brand, the regulator registers the entity"**:
  `FinancialInstitution.name` becomes the commercial name, new `legalName` holds the registered one,
  and the pickers search name + legalName + brands (`SearchableSelectOption.keywords`). New
  `retailFacing` hides corporate-only entities (foreign branches, BaaS providers such as Pomelo)
  from the pickers without removing them from the catalogue; `GET /institutions?retailFacing=true`.
- `CardAccount` gains four descriptive columns the model had no way to express: `isVirtual` (issuers
  hand out several virtual cards on one balance), `isAdditional` + `cardholderName` (a card issued to
  another person — knowing WHO spent is most of what this app adds over the bank's own statement) and
  `network` (new `CardNetwork` enum: VISA/MASTERCARD/AMEX/REDCOMPRA/OTHER). All optional, all
  descriptive: no rule depends on them yet.
- Data: legal names were verified against the CMF registries (TPEEM/TCEEM); brand↔entity links come
  from each product's own terms of service, which the registry does not carry — the softer half.
- Templates requiring updates: none.
- Follow-up TODOs: the TCEEM (non-bank CREDIT card issuers) registry and the cooperatives are still
  missing from the catalogue.
-->

<!--
Sync Impact Report — 2026-08-15 (amendment 1.37.0)
- Version change: 1.36.0 → 1.37.0 (MINOR: new enforceable rule; BREAKING for existing data, but no
  principle removed or redefined).
- Banking-domain norms gain **"A credit card is its own account, not an add-on"**: `ALLOWED_CARD_KINDS`
  becomes CHECKING/SIGHT/SAVINGS → DEBIT, CREDIT_LINE → CREDIT, PREPAID → PREPAID, INVESTMENT/CASH →
  none. A credit card on a deposit account is refused (`CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT`), only a
  CREDIT_LINE account may carry a credit pool or billing settings (new
  **`CREDIT_SETTINGS_NOT_ALLOWED`**), and a type change that would strand already-issued cards is
  refused. SAVINGS gains a DEBIT card (ATM withdrawals: BancoEstado, Coopeuch).
- Consequences: `AddOnCardEligibility` → **`NoCreditLineEligibility`** (the add-on shape can no longer
  exist, so the fallback strategy states that instead of testing for it); the seed models the two
  bank-issued credit cards as their own `CREDIT_LINE` accounts, and its cash balances skip movements
  charged to a credit line (the same rule as 1.36.0, mirrored in the fixture).
- Known limitation this removes: there was no way to record "a payment to THIS add-on card" apart from
  ordinary account income, so income was never subtracted from an add-on pool. With the card on its own
  account, its statement payment is an ordinary expense on the paying account and the pool is exact.
- Migration: none written (dev data; `pnpm db:seed` regenerates). A production dataset would need each
  add-on CREDIT card moved to a new CREDIT_LINE account, carrying its pool, statements and movements.
- Templates requiring updates: none.
- Follow-up TODOs: `OVERDRAFT_LINE` (the real "línea de crédito" of a checking account) is still
  unmodelled, and `CREDIT_LINE` keeps a name that describes it poorly — both deferred.
-->

<!--
Sync Impact Report — 2026-08-15 (amendment 1.36.0)
- Version change: 1.35.0 → 1.36.0 (MINOR: new enforceable rule correcting how a credit purchase
  moves cash; no principle removed or redefined).
- Banking-domain norms gain **"Cash moves once, when it actually moves"**: a movement charged to a
  credit line MUST NOT move `currentBalance`; the cash leaves when the statement is paid, and that
  payment movement is what moves the paying account's balance. One rule per side
  (`cashDelta` in the API, `drawsOnCredit`/`balanceAfter` on the web), obeyed by every write path.
- Fixes three defects that shared one cause (nobody owned "when does cash move"): a purchase with a
  CREDIT card debited the account at purchase time; paying a statement created its EXPENSE movement
  WITHOUT debiting the source account (breaking `currentBalance = initialBalance + Σincome − Σexpense`);
  and correcting a payment moved the balance from a base that had never been debited. Statement `sync`
  now also moves the source balance when it corrects the payment movement.
- Existing balances computed under the old behavior are NOT migrated (dev data; `pnpm db:seed`
  regenerates it). A production dataset would need a one-off recompute from the movements.
- Templates requiring updates: none.
- Follow-up TODOs: whether `CHECKING`/`SIGHT` should still allow a CREDIT card at all (a credit card
  is its own account, not a channel onto a checking balance) is open and breaking — see CLAUDE.md.
-->

<!--
Sync Impact Report — 2026-08-14 (amendment 1.35.0)
- Version change: 1.34.0 → 1.35.0 (MINOR: new enforceable rule, no spec of its own — implemented
  directly on branch 011; no principle removed or redefined).
- Banking-domain norms gain **"A catalogue is data, never an inference from classification"**: which
  account products an institution offers is stored (`institution-account-type`: `institutionId` +
  `type` + `isPrimary`, unique pair, `onDelete: Cascade` — mirrors `CountryCurrency`/
  `CountryIdentifierType`), NOT derived from `kind`/`category`. It MUST be applied permissively: an
  institution with no catalogued products passes every filter, the filter narrows the picker instead
  of rejecting a write, and an institution already saved on an account stays selectable.
- `FinancialInstitution.rut` was DROPPED (15 seeded values, no consumer anywhere): `code`
  (`@@unique([countryId, code])`) is the institution's identifier. `category` stays — unused at
  runtime, kept for grouping the picker as the catalogue expands beyond Chile.
- `accountType` (zod enum) moved from `contracts/accounts` to `contracts/common/account-type.ts` and
  is re-exported from `accounts`: `reference` needs it for `Institution.accountTypes` and `accounts`
  already imports `reference` (`InstitutionKind`), so a shared module is what breaks the cycle. Same
  reasoning that moved `identifierTypeSchema` to `reference` in 1.8.0. No call site changed.
- Business domains: 22 → 23 (`institution-account-type`).
- Templates requiring updates: none.
- Follow-up TODOs: `institutionKindForAccountType` (the BANK-only heuristic) is now redundant with
  the catalogue for the two account forms; kept only until the seeded catalogue covers every country.
-->

<!--
Sync Impact Report — 2026-08-14 (amendment 1.34.0)
- Version change: 1.33.0 → 1.34.0 (MINOR: new enforceable rule from specs/011 — prepaid as its own
  account product; no principle removed or redefined).
- Banking-domain norms gain **"A payment instrument holds no money of its own"**: money lives in an
  ACCOUNT, never in a card. A card is a channel onto its account's funds or credit line, so a card
  row MUST NOT carry a balance column of its own (`CardAccount.prepaidBalance`/
  `prepaidInitialBalance` were removed in specs/011). Consequently a prepaid product is modelled as
  an account type (`AccountType.PREPAID`), funded by an ordinary transfer or income — never by a
  dedicated "top up this card" endpoint — and several prepaid cards on one account share that
  account's single balance.
- Banking-domain norms also gain **"A prepaid account never goes negative"**: every outflow (an
  expense with a card, without one, or a transfer's outgoing leg) MUST be rejected
  (`PREPAID_INSUFFICIENT_BALANCE`) when it exceeds the balance — the rule belongs to the account
  type and is enforced in the pure policies (`MovementPolicy`/`TransferPolicy`), not per channel.
  An edit is validated against the balance BEFORE its own previous charge.
- Banking-domain norms also gain **"Which card kinds an account carries is one matrix"**: the
  account-type ↔ card-kind compatibility lives in ONE table in `@finance/contracts`
  (`ALLOWED_CARD_KINDS`), which `isCardableAccountType` derives from, and both the API and the UI
  read — never as scattered `if`s. Two distinct refusals: `ACCOUNT_CANNOT_HAVE_CARD` (this type
  carries no cards at all) vs `CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT` (it carries cards, not this kind).
- Banking-domain norms also gain **"A financial product is not a setting"**: an account's `type`
  MUST NOT be convertible to or from `PREPAID` (`ACCOUNT_TYPE_CHANGE_NOT_ALLOWED`) — converting
  would drag cards that can't exist on the other side, a credit pool and billing periods with it.
- Templates requiring updates: none (no template references these norms).
- Follow-up TODOs: none.
-->

<!--
Sync Impact Report — 2026-08-11 (amendment 1.29.0)
- Version change: 1.28.0 → 1.29.0 (MINOR: new enforceable rules from specs/010 — transfers between
  own accounts, and file attachments on a movement; no principle removed or redefined).
- Banking-domain norms gain **"A transfer is not income nor expense"**: money moved between two of
  the user's OWN accounts MUST NOT count in any income/expense aggregate. When such a movement is
  represented as ordinary rows (here: two `Transaction` rows — an EXPENSE + an INCOME — sharing
  `transferGroupId`), no existing sum excludes it by itself, so the exclusion MUST live in ONE named
  predicate (`EXCLUDE_TRANSFERS` in the API, `excludeTransfers` on the web) applied by EVERY such
  aggregate, and any new aggregate MUST apply it. The LIST and the movement COUNT deliberately do
  not: both legs are real rows the user must see in their own account.
- Banking-domain norms also gain **"A paired write is one transaction"**: a record that only makes
  sense as a pair (the two legs of a transfer) MUST be created, edited and deleted as a unit inside a
  single `prisma.$transaction` that also carries both balance deltas, and MUST NOT be editable one
  leg at a time (`409 TRANSFER_EDIT_AS_PAIR`). A half-written transfer is money that vanished.
- Architecture norms gain **"Uploaded files are validated, not trusted"**: a file accepted from a
  client MUST be validated by the API itself — declared content type against an allow-list, real
  **magic bytes** against that declared type, and a size cap enforced by the upload interceptor with
  in-memory (never on-disk) storage. The `Content-Type` is chosen by the client, so trusting it would
  let an executable renamed to `.pdf` be stored and served back under that type.
- Architecture norms also gain **"External storage is a port, and its absence is inert"**: bytes
  living outside the database are reached through a domain port (`ObjectStoragePort`) whose adapter
  lives in `infrastructure/`, so the unit tier never touches the network. Missing credentials MUST
  leave the feature INERT — `isConfigured() === false` and `503 ATTACHMENTS_UNAVAILABLE` on
  write/read — never crash boot and never degrade the rest of the app. Deleting the remote object
  happens AFTER the database transaction; a failed remote delete is logged, not rolled back.
- New dependency: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (`@types/multer` dev).
- New environment variables (all optional): `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`.
- Schema: `Transaction.transferGroupId` (+ index); new table `transaction-attachment` → **domain 22**
  (Principle VI's count moves 21 → 22).
- i18n parity is now enforced by a TEST (`apps/web/src/i18n/parity.test.ts`), not by discipline.
- Propagated in the same session: `CLAUDE.md`, `docs/{english,spanish}/ARCHITECTURE.md`,
  `docs/PENDING.md`.
-->

<!--
Sync Impact Report — 2026-08-07 (amendment 1.28.0)
- Version change: 1.27.0 → 1.28.0 (MINOR: new enforceable rule under the banking-domain norms; the
  manual balance-reconciliation endpoint is withdrawn).
- Banking-domain norms gain **"A derived total maintains itself"**: a persisted total that is defined
  as a sum of rows (`BankAccount.currentBalance` = initialBalance + Σincome − Σexpense) MUST be
  updated by every write that changes those rows, inside the SAME database transaction as the row
  itself. It MUST NOT depend on a user-triggered "recalculate" action: a total that only refreshes
  when someone presses a button is wrong for as long as nobody presses it, and every view that reads
  it is quietly wrong too. The signed delta belongs in ONE named place
  (`transaction/domain/balance-delta.ts`), never re-spelled per call site.
- Withdrawn: `POST /accounts/:id/reconcile` and `BankAccount.reconcileBalance` — with the balance
  maintained on every movement there is nothing left to reconcile, and keeping a manual override
  invites the two paths to disagree.
- First application: `BankAccountRepositoryPort.incrementBalanceWithTx`, the `balanceDeltas`
  argument threaded through `saveNew`/`saveUpdate`/`removeWithCreditAdjustment`, and an e2e that
  creates, edits and deletes a movement asserting the balance after each step.
- Propagated in the same session: CLAUDE.md (`bank-account` domain description).

<!--
Sync Impact Report — 2026-08-07 (amendment 1.27.0)
- Version change: 1.26.0 → 1.27.0 (MINOR: new enforceable rule under the banking-domain norms; the
  previous "manual correction" allowance is withdrawn; no principle removed or redefined).
- Banking-domain norms gain **"Reconcile, never re-type"**: a stored financial figure that can drift
  from the movements behind it MUST be fixable by RECOMPUTING it from those movements, never by
  letting the user type a replacement. Reconciliation MUST be total — it recomputes from the period's
  DATE WINDOW (not from stale links), re-links the movements it found, and cascades to everything
  derived from the old figure (the payment movement and the account's `creditUsed`) inside ONE
  database transaction, so a period is never left half-reconciled.
- Withdrawn: the 2026-07-25 allowance for correcting a PAID statement's frozen amount by hand "with
  no cascade" — that rule let the app hold a number nothing supported. `correctAmount`,
  `canCorrectAmount`, the PATCH endpoint and `updateCreditStatementSchema` are removed.
- First application: `POST /accounts/:id/credit-statements/:statementId/sync`
  (`SyncStatementHandler`), `CreditStatement.syncAmount`, `netForPeriod`,
  `relinkToStatementWithTx`, `updateAmountWithTx`, and the per-row "Sincronizar pagos" button.
- Propagated in the same session: CLAUDE.md (`credit-statement` amendment).

<!--
Sync Impact Report — 2026-08-13 (amendment 1.33.0)
- Version change: 1.32.0 → 1.33.0 (MINOR: a new banking-domain rule — the prepaid instrument).
- **"A PREPAID card holds its own money"**: a prepaid card is neither a credit line nor a view onto
  the account's cash. It MUST carry its own persisted pot (`CardAccount.prepaidInitialBalance` seed +
  self-maintaining `prepaidBalance`), and an expense through it MUST be bounded by that balance
  (`PREPAID_INSUFFICIENT_BALANCE` — rejected, never allowed negative: a prepaid card declines, it does
  not lend) and MUST NOT touch the account's `currentBalance` nor any credit pool.
- **The money is counted exactly once.** It leaves the account when the card is LOADED — `POST
  /accounts/:id/cards/:cardId/load` writes a real EXPENSE movement on the account (category "Recarga
  prepago"), decrements the account's balance and credits the card, in ONE `prisma.$transaction`.
  Spending afterwards moves only the card's pot. The load movement MUST NOT carry the `cardId`:
  with it, it would be indistinguishable from spending through the card, which is precisely what must
  leave the account balance alone.
- Edits/deletes of a prepaid expense MUST revert the card's pot symmetrically, and — unlike the
  credit pool — regardless of any billing period being settled: a prepaid card has no statement.
- A prepaid balance sent for a CREDIT/DEBIT card is REJECTED (`PREPAID_BALANCE_NOT_ALLOWED`), never
  ignored. Unchanged: only CHECKING/SIGHT/CREDIT_LINE accounts may carry any card at all.
- Schema: `CardAccount.prepaidInitialBalance`, `CardAccount.prepaidBalance`. Contract: `Card` gains
  both; `createCardSchema` gains `prepaidInitialBalance`; new `loadPrepaidCardSchema`.
- First application: `MovementPolicy.assertWithinPrepaidBalance`/`prepaidDelta`,
  `accountBalanceDelta`, `LoadPrepaidCardHandler`, and the web `LoadPrepaidPanel` +
  `AccountVisualCard`/`CardDetailPanel`/`CardForm` prepaid states.
- Propagated in the same session: CLAUDE.md (`card-account` + `transaction` amendments).

<!--
Sync Impact Report — 2026-08-13 (amendment 1.32.0)
- Version change: 1.31.0 → 1.32.0 (MINOR: a new enforceable rule about correcting a payment).
- **"The PAYMENT is correctable; the period's amount is not"**: a settled period's `paidAmount` MAY
  be corrected (`PATCH /accounts/:id/credit-statements/:statementId/payment`) — a figure entered
  wrong, or money transferred afterwards — but the period's own total MUST still come from its real
  movements (`POST .../sync`) and MUST NEVER be typed in. This does not reopen the retired manual
  amount correction: the correction is bounded by that computed total
  (`PAYMENT_EXCEEDS_REMAINING`), must be positive (`INVALID_PAYMENT_AMOUNT`), and only applies to an
  already-settled period (`STATEMENT_NOT_PAID`).
- **Every figure derived from a payment MUST move with it**, in the same `prisma.$transaction`: the
  payment movement's amount, the SOURCE account's balance (that expense is what left it), the credit
  account's `creditUsed`, and the shortfall carried into the next period — resolving/creating a
  successor when a period previously paid in full becomes short. A correction that updates one of
  these and not the rest is a defect, not a partial feature.
- Schema: none. Contract: `updateStatementPaymentSchema`.
- First application: `CreditStatement.changePaidAmount`, `UpdateStatementPaymentHandler`, and the web
  `EditStatementPaymentPanel` ("Modificar pago", offered only on a PARTIALLY_PAID period).
- Propagated in the same session: CLAUDE.md (`credit-statement` amendment).

<!--
Sync Impact Report — 2026-08-13 (amendment 1.31.0)
- Version change: 1.30.0 → 1.31.0 (MINOR: a derived status gains a value; no mechanism changes).
- **"A period settled for less than its total MUST say so"**: the carry-forward mechanism of
  1.30.0 is UNCHANGED — any payment still settles the period, freezes `amount` at the period's real
  total and rolls the shortfall into the next period — but such a period now reports
  **`PARTIALLY_PAID`** instead of `PAID`, and the UI MUST show what was actually covered
  (`paidAmount` of `amount`). Reporting "Pagada" for a period the user paid the minimum on hides a
  fact the user needs; the label is derived (`paidAmount < amount` once `paidAt` is set), never a
  stored column, and it is a TERMINAL state exactly like `PAID`: `canPay()`/`canClose()` are both
  false, so nothing becomes payable again. Derived lifecycle: OPEN → PENDING →
  (PAID | PARTIALLY_PAID).
- Consequence for any consumer: "settled" MUST be tested as `paidAt !== null` (or as
  `!state.canPay()`), never as `status === "PAID"` — the latter now silently excludes settled
  periods and would re-offer a payment.
- Schema: none. Contract: `creditStatementStatus` regains PARTIALLY_PAID.
- First application: `PartiallyPaidState`, `CreditStatement.state`, and the web
  `BillingSection`/`PayStatementPanel` ("pagado X de Y" + warning badge).
- Propagated in the same session: CLAUDE.md (`credit-statement` amendment).

<!--
Sync Impact Report — 2026-08-12 (amendment 1.30.0)
- Version change: 1.29.0 → 1.30.0 (MINOR: an enforceable banking-domain rule is REDEFINED in its
  mechanism, not removed — settlement stops being accumulated and becomes carried forward).
- **Supersedes "Settlement is accumulated, never a flag" (1.26.0) with "A period is settled once;
  the shortfall is carried forward"**: ANY payment on a billing period — the total, the account's
  minimum, or any amount between — SETTLES that period (`paidAt` stamped, `amount` frozen at the
  period's real total, not at what was paid). What the payment did not cover MUST be rolled into
  the next period as `CreditStatement.carriedOverAmount`, which is part of what that period owes
  (`totalFor(linkedSum)`), and the settled period MUST record where it went (`carriedToId`). A
  period therefore NEVER stays half-payable: the derived status is OPEN → PENDING → PAID and
  `PARTIALLY_PAID` no longer exists. Unchanged from 1.26.0: `creditUsed` is decremented by the
  amount ACTUALLY paid (the shortfall is still used credit, just owed in the next period), and an
  overpayment is REJECTED (`PAYMENT_EXCEEDS_REMAINING`), never capped.
- Carry-over MUST be a figure of its own, never a synthesized "previous balance" movement:
  reconciliation (`POST .../sync`) recomputes a period from its REAL movements, so a fake movement
  would be erased by the very feature meant to keep periods honest. For the same reason, syncing a
  period settled with a shortfall MUST move the CARRY-OVER (`carryOverDelta`, applied to the
  successor) and leave the payment movement and `creditUsed` untouched — what was paid is a
  historical fact.
- Schema: `CreditStatement.carriedOverAmount`, `CreditStatement.carriedToId`. Contract:
  `creditStatementStatus` loses PARTIALLY_PAID; `CreditStatement` gains `carriedOverAmount` and
  `carriedToId`; `remainingAmount` is always "0" once paid.
- First application: `CreditStatement.payTowards`/`receiveCarryOver`/`markCarriedTo`/`syncAmount`,
  `PayCreditStatementHandler` (`findOrCreateCarryOverTargetWithTx` + `addCarriedOverWithTx`),
  `SyncStatementHandler`, and the web `PayStatementPanel`/`BillingSection`.
- Propagated in the same session: CLAUDE.md (`credit-statement` amendment).
-->

<!--
Sync Impact Report — 2026-08-07 (amendment 1.26.0)
- Version change: 1.25.0 → 1.26.0 (MINOR: new enforceable rule under the banking-domain norms; no
  principle removed or redefined).
- Banking-domain norms gain **"Settlement is accumulated, never a flag"**: a billing period that can
  be paid in more than one go MUST accumulate what has been settled (`CreditStatement.paidAmount`)
  instead of flipping a boolean/date. Its status stays DERIVED (no stored `status` column) — OPEN →
  PENDING → PARTIALLY_PAID → PAID — and the period's `amount` FREEZES only when it is fully settled,
  because until then it is the live sum of its linked transactions. A payment MUST decrement the
  account's `creditUsed` by the amount actually paid, never by the period's total. A payment larger
  than what is still owed MUST be REJECTED (`PAYMENT_EXCEEDS_REMAINING`), never silently capped: a
  wrong figure in a money form must not be quietly "corrected". A partially paid period MUST refuse
  a manual amount correction, for the same reason PENDING already does.
- Banking-domain norms also gain **"No invented financial rules"**: a figure with no universal
  definition (here, the minimum payment) is per-account CONFIGURATION
  (`BillingSettings.minimumPaymentPercent`), never a constant baked into code. An account without it
  configured simply has no minimum, and the UI offers no such option instead of defaulting to one.
  A statement's composition (purchases vs installment charges) is DERIVED from its own linked
  transactions — never stored, never estimated; a concept the model doesn't have (interest) is not
  displayed at all.
- Schema: `CreditStatement.paidAmount`, `BillingSettings.minimumPaymentPercent`. Contract:
  `creditStatementStatus` gains PARTIALLY_PAID; `CreditStatement` gains `paidAmount`,
  `remainingAmount`, `minimumAmount`, `breakdown`; `payCreditStatementSchema` gains optional
  `amount`/`paidAt`/`reference`; `BankAccount` gains `minimumPaymentPercent`.
- First application: `PartiallyPaidState`, `CreditStatement.payTowards`, the shared
  `statement-dto.mapper.ts`, and the web `PayStatementPanel` (Total/Minimum/Other amount).
- Propagated in the same session: CLAUDE.md (`credit-statement` amendment).

<!--
Sync Impact Report — 2026-08-05 (amendment 1.25.0, extended the same day)
- Version change: 1.24.0 → 1.25.0 (MINOR: new enforceable rule under the design-system norms; no
  principle removed or redefined).
- Design-system norms gain **"One overlay family"**: every dialog in `apps/web` MUST be built from
  `shared/ui/overlay/` and MUST NOT hand-roll its own frame. `ResponsiveSurface` is the default
  (full-screen `Window` below 420px, centered `Modal` above); `ConfirmModal` is ALWAYS a modal —
  an alert must never become a full-screen screen, since it interrupts and may stack on another
  surface. A modal's backdrop MUST blur as well as darken. Header/body/footer come from
  `SurfaceChrome`, so the title, the way out and the action bar sit in the same place in every
  context; opinionated variants (`FormSurface`'s create/edit modes) are built ON TOP of the chrome
  rather than by adding flags to it. A route that becomes a full-screen screen on a phone uses
  `WindowScreen` instead of re-inventing sheet classes.
- Design-system norms also gain **"Container width, not viewport, when a sibling moves"** (measured
  width via `useElementWidth`, first applied to `TransactionTable`'s full-vs-compact switch) and
  **"Breakpoint stages"**: Tailwind's default scale with a stipulated
  meaning per step (base phone / `sm` end-of-phone / `md`+`lg` tablet / `xl` widest tablet /
  `2xl` desktop), documented in `apps/web/breakpoints.ts`, which is also the single source the JS media
  queries derive from. No custom screens, no arbitrary pixel values in classes or query strings.
- Removed: `shared/ui/dialog.tsx`, `shared/ui/confirm-dialog.tsx` (all 19 call sites migrated), and
  `CardDetailModal` — the card's detail/edit is now `CardDetailPanel` inside three shells (inline
  accordion in the desktop aside, `Drawer` on tablet, `Window` on phone).
- Propagated in the same session: CLAUDE.md (`apps/web` overlay amendment).

<!--
Sync Impact Report — 2026-08-05 (amendment 1.24.0)
- Version change: 1.23.0 → 1.24.0 (MINOR: new enforceable rule under Architecture norms; no
  principle removed or redefined).
- Architecture norms gain **"Unbounded list growth (paginated reads)"**: a list endpoint whose rows
  grow without limit MUST use keyset pagination over a *total* sort key (`(occurredAt, id)`) with an
  opaque `cursor` + `limit`, returning `{ items, nextCursor }`. Offset pagination is banned (rows are
  inserted/deleted mid-scroll, so offsets skip and repeat). An unrecognized cursor is REJECTED
  (`INVALID_CURSOR`), never treated as "start over" — that loops a paginating client forever.
  Aggregates over a paginated set (counts, sums, distinct values) MUST be computed in the database and
  served separately, never folded from whichever pages a client has loaded.
- First application: `GET /transactions` (response shape changed from a bare array to
  `{ items, nextCursor }`; `limit` omitted still returns everything, which the dashboard relies on)
  plus the new `GET /transactions/summary` and a server-side `category` filter that replaces the old
  client-side category search. Web adds `useInfiniteTransactions`/`useTransactionsSummary` and
  `shared/ui/infinite-scroll-sentinel.tsx`.
- Propagated in the same session: CLAUDE.md (`transaction` domain amendment).

Sync Impact Report — 2026-07-30 (amendment 1.23.0)
- Version change: 1.22.1 → 1.23.0 (MINOR: Principle VI gains a new, enforceable structural rule; no
  principle removed or redefined).
- Principle VI now requires **one table = one domain = one adapter**: every table in schema.prisma
  owns `src/domains/<table>/`, only its own adapter may query it, and reading a foreign table means
  composing that domain's port (never a Prisma `include`). Aggregate boundaries are explicitly
  preserved: a child table (card-account, card-limit, billing-settings, installment-payment,
  savings-entry) owns its table but not the rules over it — writes still go through the aggregate
  root. Adds the leaf/orchestration module split (`<table>.data.module.ts` vs `<table>.module.ts`)
  as the acyclicity mechanism, and cross-table atomicity stays one `prisma.$transaction` with
  `*WithTx` participants.
- Backend went from 11 business domains to 21 table-domains (+ `import`/`health`, which own no
  table). No public API/contract change; URLs unchanged.
- Propagated in the same session: CLAUDE.md, apps/api/README.md,
  docs/{english,spanish}/ARCHITECTURE.md §12a.

Sync Impact Report — 2026-07-30 (amendment 1.22.1)
- Version change: 1.22.0 → 1.22.1 (PATCH: status/clarity only, no principle added or redefined).
- Principle VI: the specs/009 rollout is COMPLETE — all 11 domains use the four layers, so the
  flat `module/controller/service/repository` skeleton is historical and must not be used for new
  code (it was previously "valid simultaneously during the rollout"). Recorded the Decorator
  (global `infra/cqrs/handler-logging.interceptor.ts`) as the required home for logging/timing
  around a dispatch, and replaced the retired `BillingGenerationService` path in the billing
  section with its command-handler/strategy replacements.
- Propagated in the same session: CLAUDE.md, docs/{english,spanish}/ARCHITECTURE.md §12a,
  docs/PENDING.md.

Sync Impact Report — 2026-07-25 (amendment 1.22.0)
- Version change: 1.21.1 → 1.22.0 (MINOR: new durable principle — Backend DDD + CQRS Architecture,
  specs/009-ddd-cqrs-architecture — `accounts` is the completed reference domain; the other 10
  domains are migrated later, one at a time, FR-017). Core Principles I-V unchanged in intent;
  this is an ADDITIONAL architecture-norm principle, not a redefinition of an existing one.
- New Core Principle VI (below): every backend domain, once migrated, MUST use four internal
  layers (domain/application/infrastructure/presentation), Command/Query separation built on
  `@nestjs/cqrs`, domain events dispatched synchronously by default, and the specific
  pattern-to-problem mapping FR-005–FR-014 in `specs/009-ddd-cqrs-architecture/spec.md` establish
  (State for multi-stage lifecycles, Strategy for growing categorical decisions, Template Method
  for the shared handler skeleton, Adapter for repositories, Facade for controllers, Decorator via
  Nest interceptors for cross-cutting concerns — Singleton/Abstract Factory/Prototype/Proxy/
  Composite are explicitly NOT hand-implemented, per FR-009/FR-014). Domains not yet migrated
  keep using the flat `module/controller/service/repository` skeleton from the Architecture norms
  below until their own migration turn — both shapes are constitutionally valid simultaneously
  during the rollout.
- Technology & Operational Constraints: `@nestjs/cqrs` recorded as a new dependency (`CommandBus`/
  `QueryBus`/`EventBus`). Tests for a migrated domain move out of `src/` into
  `apps/api/test/{unit,integration,e2e}/`, mirroring `src/domains/<domain>/<layer>/` — `test:unit`
  MUST run with zero database connections (Principle IV/SC-002).
- Full pattern + accounts reference tree: `docs/{english,spanish}/ARCHITECTURE.md` §12a. Narrative
  amendment: `CLAUDE.md`'s `accounts` section. Spec/plan/tasks: `specs/009-ddd-cqrs-architecture/`.

Sync Impact Report — 2026-07-25 (amendment 1.21.1)
- Version change: 1.21.0 → 1.21.1 (PATCH: docs-hygiene fix found by /speckit-analyze on spec 009 —
  Principle IV's "no test runner configured yet" note was stale drift, Vitest has run across all
  workspaces since specs/001). No principle content changed.

Sync Impact Report — 2026-07-25 (amendment 1.21.0)
- Version change: 1.20.0 → 1.21.0 (MAJOR-ish in scope but MINOR by semver-for-docs convention:
  replaces the one-shot "pay-credit" action with a full billing-period model — live-linked
  transactions, automatic generation via cron + button, real cross-account payments). Core
  Principles unchanged in intent; Principle II (per-user scoping) explicitly does NOT apply to the
  new system cron job, which is documented as the deliberate exception (a system-wide job, not a
  per-request query).
- Technology & Operational Constraints (accounts/transactions):
  - **New dependency `@nestjs/schedule`**, wired in a new **`src/infra/cron/`** module
    (`cron.module.ts` + `billing-generation.cron.ts`) — the cross-cutting home for every scheduled
    automation this app runs, same tier as `infra/prisma`/`infra/auth`/`infra/http`. Each
    `*.cron.ts` is a thin trigger; real logic lives in the owning domain's own service.
  - **`Transaction.creditStatementId`**: a contributing movement links, AT CREATION TIME, to
    whichever `CreditStatement` is currently OPEN for its account (`closedAt: null`) — created
    lazily on first contribution since the last close. Never reassigned by date on edit.
  - **`CreditStatement` has no stored `status`** — derived from `closedAt`/`paidAt`: OPEN (still
    accumulating, `amount` computed LIVE as the sum of linked transactions — no manual correction
    ever needed while unpaid) → PENDING (closed by generation, awaiting payment, still live) → PAID
    (`amount` frozen at pay time, only then correctable via `PATCH .../credit-statements/:id`, no
    cascade to the payment transaction or `creditUsed`).
  - **Statement generation** (`domains/accounts/application/commands/generate-statements.handler.ts`
    + the `BillingEligibilityStrategy` implementations in `domain/`) closes an OPEN statement once
    `billingCycleDay` passes, gated on eligibility (account + relevant card both ACTIVE) — shared
    verbatim by the daily cron (`GenerateAllDueStatementsCommand`, `scope: "system"`, every user's
    due accounts) and the manual "Generar facturación" button (`GenerateStatementsCommand`, one
    account).
  - **Paying a statement** (`POST /accounts/:id/credit-statements/:id/pay`) requires a real source
    bank account (any type except `CREDIT_LINE`) and atomically creates a genuine EXPENSE
    `Transaction` there (visible in its own Movimientos), decrements `creditUsed` by the
    statement's amount (not a full reset — later purchases land in the next OPEN period), and
    freezes the statement PAID.
  - Once a transaction's statement is PAID, editing/deleting that transaction never touches
    `creditUsed` again — its pool effect is already settled (mirrors the "no cascade" rule for
    correcting a paid statement's amount).
  - Web: `AccountDetailRoute` gained a Movimientos/Facturación tab switcher; the old sidebar
    `CreditPaySection` is replaced by `components/BillingSection.tsx`.

Sync Impact Report — 2026-07-25 (amendment 1.20.0)
- Version change: 1.19.0 → 1.20.0 (MINOR: billing config split into its own `BillingSettings`
  table; `AUTOMATIC` payment method locked in the UI pending payment-due-date design). Core
  Principles unchanged in intent.
- Technology & Operational Constraints (accounts):
  - **New `BillingSettings` model** (table `billing-settings`, 1:1 with `BankAccount` via a unique
    `accountId` FK, `onDelete: Cascade`): `billingCycleDay`, `paymentMethod`, and a new reserved
    `paymentDueDay` (nullable Int, unused) now live here instead of as `BankAccount` columns —
    deliberately separated so this configuration can be reviewed/maintained/searched independently
    instead of growing the accounts table. The API contract shape is unchanged (`BankAccount`
    still exposes `billingCycleDay`/`paymentMethod` as flat fields; the join is internal to
    `AccountsService`/`AccountsRepository.upsertBillingSettings`).
  - **The `AUTOMATIC` payment method is now locked in the UI** — `shared/ui/segmented.tsx` gained
    per-option `disabled`/`disabledReason`, rendered as a genuinely native-`disabled` button (no
    click handler fires at all — just a title tooltip explaining why), used by both `AccountForm`
    and the new `BillingSettingsModal` to grey out "Automático". It cannot be selected until the
    payment-due-date format is actually decided (still undefined — see `docs/PENDING.md`).
  - **New `BillingSettingsModal`**, reached via a small warning-badge icon next to the account name
    (not a full-width banner) on `AccountDetailRoute` when a credit-pool account has no billing day
    configured — opens a focused 2-field modal (billing day + payment method) instead of routing
    through the full `AccountForm` edit flow.

Sync Impact Report — 2026-07-25 (amendment 1.19.0)
- Version change: 1.18.0 → 1.19.0 (MINOR: `BankAccount.creditUsed` becomes a persisted column,
  paid down explicitly, instead of a value derived from transactions on every read — plus
  account-creation simplification). Core Principles unchanged in intent.
- Technology & Operational Constraints (accounts/transactions):
  - **`BankAccount.creditUsed` is now persisted**, seeded from `creditUsedInitial` at creation and
    mutated directly by `TransactionsService` on transaction create/update/delete (reverting the old
    contribution before applying the new one, including cross-account moves) — no longer recomputed
    via `AccountsRepository.sumsByAccount`/`TransactionsRepository.sumsForAccount` on read.
  - **`BankAccount.billingCycleDay` no longer scopes any sum to a time window** — the automatic
    per-cycle reset introduced in 1.17.0 is removed; it's now purely informational. Usage only goes
    down via the new **`POST /accounts/:id/pay-credit`**, which logs a **`CreditStatement`** row
    (`accountId`, `amount`, `paidAt` — history via `GET /accounts/:id/credit-statements`) and resets
    `creditUsed` to `0`. If the user never pays, `creditUsed` keeps accumulating — intended.
  - **New `BankAccount.paymentMethod`** (`BillingPaymentMethod`: MANUAL default/AUTOMATIC) — a stored
    preference only, `AUTOMATIC` has no functional effect yet (see `docs/PENDING.md`).
  - **Scoped to v1: the account-level shared pool only.** A card's own independent `CardLimit.used`
    (sub-limit) is unchanged — still derived from transactions the old, all-time way; migrating it to
    the same persisted+pay model is deferred (`docs/PENDING.md`).
  - **`AccountCreateModal` no longer asks for `status`, `billingCycleDay`, or `paymentMethod`** —
    every new account starts `ACTIVE`/unconfigured/`MANUAL`; all three remain editable afterward via
    `AccountForm` or the existing status-toggle button in `AccountDetailRoute`. A warning banner
    replaces the removed billing-day field when the drafted account has a credit pool.

Sync Impact Report — 2026-07-22 (amendment 1.18.0)
- Version change: 1.17.0 → 1.18.0 (MINOR: streamlines `CREDIT_LINE` account creation — no schema or
  API change, frontend-only). Core Principles unchanged in intent.
- Technology & Operational Constraints (accounts/cards):
  - **`AccountCreateModal` no longer requires a separate "add card" step to establish a `CREDIT_LINE`
    account's primary card.** A standalone credit-line account has no real bank account behind it, so
    its generic "Número de cuenta" field never fit well there; it's replaced (for this type only) by
    "Últimos 4 dígitos" + "Vencimiento" — combined with the account's own `creditLimit`/
    `creditUsedInitial` (already shown for this type), the modal constructs the primary `CreateCard`
    entry client-side and places it first in the submitted `cards[]`, so the backend's existing "first
    CREDIT card becomes primary" resolution (`CardsService`/`AccountsService.create`, unchanged) picks
    it up automatically. The modal's card-drafting section (relabeled "Tarjetas adicionales" for this
    type) is therefore always additional-only for `CREDIT_LINE` going forward.
  - **Unaffected:** editing an existing account (`AccountForm`) and any OTHER account type growing an
    add-on credit card (e.g. `CHECKING`) still go through the normal `CardsAside` → "Añadir tarjeta"
    flow exactly as before — this streamlining is scoped to creating a NEW `CREDIT_LINE` account only.
  - `AccountCreateModal` also gained error-toast handling on its create mutation (previously silent on
    failure) — needed now that this flow can reject with more validation codes (`CARD_LIMIT_REQUIRED`,
    invalid last4/expiry) at creation time.

Sync Impact Report — 2026-07-22 (amendment 1.17.0)
- Version change: 1.16.0 → 1.17.0 (MINOR: adds statement billing cycles to the credit model, plus a
  same-scope correctness fix). Core Principles unchanged in intent.
- Technology & Operational Constraints (accounts/cards/transactions):
  - **New `BankAccount.billingCycleDay`** (nullable Int, 1-28). Once set, every derived credit-usage
    number (`creditUsed`, a card's `ownUsed`, a card's own `CardLimit.used`) is scoped to the CURRENT
    billing cycle — since the most recent occurrence of that day-of-month, computed by
    `apps/api/src/domains/accounts/billing-cycle.ts`'s `currentCycleStart(billingCycleDay, now)` — instead
    of all-time. Usage genuinely resets each cycle for BOTH display and enforcement (a transaction that
    would have exceeded the limit last cycle can succeed again once the new cycle starts): transactions
    are never deleted, they simply stop counting toward the current limit once the next cut-off passes.
    `null` (the default, backward compatible with every existing account) keeps the prior all-time
    behavior. One billing day per account, applied uniformly to every card sharing it (one statement
    covers the whole account) — a card has no billing day of its own. The seed values
    (`creditUsedInitial`, a `CardLimit`'s `usedInitial`) are NOT reset per cycle — there's no per-cycle
    seed, only an account/card-level one, so they're still added on top of every cycle's computed sum
    (a known, documented simplification, not a gap this amendment tries to close).
  - **Correctness fix bundled with this feature:** `TransactionsRepository.sumsForAccount` (enforcement)
    and `AccountsRepository.sumsByAccount` (display) previously summed **every** transaction on an
    account toward its credit pool, with no filter on which card (if any) was used. That was harmless
    for a standalone `CREDIT_LINE` account (every transaction on it already is a credit-line one, by
    construction — an EXPENSE there always carries a CREDIT card, an INCOME is a payment) — but wrong
    for any OTHER account type that merely grew an add-on credit card: ordinary day-to-day banking
    (debit-card spend, cash, salary/other income) was incorrectly counted, in the worst observed case
    driving a displayed `creditUsed` to a large negative percentage on an account with substantial
    unrelated income. Fixed by requiring, for non-`CREDIT_LINE` accounts, that only EXPENSE transactions
    via a pool-sharing CREDIT-kind card count; income is never subtracted for this case since the app
    has no mechanism to record "a payment toward this specific add-on card" apart from ordinary account
    income (income never carries a card at all, per the existing movement rules) — a documented
    limitation carried forward, not newly introduced.
  - Frontend: `AccountCreateModal` and `AccountForm` gained a "Día de facturación" field (1-28, optional,
    digits-only, clamped to ≤28), shown whenever the account has (or is drafted to have) a credit pool.

Sync Impact Report — 2026-07-19 (amendment 1.16.0)
- Version change: 1.15.0 → 1.16.0 (MINOR: per-card usage display for pool-sharing cards). Core
  Principles unchanged in intent.
- Technology & Operational Constraints (accounts/cards):
  - **New derived contract field `Card.ownUsed`** (moneyString): a CREDIT card's own
    Σexpense−Σincome in the account's own currency, computed regardless of whether the card shares
    the account pool or carries its own `CardLimit`. Motivation: when several cards share the same
    account pool, every one of them previously displayed the identical fully-combined
    `account.creditUsed` figure — correct arithmetically (they DO share one pool) but confusing,
    since it read as "this card individually spent X" rather than "the shared pool X of the group
    is at". `AccountVisualCard` now shows `card.ownUsed` (not `account.creditUsed`) as a
    pool-sharing card's "used" figure, still against the shared `creditLimit` as the denominator;
    the no-`card` account-level tile is the only place the true combined total is still shown.
  - `ownUsed` has no seed baseline (unlike `creditUsedInitial`/`CardLimit.usedInitial`) — there is
    nowhere to attribute a pre-existing, not-transaction-backed balance to one specific
    pool-sharing card, so such a seed only ever shows up in the account's own combined
    `creditUsed`, never split across `ownUsed` values. Documented as a known limitation, not a bug.

Sync Impact Report — 2026-07-19 (amendment 1.15.0)
- Version change: 1.14.0 → 1.15.0 (MINOR: extends the primary-card credit model with
  multi-currency pools, plus a same-scope correctness fix). Core Principles unchanged in intent.
- Technology & Operational Constraints (accounts/cards/transactions):
  - **The primary card can now also carry `CardLimit` rows — but only for currencies OTHER than
    the account's own.** The account's own currency stays exclusively mirrored via
    `BankAccount.creditLimit`/`creditUsedInitial` (never duplicated as a `CardLimit` row for the
    primary); any additional currency the user enters on the primary (optional) becomes a real,
    independent `CardLimit` row — same mechanism a non-primary card's "tope propio" already uses,
    still no FX conversion, so never cross-checked against the account's own-currency pool.
    `CardsService.resolveCreditLimits` and `AccountsService.create`'s inline `cards[]` path both
    split `input.limits` this way (one entry matching the account's currency → mandatory, mirrored;
    the rest → `CardLimit` rows).
  - **New derived contract field `BankAccount.creditPools: {currency, limit, used}[]`** — the
    account's own-currency pool plus, if the primary card carries any, its extra-currency pools.
    A non-primary card's own sub-limit is NOT rolled up here (stays scoped to that card alone).
    Empty for non-credit accounts.
  - **Correctness fix (real bug, not just new-feature plumbing):** `TransactionsRepository
    .sumsForAccount` and `AccountsRepository.sumsByAccount` previously summed a bank account's
    shared-pool usage **without scoping by currency at all**, and excluded a card from that sum if
    it had *any* `CardLimit` row regardless of currency. Both were latent (harmless while a card's
    `CardLimit` rows, if any, always meant "fully independent, single currency"), but became a real
    bug the moment a SINGLE card could be pool-sharing in one currency while independently-limited
    in another (exactly what the primary + extra-currency change above introduces) — a card's
    other-currency spend would have inflated the account's own-currency `creditUsed`. Both methods
    are now scoped to the account's own currency, and the "independent card" exclusion checks for a
    `CardLimit` in *that specific currency*, not "any currency."
  - Frontend: `CardForm`'s primary-card branch gained an optional, always-visible "Topes en otras
    monedas" repeatable section (reusing the same currency/amount row UI as the additional-card
    "Tope propio" section, but excluding the account's own currency from its picker). `CardDetailModal`
    shows a small list of a card's non-account-currency `CardLimit`s (covers both the primary's extras
    and a non-primary card's own sub-limit in another currency). `AccountDetailRoute` shows a
    "Topes por moneda" card listing every entry in `creditPools` whenever there's more than one.
  - Amount inputs across `CardForm`/`AccountCreateModal`/`AccountForm` now display locale-grouped
    thousands (e.g. "3.000.000") while typing, via a shared `shared/lib/amountInput.ts` helper
    (extracted from the pre-existing transaction-amount-field pattern); these fields became
    integer-only in the process (matches the transaction amount field's existing convention) to
    avoid ambiguity between a grouping separator and a decimal separator for `es-CL`.

Sync Impact Report — 2026-07-18 (amendment 1.14.0)
- Version change: 1.13.0 → 1.14.0 (MINOR: revised the accounts/cards credit model a FOURTH time —
  supersedes 1.13.0's "any card may carry an optional sub-limit" shape with a "primary card mirrors
  the account" shape, per a same-day product decision from a definitive design mockup). Core
  Principles unchanged in intent.
- Technology & Operational Constraints (accounts/cards/transactions):
  - **`CardAccount.isPrimary`** (new boolean, `@default(false)`): the account's FIRST CREDIT-kind card,
    assigned automatically (never user-toggled) — at most one `true` per account, irrelevant for
    DEBIT/PREPAID. The primary card's limit **IS** the account's own `creditLimit`/`creditUsedInitial`
    — edited from either side (the account's own edit form, or the primary card's edit form), same
    underlying value, no `CardLimit` row of its own (`limits` is always `[]` for the primary).
  - **Every CREDIT card must resolve to a determinate limit before saving** (mandatory, enforced in
    `CardsService.resolveCreditLimits` / `AccountsService.create`'s inline `cards[]` path): the first
    CREDIT card on an account requires a limit in the account's own currency (becomes primary, writes
    through to `BankAccount.creditLimit`/`creditUsedInitial`); a *second-or-later* CREDIT card chooses,
    via new `createCardSchema.usesAccountPool` (boolean, default `true`), between sharing the account
    pool (no `CardLimit` rows) or `false` = its own independent sub-limit ("tope propio", one
    `CardLimit` row per currency, still capped against the account pool in the account's own currency
    via `CARD_SUBLIMIT_EXCEEDS_ACCOUNT`). Missing/zero limit where one is required throws the new
    `CARD_LIMIT_REQUIRED`. The `CardLimit` model itself (table `card-limit`, reinstated in 1.13.0) is
    unchanged in shape — only *when* a card gets one, and what "no row" now specifically means (either
    "this is the primary" or "this additional card shares the pool"), changed.
  - Editing an existing primary card without re-entering `usedInitial` (the frontend never surfaces
    that field) preserves the account's current `creditUsedInitial` instead of resetting it to `"0"` —
    a correctness fix alongside this redesign, since the old code always defaulted to `"0"` on write.
  - Frontend: `CardForm` is a 3-state UI now — non-CREDIT (no limit section), CREDIT-becomes-primary
    (one mandatory amount field in the account's currency), CREDIT-additional (a "Cupo de la
    cuenta"/"Tope propio" `Segmented` toggle, the latter revealing the existing repeatable
    currency/amount rows). `AccountCreateModal`'s account-level cupo fields become read-only/derived
    from the drafted primary card's own limit once one exists (mirrors 1:1, no independent input);
    `AccountForm` (editing an existing account) disables its cupo fields once a primary card exists,
    with a hint pointing at editing via the card instead. `AccountVisualCard`/`DraftCardTile` show a
    small "Principal"/"Adicional" badge next to a CREDIT card's name.
  - No new error codes beyond `CARD_LIMIT_REQUIRED`; `CARD_SUBLIMIT_EXCEEDED`/`CARD_SUBLIMIT_EXCEEDS_ACCOUNT`
    from 1.13.0 remain in active use for the "tope propio" path.

Sync Impact Report — 2026-07-18 (amendment 1.13.0)
- Version change: 1.12.0 → 1.13.0 (MINOR: revised accounts/cards model a third time — reinstates a
  card-level credit sub-limit, deliberately reversing amendment 1.5.0's simplification, per a live
  2026-07-18 product decision). Core Principles unchanged in intent.
- Technology & Operational Constraints (accounts/cards/transactions):
  - **`CardLimit` model reinstated** (table `card-limit`, one row per `(cardId, currency)`): `limitAmount`
    + `usedInitial` (seed), with a derived `used = usedInitial + Σexpense − Σincome` on that card+currency
    — same reconciliation pattern as the account's own `creditUsed`. Unlike the 1.4.0 attempt this
    amendment supersedes again, there is **no `parentCardId`/primary-secondary hierarchy** — a card either
    has its own `CardLimit` row(s) or it doesn't; a card with none simply draws on the full account pool.
    "Primary vs. secondary" is purely a naming convention in card names now, not a data relationship.
  - **The account-level pool is still the master/shared cap** — unchanged from 1.5.0 — but is no longer
    exclusive to `CREDIT_LINE`: **any cardable account that grows a CREDIT-kind card** (e.g. a CHECKING
    account's bank add-on credit card) gets the same `creditLimit`/`creditUsedInitial`/derived `creditUsed`
    treatment. A card's own sub-limit (if set, for a given currency) is an *additional, narrower* cap on
    top of the account pool, never a substitute for it — both are checked on every relevant transaction.
  - Setting a card's sub-limit in the **account's own currency** cannot exceed the account's `creditLimit`
    (`CARD_SUBLIMIT_EXCEEDS_ACCOUNT`, checked in `CardsService`); limits in other currencies aren't
    cross-checked against it (no FX conversion anywhere in this app — same stance as `extraCurrencies`).
  - Error codes restored: `CARD_SUBLIMIT_EXCEEDED` (a transaction exceeds the card's own sub-limit) is
    back in active use; `PARENT_CARD_INVALID` from 1.4.0 was NOT reinstated (no parent/secondary relation
    exists to validate). New: `CARD_SUBLIMIT_EXCEEDS_ACCOUNT`.
  - Frontend: `CardForm` gained an optional "topes por moneda" repeatable section (CREDIT kind only);
    `AccountCreateModal`/`AccountForm` show the account-level cupo fields whenever the account is a
    `CREDIT_LINE` OR has gained a CREDIT card (previously CREDIT_LINE-only); `AccountVisualCard` shows a
    card's own sub-limit progress when set, else falls back to the account pool.

Sync Impact Report — 2026-07-16 (amendment 1.12.0)
- Version change: 1.11.0 → 1.12.0 (MINOR: full profile-page redesign from a definitive design file,
  specs/008 "Perfil de Usuario"; also records a new durable workflow convention). Core Principles
  unchanged in intent.
- Technology & Operational Constraints:
  - `User` gains `phone`, `hideBalances` (real, partial coverage), `monthlyBudgetTarget` (money),
    `billingCycleStartDay`, `extraCurrencies` (`String[]`, selection only — no live FX), and
    `budgetAlertThreshold` (%, UI-only threshold). New shared primitive `shared/ui/collapsible-
    section.tsx` — Profile's configuration sections are now collapsible accordions, closed by default.
  - New sections `PlanBillingSection` and `DataPrivacySection` are **intentionally pure placeholders**
    (fixed example data, every action a no-op) — billing/plans, open-banking bank sync, data export,
    and automated backups are out of scope; no infrastructure for any of them exists in this project.
    `SecuritySection` similarly gained inert passkey/sessions rows.
- **New Development Workflow convention (Principle V extension)**: when a feature ships a
  visually-complete but non-functional/placeholder section, or a feature with only partial coverage
  (e.g. a preference wired into some but not all applicable call sites), it MUST be catalogued in
  **`docs/PENDING.md`** (a single project-wide living document, not one per feature — it's project
  history, not spec content) — what looks real but isn't, and what "real" would require. This is not
  optional documentation; silently shipping a convincing-looking no-op is a defect class this
  constitution now explicitly guards against (see `docs/PENDING.md`'s "Perfil de usuario" section for
  the reference example).

Sync Impact Report — 2026-07-16 (amendment 1.11.0)
- Version change: 1.10.0 → 1.11.0 (MINOR: major stack-version bump — NestJS 10 → 11 (Express 5) —
  dependabot PR #5, evaluated then implemented). Core Principles unchanged in intent.
- **NestJS 11 / Express 5**: `@nestjs/jwt`'s `JwtSignOptions.expiresIn` is now `jsonwebtoken`'s own
  `StringValue | number` (from the `ms` package) instead of a generic `string`, breaking
  `AuthService.issueTokens` (`apps/api/src/domains/auth/auth.service.ts`) — fixed with a small
  `expiresIn()` helper that types the env-sourced duration string as `StringValue`. Verified against
  a real server, not just CI: login, `/auth/me`, a real nested `:id` route, and the refresh-token
  rotation flow all worked end-to-end (JWT sign/verify, httpOnly cookies). No route in this codebase
  uses wildcard or optional-segment patterns, so Express 5's path-to-regexp changes don't apply here.

Sync Impact Report — 2026-07-16 (amendment 1.10.0)
- Version change: 1.9.0 → 1.10.0 (MINOR: major stack-version bump — React 18 → 19, react-i18next 15 → 17
  — dependabot PR #8, evaluated then implemented). Core Principles unchanged in intent.
- **React 19**: `apps/web` bumped straight through — no compatibility shims needed (typecheck, all 67
  unit/component tests, and build were clean with no source changes). Manually smoke-tested in a real
  browser against the real API/DB: login, every domain route (Panel, Cuentas, Movimientos, Cuotas,
  Deudas, Ahorros, Inversiones), and the sidebar theme toggle — all rendered and behaved correctly.
- **i18next 26**: dependabot's `react-i18next` group bump (15 → 17) required `i18next >= 26.2.0` as a
  peer, but the group didn't include `i18next` itself (left at 24.2.0) — a dependabot grouping gap, not
  a real conflict. Bumped `i18next` to `^26.3.6` alongside it; resolves the `keyFromSelector` export
  error that otherwise broke 10 test suites.

Sync Impact Report — 2026-07-16 (amendment 1.9.0)
- Version change: 1.8.0 → 1.9.0 (MINOR: major stack-version bump — Prisma 6 → 7 — dependabot PR #9,
  evaluated then implemented). Core Principles unchanged in intent.
- **Prisma 7**: `datasource.url` in `schema.prisma` is no longer accepted (Prisma 7 breaking change).
  `apps/api` now connects via the **`@prisma/adapter-pg`** driver adapter, constructed with
  `DATABASE_URL` (read through `ConfigService`) and passed to the `PrismaClient`/`PrismaService`
  constructor; the CLI (validate/generate/db push) reads the same `DATABASE_URL` via a new
  `apps/api/prisma.config.ts` (`defineConfig` + `env()` from `prisma/config`). `apps/api/prisma/seed.ts`
  constructs its own adapter identically. `prisma db push` no longer accepts `--skip-generate`
  (removed in Prisma 7); `scripts/db-reset.mjs` updated accordingly. No schema/model changes — this is
  a connection-mechanism migration only, verified against a real Postgres instance (db push + seed +
  a live query), not just CI.

Sync Impact Report — 2026-07-15 (amendment 1.8.0)
- Version change: 1.7.0 → 1.8.0 (MINOR: corrects the 1.7.0 identifier-type design before it shipped
  further — same specs/008 feature, not a new one). Core Principles unchanged in intent.
- Technology & Operational Constraints:
  - Which national-identity document type(s) a country supports is now **data**, not a fixed global
    enum list assumed valid everywhere: new join `CountryIdentifierType` (mirrors `CountryCurrency`'s
    `Country ↔ Currency` shape exactly — `countryId` + `identifierType` + `isPrimary`, unique pair).
    A country may support more than one type (e.g. RUT + passport). `identifierTypeSchema` moved from
    `auth` to `reference` (packages/contracts) — it's reference/lookup vocabulary shared by `Country`
    and `User`, not auth-specific. `reference.Country` now exposes `identifierTypes` (primary first).
  - The web edit form's identifier-type options now come from the selected country's own
    `identifierTypes`, falling back to the full vocabulary only when no country is set (covers
    pre-existing data saved before a country was chosen). Seeded via the same
    country↔currency-link pattern in `prisma/seed.ts`.

Sync Impact Report — 2026-07-15 (amendment 1.7.0)
- Version change: 1.6.0 → 1.7.0 (MINOR: personal-info expansion of specs/008 "Perfil de Usuario" —
  country/address/birth date/national identifier). Core Principles unchanged in intent.
- Technology & Operational Constraints:
  - `User` gains `countryId` (FK → `Country`, reusing the existing reference table), structured
    address (`addressStreet`/`addressCity`/`addressRegion`/`addressPostalCode`, all free text),
    `birthDate`, and a generalized national-identity pair `identifierType` (`IdentifierType`:
    RUT/DNI/PASSPORT/OTHER) + `identifierValue` — not a Chile-only `rut` field, to support users
    identifying with other countries' documents too. All optional; purely informational today (no
    billing/KYC feature consumes them).
  - **New validation rule**: `identifierValue` is check-digit validated (módulo 11) only when
    `identifierType === "RUT"` (`packages/contracts/src/auth/rut.ts`, `isValidRut`). Other identifier
    types have no universal format and are accepted as free text.
  - **Contract exposes both a derived and a raw form of the same fact**: `birthDate` (ISO date string)
    for edit-form hydration, and `age` (derived) for display. The Profile view only ever renders `age`
    — precedent: hiding a sensitive exact value from the default view is a **UI** choice, the API
    still returns the real data to the account's own authenticated owner (no server-side redaction of
    a user's own data).
  - **`packages/contracts` gained a Vitest suite** (`"test": "vitest run"`, `vitest` devDependency) —
    it previously had none, unlike `apps/api`, `apps/web`, and `packages/money`. Closes that gap for
    this package going forward; new contract-level validators (like `isValidRut`) belong here.

Sync Impact Report — 2026-07-15 (amendment 1.6.0)
- Version change: 1.5.1 → 1.6.0 (MINOR: new user-facing capability from specs/008 "Perfil de Usuario"
  — data-model + auth-mechanism expansion). Core Principles unchanged in intent.
- Technology & Operational Constraints:
  - `User` gains `preferredCurrency`, `locale`, `dateFormat`, `theme`, `status` (`UserStatus`:
    ACTIVE/DISABLED), `createdAt`. No new backend domain/module — folded into the existing `auth`
    domain, since `User` already lives there and no other responsibility justifies a separate module.
  - **Account deactivation is a real auth-mechanism change**: `JwtAuthGuard` now performs a per-request
    DB check (`status === ACTIVE`) in addition to JWT signature verification, and `AuthService.
    validateCredentials`/`rotateFromRefresh` reject `DISABLED` accounts (`ACCOUNT_DISABLED`). A prior
    behavior where a disabled account could keep using an already-issued access token until its
    natural ~15min expiry is explicitly rejected — deactivation must take effect on the account's next
    authenticated request, not wait for token expiry.
  - New endpoints on `auth`: `PATCH /auth/me`, `POST /auth/me/password`, `PATCH /auth/me/preferences`,
    `POST /auth/me/deactivate` (soft-disable only — no data deletion; a defense-in-depth Prisma `P2002`
    catch guards the email-uniqueness pre-check against a concurrent-write race). New error codes
    `INVALID_CURRENT_PASSWORD`, `ACCOUNT_DISABLED`.
  - **Bugfix recorded as a constraint going forward**: `AllExceptionsFilter` (`infra/http`) previously
    discarded every domain-specific error `code` thrown on an exception, replacing it with a generic
    status-derived code (e.g. a real `EMAIL_TAKEN` conflict reached the client as plain `CONFLICT`).
    Fixed to preserve the thrown `{code, field}` when present, falling back to the generic mapping only
    when none was thrown. This must not regress — it silently broke every specific error code app-wide,
    not just this feature's.
  - Frontend gains a new domain `apps/web/src/domains/profile` (route `/profile`) and a new shared
    primitive `shared/ui/switch.tsx`. The theme preference (previously `localStorage`-only) is now also
    persisted per-user server-side; `localStorage` remains the pre-auth/first-paint source of truth.

Sync Impact Report — 2026-07-02 (amendment 1.5.0)
- Version change: 1.4.0 → 1.5.0 (MINOR: revised accounts/cards model — supersedes the 1.4.0
  secondary-card sub-limit design before it shipped). Core Principles unchanged in intent.
- Technology & Operational Constraints (accounts/cards/transactions):
  - `AccountType` enum redefined: **CHECKING, SIGHT, SAVINGS, INVESTMENT, CREDIT_LINE, CASH**
    (removed VISTA→SIGHT, CREDIT_CARD/DEBIT_CARD/OTHER; added INVESTMENT, CREDIT_LINE).
  - **A standalone credit card is modeled as a `CREDIT_LINE` account** (the credit line lives in the
    account). The credit pool moved from the card to the account: `BankAccount.creditLimit` +
    `creditUsedInitial` (seed); derived `creditUsed = creditUsedInitial + Σexpense − Σincome`.
  - `Card` is now a pure payment instrument (plastic) that ALWAYS belongs to an account: `kind`
    (`CardKind`: CREDIT/DEBIT/**PREPAID**), `isActive`; **`CardLimit` model removed**, and the 1.4.0
    `parentCardId`/sub-limit secondary mechanism removed (secondaries = multiple cards on one
    credit-line account sharing its pool). Error codes reduced to CARD_REQUIRED, CARD_NOT_ALLOWED,
    CARD_ACCOUNT_MISMATCH, CARD_LIMIT_EXCEEDED (dropped CARD_SUBLIMIT_EXCEEDED, PARENT_CARD_INVALID).
  - Transactions: EXPENSE on a CREDIT_LINE account requires a card and is enforced against the
    account's credit pool; on other non-cash accounts the card is optional.
  - **Docker dev DB + reset workflow:** added `docker-compose.yml` (Postgres) and `pnpm db:reset`
    (`scripts/db-reset.mjs`) — destroy volume → recreate → `db push` → seed. Still no migrations folder.
  - **Persistence naming rule (1.5.1):** DB tables are **kebab-case via `@@map`** (models stay
    PascalCase). Renamed models `Card → CardAccount`, `WalletItem → WalletItemDashboard`. Removed the
    dead NextAuth tables (`Account`/`Session`/`VerificationToken`) — auth is JWT email+password only.
    Rule recorded under Architecture norms.

Sync Impact Report — 2026-07-02 (amendment 1.4.0)
- Version change: 1.3.0 → 1.4.0 (MINOR: data-model + business-rule expansion from specs/007
  "Rediseño Cuentas y Movimientos con tarjetas secundarias"). Core Principles unchanged in intent.
- Technology & Operational Constraints (accounts/cards/transactions domains):
  - `BankAccount` gains `accountNumber` (bank account number — free text, stored/shown in full; the
    "only last-4 / no PAN/CVV" rule applies ONLY to `Card`).
  - `Card` gains a self-relation `parentCardId` (secondary/additional cards, one level, onDelete Cascade).
    A secondary CREDIT card shares its primary's credit pool with its own sub-limit; a secondary DEBIT
    card is just another card on the same account (no pool).
  - `CardLimit.used` (previously a stored, user-set value) is replaced by `initialUsed` (seed) + a
    DERIVED reconciled `used = initialUsed + Σ credit EXPENSE`; a primary aggregates its secondaries.
    Mirrors the account initialBalance/currentBalance pattern (Principle I still holds — decimal only).
  - Transactions: bank required on new movements; non-cash EXPENSE requires a card, INCOME/cash forbid one;
    credit expenses enforced against sub-limit + shared pool. New language-agnostic error codes: CARD_REQUIRED,
    CARD_NOT_ALLOWED, CARD_ACCOUNT_MISMATCH, CARD_LIMIT_EXCEEDED, CARD_SUBLIMIT_EXCEEDED, PARENT_CARD_INVALID.
  - DB workflow note: the repo currently has no `prisma/migrations` folder and syncs schema via
    `prisma db push` ("Database schema is up to date"); the specs/007 schema change was applied with a
    data-preserving SQL backfill (`initialUsed = used`) then `db push`.

Sync Impact Report — 2026-06-21 (amendment 1.3.0)
- Version change: 1.2.0 → 1.3.0 (MINOR: recorded post-merge reality — monorepo merged to `main`;
  two new business domains (recurring, wallet); the design-system redesign and its approved
  frontend libraries). Core Principles unchanged in intent.
- Technology & Operational Constraints:
  - Business domains expanded from 8 to 10: added **recurring** (RecurringExpense — subscriptions/
    rent/periodic payments, next-due computed) and **wallet** (WalletItem — user-curated dashboard
    cards/accounts, drag-reorder). accounts now also exposes a per-day `balanceSeries` + `balanceChangePct`.
  - Approved frontend libraries recorded: **Recharts** (charts), **sonner** (toasts), **@dnd-kit**
    (drag-and-drop), **Geist** via `@fontsource-variable/geist` (typography). Design tokens gained the
    **clay `--accent`** channel.
  - Migration status: specs/001 monorepo **merged to `main`** (PR #1); legacy Next.js app removed.
- Known drift (pending wording refresh, not a behavior change): Principles II and III still cite
  legacy Next.js specifics (`app/api/**/route.ts`, `auth()`, `messages/*.json`, `next/link`,
  `@/i18n/navigation`). Intent holds; the mechanisms are now NestJS `JwtAuthGuard`/`@CurrentUser`
  and the web app's `src/i18n` es/en catalogs.

Sync Impact Report — 2026-06-14 (amendment 1.2.0)
- Version change: 1.1.0 → 1.2.0 (MINOR: added explicit, enforced Architecture norms — domain-first,
  one-source-of-truth shapes, one-way deps via check:boundaries, zod validation; updated Definition
  of Done to the real gates; migration now implemented on branch 001, pending merge). Principles unchanged.

Sync Impact Report — 2026-06-14 (amendment 1.1.0)
- Version change: 1.0.0 → 1.1.0 (MINOR: redefined Technology & Operational Constraints to the
  ratified target architecture; recorded Vitest as the chosen test runner). Core Principles
  unchanged. Driven by specs/001-api-frontend-monorepo (plan approved).
- Technology & Operational Constraints: now describes the target monorepo (apps/api NestJS +
  apps/web Vite/React + packages/* shared) with pnpm+Turborepo and backend-issued JWT (httpOnly).
  Migration is tracked by specs/001 and performed on a dedicated branch; the pre-migration single
  Next.js app remains on `main` until that branch passes its done-state and merges.
- Principle IV: Vitest selected as the single runner — the chosen means to close TODO(TEST_RUNNER)
  (still open until set up during the migration).

Sync Impact Report — initial ratification
- Version change: (template) → 1.0.0
- Ratification: initial adoption (first ratification)
- Principles defined:
  1. Money Precision (NON-NEGOTIABLE)
  2. Per-User Data Isolation (NON-NEGOTIABLE)
  3. i18n Parity (NON-NEGOTIABLE)
  4. Test-First / TDD (NON-NEGOTIABLE) — current gap recorded: no test runner yet
  5. Spec-Driven Development & Living Memory (NON-NEGOTIABLE)
- Added sections: Technology & Operational Constraints; Development Workflow & Quality Gates; Governance
- Removed sections: none (template placeholders replaced)
- Templates reviewed:
  ✅ .specify/templates/plan-template.md — Constitution Check gate is generic; compatible
  ✅ .specify/templates/spec-template.md — no constitution-driven mandatory sections to change
  ✅ .specify/templates/tasks-template.md — task categories compatible (testing tasks supported)
  ✅ CLAUDE.md — SDD + memory-sync rule already present and aligned
- Deferred TODOs:
  ⚠ TODO(TEST_RUNNER): no test runner configured in the repo. Principle IV (TDD) is the
    mandated standard but is NOT yet satisfied. Set up a test runner (e.g. Vitest) before
    or as the first task of the next feature, then drop this note.
-->

# FinanceApp Constitution

FinanceApp is a personal-finance web application (individual/household use) for tracking
income and expenses, installments, debts, savings goals, bank accounts, investments (ETF +
remunerated accounts), and Excel import. This constitution encodes the non-negotiable
principles and operating rules that every spec, plan, and implementation MUST honor. The
code is the source of truth; this document governs how the code is allowed to change.

## Core Principles

### I. Money Precision (NON-NEGOTIABLE)

All monetary values MUST use `decimal.js` in business logic and `Prisma.Decimal` in
persistence, at the schema-defined precisions (e.g. `Decimal(18,4)`). Floating-point
arithmetic on money (JavaScript `number` for amounts, rates, or balances) is FORBIDDEN.
Rounding MUST be explicit and consistent with the stored precision.

Rationale: a finance app is only trustworthy if totals reconcile to the cent. Binary
floats silently lose precision and corrupt balances, interest, and amortization.

### II. Per-User Data Isolation (NON-NEGOTIABLE)

Every data read and write MUST be scoped by `session.user.id`. API route handlers
(`app/api/**/route.ts`) MUST call `auth()` and return `401` when there is no valid session
(the locale/auth middleware does not protect `api` routes). No query may return, and no
mutation may touch, another user's data.

Rationale: financial data is sensitive and personal. A single unscoped query is a data
breach. Isolation is enforced at every entry point, not assumed.

### III. i18n Parity (NON-NEGOTIABLE)

Every user-facing string MUST exist in BOTH `messages/es.json` and `messages/en.json` under
identical keys. Locale-aware navigation MUST use `@/i18n/navigation` (`Link`, `redirect`);
bare `next/link` for internal routes is FORBIDDEN. Default locale is `es`; `localePrefix` is
`always`.

Rationale: the app ships Spanish and English as first-class. A key present in one catalog
but missing in the other is a user-visible defect (raw key or crash).

### IV. Test-First / TDD (NON-NEGOTIABLE)

Tests are written before implementation and follow Red-Green-Refactor: write a failing test,
make it pass, refactor. Financial logic (`lib/finance/**`) MUST have unit tests covering the
money rules in Principle I.

**Vitest** is the runner, set up across `apps/api`, `apps/web`, and `packages/*` (ratified with
specs/001, completed during the monorepo migration). `TODO(TEST_RUNNER)` is closed.

Rationale: correctness in money math cannot be verified by eye. TDD makes the intended
behavior executable and prevents regressions in the most consequential code.

### V. Spec-Driven Development & Living Memory (NON-NEGOTIABLE)

Features MUST be built through the Spec Kit lifecycle, orchestrated by the `/sdd` skill:
constitution → specify → clarify → plan → checklist → tasks → analyze → implement. There is
NO implementation without an approved spec → plan → tasks chain.

On ANY relevant change — new dependency, new convention, schema/data-model change, new env
var, new command, routing/auth change, or a new/amended principle — BOTH this constitution
AND `CLAUDE.md` MUST be updated in the SAME session. Stale documentation is a defect, not a
follow-up.

Rationale: the spec is the shared contract; skipping it produces code nobody agreed to.
The constitution and `CLAUDE.md` are the project's durable memory — if they drift from
reality, every future decision is made on false information.

### VI. Backend DDD + CQRS Architecture (one table = one domain, 23 domains)

**One table, one domain, one adapter.** Every table in `apps/api/prisma/schema.prisma` MUST own
exactly one folder `src/domains/<table>/` (kebab-case, matching its `@@map`), and exactly one Prisma
adapter may query that table. No adapter, handler or controller may read or write a table owned by
another domain: it goes through that domain's port. A folder that owns no table is allowed only when
it owns no data either (`import`, `health`).

This does NOT dissolve aggregates. A table whose rows exist only inside another aggregate
(`card-account`, `card-limit`, `billing-settings`, `installment-payment`, `savings-entry`) owns its
table and its row shape, never the rules over it — writes still travel through the aggregate root
that validates them, and such a domain has only `domain/` + `infrastructure/` layers. Cross-table
atomicity stays a single `prisma.$transaction(...)` opened by the handler, with each owner exposing a
`*WithTx` method. To keep the module graph acyclic, a table exposes a LEAF `<table>.data.module.ts`
(its port→adapter binding, importing no other domain) and, when it has commands/queries/HTTP, a
`<table>.module.ts` that imports the leaves it reads — orchestration depends on leaves, never the
reverse.

Once a backend domain (`apps/api/src/domains/<domain>/`) is migrated under
specs/009-ddd-cqrs-architecture, it MUST use four internal layers — **domain** (aggregates that
own their invariants/lifecycle; State objects for multi-stage lifecycles; Strategy objects for
decisions that vary by a growing set of categories; domain events; repository ports; domain
errors), **application** (Command/Query separation — one command+handler pair per mutation, one
query+handler pair per read, every handler extending the shared `BaseCommandHandler`/
`BaseQueryHandler` Template Method built on `@nestjs/cqrs`), **infrastructure** (Prisma repository
Adapters implementing the domain's ports — the ONLY files in the domain allowed to import
`@prisma/client`), **presentation** (a thin Facade controller: request → command/query →
response, plus Zod validation of body/query AND path params). Domain events publish via
`@nestjs/cqrs`'s `EventBus` and are dispatched **synchronously by default** (a failing listener
surfaces as part of the same request; async is opt-in per listener, only when a reaction can
genuinely wait). A business action that inherently spans more than one aggregate in one atomic
step MAY use a single `prisma.$transaction(...)` across the involved ports' `saveWithTx` — this is
a documented pragmatic exception, not a violation of aggregate boundaries. Singleton, Abstract
Factory, Prototype, Proxy, and Composite are explicitly NOT hand-implemented (Nest's DI, existing
Guards, and this app's flat non-recursive data already cover their roles).

Migration proceeded one domain at a time (`bank-account` is the reference implementation) and is
**complete: all 21 table-domains use the four layers**, so the flat
`module/controller/service/repository` skeleton described in the Architecture norms below is
historical and MUST NOT be used for new code. Cross-cutting concerns around a dispatch (logging,
timing) are Decorators — NestJS interceptors registered globally (`infra/cqrs/
handler-logging.interceptor.ts`), never a `Logger` call inside a handler. Tests for each domain
live in `apps/api/test/{unit,integration,e2e}/`, mirroring
`src/domains/<domain>/<layer>/` — the unit tier MUST run with zero database connections
(reinforces Principle IV).

Rationale: business rules scattered across a service file that also talks to the database are
easy to bypass from another code path; concentrating them in an aggregate makes them structurally
impossible to skip and independently unit-testable. CQRS keeps read-shaping changes from ever
risking write-side correctness. Full pattern-to-problem rationale (FR-005–FR-014) and the
`accounts` reference tree: `docs/{english,spanish}/ARCHITECTURE.md` §12a;
`specs/009-ddd-cqrs-architecture/spec.md`.

## Technology & Operational Constraints

- **Target architecture (ratified — specs/001):** a **pnpm + Turborepo monorepo** with two
  separately deployable apps and shared packages:
  - `apps/api` — **NestJS** backend, **Prisma 7 / PostgreSQL** (sole DB owner, connected via the
    **`@prisma/adapter-pg` driver adapter** + `prisma.config.ts` — Prisma 7 no longer accepts a
    `datasource.url` in `schema.prisma`), domain-first modules; auth issues **JWT access+refresh
    tokens in httpOnly cookies**.
  - `apps/web` — **Vite + React 19 SPA**, domain-first features, consumes the API over HTTP only;
    **owns the es/en i18n catalogs** (the API returns data + language-agnostic error codes).
  - `packages/*` — shared **contracts** (zod schemas + types), **money** (`decimal.js`),
    config. One-way deps: apps → packages; `api ↛ web`.
  - **Testing:** **Vitest** across apps and packages.
- **Architecture norms (NON-NEGOTIABLE, enforced):**
  - **Domain-first:** both apps organize code under `src/domains/<domain>/`; the backend follows the
    `module → controller → service → repository` skeleton (the repository is the only Prisma touchpoint
    and always scopes by `userId`). New domains mirror this skeleton.
  - **One source of truth for shapes:** request/response models are zod schemas in
    `@finance/contracts` (flat interfaces via `@finance/contracts/models`); money math lives in
    `@finance/money`. The Prisma schema (`apps/api/prisma`) is the only persistence model.
  - **One-way dependencies:** `apps → packages`; `packages ↛ apps`; `api ↛ web`. Enforced by
    `pnpm check:boundaries` (the frontend must not import backend internals or any DB client).
  - **Validation with zod** (`ZodValidationPipe`), not class-validator.
  - **Unbounded list growth (paginated reads):** a list endpoint whose rows grow without limit
    (`transaction` today) MUST offer **keyset pagination** — an opaque `cursor` over a _total_
    sort key (`(occurredAt, id)`, never a bare timestamp) plus `limit`, returning
    `{ items, nextCursor }`. Offset pagination is NOT used: rows are inserted and deleted while
    the user scrolls, which makes offsets skip and repeat records. A cursor the API didn't issue
    is **rejected** (`INVALID_CURSOR`), never silently treated as "start over" — that turns a
    paginating client into an infinite loop. **Aggregates over a paginated set (counts, sums,
    distinct values) MUST be computed in the database and served separately** (e.g.
    `GET /transactions/summary`), never folded from the rows a client happens to have loaded:
    a KPI derived from page one is a wrong number, not an approximation.
  - **Breakpoint stages (web):** the responsive scale is Tailwind's DEFAULT one, with a fixed meaning
    per step: base = phone, `sm` (640) = end of phone/start of tablet, `md` (768) = tablet, `lg` (1024)
    = tablet, `xl` (1280) = widest tablet, `2xl` (1536) = desktop.
    Custom screens, arbitrary `min-[NNNpx]:` classes and inline `(min-width: NNNpx)` strings are NOT
    used; `apps/web/breakpoints.ts` documents the stages and is the single source the JS media queries
    derive from (`minWidth(name)`), so a view's CSS and its structural JS always switch at the same
    width. Rationale: the gap between a CSS breakpoint and a differing JS one is a state nobody
    designed — a shipped instance hid a desktop aside and its mobile tab at once, making the content
    unreachable.
  - **Container width, not viewport, when a sibling moves (web):** if the space a component gets can
    change without the viewport changing (the collapsible sidebar), the layout decision MUST read the
    element's own measured width (`shared/lib/useElementWidth.ts`) rather than a breakpoint. A media
    query cannot distinguish "1024px with the sidebar collapsed" from "1024px with it expanded", so a
    breakpoint-only rule necessarily gets one of the two wrong.
  - **One overlay family (web):** every dialog is built from `apps/web/src/shared/ui/overlay/` and
    MUST NOT hand-roll its own frame. `ResponsiveSurface` is the default (full-screen `Window` below
    420px, centered `Modal` above; the choice is a media query, so only one structure is mounted);
    `ConfirmModal` is **always** a modal — an alert interrupts, may stack on top of another surface,
    and turning it into a full screen would hide the very thing being asked about. A modal's backdrop
    blurs as well as darkens. Header (`leading`/title/`headerAside`/close), single scrolling body and
    pinned footer come from `SurfaceChrome`, so those land in the same place in every context;
    opinionated variants (`FormSurface`'s `create`/`edit` modes) are composed ON TOP of the chrome,
    never added as flags inside it. A route that becomes a full-screen screen on a phone uses
    `WindowScreen`. When a form's submit lives in the surface footer, they are wired with
    `formId` + `form="<id>"` — one form, one action bar. Where a width has room to show a record
    beside its list (the desktop cards aside), the detail is shown **inline** instead of in an
    overlay, and the same content component is reused across the inline/drawer/window forms — the
    same information MUST NOT be rendered twice at once.
  - **A payment instrument holds no money of its own:** money lives in an ACCOUNT; a card is a
    channel onto its account's funds (DEBIT/PREPAID) or credit line (CREDIT). A card row MUST NOT
    carry a balance column of its own. A prepaid product is therefore an account type
    (`AccountType.PREPAID`) whose cards all share the account's single balance, funded by an
    ordinary transfer or income — never by a dedicated card top-up endpoint, which would be a second
    way to record the same fact.
  - **A prepaid account never goes negative:** every outflow — an expense with a card, an expense
    without one, or a transfer's outgoing leg — MUST be rejected with `PREPAID_INSUFFICIENT_BALANCE`
    when it exceeds the balance, and its initial balance MUST NOT be negative
    (`INVALID_INITIAL_BALANCE`). The rule belongs to the account TYPE, so it is enforced once in the
    pure policies (`MovementPolicy`/`TransferPolicy`), never per channel; an edit is checked against
    the balance BEFORE its own previous charge.
  - **A credit card is its own account, not an add-on:** a credit card MUST live on a `CREDIT_LINE`
    account, never on a CHECKING/SIGHT/SAVINGS one. Banks sell them bundled as a "plan", but a
    purchase on the card doesn't take money out of the deposit account: it opens revolving debt with
    its own statement, cycle and minimum payment. Consequently only a `CREDIT_LINE` account carries a
    credit pool and billing settings (`CREDIT_SETTINGS_NOT_ALLOWED` otherwise), and a type change MUST
    be refused when it would strand cards already issued on the account. Cash accounts hold cash and
    are spent with DEBIT cards — including SAVINGS, whose debit card exists to withdraw at an ATM.
  - **Which card kinds an account carries is one matrix:** the account-type ↔ card-kind
    compatibility lives in a single table in `@finance/contracts` (`ALLOWED_CARD_KINDS`), from which
    `isCardableAccountType` derives and which BOTH the API aggregate and the web forms read — never
    as scattered conditionals. An account carrying no cards at all answers
    `ACCOUNT_CANNOT_HAVE_CARD`; one carrying cards but not that kind answers
    `CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT`.
  - **A financial product is not a setting:** an account's `type` MUST NOT be convertible to or from
    `PREPAID` (`ACCOUNT_TYPE_CHANGE_NOT_ALLOWED`). Correcting a mistyped account means deleting and
    recreating it, not migrating cards, a credit pool and billing periods across products.
  - **Cash moves once, when it actually moves:** a movement's COST and its effect on the account's
    cash balance are different questions. A purchase charged to a credit line (any movement on a
    `CREDIT_LINE` account, or one made with a CREDIT-kind card on any account) MUST NOT move
    `currentBalance` — it raises `creditUsed`, and the cash leaves once, later, when the statement is
    paid. That payment is a real EXPENSE movement, so IT is what moves the paying account's balance
    (which need not be the account carrying the card). The rule lives in one place per side
    (`transaction/domain/balance-delta.ts`'s `cashDelta` in the API, `drawsOnCredit`/`balanceAfter` on
    the web) and every write path — create, edit, delete, statement payment, payment correction,
    statement sync — MUST agree with it; a balance the user cannot reconcile by hand is a defect.
  - **The user recognises the brand, the regulator registers the entity:** an institution's
    user-facing `name` is its COMMERCIAL name (Copec Pay, Tenpo, BancoEstado) and its registered
    entity lives in `legalName`; pickers label with the former and MUST search both plus `brands`,
    because a person looks for what is printed on their card. An institution that sells only to
    companies stays in the catalogue (the regulator lists it, and history may point at it) but is
    flagged `retailFacing: false` and hidden from the pickers — never deleted.
  - **A catalogue is data, never an inference from classification:** which account products an
    institution offers lives in its own seeded table (`institution-account-type`, flagship first via
    `isPrimary`) and MUST NOT be derived at runtime from `kind` or `category`, which classify what
    the entity IS (regulation) rather than what it SELLS — a non-bank issuer may launch a checking
    account, a foreign branch may sell only one product. Such a catalogue is ALWAYS behind reality,
    so it MUST be applied permissively: an institution with no catalogued products is offered for
    every account type, the filter narrows the picker instead of rejecting a write, and an
    institution already saved on an account stays selectable even once it stops offering that
    product. A relation that carries attributes of its own is a join TABLE, not a scalar list.
  - **A transfer is not income nor expense:** money moved between two of the user's own accounts MUST
    be excluded from every income/expense aggregate. Representing it as ordinary rows (two
    `Transaction` rows sharing `transferGroupId`) means no sum excludes it on its own, so the
    exclusion lives in ONE named predicate — `EXCLUDE_TRANSFERS` (API) / `excludeTransfers` (web) —
    that EVERY such aggregate applies, including any new one. The list and the movement count do not
    exclude them: each account must see its own leg. A transfer never carries a card, never touches a
    credit pool or a billing period, and never lands in a `CREDIT_LINE` account.
  - **A paired write is one transaction:** a record that only exists as a pair MUST be created,
    edited and deleted as a unit, inside a single `prisma.$transaction` that also applies every
    affected account's balance delta, and MUST NOT be editable one side at a time
    (`409 TRANSFER_EDIT_AS_PAIR`); deleting from either side deletes the pair.
  - **Uploaded files are validated, not trusted:** a file accepted from a client MUST be checked by
    the API — declared content type against an allow-list, the file's real **magic bytes** against
    that declared type, and a size cap enforced by the upload interceptor with in-memory (never
    on-disk) storage — before anything is written and after the owning record's ownership is
    verified. Ownership failures answer 404, never 403.
  - **External storage is a port, and its absence is inert:** bytes stored outside the database are
    reached through a domain port (`ObjectStoragePort`), its client confined to `infrastructure/`,
    so the unit tier stays network-free. Missing configuration MUST leave the feature inert
    (`isConfigured() === false`, `503 ATTACHMENTS_UNAVAILABLE`), never break boot or any other
    feature. Removing the remote object happens AFTER the database transaction — a network call must
    not hold one open — and a failed removal is logged with its key rather than rolled back.
  - **A derived figure is declared unknown, not approximated (web):** a client-side financial figure
    that cannot be computed correctly from what is loaded (balance after a movement, when a date
    filter or a mixed-account list hides the rows it depends on) MUST read as an explicit unknown
    (an em dash) or be hidden — never as an unlabelled estimate — and the gap catalogued in
    `docs/PENDING.md`. Keeping the labelled row with "—" is preferred where the design shows it:
    it tells the user the figure exists and is not available, instead of silently missing.
  - **Persistence naming:** Prisma **model** names are PascalCase; the physical **DB table** name MUST
    be **kebab-case via `@@map`** (e.g. `BankAccount` → `bank-account`, `CardAccount` → `card-account`,
    `WalletItemDashboard` → `wallet-item-dashboard`). Every model carries an `@@map`. No unused/legacy
    tables: auth is JWT email+password only (no NextAuth `Account`/`Session`/`VerificationToken`).
- **Business domains (current — 11):** backend `apps/api/src/domains/*`: `reference` (global read-only
  countries + financial institutions [banks + non-bank card issuers via `FinancialInstitution.kind`] +
  currencies — ISO 3166-1 + ISO 4217; `BankAccount.institutionId` FK), `auth`, `accounts`
  (incl. `cards` + a per-day `balanceSeries`/`balanceChangePct`), `transactions`, `installments`,
  `debts`, `recurring` (recurring expenses — subscriptions/rent/periodic payments; next-due computed
  from anchor + frequency × interval), `savings`, `investments`, `import`, `wallet` (user-curated set
  of pinned cards/accounts shown on the dashboard, manually ordered). The dashboard (Panel) is a
  frontend-only aggregation over these domains. New domains mirror the module skeleton.
- **Approved frontend libraries:** charts via **Recharts**; toasts via **sonner**; drag-and-drop via
  **@dnd-kit** (`core`/`sortable`/`utilities`); typography **Geist** (`@fontsource-variable/geist`).
  Design tokens include the **clay `--accent`** channel (HSL, dark/light). Adding a new runtime
  dependency is a Principle V change (record it here and in `CLAUDE.md` the same session).
- **Migration status:** the specs/001 monorepo migration has **merged to `main`** (PR #1); the legacy
  single Next.js app is removed. (Principles II–III still use legacy Next.js phrasing — see the latest
  Sync Impact Report; intent is unchanged, mechanisms are now NestJS guard + the web `src/i18n` catalogs.)
- **Environment:** per `.env.example` — `DATABASE_URL`, JWT secrets, CORS origin (api), and
  `VITE_API_URL` (web); optional `GOOGLE_CLIENT_*`, `ALPHA_VANTAGE_API_KEY`. Secrets MUST NOT be
  committed; `.env` stays out of version control.
- **Major stack changes** (framework, ORM, auth strategy, package manager, monorepo tooling) are
  governance amendments and require a version bump here plus a `CLAUDE.md` update.

## Development Workflow & Quality Gates

- **SDD review gates:** the spec is reviewed and approved before planning; the plan is
  reviewed and approved before tasks; `/speckit-analyze` runs and its findings are resolved
  before `/speckit-implement`.
- **Definition of done:** `pnpm check:boundaries`, `pnpm typecheck`, `pnpm test`, and `pnpm build`
  MUST pass; money/finance logic in `packages/money` is covered by tests.
- **Ambiguity:** when scope, a tech choice, or acceptance criteria are unknown, STOP and ask
  the user — do not guess. (Enforced by the `/sdd` orchestrator.)
- **Memory sync:** every cycle ends by reconciling this constitution and `CLAUDE.md` with what
  actually changed.
- **No silent placeholders:** a feature MAY ship a visually-complete but non-functional section, or a
  preference wired into only some applicable call sites — but it MUST be catalogued in
  **`docs/PENDING.md`** (project-wide, not per-feature) with what looks real but isn't, and what
  "real" would require. Convincing-looking no-ops that aren't documented are a defect, not a shortcut.

## Governance

This constitution supersedes ad-hoc practices. When a principle and a convenience conflict,
the principle wins, or the principle is formally amended — not silently ignored.

- **Amendment (pragmatic):** a single maintainer MAY amend this document by (a) editing the
  relevant section, (b) documenting the change in the Sync Impact Report, and (c) bumping the
  version. No multi-party approval ceremony is required, but the change MUST be recorded.
- **Versioning (semver):** MAJOR = backward-incompatible principle removal/redefinition;
  MINOR = new principle/section or materially expanded guidance; PATCH = clarifications and
  wording.
- **Compliance:** complexity MUST be justified against the principles. `CLAUDE.md` is the
  runtime guidance file and MUST be kept in sync with this constitution (Principle V).

**Version**: 1.39.0 | **Ratified**: 2026-06-14 | **Last Amended**: 2026-08-15
