<!--
Sync Impact Report
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
Until one exists, this principle is the mandated standard but is **not yet satisfied** —
see `TODO(TEST_RUNNER)` in the Sync Impact Report. Setting up a test runner is a required
task of the next feature cycle.

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

- **Stack (pinned):** Next.js 14 (App Router) + React 18; Prisma 6 / PostgreSQL; NextAuth v5
  (JWT sessions) with email+password (bcrypt) and optional Google OAuth; next-intl (es/en);
  Tailwind CSS + Radix UI. Package manager is **pnpm**.
- **Commands:** dev runs `next dev --turbo`; database via `prisma migrate` / `prisma db seed`
  (`pnpm run db:*`). See `CLAUDE.md` for the full command list.
- **Environment:** configured per `.env.example` — `DATABASE_URL`, `NEXTAUTH_URL`,
  `NEXTAUTH_SECRET`, optional `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `ALPHA_VANTAGE_API_KEY`.
  Secrets MUST NOT be committed; `.env` stays out of version control.
- **Major stack changes** (framework, ORM, auth strategy, package manager) are governance
  amendments and require a version bump here plus a `CLAUDE.md` update.

## Development Workflow & Quality Gates

- **SDD review gates:** the spec is reviewed and approved before planning; the plan is
  reviewed and approved before tasks; `/speckit-analyze` runs and its findings are resolved
  before `/speckit-implement`.
- **Definition of done:** `pnpm exec tsc --noEmit` (typecheck) and `pnpm run lint` MUST pass;
  for changes touching `lib/finance/**`, the relevant tests pass (once the runner exists).
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

**Version**: 1.0.0 | **Ratified**: 2026-06-14 | **Last Amended**: 2026-06-14
