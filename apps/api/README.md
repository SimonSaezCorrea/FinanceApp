# @finance/api — NestJS backend

Sole owner of the database (Prisma). Exposes the HTTP API under `/api/v1`. The frontend talks to
it only over HTTP. Validation uses **zod** schemas from `@finance/contracts` (not class-validator).

## Per-table domain skeleton (`src/domains/<table>/`)

**One table, one domain.** Every table in `prisma/schema.prisma` has its own folder under
`src/domains/<table>/` (kebab-case, matching the table's `@@map`), and **exactly one adapter is
allowed to query that table**. There are 21 tables and therefore 21 folders; `import` and `health`
are the only extra folders — they own no table (`import` writes movements through the `transaction`
domain's port).

Each folder uses the four DDD + CQRS layers (specs/009). A table whose rows are only ever reached
through another aggregate (e.g. `card-limit`, `installment-payment`) has just `domain/` +
`infrastructure/`; the rules over it live in the aggregate that owns it.

```
src/domains/<table>/
├── <table>.data.module.ts    # LEAF: only this table's port→adapter binding, imports no domain
├── <table>.module.ts         # orchestration (only if the table has commands/queries/HTTP)
├── domain/                   # aggregates (own their invariants), states, strategies, events,
│                             #   ports/*.repository.port.ts, errors.ts — no Prisma, no Nest HTTP
├── application/              # commands/ + queries/ (one command|query + handler pair each),
│                             #   events/*.listener.ts; handlers extend infra/cqrs base classes
├── infrastructure/           # prisma-*.repository.ts — the ONLY files allowed to import
│                             #   @prisma/client; always scope by userId
└── presentation/             # <table>.controller.ts (thin Facade: request → CommandBus/QueryBus)
                              #   + dto/*.params.ts for ZodParamsPipe
```

**Reading a table you don't own is forbidden — compose its port instead.** A hydrated `BankAccount`
needs cards, their limits and its billing settings: the adapter injects those three domains' ports
rather than using a Prisma `include`. Cross-table atomicity still works: the handler opens one
`prisma.$transaction(...)` and each owner's `*WithTx` method enlists in it (see
`credit-statement`'s pay flow, which writes `credit-statement` + `transaction` + `bank-account`).

**Two modules per table, when needed.** `<table>.data.module.ts` is a leaf that exports only the
port and imports no other domain; `<table>.module.ts` holds handlers/controllers and imports the
leaves it reads. Orchestration depends on leaves, never the reverse — that's what keeps the module
graph acyclic when two tables reference each other (`transaction` ⇄ `bank-account`).

Tests mirror that tree under `test/{unit,integration,e2e}/domains/<table>/<layer>/`; `test:unit`
must open zero DB connections. Cross-cutting code lives in `src/infra/` (`prisma`, `auth` guard +
`@CurrentUser`, `http` error filter + `ZodValidationPipe`/`ZodParamsPipe`, `cqrs` base handlers +
global logging interceptor, `cron`, `config`). Domain modules are registered in `src/app.module.ts`.

Rules: every query/mutation is scoped by `session.user.id` (Principle II); money stays in
`Decimal`/strings (Principle I); errors are language-agnostic codes (the frontend localizes).

## Extraction

The backend depends only on `@finance/*` shared packages (never on `apps/web`), so `apps/api` +
those packages are a self-contained subset that can be lifted into its own repo (SC-007).
