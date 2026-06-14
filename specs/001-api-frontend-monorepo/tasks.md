# Tasks: API/Frontend Monorepo Architecture

**Feature**: specs/001-api-frontend-monorepo | **Plan**: [plan.md](./plan.md)

This is the **one-shot migration roadmap** to the ratified target architecture. Tasks are NOT
executed in this SDD cycle — they run later via `/speckit-implement` on a **dedicated branch**
(`main` stays deployable until done-state passes). TDD is mandated (Principle IV) → test tasks
precede implementation. `[P]` = parallelizable (different files, no incomplete deps).

**Conventions**: backend `apps/api`, frontend `apps/web`, shared `packages/*`. The 8 domains are:
transactions, debts, savings, installments, investments, accounts, import, auth.

---

## Phase 1: Setup (monorepo scaffold)

- [x] T001 Create `pnpm-workspace.yaml` declaring `apps/*` and `packages/*` at repo root
- [x] T002 Create root `turbo.json` with `build`, `dev`, `test`, `lint`, `typecheck` pipelines
- [x] T003 Rewrite root `package.json` so scripts delegate to Turborepo; pin Node 20 in `.nvmrc`/`engines`
- [x] T004 [P] Add `packages/config` (shared `tsconfig.base.json`, ESLint, Prettier)
- [x] T005 [P] Add root Vitest config + `pnpm test` wiring across workspaces (closes TODO(TEST_RUNNER))
- [x] T006 [P] Add `.editorconfig` and update root `.gitignore` for `apps/*/dist`, `apps/web/.vite`, turbo cache

## Phase 2: Foundational (blocking prerequisites for all stories)

- [x] T007 [P] Scaffold `packages/money` (decimal.js helpers) with a failing unit test first, then impl in `packages/money/src/index.ts`
- [x] T008 [P] Scaffold `packages/contracts` skeleton (`packages/contracts/src/index.ts`) for zod schemas + inferred types
- [x] T009 Move Prisma into the backend: relocate `schema.prisma`, `migrations/`, `seed.ts` to `apps/api/prisma/`; verify `prisma generate`
- [x] T010 Scaffold NestJS app in `apps/api/src` (`main.ts`, `app.module.ts`) with global validation pipe + cookie parser + CORS(credentials)
- [x] T011 [P] Add `apps/api/src/infra/prisma/prisma.service.ts` (single PrismaClient) + module
- [x] T012 [P] Add `apps/api/src/infra/config` (env loading/validation: DB, JWT secrets, CORS origin)
- [x] T013 [P] Add `apps/api/src/infra/http` error filter mapping errors → `{ error: { code, field, details } }` (language-agnostic)
- [x] T014 Scaffold Vite+React app in `apps/web/src` (`main.tsx`, `app/` providers: Router, TanStack Query, i18n, auth context)
- [x] T015 [P] Add `apps/web/src/shared/lib/apiClient.ts` (fetch wrapper using `VITE_API_URL`, credentials, error-code parsing)
- [x] T016 [P] Add `apps/web/src/i18n` with es/en catalogs + key-parity check (frontend owns translations)

**Checkpoint**: both apps boot empty; shared packages importable; DB owned by api.

## Phase 3: User Story 1 — Separately runnable & deployable (P1) 🎯 MVP

**Goal**: each app builds, runs, and deploys independently, communicating over HTTP only.
**Independent test**: start api alone → `GET /api/v1/health` 200; build web alone → static bundle hits api via base URL.

- [x] T017 [US1] Add `apps/api` health module: `GET /api/v1/health` returns 200 in `apps/api/src/domains/health` (or infra)
- [x] T018 [P] [US1] Backend dev/build/start scripts in `apps/api/package.json`; runs with web stopped
- [x] T019 [P] [US1] Frontend dev/build scripts in `apps/web/package.json`; static build output configurable by `VITE_API_URL`
- [x] T020 [P] [US1] Write Vitest e2e for health endpoint in `apps/api/test/health.e2e.spec.ts`
- [x] T021 [P] [US1] Add per-app deploy config (api: Dockerfile/Procfile; web: static host config)
- [x] T022 [US1] CI: build/test only the affected app via `turbo run ... --filter=...[origin/main]`

**Checkpoint**: SC-001, SC-002, SC-006 demonstrable. MVP delivered.

## Phase 4: User Story 2 — Domain-first discoverability (P1)

**Goal**: every business domain's code is co-located on both apps following one repeatable skeleton.
**Independent test**: open any domain folder → routes+service+repository+dto (api) / api+components+hooks+routes (web) all present.

- [x] T023 [US2] Define and document the per-domain skeleton (backend + frontend) in `apps/api/README.md` and `apps/web/README.md`
- [x] T024 [P] [US2] Define zod request/response/error-code schemas per domain in `packages/contracts/src/<domain>/`
- [x] T025 [US2] **auth** domain — backend: `apps/api/src/domains/auth` (register/login/refresh/logout/me; JWT httpOnly cookies; guard + current-user decorator); tests first
- [x] T026 [P] [US2] **accounts** domain — backend module (controller/service/repository/dto) in `apps/api/src/domains/accounts` + e2e test
- [x] T027 [P] [US2] **transactions** domain — backend module + e2e test (filters: date/account/type)
- [x] T028 [P] [US2] **installments** domain — backend module + pay-payment endpoint + e2e test
- [x] T029 [P] [US2] **debts** domain — backend module + settle endpoint + e2e test
- [x] T030 [P] [US2] **savings** domain — backend module (goals + entries) + e2e test
- [x] T031 [P] [US2] **investments** domain — backend module + ETF quote endpoint (Alpha Vantage + EtfPriceCache 24h) + e2e test
- [x] T032 [P] [US2] **import** domain — backend module: `POST /import/transactions` (server-side Excel parse via xlsx) + test
- [x] T033 [US2] **auth** domain — frontend: `apps/web/src/domains/auth` (login/register UI, session/auth context, refresh handling)
- [x] T034 [P] [US2] **accounts** domain — frontend (api/components/hooks/routes) in `apps/web/src/domains/accounts` + component test
- [x] T035 [P] [US2] **transactions** domain — frontend feature + component test
- [x] T036 [P] [US2] **installments** domain — frontend feature + component test
- [x] T037 [P] [US2] **debts** domain — frontend feature + component test
- [x] T038 [P] [US2] **savings** domain — frontend feature + component test
- [x] T039 [P] [US2] **investments** domain — frontend feature + component test
- [x] T040 [P] [US2] **import** domain — frontend upload/mapping UI + component test
- [x] T041 [US2] Wire frontend dashboard/layout + domain routes in `apps/web/src/app`

**Checkpoint**: SC-003, SC-008 demonstrable; all domains migrated end-to-end.

## Phase 5: User Story 3 — Safe shared boundary (P2)

**Goal**: shared code has one source of truth; frontend cannot import backend internals or touch the DB.

- [x] T042 [US3] Add ESLint boundary rules forbidding `apps/web` → `apps/api/**` and any Prisma/DB client import
- [x] T043 [P] [US3] Enforce `packages/*` declare no dependency on `apps/*` (lint/CI check)
- [x] T044 [P] [US3] Verify money values cross the boundary as strings, parsed via `packages/money` on both sides (add test)
- [x] T045 [US3] Add CI check failing on duplicated/divergent contract definitions (single source in `packages/contracts`)

**Checkpoint**: SC-004, SC-005 demonstrable.

## Phase 6: User Story 4 — Trivial future extraction (P3)

**Goal**: backend + shared packages form a self-contained subset.

- [x] T046 [US4] Add dependency-graph check (CI) proving `apps/api` imports no `apps/web` code
- [x] T047 [P] [US4] Document the extraction procedure (api + required packages) in `apps/api/README.md`

**Checkpoint**: SC-007 demonstrable.

## Phase 7: Polish & cross-cutting (migration done-state)

- [x] T048 [P] Port `lib/finance/*` logic (installments, interest, etf) into backend services + `packages/money`, with unit tests
- [x] T049 [P] Achieve test coverage on all `lib/finance` money rules (Principle I/IV)
- [x] T050 Remove the legacy single-app Next.js code (`app/`, root `auth.ts`, etc.) once parity verified
- [x] T051 Update root `README.md` + `CLAUDE.md` to the monorepo reality (memory sync)
- [ ] T052 Validate full done-state against quickstart.md scenarios 1–8; then merge the branch into `main`

---

## Dependencies & order

- **Setup (P1 phase)** → **Foundational (P2 phase)** → user stories.
- **US1 (P1)** is the MVP and unblocks deploy/runnability; can start right after Foundational.
- **US2 (P1)** depends on Foundational (contracts, prisma, app skeletons). Auth (T025/T033) should land first as other domains assume an authenticated user.
- **US3 (P2)** depends on US2 existing (boundaries enforced on real code).
- **US4 (P3)** depends on US3.
- **Polish** last; T050 (delete legacy) only after parity; T052 gates the merge.

## Parallel opportunities

- Phase 1: T004, T005, T006 in parallel.
- Phase 2: T007, T008, T011, T012, T013, T015, T016 in parallel (distinct files).
- US2: all `[P]` domain tasks (T026–T032 backend, T034–T040 frontend) run in parallel once their contract (T024) and auth (T025/T033) exist.

## Implementation strategy

MVP = Phase 1 + 2 + **US1** (separately runnable/deployable shell). Then incrementally migrate
domains (US2) starting with auth, enforce boundaries (US3), prove extraction (US4), and finish
with polish + legacy removal + done-state validation before merging to `main`.

**Totals**: 52 tasks — Setup 6, Foundational 10, US1 6, US2 19, US3 4, US4 2, Polish 5.
