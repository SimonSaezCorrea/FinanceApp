# Quickstart: Validating the DDD + CQRS Migration

This is a **validation guide**, not implementation code — use it to prove each domain's migration
(starting with `accounts`/billing) actually delivers the spec's User Stories, before and after
`/speckit-implement` runs.

## Prerequisites

- `pnpm install` at the repo root (installs the new `@nestjs/cqrs` dependency once added).
- Local Postgres running (existing `docker-compose.yml` setup, unchanged).
- `pnpm --filter @finance/api exec prisma generate` (schema itself is unchanged, but re-run if the
  client was regenerated for any reason).

## 1. Business-rule tests run without a database (User Story 1 / SC-002)

```bash
pnpm --filter @finance/api test:unit
```

Expected: this command targets only `apps/api/test/unit/**` and completes with **zero** Postgres
connections opened (confirm by temporarily stopping the local Postgres container and re-running —
the unit suite must still pass).

## 2. A business rule can't be bypassed (User Story 1)

Pick `CreditStatement.pay()`: write (or locate, post-migration) a unit test asserting that calling
`pay()` twice on the same aggregate throws on the second call, with no database involved:

```ts
const statement = CreditStatement.fromPersistence(openStatementRow);
statement.pay(100, "acc_1", "tx_1");
expect(() => statement.pay(100, "acc_1", "tx_2")).toThrow(StatementAlreadyPaidError);
```

## 3. A new event listener attaches without touching the publisher (User Story 2 / SC-003)

Add a throwaway listener:

```ts
@EventsHandler(StatementPaidEvent)
class LogStatementPaidListener implements IEventHandler<StatementPaidEvent> {
  handle(event: StatementPaidEvent) { console.log("paid:", event.statementId); }
}
```

Register it in `accounts.module.ts`'s providers, then pay a real statement through the API
(`POST /accounts/:id/credit-statements/:statementId/pay`) and confirm the log line appears —
with **zero modifications** to `PayCreditStatementHandler` or any file that publishes the event.

## 4. Reads and writes are independent (User Story 3)

Change `ListCreditStatementsQueryHandler`'s returned DTO shape (e.g. add a computed field), run:

```bash
pnpm --filter @finance/api test:unit -- credit-statement
```

Expected: no command handler, aggregate, or state-object test needs to change for this to pass.

## 5. Test suite runs in independent groups (User Story 4 / SC-005)

```bash
pnpm --filter @finance/api test:unit         # apps/api/test/unit/**
pnpm --filter @finance/api test:integration  # apps/api/test/integration/** (real test DB)
pnpm --filter @finance/api test:e2e          # apps/api/test/e2e/** (through HTTP)
```

Each MUST be independently runnable (integration/e2e require the test DB; unit does not).

## 6. Existing API behavior is unchanged (SC-001)

Run the full existing behavioral coverage against the migrated domain and confirm no regression:

```bash
pnpm --filter @finance/api test
pnpm --filter @finance/api typecheck
```

Then manually re-run the same accounts/billing flows exercised in prior sessions (create a
CREDIT_LINE account, generate a statement, pay it from a CHECKING account, correct a paid
statement's amount) via `pnpm dev` and confirm identical behavior to pre-migration.

## 7. Controllers stay thin (SC-008)

```bash
grep -rn "prisma\." apps/api/src/domains/accounts/presentation/ || echo "OK: no direct Prisma access in presentation layer"
```

## 8. Path params are Zod-validated (SC-007)

Hit an endpoint with a malformed `:id` (e.g. `GET /accounts/not-a-real-id/credit-statements`) and
confirm a Zod validation error (400) is returned before any repository/database call is made,
instead of falling through to a generic 404 from an empty Prisma lookup.

## 9. Documentation parity (SC-004a)

```bash
grep -c "domain/application/infrastructure/presentation" CLAUDE.md docs/english/ARCHITECTURE.md docs/spanish/ARCHITECTURE.md .specify/memory/constitution.md
```

All four files should describe the same four-layer pattern; read each to confirm no
contradictions (this is a manual cross-read, not fully automatable).
