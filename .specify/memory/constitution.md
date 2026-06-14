<!--
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

Current-state note (MUST be closed): the repository has **no test runner configured yet**.
**Vitest** is the chosen runner (ratified with specs/001); until it is set up during the
monorepo migration, this principle is the mandated standard but is **not yet satisfied** — see
`TODO(TEST_RUNNER)` in the Sync Impact Report.

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

## Technology & Operational Constraints

- **Target architecture (ratified — specs/001):** a **pnpm + Turborepo monorepo** with two
  separately deployable apps and shared packages:
  - `apps/api` — **NestJS** backend, **Prisma 6 / PostgreSQL** (sole DB owner), domain-first
    modules; auth issues **JWT access+refresh tokens in httpOnly cookies**.
  - `apps/web` — **Vite + React 18 SPA**, domain-first features, consumes the API over HTTP only;
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
- **Migration status:** the monorepo above was implemented on branch `001-api-frontend-monorepo`
  (legacy Next.js app removed there). `main` holds the legacy app until that branch is merged; bump
  this constitution to drop the migration note once the merge lands.
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

**Version**: 1.2.0 | **Ratified**: 2026-06-14 | **Last Amended**: 2026-06-14
