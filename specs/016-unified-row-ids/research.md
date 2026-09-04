# Research: Unified Row Identifiers

## Decision 1 — Schema-level id generation

**Decision**: Change every table's `id` column default in `apps/api/prisma/schema.prisma` from
`@default(cuid())` to `@default(uuid(7))`.

**Rationale**: Prisma (confirmed on the project's pinned `prisma@7.9.1`) generates the default
value client-side when the schema declares `uuid(7)` — it does not depend on a Postgres-native
v7 generator function (Postgres itself only gained `gen_random_uuid()` for v4 pre-17; this
project's CI/dev Postgres is `16-alpine`). This means the switch is a pure schema-default change:
no new Postgres extension, no raw SQL default, no version bump of the database image.

**Alternatives considered**:

- `dbgenerated("gen_random_uuid()")` (native v4) — rejected, wrong version and still Prisma has the
  cleaner `uuid(7)` default builtin.
- Postgres 18's native `uuidv7()` SQL function — rejected, requires a Postgres major upgrade this
  feature has no reason to force.
- cuid2 — rejected per the product owner's explicit choice of UUID v7 (spec Assumptions).

## Decision 2 — Application-minted ids (the 5 known write paths)

**Decision**: Add one small internal helper in `apps/api/src/infra/id/` (e.g. `generate-row-id.ts`)
that returns a UUID v7 string via the `uuid` npm package's `v7()` export (new dependency, `apps/api`
only — id minting is a backend-only concern, `apps/web` never mints a row id, so this does not
belong in a shared `packages/*`). Every one of the five sites that currently calls `randomUUID()`
switches to this helper instead of Prisma's schema default, because in every one of the five cases
the code needs the id's value _before_ the row is inserted (a cross-referenced value written into
a sibling record in the same transaction, or a value that is also used to derive something else,
like the attachment's storage key) — a schema default alone can't supply that.

**Rationale**: One function, one implementation, used everywhere an id is minted outside of letting
Prisma apply its own default. Two different UUID-v7 implementations from two different libraries
still interoperate at the _format_ level (both produce spec-compliant RFC 9562 v7 strings), but
using one avoids any risk of divergent behavior (e.g. clock-sequence handling) and gives the
project exactly one place to look when auditing "how are ids minted here."

**Alternatives considered**:

- Calling into Prisma's own internal `uuid(7)` default generator directly from application code —
  rejected, Prisma does not expose it as a standalone importable function; it is schema-DSL-only.
- `uuidv7` (single-purpose package) instead of `uuid` — either works; `uuid` was chosen because it
  is already the de facto standard package for this need and ships the `v7` export alongside
  `v4`/`validate`, useful if a future need arises to validate/inspect a uuid string in application
  code (as opposed to at the contract-validation boundary, which uses zod, see Decision 3).

## Decision 3 — Format validation at the API boundary

**Decision**: Add one shared schema, `rowId` (in `@finance/contracts`, e.g.
`packages/contracts/src/common/row-id.ts`), built on zod v4's native `z.uuidv7()` (confirmed
present on the project's pinned `zod@4.4.3` — `zod/v4/classic/schemas.d.ts` exports
`uuidv7()` as a top-level, non-deprecated schema constructor, strictly matching version-7 UUIDs,
not any UUID version). Every path-param schema's id-shaped fields (the 12 files enumerated below)
and every domain schema's id-shaped fields switch from `z.string().min(1)` (or bare `z.string()`)
to this shared schema.

**Rationale**: One schema, defined once, is what makes "every id field validates the same way"
achievable and keeps it that way as new fields are added — mirrors this project's existing
`moneyString` pattern (one shared zod primitive, reused everywhere a decimal string crosses the
boundary) rather than repeating `.uuid({version:"v7"})` at each of ~62 call sites with room for one
to drift.

**Path-param schema files affected** (12 files under `apps/api/src/domains/*/presentation/dto/`,
matching the "13 path-param schemas" figure from the constitution's 2026-09-02 audit — one of the
13 originally counted, `installmentPaymentParamsSchema`'s `seq`, is a sequence NUMBER, not a row
id, and correctly stays a coerced positive integer, untouched by this feature):
`account-id.params.ts`, `card.params.ts`, `statement.params.ts`, `debt-id.params.ts`,
`installment-payment.params.ts` (only its `id` field), `installment-plan-id.params.ts`,
`investment-id.params.ts`, `recurring-id.params.ts`, `savings-entry-id.params.ts`,
`savings-goal-id.params.ts`, `transaction-id.params.ts`, `transfer-group.params.ts`,
`wallet-item-id.params.ts`.

**Alternatives considered**:

- A regex-based custom zod `.refine()` repeated per field — rejected, exactly the drift risk the
  shared-schema approach avoids.
- Validating only path params, leaving body-field ids as bare strings — rejected, FR-003 and User
  Story 1's second acceptance scenario explicitly require both; a body-supplied foreign id is also
  where the constitution's separate ownership-verification debt (docs/PENDING.md point 3) lives,
  and this feature's format check is a prerequisite defense for that future work, not a replacement
  for it.

## Decision 4 — Producing the single shared `INVALID_ID_FORMAT` error code

**Decision**: `rowId` carries a zod `meta()` tag (`{ errorCode: "INVALID_ID_FORMAT" }`). Both
`ZodValidationPipe` (body/query) and `ZodParamsPipe` (path params) — today generic, mapping any
failure to `VALIDATION_FAILED` — gain one small addition: when a validation issue's failing schema
node carries that meta tag, the pipe throws `INVALID_ID_FORMAT` with `field` set to the issue's
path instead of the generic `VALIDATION_FAILED`. Every other (non-id) validation failure keeps
behaving exactly as it does today — this is additive, not a rewrite of the pipes' existing
contract.

**Rationale**: This is the minimal change that satisfies the spec's clarified answer (FR-004: one
shared `INVALID_ID_FORMAT` code with a `field` pointer, following the existing
`{error:{code,field}}` convention) without inventing a second validation-error pathway alongside
the one the two pipes already implement.

**Alternatives considered**:

- A dedicated `IdParamsPipe` separate from `ZodParamsPipe` — rejected, would fork behavior (stack
  traces, logging, the `describeError` integration) that the existing pipes already get right.
- Detecting the failure by issue shape alone (`issue.code === "invalid_format" && issue.format ===
"uuid"`) instead of a meta tag — considered and rejected as the primary mechanism: it would also
  fire for a hypothetical future non-id UUID-shaped field (there are none today, but nothing stops
  one being added later) and wrongly relabel it as a row-id error. The meta tag keeps the
  association explicit and field-scoped.

## Decision 5 — Route-ordering fragility (FR-005) is NOT solved by format validation

**Decision**: No change to the existing convention of declaring literal-path routes (e.g.
`GET /transactions/summary`, `POST /transactions/transfers`) before the dynamic `:id` route in each
controller. This feature does not remove that requirement.

**Rationale**: NestJS resolves which handler matches a request purely by declaration order among
routes at the same path depth — a `:id` handler will still greedily match a literal segment like
`summary` unless the literal route is registered first, regardless of what the `:id` param's zod
schema does afterward (the schema only runs once NestJS has already decided the `:id` handler is
the match). Format validation is a second, independent layer of defense (a malformed value inside
whichever handler NestJS picked gets rejected) — it does not change routing itself. This is
recorded here specifically so the feature isn't implemented under the mistaken belief that adding
`rowId` validation lets the ordering comments/constraints in `transactions.controller.ts` be
removed.

**Alternatives considered**: Rewriting the affected routes with more specific path prefixes to make
ordering irrelevant — rejected as out of scope; it's a larger routing refactor unrelated to
identifier format and not requested by the spec (FR-005 only requires literal routes keep working,
which they already do today via the existing ordering convention).

## Decision 6 — `specs/009/quickstart.md` SC-007 update

**Decision**: Update the SC-007 manual-check section (`## 8. Path params are Zod-validated
(SC-007)`) to describe the concrete, now-real check: hitting an endpoint with a malformed `:id`
(e.g. `not-a-real-id`, or a well-formed UUID v4) returns `400 INVALID_ID_FORMAT` before any
repository call — replacing the current wording, which describes intended behavior that the code
does not yet implement.

**Rationale**: Directly closes User Story 3 / FR-007 / SC-004.

## Decision 7 — No production data migration

**Decision**: No migration script. `pnpm db:push && pnpm db:seed` (or `pnpm db:reset`) is the
upgrade path for every environment this project has today (confirmed: no production data exists —
spec Assumptions).

**Rationale**: Matches this project's established convention for schema-default changes (see
CLAUDE.md: "this repo has no `prisma/migrations` folder; `db push` is the workflow").

## Decision 8 — FK ownership verification (User Story 4, added 2026-09-04)

**Decision**: One new narrow port, `BankAccountLookupPort` (`bank-account/domain/ports/
bank-account-lookup.port.ts`, single method `accountOwned(userId, accountId): Promise<boolean>`),
mirrors the existing `CountryLookupPort`/`FinancialInstitutionLookupPort` convention (a lightweight
read-only slice of a table for a domain that only needs one narrow fact about it, versus importing
the full aggregate's repository port). Backed by a Prisma adapter scanning `bank-account` with
`WHERE id = ? AND userId = ?`, wired into the existing `BankAccountDataModule` (already the leaf for
this table) alongside its full `BankAccountRepositoryPort`. Four handlers gain the check: `import`'s
bulk handler (deduplicates the referenced ids first, one query per DISTINCT id, not per row),
`investment`'s create/update, `recurring-expense`'s create/update. `installment-plan`'s create/
update handlers already inject the FULL `BankAccountRepositoryPort` (needed for other reasons —
paying an instalment moves a real balance) so they reuse its existing `findById` instead of adding
the narrow port redundantly.

**Rationale**: A narrow lookup port for a boolean ownership check is the established pattern in
this codebase for "domain X needs one fact about table Y it doesn't own" — matches `wallet`'s own
`accountOwned`/`cardOwned` (defined inside `WalletItemRepositoryPort` itself, since wallet is the
only consumer) and `savings-entry`'s reuse of `savings-goal`'s own `findOne` (specs/015). Reusing an
existing full port where one is already injected (`installment-plan`) avoids injecting the same
capability twice under two different names.

**The `cardId` fix is a logic change, not a new port**: `CardAccountRepositoryPort.kindForCard`
already scopes by `userId` (so a foreign card already resolves to `null`, same as a genuinely
absent one) — the bug was purely in the two `installment-plan` handlers not distinguishing "no
`cardId` was sent" from "a `cardId` was sent but resolved to nothing" before deciding what to do
with it. The fix is one added `if (input.cardId && !cardKind) throw new CardNotFoundError();` per
handler, reusing `bank-account` domain's own existing `CardNotFoundError` (same reuse-the-target-
aggregate's-own-error convention as `AccountNotFoundError`).

**Two write paths double-checked and confirmed already correct, not touched by this story**:
`POST /transactions`'s `cardId` already throws `CardAccountMismatchError` when a `cardId` is
supplied but doesn't resolve on the given account (`movement-policy.ts:116,119`), and `POST /wallet`
already verifies via its own `accountOwned`/`cardOwned` — the constitution's audit cited both as the
PATTERN TO MIRROR for the five broken ones, not as broken themselves, and reading both handlers
before writing this decision confirmed that citation was accurate.

**Alternatives considered**:

- Checking ownership inside the AGGREGATE (`Investment`/`RecurringExpense`/`InstallmentPlan`)
  instead of the handler — rejected: an aggregate has no repository access in this codebase's
  layering (Adapter pattern keeps Prisma out of `domain/`), and ownership of a DIFFERENT table's row
  isn't this aggregate's own invariant to protect.
- A single mega-port covering every cross-domain lookup this app will ever need — rejected as
  premature; each domain's own narrow port (this one included) is cheaper to reason about and this
  codebase already has three of them.
