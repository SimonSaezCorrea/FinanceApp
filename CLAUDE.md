# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Canonical reference

`docs/APP_CONTEXT_AND_HISTORY.md` is the in-depth, maintained spec (architecture, data model, business rules, env vars, extension guides). Read it for anything beyond the summary below. Code is the source of truth; that doc explains intent.

## Commands

Package manager is **pnpm** (lockfile `package-lock.json` exists but the project runs with pnpm — see dev logs).

- `pnpm run dev` — Next dev server (`next dev --turbo`, Turbopack)
- `pnpm run build` / `pnpm start` — production build / serve
- `pnpm run lint` — ESLint (`eslint-config-next`)
- `pnpm run db:migrate` — Prisma migrate dev (local schema changes)
- `pnpm run db:migrate:deploy` — apply migrations in CI/prod
- `pnpm run db:push` — push schema without migration (prototyping)
- `pnpm run db:seed` — seed demo data (`tsx prisma/seed.ts`); only touches demo users `demo@finance.local` / `partner@finance.local`
- `pnpm run db:studio` — Prisma Studio

No test runner is configured.

Setup: copy `.env.example` → `.env`, fill `DATABASE_URL` (Postgres/Supabase), `NEXTAUTH_URL`, `NEXTAUTH_SECRET`; `GOOGLE_CLIENT_*` and `ALPHA_VANTAGE_API_KEY` optional. `postinstall` runs `prisma generate`.

## Architecture (big picture)

Next.js 14 App Router + React 18, Prisma 6 / PostgreSQL, NextAuth v5 (beta, JWT sessions), next-intl, Tailwind + Radix.

- **Routing & i18n:** all pages under `app/[locale]/` with `localePrefix: "always"`, default `es`. Locales defined in `lib/i18n/routing.ts`. Route groups: `(auth)` (login/register, public) and `(dashboard)` (authenticated screens: dashboard, accounts, transactions, installments, debts, savings, investments, import).
- **`middleware.ts`:** runs next-intl middleware first, then wraps with NextAuth `auth()`; redirects to `/{locale}/login` when no `req.auth` and route isn't public. `matcher` **excludes** `api`, `_next`, `_vercel`, static files — so API routes do NOT go through this auth/i18n chain.
- **API routes (`app/api/*/route.ts`):** plain REST handlers. Each must call `auth()` from `@/auth` itself and return 401 if no session (middleware does not protect them). Always filter queries by `session.user.id` — never leak one user's data to another.
- **Auth (`auth.ts`):** `PrismaAdapter`, JWT strategy. Google provider only if env set. `dev-credentials` provider (email-only `upsert`, **dev only**, `NODE_ENV !== "production"`) for working against seed data. `auth.ts` exports `{ handlers, auth, signIn, signOut }`.
- **Providers (`components/providers.tsx`):** client `SessionProvider` + `ThemeProvider`. Root `app/layout.tsx` is async, calls `auth()` server-side and passes `session` down so the client doesn't refetch on mount; `refetchOnWindowFocus`/`refetchInterval` are disabled.
- **`lib/finance/`:** money logic in `decimal.js`. `installments.ts` = equal-principal amortization; `interest.ts` = simple/compound rates; `etf.ts` = Alpha Vantage quotes cached in `EtfPriceCache` (24h TTL constant `TTL_MS`).
- **`lib/utils/excel-parser.ts`:** zod-validated column `mapping` → normalized transaction rows. Note: `POST app/api/import` is still a stub (`imported: 0`); the parser is ready to wire in.

## Conventions

- **Money:** use `decimal.js` / `Prisma.Decimal`, matching schema precisions (`Decimal(18,4)` amounts etc.). Don't use floats.
- **i18n:** every UI string goes in BOTH `messages/en.json` and `messages/es.json`. Use `@/i18n/navigation` (`Link`, `redirect`) for locale-aware links, not bare `next/link`.
- **Scoped edits:** minimal changes to the target; mirror existing imports/naming/structure in the file you touch. No unsolicited mass refactors.
- **Commits:** only when the user explicitly asks.
- **Markdown:** don't add `.md` files unless requested.

## Spec-Driven Development (SDD / Spec Kit)

This repo uses **GitHub Spec Kit** for feature work. Structure lives in `.specify/`
(templates, scripts, `memory/constitution.md`) and the workflow runs through the
`/speckit-*` skills: `constitution → specify → clarify → plan → checklist → tasks
→ analyze → implement`.

- **To build a feature the SDD way, use the `/sdd` skill** — it orchestrates the
  whole lifecycle end to end (crafts the specify prompt with the user, runs each
  command in order, holds review gates, asks when unsure). Don't run `implement`
  without an approved spec/plan/tasks chain.
- **Project principles** live in `.specify/memory/constitution.md`. It supersedes
  ad-hoc practices; honor it in every plan and implementation.
- **Keep memory in sync (mandatory):** on ANY relevant change — new dependency,
  convention, data-model/schema change, env var, command, routing/auth change, or
  new principle — update BOTH `.specify/memory/constitution.md` (principle-level,
  bump version) AND this `CLAUDE.md` (architecture/commands/conventions) in the
  same session. These are the canonical, living memory; stale docs are a defect.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
