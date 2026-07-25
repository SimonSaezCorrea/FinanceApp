# Phase 1 Data Model: Backend DDD + CQRS Architecture Migration

No Prisma schema changes (see spec Assumptions — this is a code-organization migration). This
file models the **conceptual objects the new layers introduce**, generically (for every domain)
and concretely for the reference domain (`accounts`/billing).

## Generic shapes (apply to every domain)

### Aggregate

- Identity: its own id (mirrors the Prisma row's id it wraps).
- State: private fields, mutated only by its own methods.
- Invariants: enforced inside those methods — an invalid transition throws a domain-specific error
  (e.g. `StatementAlreadyPaidError`), never a generic one.
- Reconstruction: a static factory method (`fromPersistence(row)`) rebuilds an aggregate from a
  repository adapter's read — this is the recommended **Factory Method** use (FR-008).
- Emits: zero or more domain events as a result of a method call, collected and returned to the
  command handler, which passes them to the `EventBus` after a successful persist.

### Domain Event

- Immutable value object: `{ occurredAt, ...fields describing what happened }`.
- Named in past tense (`StatementPaid`, not `PayStatement`).
- Carries only the data a listener would plausibly need — not the whole aggregate.

### Command / Command Handler

- Command: a plain data object, always including `userId` (Principle II) plus whatever the
  operation needs (e.g. `PayCreditStatementCommand { userId, accountId, statementId,
  fromAccountId }`).
- Handler: implements `ICommandHandler<TCommand>` from `@nestjs/cqrs`, extends the shared
  `BaseCommandHandler` (Template Method) which fixes the skeleton: load aggregate(s) scoped to
  `userId` → invoke the aggregate method → persist via the repository port → publish resulting
  events. The concrete handler only supplies "which aggregate(s) to load" and "which method to
  call".

### Query / Query Handler

- Query: a plain data object (e.g. `ListCreditStatementsQuery { userId, accountId }`).
- Handler: implements `IQueryHandler<TQuery>`, reads via the repository port's read methods (or a
  dedicated read-only query method), and returns a DTO shaped for that specific read — never an
  aggregate instance, never a Prisma row.

### Repository (port + adapter)

- Port: an interface in `domain/ports/`, owned by the domain, naming only the operations the
  domain actually needs (`findById`, `save`, not a generic CRUD surface).
- Adapter: a class in `infrastructure/`, implementing the port against Prisma — the only place in
  the domain allowed to import `@prisma/client` types.

## Reference domain: `accounts` / billing

### `BankAccount` (aggregate)

- Wraps the existing `BankAccount` Prisma row.
- Invariants carried over from current `AccountsService`/`CardsService` logic (unchanged rules,
  now enforced here instead of scattered across services):
  - Only `CHECKING`/`SIGHT`/`CREDIT_LINE` accounts can carry a card (`ACCOUNT_CANNOT_HAVE_CARD`).
  - `accountNumber` required for `CHECKING`/`SIGHT`/`SAVINGS` (`ACCOUNT_NUMBER_REQUIRED`).
  - `creditUsed` adjustments never take it negative; a projected increment exceeding `creditLimit`
    is rejected (`CARD_LIMIT_EXCEEDED`).
- Methods: `adjustCreditUsed(delta)`, `deactivate()` (emits `AccountDeactivated`), `reconcileBalance(...)`.

### `CreditStatement` (aggregate, State pattern)

- Wraps the existing `CreditStatement` Prisma row plus its linked transactions' live sum.
- State object per lifecycle stage (`domain/states/`), each implementing the same interface:

  | State | `canClose()` | `canPay()` | `canCorrectAmount()` |
  |---|---|---|---|
  | `OpenState` | only if due date passed + account/card eligible (Strategy) | yes (early payment allowed) | no — no frozen amount yet |
  | `PendingState` | n/a (already closed) | yes | no — still live, edit via linked transactions |
  | `PaidState` | n/a | no — `StatementAlreadyPaidError` | yes — the one state where correction is allowed |

- Methods: `close(boundaryDate)`, `pay(amount, fromAccountId, paymentTxId)`, `correctAmount(newAmount)`
  — each delegates the "is this allowed right now" question to `this.state`, then transitions
  `this.state` to the next one and emits the matching event (`StatementClosed`/`StatementPaid`).
- `BillingEligibilityStrategy` (domain/, Strategy pattern): one implementation per account shape
  (`CreditLineEligibility`, `AddOnCardEligibility`), each answering "is this account/card
  configuration eligible to close its current period right now" — replaces the current if/else in
  `BillingGenerationService`.

### Commands (accounts/billing)

All commands below implement `BaseCommand` (`contracts/layer-contracts.md`): user-scoped ones set
`scope: "user"` alongside `userId`; the one system-wide trigger sets `scope: "system"` and has no
`userId` at all — a typed exception to per-user scoping, not an untyped gap.

- `PayCreditStatementCommand { scope: "user", userId, accountId, statementId, fromAccountId }` —
  its `persist()` spans `CreditStatement` + `Transaction` + `BankAccount`, so it uses the
  cross-aggregate transactional `persist()` override (see `contracts/layer-contracts.md`).
- `GenerateStatementsCommand { scope: "user", userId, accountId }` (manual trigger)
- `GenerateAllDueStatementsCommand { scope: "system" }` (cron trigger — genuinely system-wide, not
  tied to any one request/user; `loadContext` skips per-user scoping for this command type only)
- `CorrectStatementAmountCommand { scope: "user", userId, accountId, statementId, amount }`

### Queries (accounts/billing)

- `ListCreditStatementsQuery { userId, accountId }` → `CreditStatementDto[]`
- `GetAccountQuery { userId, accountId }` → `BankAccountDto`

### Domain Events (accounts/billing)

- `StatementClosedEvent { accountId, statementId, periodStart, closedAt }`
- `StatementPaidEvent { accountId, statementId, amount, paidFromAccountId, paidTransactionId }`
- `AccountDeactivatedEvent { accountId }`

### Ports (accounts/billing)

- `BankAccountRepositoryPort`: `findById(userId, id)`, `save(aggregate)`, `listByUser(userId,
  filters)`.
- `CreditStatementRepositoryPort`: `findById(userId, accountId, statementId)`,
  `findOpenForAccount(accountId)`, `save(aggregate)`, `listForAccount(userId, accountId)`.
