# Feature Specification: Backend DDD + CQRS Architecture Migration

**Feature Branch**: `009-ddd-cqrs-architecture`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "Migrar la arquitectura de apps/api (NestJS) de un patrón domain-first plano a DDD táctico completo: cada dominio se reorganiza en capas domain/application/infrastructure/presentation; las reglas de negocio viven en aggregates con sus propias invariantes (ej. CreditStatement no puede pagarse dos veces, una cuenta inactiva no genera facturación); los cambios de estado relevantes emiten eventos de dominio (ej. StatementClosed, StatementPaid, AccountDeactivated) que otros módulos pueden escuchar sin acoplarse directamente; lecturas y escrituras se separan en CQRS completo (command handlers para mutar, query handlers con su propio modelo de lectura para consultar); los tests se reorganizan fuera de src/ a apps/api/test/{unit,integration,e2e} espejando la estructura de src/. Se aplica a los 11 dominios existentes (auth, accounts, transactions, installments, debts, recurring, savings, investments, import, wallet, reference), dominio por dominio, sin romper ningún endpoint público existente (mismos contratos de API). Se documenta el patrón en CLAUDE.md y en la constitución del proyecto para que quede claro cómo escribir código nuevo bajo esta arquitectura."

## User Scenarios & Testing _(mandatory)_

/ Note: the primary users of this feature are the people who build and maintain this codebase
(currently a solo developer, plus any future Claude Code session) — the "user experience" being
improved is how it feels to add, change, and reason about backend business logic.

### User Story 1 - Add a business rule with confidence (Priority: P1)

A maintainer needs to add or change a business rule inside a domain (e.g. "a statement cannot be
paid twice", "an inactive account cannot generate a new statement"). Today that rule can live
anywhere inside a service that also talks to the database — it's easy to accidentally bypass it
from another code path. After the migration, that rule lives inside one well-known object (the
aggregate) that is the *only* way to change that piece of data, so it is structurally impossible
to bypass, and the rule can be tested by itself with no database involved.

**Why this priority**: This is the foundational promise of the whole migration — if invariants
aren't actually protected, the rest of the architecture is just extra folders.

**Independent Test**: Pick one existing rule (e.g. "a PAID statement's core fields are frozen"),
move it into its aggregate, write a unit test that proves the rule holds with zero database
access, and confirm the existing API behavior is unchanged from the outside.

**Acceptance Scenarios**:

1. **Given** a migrated domain's aggregate, **When** code anywhere in the system attempts a state
   change that violates one of its invariants, **Then** the change is rejected by the aggregate
   itself, not by a check duplicated in a service or controller.
2. **Given** a business rule now living in an aggregate, **When** a maintainer runs its unit test,
   **Then** the test runs and passes without a database connection, mock ORM objects, or an HTTP
   server.

---

### User Story 2 - React to something that happened, without touching the source (Priority: P2)

A maintainer wants to add new behavior that happens *because* something else happened elsewhere
in the system (e.g. "when a statement is paid, eventually notify the user" or "when an account is
deactivated, stop its recurring reminders"). Today that means editing the original service that
caused the change. After the migration, the original change publishes a domain event, and the new
behavior is a separate listener that subscribes to it.

**Why this priority**: This is what makes the codebase safe to keep growing — new integrations
(several are already anticipated: automatic payments, bank sync, notifications) attach without
risking the module that already works.

**Independent Test**: Add a trivial new listener (e.g. a log line) for an existing domain event
and confirm it fires on the real state change, with zero modifications to the module that raises
the event.

**Acceptance Scenarios**:

1. **Given** a state transition that matters to the rest of the system, **When** it happens,
   **Then** a domain event describing it is published.
2. **Given** a new listener subscribed to an existing domain event, **When** the event is
   published, **Then** the listener runs without any change to the code that published the event.

---

### User Story 3 - Change how data is displayed without risking data integrity (Priority: P2)

A maintainer needs to change or optimize how data is read/listed for the UI (e.g. reshape what a
list endpoint returns) without any risk of touching the code path that protects the data's
integrity on write. After the migration, reads and writes are two separate code paths that don't
share logic.

**Why this priority**: Read-shaping changes are common and should never be able to introduce a
write-side bug.

**Independent Test**: Change a query's output shape and confirm no command/aggregate/write-path
file needed to change, and that existing write behavior/tests are unaffected.

**Acceptance Scenarios**:

1. **Given** a migrated domain, **When** a maintainer changes what a query returns, **Then** no
   command handler, aggregate, or invariant-enforcing code is touched.
2. **Given** a migrated domain, **When** a maintainer changes a business rule, **Then** no query
   handler needs to change for existing reads to keep working.

---

### User Story 4 - Run tests at the right speed (Priority: P3)

A maintainer wants to run just the fast, pure business-rule tests while iterating, and only run
the slower database/HTTP tests before finishing. Today all tests are mixed together next to the
source files they test. After the migration, tests live in one dedicated tree, split by kind, so
either group can be run on its own.

**Why this priority**: Matters more as the codebase grows — the difference between a 2-second
feedback loop and a 30-second one changes how often a maintainer actually runs tests.

**Independent Test**: Run "only unit tests" and "only integration tests" as two separate commands
and confirm each targets only the intended tests.

**Acceptance Scenarios**:

1. **Given** the reorganized test tree, **When** a maintainer runs the unit-test command, **Then**
   only pure, database-free tests execute.
2. **Given** the reorganized test tree, **When** a maintainer runs the integration-test command,
   **Then** only tests that hit a real (test) database execute.

---

### User Story 5 - Extend the pattern to a new domain without guesswork (Priority: P4)

A maintainer (or a future Claude Code session) needs to build a brand-new domain, or finish
migrating one of the remaining ones, and wants to follow the established pattern exactly by
reading the project's documentation, without reverse-engineering it from an example.

**Why this priority**: This is what prevents the migration from becoming inconsistent
domain-by-domain, and is the explicit ask behind documenting the pattern in CLAUDE.md/constitution.

**Independent Test**: Give the documented conventions (without looking at already-migrated code)
to someone unfamiliar with this codebase and confirm they can correctly predict where a new rule,
command, query, or event should live.

**Acceptance Scenarios**:

1. **Given** the updated CLAUDE.md and constitution, **When** a maintainer starts a new domain,
   **Then** they can determine the four layers' responsibilities and the test-file location without
   opening an already-migrated domain as a reference.

---

### Edge Cases

- What happens to a domain's existing public API contract during and after its migration? It MUST
  behave identically — this is a structural/internal reorganization, not a behavior or contract
  change.
- What happens when a domain event has zero listeners (nothing reacts to it yet)? Publishing it is
  still correct and required wherever a meaningful state transition happens — future listeners are
  expected to attach later without touching the publisher.
- What happens if the process running the app restarts between a domain event being published and
  a listener processing it? For this iteration, delivery is in-process only (see Assumptions) —
  an event that hasn't been processed yet when the process restarts is lost. This is a documented,
  accepted limitation for now, not a defect.
- What happens when one user-facing action needs to change data that today spans more than one
  conceptual aggregate in a single atomic step (e.g. paying a credit statement today also creates a
  bank-account transaction and adjusts a running balance)? See Clarifications — this determines
  whether such an action is modeled as one transaction touching multiple aggregates pragmatically,
  or split into an aggregate-owned step plus event-driven follow-up steps.

## Clarifications

### Session 2026-07-25

- Q: When a state-changing action needs to touch what would conceptually be more than one
  aggregate at once (e.g. paying a statement today also creates a bank transaction and adjusts a
  balance) — should this stay one atomic database transaction spanning multiple aggregates'
  repositories directly (pragmatic), or must each aggregate change be committed on its own with
  cross-aggregate consistency handled through domain events (strict)? → A: Pragmatic — a single
  command handler MAY orchestrate changes across more than one aggregate inside one database
  transaction when the business action is inherently atomic (like paying a statement). Domain
  events are still published for OTHER modules to react to afterward, but are not required as the
  mechanism to keep the directly-involved aggregates consistent with each other.
- Q: Does "separate read model" for CQRS mean a query handler that reshapes/queries the same
  underlying tables into a DTO tailored for its use case (no new storage), or a genuinely separate,
  persisted read-optimized store (e.g. materialized/denormalized projection tables kept in sync by
  domain events)? → A: Light — query handlers query the existing tables directly (via repositories/
  read-only query builders) and return DTOs shaped for their specific use case. No new persisted
  projection/read-store infrastructure is introduced in this iteration; that remains a possible
  future evolution once/if a real read-scaling need appears.
- Q: Should the Command/Query/Event plumbing (buses, handler wiring) be built by hand, or on top
  of the official `@nestjs/cqrs` package? → A: `@nestjs/cqrs` — its `CommandBus`/`QueryBus`/
  `EventBus` already implement the Command and Observer patterns, wire into Nest's DI, and support
  sagas if ever needed, avoiding hand-rolled plumbing repeated across 11 domains.
- Q: Should read-only/trivial domains (e.g. `reference`) get a lighter application of the pattern
  (skip the Command side where there are no writes/invariants), or must all 11 domains apply the
  full four-layer + Command/Query split uniformly, without exceptions? → A: Uniform/strict — every
  domain gets the full split with no exceptions, even where a domain looks trivial today, because
  this project handles personal banking data and consistency of enforcement matters more than
  avoiding boilerplate in the simplest domains.
- Q: Should domain event listeners run synchronously (in-line with the triggering request/
  transaction) by default, or asynchronously (decoupled, after the response is already sent) by
  default? → A: Synchronous by default — a listener that fails is visible/reportable as part of the
  same request instead of silently failing later; a listener may opt into async explicitly only
  when its reaction can genuinely wait (e.g. a future notification).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Each of the 11 existing backend domains (auth, accounts, transactions,
  installments, debts, recurring, savings, investments, import, wallet, reference) MUST be
  reorganized into four internal layers: domain (business rules and invariants), application
  (use-case orchestration: command/query handlers), infrastructure (persistence and external
  integration), and presentation (the HTTP surface/controllers and their DTOs). This applies
  uniformly with NO exceptions for domains that look simple/read-only today (e.g. `reference`) —
  consistency of enforcement takes priority over avoiding boilerplate, since this project handles
  personal banking data (see Clarifications).
- **FR-002**: Business invariants (rules that must always hold for a piece of data, e.g. "a paid
  statement's core fields are frozen") MUST be enforced by aggregate/entity objects in the domain
  layer, and MUST NOT be re-implemented or duplicated in a service, controller, or repository.
- **FR-003**: Every state-changing operation MUST be triggered through an explicit command object
  and handled by exactly one command handler (the **Command** pattern) — the controller's only job
  is to translate the incoming request into a command and hand it to its handler. Every read
  operation MUST go through a separate query and query handler, returning a DTO shaped for that
  specific read — reads MUST NOT be served by reusing a command handler or reaching directly into a
  write-side aggregate.
- **FR-004**: Every state transition meaningful to the rest of the system MUST publish a domain
  event describing what happened (e.g. `StatementClosed`, `StatementPaid`, `AccountDeactivated`),
  following the **Observer** pattern: publishers never enumerate or know their subscribers.
  Other parts of the system MUST be able to subscribe to that event without the module that
  publishes it depending on, importing, or knowing about the subscriber.
- **FR-005**: Where an aggregate has a meaningful lifecycle with different valid operations per
  stage (e.g. a credit statement: OPEN → PENDING → PAID, each stage allowing different actions),
  that lifecycle MUST be modeled with the **State** pattern — one object per state owning which
  transitions/operations are valid from it — rather than scattered `if`/`switch` checks on a status
  field throughout the codebase.
- **FR-006**: Where a decision varies by a discrete category and is likely to grow more categories
  over time (e.g. "is this account eligible to close its billing period" varying by account/card
  configuration), it MUST be modeled with the **Strategy** pattern — one interchangeable,
  independently testable strategy per category — instead of an `if`/`else` chain embedded in a
  service method.
- **FR-007**: Command handlers (and query handlers, where they share the same shape) MUST share a
  common **Template Method**: a base class or shared function defining the fixed skeleton (load →
  validate/authorize → execute → persist → publish events) with the domain-specific step supplied
  by each concrete handler, instead of every handler re-implementing that skeleton from scratch —
  built on top of `@nestjs/cqrs`'s `ICommandHandler`/`IQueryHandler` (see Clarifications) rather
  than a hand-rolled bus.
- **FR-008**: The **Builder** pattern (for assembling complex aggregates/inputs with several
  optional parts, e.g. creating an account with inline cards) and the **Factory Method** pattern
  (for reconstructing an aggregate from a persisted row inside a repository adapter) are RECOMMENDED
  wherever they clarify construction logic, but are NOT mandatory for every domain — apply them
  where a domain's construction logic is actually complex enough to benefit.
- **FR-009**: Singleton, Abstract Factory, and Prototype are explicitly OUT of scope as
  hand-implemented patterns: NestJS providers are already singletons via its own DI container
  (re-implementing Singleton would fight the framework), and this codebase has no family of
  interchangeable infrastructure implementations (Abstract Factory) or expensive-to-construct
  objects that need cloning (Prototype) to justify introducing them.
- **FR-010**: Every route parameter (e.g. an `:id` in a URL path), not just the request body/query,
  MUST be validated through a Zod schema before reaching a command/query — closing the current gap
  where path params are plain unvalidated strings, and making input validation uniform across the
  entire presentation layer.
- **FR-011**: Every repository port's concrete implementation MUST follow the **Adapter** pattern —
  the domain layer only ever depends on the port (its own interface); the infrastructure-layer
  class adapts the actual persistence technology (Prisma) to that interface, so swapping or
  wrapping the underlying technology never requires a domain-layer change.
- **FR-012**: A domain's controller (presentation layer) MUST act as a **Facade** over its
  application layer: it translates an HTTP request into a command/query, invokes the corresponding
  handler, and translates the result back into an HTTP response — it MUST NOT contain business
  logic, and MUST NOT be where a caller needs to know how a command/query/handler is assembled.
- **FR-013**: Cross-cutting concerns that wrap a command/query handler's execution (e.g. logging,
  timing, wrapping in a transaction) MUST be applied via the **Decorator** pattern — using NestJS's
  own interceptor/decorator mechanism rather than re-implementing decoration by hand — so a
  handler's own code never contains concerns unrelated to its specific business operation.
- **FR-014**: Proxy and Composite are explicitly OUT of scope as hand-implemented patterns: access
  control before a handler runs is already served by NestJS Guards (`JwtAuthGuard`), which fill the
  Proxy role, and this codebase has no recursive/tree-shaped data (accounts, cards, and statements
  are all flat, non-nested) to justify a Composite.
- **FR-015**: All existing public API endpoints and their request/response contracts
  (`@finance/contracts`) MUST continue to behave identically for API consumers after each domain's
  migration — this is an internal reorganization, not a breaking change.
- **FR-016**: Automated tests MUST be relocated out of `src/` into a dedicated top-level directory
  (`apps/api/test/`) that mirrors the `src/` structure, split by kind: unit (pure, no I/O),
  integration (real test database), and end-to-end (through the HTTP layer).
- **FR-017**: The migration MUST proceed one domain at a time, each domain's migration
  independently completable, independently verifiable, and shippable without depending on any
  other domain having been migrated yet.
- **FR-018**: The chosen architecture pattern, its four layers, its conventions (where a rule
  lives, where a command/query/event lives, where its test lives) MUST be documented in the
  project's living memory (`CLAUDE.md` and `.specify/memory/constitution.md`) AND in the
  authoritative architecture reference (`docs/english/ARCHITECTURE.md` + `docs/spanish/
  ARCHITECTURE.md`, kept in parity) clearly enough that a new domain can be built correctly by
  following the documentation alone, without cross-referencing already-migrated code.
- **FR-019**: Domain events MUST be delivered in-process (no new distributed messaging
  infrastructure) for this iteration, and MUST be dispatched to their listeners synchronously by
  default (in-line with the triggering request), so a failing listener is surfaced as part of that
  same request rather than silently swallowed — async dispatch is opt-in per listener, only for
  reactions that can genuinely be deferred. A real message-broker-backed event bus is explicitly
  out of scope for this feature and is tracked as a future consideration (see Assumptions).
- **FR-020**: When a single business action inherently spans more than one aggregate (see
  Clarifications), it MUST remain atomic (one database transaction) rather than being forced into
  strict single-aggregate-per-transaction purity that would risk partial/inconsistent state.

### Key Entities

- **Aggregate**: The authoritative, invariant-protecting object for one conceptual piece of
  business data within a domain (e.g. a credit statement, a debt). All state changes to it go
  through its own methods; nothing else is allowed to mutate its state directly.
- **Domain Event**: An immutable record that something meaningful already happened (e.g.
  `StatementPaid`), published by the aggregate/command handling the change, consumed by zero or
  more independent listeners elsewhere in the system.
- **Command / Command Handler**: A command is a request to change something; its handler is the
  one place that loads the relevant aggregate(s), applies the change, persists the result, and
  publishes resulting domain events.
- **Query / Query Handler**: A query is a request to read something; its handler reads directly
  (via a repository/read path) and returns a DTO shaped for that read — it never mutates state.
- **Repository (port + adapter)**: A repository port is the domain-facing interface an aggregate/
  handler depends on to load and save data; the adapter is its concrete implementation against the
  actual database, kept in the infrastructure layer so the domain layer never depends on it
  directly.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of existing API endpoints continue to pass their existing behavioral tests,
  unmodified, after each domain's migration completes.
- **SC-002**: For every migrated domain, its business-rule (aggregate) unit tests run with zero
  database connections and zero HTTP server involvement.
- **SC-003**: A new reaction to an existing domain event can be added by creating exactly one new
  listener file, with zero modifications to the file that publishes the event.
- **SC-004**: All 11 domains are migrated to the new structure, each one individually verified
  (tests passing, contracts unchanged) before the next domain's migration begins.
- **SC-004a**: `docs/{english,spanish}/ARCHITECTURE.md`, `CLAUDE.md`, and the constitution describe
  the exact same four-layer pattern with no contradictions between them, verifiable by cross-
  reading all three.
- **SC-005**: The test suite can be run as three independent, separately-invokable groups (unit /
  integration / e2e), each completing without requiring the others.
- **SC-006**: Every aggregate with a multi-stage lifecycle has its valid/invalid transitions
  enforced by dedicated per-state logic (State pattern), not by scattered conditionals — verifiable
  by grepping for the status field outside that logic and finding no duplicated rule checks.
- **SC-007**: 100% of route path parameters across migrated domains are parsed/validated by a Zod
  schema before use, matching the existing coverage already achieved for request bodies and query
  strings.
- **SC-008**: Every migrated domain's controller methods are limited to request/response
  translation — verifiable by confirming no controller method contains a conditional business rule
  or a direct database call.

## Assumptions

- The migration is purely an internal code-organization and business-logic-enforcement change — it
  does not change the Prisma data model or the `@finance/contracts` request/response shapes.
  Schema/contract changes, if any turn out to be needed for a specific domain, are out of scope
  for this feature and would be handled as their own follow-up.
- Domain events are delivered in-process only for this iteration (see FR-019). A real
  message-broker-backed event bus (e.g. Redis-backed queue) is a deliberate future consideration,
  to be tracked in `docs/PENDING.md`, not built now.
- "Separate read model" means query handlers reading the existing tables and shaping their own
  DTOs — not a new persisted/denormalized projection store (see Clarifications).
- The order in which the 11 domains are migrated is a planning-phase decision, not fixed by this
  spec; `accounts`/billing is expected to be an early candidate since its business rules (statement
  lifecycle, eligibility, payment) are already the most developed in this codebase.
- `apps/web` and the shared `packages/` are unaffected by this feature — it is scoped entirely to
  `apps/api`.
- Narrative business-rule docs that reference specific files (e.g. `docs/{english,spanish}/
  BANKING_LOGIC.md`, which currently cites exact service/repository file paths for the accounts/
  billing domain) MUST have their file/path references updated to point at the new aggregate/
  handler locations wherever that domain is migrated — the business rules they describe don't
  change, only where the code enforcing them lives.
