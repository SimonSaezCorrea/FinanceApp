# Feature Specification: API/Frontend Monorepo Architecture

**Feature Branch**: `001-api-frontend-monorepo`

**Created**: 2026-06-14

**Status**: Draft

**Input**: User description: "Establish the correct architecture for FinanceApp: separate the Node.js backend API and the React frontend into a monorepo with a domain-driven folder distribution that maximizes maintainability, scalability, and discoverability. The API must run independently from the frontend even though both live in one repo."

## Overview

This is an **architecture-definition** effort, not a user-facing feature. The "users" are
the **developers/maintainers** of FinanceApp. The deliverable is a **target architecture
blueprint** plus a **phased migration roadmap** — no production code is moved or rewritten in
this cycle.

Today FinanceApp is a single fullstack Next.js application where API logic, data access, and
UI live together. As the finance domain grows (transactions, debts, savings, installments,
investments, accounts, import, auth), this coupling degrades navigation, isolated testing,
independent scaling, and clear ownership of business logic. The target is a **monorepo** that
cleanly separates a **Node.js backend API** from a **React frontend**, each independently
buildable, testable, and deployable, communicating only over a published HTTP API contract.

## Clarifications

### Session 2026-06-14

- Q: With API and frontend separated, who owns translations and does the API return localized text? → A: The frontend owns all UI translations (es/en); the API returns data plus stable, language-agnostic error codes/keys and never localized prose.
- Q: How is `auth` treated in the new structure? → A: Auth is a backend domain module (issues/validates credentials over HTTP) plus a frontend auth domain (login/session UI); the concrete cross-boundary mechanism (JWT/session) is decided in planning.
- Q: For the one-shot restructure, how is deployability protected during the change? → A: The restructure happens on a dedicated branch; `main` stays deployable until the new structure passes its done-state, then it is merged. Rollback = remain on `main`.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Separately runnable & deployable apps (Priority: P1)

A developer can build, run, and deploy the backend API and the React frontend independently.
Starting one does not require the other; each has its own dev startup, build output, and CI
pipeline. They communicate only over HTTP.

**Why this priority**: This is the core of the request — decoupling so the two halves can
evolve and scale on their own. Without it, nothing else matters.

**Independent Test**: From a clean checkout, start the backend alone and confirm it serves its
HTTP API (health check + at least one domain endpoint) with the frontend not running; then
build the frontend alone and confirm it produces a deployable artifact that targets the API by
configured base URL only.

**Acceptance Scenarios**:

1. **Given** the monorepo, **When** a developer runs the backend dev command only, **Then** the
   API starts and responds to requests without the frontend present.
2. **Given** the monorepo, **When** a developer runs the frontend dev command only, **Then** the
   UI starts and reaches the backend via a configurable API base URL (no in-process coupling).
3. **Given** CI, **When** only backend files change, **Then** the backend can be built/tested/
   deployed without rebuilding the frontend (and vice versa).

---

### User Story 2 - Domain-first discoverability (Priority: P1)

A developer looking for everything about a business domain (e.g. "debts") finds that domain's
code co-located, on both backend and frontend, organized by business domain rather than by
technical layer at the top level.

**Why this priority**: "Maintainability, scalability, and discoverability" is the stated goal.
Domain-first layout is how a developer navigates a growing finance app without a map.

**Independent Test**: Pick any domain (e.g. `savings`) and confirm its API endpoints, business
logic, data access, validation, and the frontend screens/components that consume it are each
locatable within that domain's folder on their respective side, not scattered across global
layer folders.

**Acceptance Scenarios**:

1. **Given** the target structure, **When** a developer opens the backend's `debts` domain
   folder, **Then** they find that domain's routes, business logic, and data access together.
2. **Given** the target structure, **When** a new domain is added, **Then** it follows a single
   documented, repeatable layout (the same skeleton every domain uses).

---

### User Story 3 - Safe shared boundary (Priority: P2)

Cross-cutting code that both sides legitimately reuse (types/DTOs, validation schemas, money
utilities, shared constants) lives in a shared location, while backend internals (data access,
secrets, server-only logic) never leak into the frontend bundle.

**Why this priority**: Sharing reduces drift (one source of truth for contracts and money
rules) but must not become a backdoor that recouples the two apps or ships server code to the
browser.

**Independent Test**: Confirm a shared contract/type is imported by both apps from one place;
confirm the frontend cannot import backend-internal modules (data access, server config) — such
an import is rejected by tooling or convention.

**Acceptance Scenarios**:

1. **Given** a shared contract type, **When** the API response shape changes, **Then** both apps
   reference the single shared definition (no duplicated, drifting copies).
2. **Given** the frontend code, **When** it attempts to import a backend-internal module, **Then**
   the boundary rule flags/prevents it.

---

### User Story 4 - Trivial future extraction (Priority: P3)

The boundaries are clean enough that extracting the backend API into its own repository later is
a low-risk, mostly-mechanical move.

**Why this priority**: Future-proofing requested by the user; valuable but not required for the
immediate restructure to deliver value.

**Independent Test**: Trace the backend's dependencies and confirm it depends only on shared
packages (not on frontend code), so the backend + shared packages form a self-contained subset.

**Acceptance Scenarios**:

1. **Given** the dependency graph, **When** inspected, **Then** the backend never imports
   frontend code, and shared packages never import either app.

---

### Edge Cases

- **Database ownership**: only the backend accesses the database; the frontend has no direct DB
  access under any path.
- **Auth across the boundary**: auth is a backend domain module (issues/validates credentials
  over HTTP) plus a frontend auth domain (login/session UI); the concrete cross-boundary
  mechanism (JWT/session) is decided in planning.
- **Shared money rules**: monetary precision logic used by both sides must have a single source
  of truth to avoid divergent rounding.
- **i18n ownership**: the frontend owns all UI translation catalogs (es/en); the API returns
  data plus stable, language-agnostic error codes/keys and never localized prose, so es/en
  parity stays in one place.
- **Big-bang restructure risk**: the one-shot full restructure must define a verifiable
  "done" state and a rollback point, since the app is non-functional mid-move.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The architecture MUST define a monorepo containing a Node.js backend app and a
  React frontend app as distinct, separately buildable units.
- **FR-002**: The backend MUST be runnable and deployable WITHOUT the frontend present, and the
  frontend MUST be buildable and deployable WITHOUT the backend present.
- **FR-003**: The frontend MUST communicate with the backend ONLY through a published HTTP API
  contract; no shared in-process calls and no direct database access from the frontend.
- **FR-004**: Backend and frontend code MUST be organized **by business domain** at the top
  level of each app (transactions, debts, savings, installments, investments, accounts, import,
  auth), with a single documented, repeatable per-domain skeleton.
- **FR-005**: The architecture MUST define a shared layer for code reused by both apps
  (contracts/types, validation schemas, money utilities, shared constants) with one source of
  truth per shared concern.
- **FR-006**: The architecture MUST forbid the frontend from importing backend-internal modules
  (data access, server configuration, secrets) and define how that boundary is enforced.
- **FR-007**: The architecture MUST preserve the project's non-negotiables: monetary precision,
  per-user data isolation, i18n parity (es/en), and the path toward Test-First.
- **FR-007a**: The frontend MUST own all UI translation catalogs (es/en). The API MUST return
  only data and stable, language-agnostic error codes/keys — never localized prose.
- **FR-007b**: `auth` MUST be modeled as a backend domain module (credential issuing/validation
  over HTTP) and a frontend auth domain (login/session UI); the cross-boundary mechanism is
  determined in planning.
- **FR-008**: The blueprint MUST specify the complete target folder/file domain map, module
  boundaries, naming conventions, and discoverability conventions (where each kind of thing
  lives and how it's named).
- **FR-009**: The blueprint MUST define API↔frontend contract conventions (how endpoints,
  request/response shapes, and errors are described and shared).
- **FR-010**: The effort MUST produce a **phased migration roadmap** to move the current
  single-app codebase to the target structure via a **one-shot full restructure**, including a
  defined "done" state and a rollback point. The restructure MUST be performed on a dedicated
  branch so that `main` remains deployable until the new structure passes its done-state and is
  merged; rollback is defined as remaining on `main`.
- **FR-011**: The dependency direction MUST be one-way: apps may depend on shared packages;
  shared packages MUST NOT depend on either app; the backend MUST NOT depend on frontend code
  (so the backend + shared packages are a self-contained subset).
- **FR-012**: The architecture MUST keep exactly one owner of database access (the backend) and
  document where the data model/schema lives in the new structure.
- **FR-013**: This cycle MUST NOT move or rewrite production code; its outputs are the blueprint
  and roadmap only. (Framework/tooling selections are deferred to planning.)

### Key Entities _(architecture elements, not data)_

- **Backend API app**: the Node.js service owning business logic and the only database access;
  exposes the HTTP contract.
- **Frontend app**: the React application consuming the API over HTTP; owns UI and presentation.
- **Shared package(s)**: contracts/types, validation schemas, money utilities, constants reused
  by both apps under a one-way dependency rule.
- **Domain module**: a self-contained slice of one business domain following the standard
  per-domain skeleton (present on backend and/or frontend as applicable).
- **API contract**: the published description of endpoints, request/response shapes, and errors
  that is the sole integration surface between the apps.
- **Migration roadmap**: the ordered plan (with done-state and rollback) for the one-shot
  restructure of the existing codebase.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The backend starts and serves its HTTP API (health check + ≥1 domain endpoint)
  with the frontend not running.
- **SC-002**: The frontend builds to a deployable artifact and runs against the backend using
  only a configurable API base URL, with the backend reachable solely over HTTP.
- **SC-003**: For every business domain, 100% of that domain's backend code (routes, logic, data
  access) is co-located in its domain folder; no domain logic remains in global layer folders.
- **SC-004**: 0 frontend modules import backend-internal code; 0 frontend code paths reach the
  database directly (verifiable by dependency inspection / boundary tooling).
- **SC-005**: Every shared concern (each contract type, each money utility) has exactly one
  definition referenced by both apps (no duplicated/divergent copies).
- **SC-006**: A change touching only one app can be built/tested in CI without building the
  other app.
- **SC-007**: The backend + shared packages form a self-contained dependency subset (the backend
  imports no frontend code), making future repo extraction mechanical.
- **SC-008**: A new developer can locate all code for a given domain in under 2 minutes using
  only the documented conventions.
- **SC-009**: The deliverables exist and are approved: a complete target folder/file blueprint
  and a phased one-shot migration roadmap with a defined done-state and rollback point.
- **SC-010**: 0 API responses contain localized prose (only data + language-agnostic codes/keys);
  all es/en catalogs live in the frontend.
- **SC-011**: `main` remains deployable throughout the restructure (work occurs on a dedicated
  branch; merge happens only after the done-state passes).

## Assumptions

- The audience for this spec is the development team; "users" here means developers/maintainers.
- Backend language/runtime is **Node.js** and the frontend is **React** (user-mandated
  constraints); specific frameworks, build tools, monorepo tooling, and the cross-boundary auth
  mechanism are intentionally deferred to the planning phase.
- The package manager remains **pnpm** unless planning justifies otherwise.
- The existing data domains (transactions, debts, savings, installments, investments, accounts,
  import, auth) define the initial domain set; new domains follow the same skeleton.
- The current persistence (PostgreSQL via an ORM) is retained; only its location/ownership in
  the new structure is being defined, not the database technology.
- "One-shot full restructure" is the chosen migration strategy, performed on a dedicated branch
  so `main` stays deployable; the branch may be temporarily non-functional mid-move, with a
  clear done-state gating the merge and rollback defined as remaining on `main`.
- Adopting this architecture amends the project constitution's currently-pinned "single
  fullstack Next.js" stack; that amendment is expected as part of memory-sync when the plan is
  approved.
