# Phase 0 Research: Backend DDD + CQRS Architecture Migration

All open questions from the spec's Technical Context were resolved during `/speckit-clarify`
(see `spec.md`'s Clarifications section) or have an unambiguous default given the existing
codebase. No `NEEDS CLARIFICATION` markers remain. This file consolidates the resulting decisions
and the alternatives considered for each, plus a few implementation-level research items needed
before Phase 1 design.

## Decision: Command/Query/Event plumbing via `@nestjs/cqrs`

- **Decision**: Use the official `@nestjs/cqrs` package for `CommandBus`, `QueryBus`, and
  `EventBus`, registered per domain module via `CqrsModule`.
- **Rationale**: It already implements the Command and Observer patterns correctly, integrates
  with Nest's existing DI container (no parallel container needed), is maintained alongside the
  NestJS core the project already depends on, and supports sagas later if a domain ever needs
  multi-step process orchestration — without having to introduce that concept ourselves.
- **Alternatives considered**: A hand-rolled bus (plain classes + a `Map` of handlers) was
  rejected — it would need to be built and tested 11 times over (once per domain, or centralized
  and still maintained by us) for strictly less capability than a library already in the NestJS
  ecosystem.

## Decision: In-process, synchronous-by-default domain events

- **Decision**: `EventBus.publish()` dispatches to `@EventsHandler`-annotated listeners in-process,
  synchronously, within the same request/transaction by default. A listener may opt into
  asynchronous handling explicitly (e.g. via a microtask/queue-like deferral) only when its
  reaction can genuinely wait.
- **Rationale**: Personal-finance data correctness matters more than response latency at this
  scale; a listener failure must be visible as part of the triggering request, not silently lost.
  No distributed broker (Redis/BullMQ) is introduced — there is exactly one process, one deploy,
  and no external consumer today.
- **Alternatives considered**: Redis + BullMQ was evaluated and explicitly deferred (tracked in
  `docs/PENDING.md` as a future "para analizar" item) — it only pays for itself once a listener
  needs to survive a process restart or run on a separate worker, neither of which is true yet.

## Decision: CQRS scope — light read models, pragmatic write transactions

- **Decision**: Query handlers query the existing Postgres tables directly (via repositories or
  read-only query builders) and shape their own DTO — no new persisted/denormalized projection
  store. Command handlers MAY touch more than one aggregate's repository inside a single database
  transaction when the business action is inherently atomic (e.g. paying a statement: seal the
  `CreditStatement`, create a `Transaction`, adjust `BankAccount.creditUsed`).
- **Rationale**: A separate read-store only pays for itself at a read-scaling problem this project
  doesn't have. Strict one-aggregate-per-transaction purity would force artificial multi-step
  sagas for what is, physically, one atomic accounting operation — adding failure modes (partial
  application) without a real benefit at this scale.
- **Alternatives considered**: Full CQRS with persisted projections (rejected — premature);
  strict single-aggregate transactions with eventual consistency via events (rejected — the
  cross-aggregate operations in this domain are genuinely atomic business actions, not
  eventually-consistent processes).

## Decision: Uniform architecture across all 11 domains, no lightweight exception

- **Decision**: Every domain — including read-heavy/simple ones like `reference` — gets the full
  four-layer split and Command/Query separation. No domain is exempted for being "too simple".
- **Rationale**: Explicit user requirement, justified by this being personal banking data:
  consistency of enforcement across the whole codebase outweighs the boilerplate cost in the
  simplest domains.
- **Alternatives considered**: A lighter pattern for read-only domains (rejected per user
  decision).

## Decision: Zod validation extends to route path parameters

- **Decision**: Add a small param-validation pipe (`ZodParamsPipe`, mirroring the existing
  `ZodValidationPipe` used for body/query) so every `@Param()` is parsed through a Zod schema
  before a command/query is constructed.
- **Rationale**: Closes the one remaining gap in "all input passes through Zod" — today path
  params are plain unvalidated strings.
- **Alternatives considered**: Leaving params as-is and relying on the repository/`findFirst`
  returning nothing for a malformed id (rejected — inconsistent with the rest of the input
  pipeline, and pushes a validation concern into the domain/infrastructure layer).

## Decision: `accounts`/billing as the reference-implementation domain

- **Decision**: Migrate `accounts` (specifically its billing sub-area: `BankAccount`,
  `CreditStatement`, `BillingGenerationService`, the pay/generate/correct flows) first, as the
  concrete reference other domains are migrated against.
- **Rationale**: It already has the richest business logic in the codebase (a real lifecycle,
  eligibility rules, cross-aggregate atomic operations, an existing cron) — the reference
  implementation should exercise every pattern named in the spec (State, Strategy, Command,
  Observer, Adapter, Facade, Decorator, Template Method) at least once.
- **Alternatives considered**: Starting with a simpler domain (e.g. `wallet`) was considered but
  rejected — it wouldn't exercise State/Strategy/cross-aggregate transactions, so patterns
  established there would need revisiting once a more complex domain is reached.

## Research: `@nestjs/cqrs` handler-testing pattern (for SC-002: zero-DB unit tests)

- Aggregates (plain classes, no Nest decorators) are unit-tested by direct instantiation — no
  Nest testing module needed at all.
- Command/query handlers are tested by constructing them with a hand-written fake implementing
  the repository **port** interface (not a Prisma mock) — since the port is a small,
  domain-owned interface, the fake is trivial and has no ORM shape leakage.
- Integration tests (`test/integration/`) instantiate the real Prisma-backed adapter against a
  test database (existing test DB setup, unchanged) to verify the adapter correctly implements
  its port.
