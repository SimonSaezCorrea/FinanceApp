# Phase 0 Research: API/Frontend Monorepo Architecture

All decisions below were confirmed with the maintainer during `/sdd` clarify/plan. No open
`NEEDS CLARIFICATION` items remain.

## D1 — Monorepo tooling

- **Decision**: pnpm workspaces + **Turborepo**.
- **Rationale**: pnpm is already the package manager; Turborepo adds task pipelines, remote/local
  caching, and "build only affected app" — directly serving SC-006 (per-app CI) with minimal setup.
- **Alternatives**: Nx (more power: generators, enforced module boundaries — heavier, more
  opinionated than needed now); pnpm workspaces alone (no task caching/orchestration).

## D2 — Backend framework

- **Decision**: **NestJS 10** (TypeScript).
- **Rationale**: Nest modules map 1:1 to business domains, giving the domain-first layout for free;
  DI + provider model make per-domain services/repositories testable in isolation; opinionated
  structure resists drift as domains grow (maintainability/scalability goals).
- **Alternatives**: Fastify (fast/light, but domain structure + DI are hand-rolled), Express
  (ubiquitous but least structure/typing), Hono (modern/edge, smaller ecosystem for this use).

## D3 — Frontend base

- **Decision**: **Vite + React 18 SPA** (react-router + TanStack Query).
- **Rationale**: cleanest separation — a pure client that talks to the API only over HTTP and
  builds to a static artifact deployable to any CDN (FR-002/FR-003). The app is auth-gated, so SSR
  SEO is not needed. Removes the extra Next server and its coupling to API logic.
- **Alternatives**: keep Next.js as frontend-only (less rewrite, but keeps a Node server and
  framework coupling); Remix/React Router SSR (data-oriented SSR, unnecessary complexity here).
- **Trade-off acknowledged**: the current Next frontend (App Router, next-intl, next-auth) is
  rewritten; i18n moves to a client i18n lib, auth moves to the backend.

## D4 — Cross-boundary auth

- **Decision**: backend-issued **JWT access + refresh tokens delivered via httpOnly cookies**.
- **Rationale**: stateless validation fits a separately deployed API; httpOnly cookies keep tokens
  out of JS (XSS theft mitigation); refresh rotation enables short-lived access tokens.
- **Requirements introduced**: CSRF protection for cookie-based auth (double-submit or SameSite),
  refresh-token rotation/revocation strategy, CORS with credentials between web origin and API.
- **Alternatives**: server sessions (easy revocation, but server state contradicts stateless API
  goal); keep NextAuth/OAuth (keeps auth in the frontend — contradicts separation). Google OAuth
  can still be added later as an identity source feeding the backend's token issuance.

## D5 — Testing runner (closes constitution TODO(TEST_RUNNER))

- **Decision**: **Vitest** as the single runner across apps and packages.
- **Rationale**: one config/mental-model repo-wide; fast, ESM-native, TS-first; Testing Library for
  React, Nest testing module/supertest for API e2e. Adopting it satisfies Principle IV's
  infrastructure prerequisite.
- **Alternatives**: Jest (heavier ESM/TS setup), node:test (minimal, less ergonomic for React).

## D6 — i18n ownership

- **Decision**: frontend owns es/en catalogs; API returns data + stable, language-agnostic error
  codes/keys, never localized prose (clarify Q1).
- **Rationale**: keeps i18n parity enforcement in one place (the frontend), keeps the API
  presentation-agnostic and reusable by any client.

## D7 — Database ownership & data model location

- **Decision**: Prisma schema, migrations, and seed live in `apps/api/prisma`; only the backend
  accesses the DB.
- **Rationale**: single DB owner (FR-012, Principle II); makes backend + shared packages a
  self-contained subset for future extraction (SC-007).

## D8 — Migration strategy

- **Decision**: one-shot full restructure on a **dedicated branch**; `main` stays deployable until
  the new structure passes its done-state, then merge; rollback = remain on `main` (clarify Q3).
- **Rationale**: protects production while allowing a clean cut rather than a long-lived hybrid.
