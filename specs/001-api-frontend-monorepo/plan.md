# Implementation Plan: API/Frontend Monorepo Architecture

**Branch**: `001-api-frontend-monorepo` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-api-frontend-monorepo/spec.md`

## Summary

Restructure FinanceApp from a single fullstack Next.js app into a **pnpm + Turborepo monorepo**
with two **separately deployable** apps — a **NestJS** backend API (domain-first modules, sole
DB owner) and a **Vite + React SPA** frontend (domain-first features, consumes the API over HTTP
only) — plus **shared packages** for contracts/types, validation, and money utilities under a
strict one-way dependency rule. Auth is a backend domain issuing **JWT access+refresh tokens in
httpOnly cookies**; the frontend owns es/en translations and the API returns only data +
language-agnostic error codes. This cycle delivers the **blueprint + one-shot migration roadmap**
(on a dedicated branch, `main` stays deployable). No production code is moved yet.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (both apps).

**Primary Dependencies**:

- Backend: **NestJS 10**, **Prisma 6** (owns DB access), **zod** (validation, shared), `decimal.js`,
  `bcryptjs`, JWT (`@nestjs/jwt` / `jose`).
- Frontend: **Vite 5**, **React 18**, **react-router** (routing), a data-fetching layer
  (**TanStack Query**), **react-i18next** or equivalent (es/en catalogs), `decimal.js` (display).
- Shared: **zod** schemas + inferred TS types, money utilities.

**Storage**: PostgreSQL via Prisma — accessed **only** by the backend.

**Testing**: **Vitest** as the single runner across apps and packages (closes the constitution's
`TODO(TEST_RUNNER)` gap). Backend: unit + e2e (NestJS testing module / supertest). Frontend:
component + integration (Vitest + Testing Library). Shared: unit (money/validation).

**Target Platform**: Backend = Node server (container/Vercel/Render). Frontend = static SPA bundle
served by any CDN/static host, configured with an API base URL.

**Project Type**: Web monorepo — `apps/api` (backend) + `apps/web` (frontend) + `packages/*`.

**Performance Goals**: Architecture-level — each app builds independently; Turborepo task caching;
CI builds only affected app. No new runtime perf targets introduced this cycle.

**Constraints**: One-way deps (apps → packages; packages → nothing; api ↛ web). Frontend never
imports backend internals and never touches the DB. API returns no localized prose.

**Scale/Scope**: 8 initial business domains (transactions, debts, savings, installments,
investments, accounts, import, auth). New domains follow one repeatable per-domain skeleton.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                   | Impact of this plan                                                                                       | Verdict                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------- |
| I. Money Precision          | `decimal.js`/`Prisma.Decimal` retained; money utils centralized in `packages/money` (one source of truth) | ✅ Strengthened                   |
| II. Per-User Data Isolation | Backend owns all DB access; every endpoint scoped by authenticated `userId`; frontend has no DB path      | ✅ Strengthened                   |
| III. i18n Parity            | Frontend owns es/en catalogs with identical keys; API returns codes only                                  | ✅ Preserved                      |
| IV. Test-First / TDD        | Vitest adopted as runner — **closes the `TODO(TEST_RUNNER)` gap**; tests precede domain migration         | ✅ Resolves known gap             |
| V. SDD & Living Memory      | This plan is the SDD artifact; constitution + CLAUDE.md amended at approval                               | ⚠ Amendment required (see below) |

**Amendment required (Principle V / Governance):** the constitution currently pins a "single
fullstack Next.js" stack. Approving this plan amends the **Technology & Operational Constraints**
to the NestJS + Vite/React monorepo. This MUST be applied to `.specify/memory/constitution.md`
(version bump) and `CLAUDE.md` in the same session — performed at the plan-approval gate. No
unjustified violations; recorded in Complexity Tracking below.

## Project Structure

### Documentation (this feature)

```text
specs/001-api-frontend-monorepo/
├── plan.md              # This file
├── research.md          # Phase 0: decisions + rationale
├── data-model.md        # Phase 1: domain entities (backend-owned)
├── quickstart.md        # Phase 1: run each app independently + validation
├── contracts/           # Phase 1: API contract conventions + per-domain endpoints
│   └── api-conventions.md
├── checklists/
│   └── requirements.md  # spec quality checklist
└── tasks.md             # Phase 2 (/speckit-tasks) — not created here
```

### Source Code (target monorepo layout)

```text
finance-app/                      # repo root
├── pnpm-workspace.yaml           # workspaces: apps/*, packages/*
├── turbo.json                    # task pipeline (build, dev, test, lint, typecheck)
├── package.json                  # root scripts delegate to turbo
│
├── apps/
│   ├── api/                      # NestJS backend — sole DB owner
│   │   ├── src/
│   │   │   ├── main.ts           # bootstrap (Nest app, cookies, CORS, validation pipe)
│   │   │   ├── app.module.ts     # wires domain modules + infra
│   │   │   ├── domains/          # DOMAIN-FIRST (one folder per business domain)
│   │   │   │   ├── transactions/
│   │   │   │   │   ├── transactions.module.ts
│   │   │   │   │   ├── transactions.controller.ts   # HTTP routes
│   │   │   │   │   ├── transactions.service.ts      # business logic
│   │   │   │   │   ├── transactions.repository.ts   # Prisma access (this domain only)
│   │   │   │   │   ├── dto/                          # request/response DTOs (zod from shared)
│   │   │   │   │   └── transactions.spec.ts          # unit/e2e tests
│   │   │   │   ├── debts/         # …same skeleton
│   │   │   │   ├── savings/
│   │   │   │   ├── installments/
│   │   │   │   ├── investments/
│   │   │   │   ├── accounts/
│   │   │   │   ├── import/        # Excel parsing stays server-side
│   │   │   │   └── auth/          # credential issue/validate, JWT, refresh, guards
│   │   │   ├── infra/             # cross-cutting (NOT a domain)
│   │   │   │   ├── prisma/        # PrismaService (the single DB client)
│   │   │   │   ├── auth/          # JWT strategy, guards, current-user decorator
│   │   │   │   ├── config/        # env loading/validation
│   │   │   │   └── http/          # error filter → language-agnostic error codes
│   │   │   └── common/            # shared Nest utils (pipes, interceptors)
│   │   ├── prisma/                # schema.prisma + migrations + seed (DB lives with the API)
│   │   ├── test/                  # e2e bootstrap
│   │   └── package.json
│   │
│   └── web/                      # Vite + React SPA — consumes API over HTTP only
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/              # router, providers (Query, i18n, auth context), layout
│       │   ├── domains/          # DOMAIN-FIRST (mirror of business domains)
│       │   │   ├── transactions/
│       │   │   │   ├── api/       # typed client calls (uses shared contracts)
│       │   │   │   ├── components/
│       │   │   │   ├── hooks/
│       │   │   │   ├── routes/    # screens/pages for this domain
│       │   │   │   └── transactions.test.tsx
│       │   │   ├── debts/  savings/  installments/  investments/  accounts/  import/  auth/
│       │   ├── shared/           # UI primitives (button, sheet…), lib (api client, cn)
│       │   ├── i18n/             # es/en catalogs (FRONTEND owns translations)
│       │   └── styles/
│       ├── index.html
│       ├── vite.config.ts        # API base URL via env (VITE_API_URL)
│       └── package.json
│
└── packages/                     # shared, one-way deps (apps → packages → nothing)
    ├── contracts/                # zod schemas + inferred TS types = the API contract
    │   └── src/<domain>/         # one module per domain (request/response/error codes)
    ├── money/                    # decimal.js money utilities (single source of truth)
    ├── validation/              # shared zod helpers/refinements (if separate from contracts)
    └── tsconfig/ or config/      # shared TS/eslint config
```

**Structure Decision**: **Option 2 (web application) extended to a monorepo.** `apps/api`
(NestJS) and `apps/web` (Vite/React) are the two separately deployable units; `packages/*` hold
shared contracts/money. Within each app, the **top level under `src/` is `domains/`** (domain-first),
each domain following one repeatable skeleton; cross-cutting code sits in `infra/`+`common/`
(backend) and `shared/`+`app/` (frontend). The Prisma schema/migrations live with `apps/api`,
making the backend + `packages/*` a self-contained subset (trivial future extraction, FR-011/FR-007/SC-007).

## Complexity Tracking

> The plan adds structure that the constitution's "simplicity" expectation requires us to justify.

| Decision                                | Why Needed                                                                            | Simpler Alternative Rejected Because                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Monorepo (3+ packages) vs single app    | Independent build/deploy + clean boundary + future repo extraction (FR-001/002/011)   | Single Next app is the current coupling the spec exists to remove                    |
| NestJS (opinionated) vs minimal Express | Modules map 1:1 to domains; DI + testability serve scalability/maintainability goals  | Express/Fastify push domain structure + wiring to hand-rolled conventions that drift |
| Repository layer per domain             | Keeps Principle II (per-user scoping) and DB access auditable in one place per domain | Direct Prisma in controllers scatters isolation logic and weakens testability        |
| Backend JWT (access+refresh, httpOnly)  | Stateless auth fits a separately deployed API; httpOnly mitigates token theft         | Coupled NextAuth keeps auth in the frontend, contradicting the separation goal       |
