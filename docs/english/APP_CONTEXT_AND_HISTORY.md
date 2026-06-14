# FinanceApp — Canonical Context & Technical History

> Spanish version: [../spanish/APP_CONTEXT_AND_HISTORY.md](../spanish/APP_CONTEXT_AND_HISTORY.md)
>
> **Note:** this document describes the **original monolithic Next.js app** (before the monorepo
> migration). The stack/routing here are **historical**; the **product vision, data model and
> business rules still apply**. For the current architecture see [ARCHITECTURE.md](./ARCHITECTURE.md).

A historical and operational reference for agents and people maintaining the project. The **repo
code** is the source of truth; this file summarizes intent, structure, and observed conventions.

**Last revised:** 2026-05-15

---

## 1. Product origin & vision

**Vision:** a **personal-finance** web app for individual or household use: record **income and
expenses**, track **installments**, **debts** (lent / owed), **savings goals** and related entries,
**bank accounts** with a cached balance, **views/summaries and charts** (e.g. Recharts in the
stack), **ETF**-type **investments** (quotes via **Alpha Vantage**) and **remunerated accounts**
(annual rate, principal), and **Excel import** (SheetJS / `xlsx`). The design aims for **monetary
precision** (`Decimal` types in the DB and `decimal.js` in business logic) and modern cloud
deployment (e.g. **Vercel**, aligned with Next.js).

**Tech stack (original repo state, `package.json`):**

| Area | Technology |
|------|------------|
| UI framework | **Next.js** 14.x (App Router), **React** 18 |
| Database | **PostgreSQL** (documented in `.env.example` as **Supabase** Postgres) |
| ORM | **Prisma** 6.x, `@prisma/client` |
| Auth | **NextAuth** v5 (`next-auth` beta), **Prisma adapter**, JWT sessions |
| i18n | **next-intl** 4.x, routes under `/[locale]` |
| UI / styling | **Tailwind CSS**, **Radix UI**, **next-themes** (light/dark/system) |
| Numbers / money | **decimal.js** in financial utilities; **Prisma `Decimal`** in the schema |
| Charts | **recharts** |
| Excel | **xlsx** (SheetJS) |
| Validation | **zod** |
| ETF quotes | **Alpha Vantage** (`ALPHA_VANTAGE_API_KEY`; client in `lib/finance/etf.ts`) |

---

## 2. Repository timeline (verifiable facts)

The following is inferred from the **state of the code**, not from an external version-control
narrative.

1. **Initialization:** a **Next.js** project with App Router, TypeScript, Tailwind, and the
   dependencies listed above (`package.json`).

2. **Persistence:** a relational model defined in `prisma/schema.prisma` and materialized into SQL
   by migrations.

3. **Initial migration:** folder `prisma/migrations/20260515143000_init/` with `migration.sql`
   creating ENUMs (`TransactionType`, `DebtDirection`, `InvestmentKind`), NextAuth tables (`User`,
   `Account`, `Session`, `VerificationToken`) and the financial domain (`BankAccount`,
   `Transaction`, `InstallmentPlan`, `InstallmentPayment`, `Debt`, `SavingsGoal`, `SavingsEntry`,
   `Investment`, `EtfPriceCache`), with indexes per the schema.

4. **Seed (`prisma/seed.ts`, command `npm run db:seed`):**
   - Deletes and recreates only users with the demo emails `demo@finance.local` and
     `partner@finance.local` (aligned with the dev login in `auth.ts`).
   - Does not use **bcrypt** or persisted passwords: the dev credentials flow does an **upsert** of
     `User` by email without a hash.
   - Loads example data: accounts, an installment plan, transactions, debts, savings, ETF +
     remunerated investments, and a demo row in `EtfPriceCache` for `VTI`.

5. **Internationalization:** `next-intl` with a plugin in `next.config.mjs` pointing to
   `i18n/request.ts`; messages in `messages/es.json` and `messages/en.json`; central routing in
   `lib/i18n/routing.ts` (`defaultLocale: "es"`, `localePrefix: "always"`).

6. **Theming / settings:** `components/providers.tsx` wraps the app with `ThemeProvider`
   (next-themes) and `SessionProvider`. UI settings (theme and language) in
   `components/layout/SettingsSheet.tsx` with `settings.*` translations.

---

## 3. Architecture

### 3.1 App Router

- **`app/layout.tsx`:** root layout (`<html lang="es">`), Inter font, `Providers` (theme + client session).
- **`app/[locale]/layout.tsx`:** validates `locale` against `routing.locales`, `setRequestLocale`,
  `NextIntlClientProvider`, `HtmlLang` to sync the document's `lang` attribute.
- **Route groups:**
  - `(auth)` — login, register (placeholder linking to login).
  - `(dashboard)` — authenticated pages: dashboard, accounts, transactions, installments, debts,
    savings, investments, import.

### 3.2 API Routes (`app/api/`)

REST routes under `app/api/.../route.ts` (accounts, transactions, installments, debts, savings,
investments, import, auth). They **do not** go through the locale/auth middleware chain the same way
pages do: the `matcher` in `middleware.ts` **excludes** `api`. Each handler uses **`auth()`** from
`@/auth` and responds `401` if there is no valid session (a unified API protection pattern).

### 3.3 `lib/` — layers

| Path | Role |
|------|------|
| `lib/prisma.ts` | `PrismaClient` singleton with logs in development |
| `lib/i18n/routing.ts` | Supported locales and `defineRouting` (default `es`) |
| `lib/i18n/pathname.ts` | Utility used in middleware to extract the locale from the pathname |
| `lib/finance/installments.ts` | Installments: **equal-principal** amortization + optional simple interest per period (`decimal.js`) |
| `lib/finance/interest.ts` | Compound / simple interest and rate utilities (`decimal.js`) |
| `lib/finance/etf.ts` | Alpha Vantage quote + `EtfPriceCache` with a **24h** TTL in code |
| `lib/utils/excel-parser.ts` | Excel parsing → normalized rows for transactions |
| `lib/utils/currency.ts`, `formatters.ts`, `cn.ts` | Formatting and UI utilities |

### 3.4 Components

- **`components/layout/`** — dashboard shell: `Sidebar`, `Topbar`, `MobileNav`, `SettingsSheet`,
  `LanguageSwitcher`, `UserMenu`, `HtmlLang`.
- **`components/ui/`** — shadcn-style primitives (button, sheet, etc.).
- **`components/auth/`** — login forms.
- **`components/providers/`** — `theme-provider` (next-themes).

### 3.5 Middleware

File `middleware.ts`:

1. Builds the **next-intl** middleware with `routing`.
2. Wraps it with NextAuth **`auth()`**: after applying i18n, if the route is not public and there is
   no session, it **redirects** to `/{locale}/login`.
3. **Public routes** (without locale prefix in the internal logic): `pathnameWithoutLocale === "/login"`
   or `=== "/register"`.
4. **`matcher`:** excludes `api`, `_next`, `_vercel`, and static files (`.*\\..*`).

### 3.6 Environment variables

Documented in **`.env.example`**:

- `DATABASE_URL` — Postgres (e.g. Supabase).
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — optional OAuth.
- `ALPHA_VANTAGE_API_KEY` — ETF quotes.

**Never** commit `.env` with real secrets.

### 3.7 Next config

`next.config.mjs`: **next-intl** plugin (`./i18n/request.ts`);
`experimental.serverComponentsExternalPackages: ["@prisma/client"]`.

---

## 4. Data model & business rules (Prisma)

Source: `prisma/schema.prisma` and modules in `lib/finance/`.

### 4.1 Authentication (NextAuth / Auth.js)

- `User`, `Account`, `Session`, `VerificationToken` — standard schema with `@auth/prisma-adapter`.

### 4.2 Financial domain

- **`BankAccount`:** name, currency, optional institution, **`currentBalance`** as a **cached**
  balance (schema comment: reconcile via transactions in app logic).
- **`Transaction`:** `INCOME` | `EXPENSE` (`TransactionType`), amount `Decimal(18,4)`, optionally
  linked to a `BankAccount` and an **`InstallmentPlan`**.
- **`InstallmentPlan` + `InstallmentPayment`:** a plan with total principal, number of installments,
  due dates per sequence; payments with an optional `paidAt`. The `buildEqualPrincipalSchedule`
  library documents an **equal-principal** split plus simple interest on the balance if an APR per
  period is passed (the exact alignment with plan fields in UI/API depends on how each screen
  consumes it).
- **`Debt`:** direction `OWED_TO_YOU` | `YOU_OWE`, counterparty, principal, dates, optional
  **`interestApr`** (`Decimal(8,4)`).
- **`SavingsGoal` + `SavingsEntry`:** a goal with a target amount; entries optionally linked to a goal.
- **`Investment`:** `ETF` (symbol, shares) or `REMUNERATED_ACCOUNT` (annual rate, principal,
  optionally `bankAccountId`).
- **`EtfPriceCache`:** one row per unique **symbol**; `fetchedAt` + OHLCV; optional `rawJson`.
  Schema comment: TTL ~24h — the app treats older data as **stale** and refetches + upserts; the
  **`TTL_MS`** constant is replicated in `lib/finance/etf.ts` (**24h**).

### 4.2 Money

- PostgreSQL: `Decimal` type with precisions defined per model.
- JS: **`decimal.js`** in financial calculations; Prisma uses `Prisma.Decimal` in the seed.

### 4.3 Excel import — column mapping

**Reference file:** `lib/utils/excel-parser.ts`.

The parser expects a **`mapping`** object (validated with zod) relating **Excel column names** to
logical fields:

| Logical field | Mapping key | Notes |
|---------------|-------------|-------|
| Date | `date` | Prefer ISO `yyyy-mm-dd` in sheets |
| Amount | `amount` | Positive; a negative sign can force an expense |
| Description | `description` | Optional |
| Category | `category` | Optional |
| Type | `type` | Optional: INCOME/EXPENSE synonyms (en/es) or the amount's sign |
| Currency | `currency` | Optional |
| Account | `account` | Optional (text) |

The **`POST app/api/import`** route exists but as of 2026-05-15 returns a **stub** (`imported: 0`,
a note to wire up SheetJS + parser); the parser in `lib` is **ready** to integrate.

---

## 5. Authentication & security

### 5.1 Configuration (`auth.ts`)

- **Adapter:** `PrismaAdapter(prisma)`.
- **Session:** **`strategy: "jwt"`** (even though Prisma `Session` tables exist, the current config
  uses JWT).
- **Providers:**
  - **Google:** only if `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are defined;
    `allowDangerousEmailAccountLinking: true`.
  - **Credentials** (`id: "dev-credentials"`): **only if `NODE_ENV !== "production"`** — authorizes
    with email only, upserts the user; handy against **seed** data.
- **Callbacks:** propagate `sub` and email in JWT/session for `session.user.id`.
- **Pages:** `signIn: "/login"` (locale-managed route handled by the app).
- **`trustHost: true`**

### 5.2 Protected routes

- Middleware: everything except `/login` and `/register` (locale-prefixed) requires **`req.auth`**.
- APIs: check `session` with `auth()` in each route handler.

### 5.3 Secrets

- Do not commit **`.env`** or real keys; follow `.env.example`.
- `NEXTAUTH_SECRET`: generation suggested in the example comment (`openssl rand -base64 32`).

---

## 6. AI / build rules (project conventions)

A summary for future agents, aligned with repo patterns and maintenance expectations:

- **Scoped changes:** minimal edits to the target; avoid unsolicited mass refactors.
- **Style:** mirror existing imports, naming, and structure in the file you touch.
- **Commits:** create commits **only** when the user explicitly asks.
- **i18n:** new UI strings in **`messages/en.json`** and **`messages/es.json`**; routes and links via
  `@/i18n/navigation` (`Link`, `redirect`, etc.) where applicable.
- **Money:** prefer **`decimal.js`** / `Prisma.Decimal` for calculations and rounding consistent
  with the schema.
- **Auth:** never expose one user's data to another — filter by `session.user.id` in queries.
- **API:** keep the `auth()` check and consistent JSON responses.
- **Markdown docs:** don't add unrequested `.md` files unless explicitly required (this document is
  a requested exception).

---

## 7. How to extend

### 7.1 New locale (per comments in `lib/i18n/routing.ts`)

1. Extend the **`locales`** tuple in `lib/i18n/routing.ts` with the new code.
2. Add **`messages/<code>.json`** with the same keys as `es`/`en`.
3. Wherever there's an exhaustive `switch (locale)` typed with `Locale`, TypeScript will point out
   the spots to update.

Optional: review `app/[locale]/layout.tsx` (`generateStaticParams` already uses `routing.locales`).

### 7.2 New Prisma model

1. Edit **`prisma/schema.prisma`** (models, enums, indexes, relations with consistent `onDelete`).
2. Run **`npm run db:migrate`** (or `db:push` for local prototyping) and regenerate the client
   (`postinstall` already runs `prisma generate`).
3. If it affects the demo seed, update **`prisma/seed.ts`** carefully so as not to delete users
   other than `DEMO_EMAILS`.

### 7.3 Seed and command order

- Variables: copy `.env.example` → `.env` and fill it in.
- Migrations: `npm run db:migrate` (development) or `npm run db:migrate:deploy` (CI/prod).
- Demo data: `npm run db:seed` (controlled resets for demo emails).
- Exploration: `npm run db:studio`.

### 7.4 Wire Excel import end-to-end

Connect in **`app/api/import/route.ts`**: multipart `file`, `parseExcelTransactions` from
`lib/utils/excel-parser.ts`, persistence into `Transaction` / linking to accounts per product rules.

---

## Quick code-path references

| Concept | Location |
|---------|----------|
| NextAuth auth | `auth.ts`, `app/api/auth/[...nextauth]/route.ts` |
| i18n + auth middleware | `middleware.ts` |
| Locale routing | `lib/i18n/routing.ts` |
| ETF quotes + 24h cache | `lib/finance/etf.ts`, `EtfPriceCache` model |
| Installments (equal-principal logic) | `lib/finance/installments.ts` |
| Excel | `lib/utils/excel-parser.ts` |
| Env example | `.env.example` |

---

*End of canonical document.*
