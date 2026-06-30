# FinanceApp — How it works & how to run it

A practical companion to [ARCHITECTURE.md](./ARCHITECTURE.md). That doc says _what the pieces are_;
this one says _how they run and how a request flows end to end_.

---

## 1. The mental model in one paragraph

There are **two independent programs** that happen to live in one repo: a **backend** (`apps/api`,
NestJS) that owns the database and answers HTTP requests under `/api/v1`, and a **frontend**
(`apps/web`, a React single-page app) that runs entirely in the browser and talks to the backend
over HTTP. They never share memory or code at runtime — only **shared packages** at build time
(`@finance/contracts` for the request/response shapes, `@finance/money` for money math). You can
start, stop, build, and deploy each one on its own.

## 2. What runs where

| Process    | What it is                                                 | Default URL             | Owns                                            |
| ---------- | ---------------------------------------------------------- | ----------------------- | ----------------------------------------------- |
| `apps/api` | A long-running Node/NestJS server                          | `http://localhost:3001` | The database (Prisma), business logic, auth     |
| `apps/web` | A Vite dev server (dev) / static files behind nginx (prod) | `http://localhost:5173` | The UI, routing, translations                   |
| PostgreSQL | The database                                               | `:5432`                 | Persisted data — reached **only** by `apps/api` |

The browser downloads the SPA from `apps/web`, then every data action is a `fetch()` to `apps/api`.

## 3. Running it locally

```bash
# 1. install everything (all workspaces)
pnpm install

# 2. generate the Prisma client for the backend
pnpm --filter @finance/api exec prisma generate

# 3. configure env (copy the examples, fill values)
#    apps/api/.env  -> DATABASE_URL, PORT, CORS_ORIGIN, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#    apps/web/.env  -> VITE_API_URL=http://localhost:3001

# 4. set up the database (run migrations + seed demo data)
pnpm db:migrate
pnpm db:seed

# 5. run both apps together (Turborepo runs them in parallel)
pnpm dev
```

Or run them **separately** (proves the decoupling):

```bash
pnpm --filter @finance/api dev   # backend only, on :3001
pnpm --filter @finance/web dev   # frontend only, on :5173
```

Quick health check (backend alone, frontend not needed):

```bash
curl http://localhost:3001/api/v1/health   # -> {"status":"ok","service":"finance-api"}
```

## 4. How the backend boots (`apps/api/src/main.ts`)

1. Nest creates the app from `AppModule`, which imports `ConfigModule` (env), the global
   `PrismaModule` (one DB client), and every domain module (`auth`, `accounts`, …).
2. Global setup: prefix `/api/v1`, cookie parser, CORS for the web origin **with credentials**, and
   the global error filter that turns any error into `{ error: { code } }`.
3. It listens on `PORT` (3001). `PrismaService.onModuleInit` opens the DB connection.

## 5. Request lifecycle (the important part)

### a) Logging in

```
Browser (LoginRoute)                apps/api                         PostgreSQL
   │  POST /api/v1/auth/login          │                                 │
   │  { email, password } ───────────▶ │ AuthController.login            │
   │                                   │  → ZodValidationPipe (validate) │
   │                                   │  → AuthService.validateCredentials
   │                                   │     → AuthRepository.findByEmail ─▶ SELECT user
   │                                   │     → bcrypt.compare(password)   │
   │                                   │  → issue JWT access + refresh    │
   │ ◀── 200 { id, email, name } ──────│  Set-Cookie: access_token (httpOnly)
   │     + httpOnly cookies            │  Set-Cookie: refresh_token (httpOnly)
```

The tokens live in **httpOnly cookies**, so JavaScript can't read them (XSS-safe). The frontend
just gets the user object and stores it in React state (`AuthProvider`).

### b) An authenticated request (e.g. listing accounts)

```
Browser (useAccounts → apiClient)        apps/api
   │  GET /api/v1/accounts                 │
   │  (cookies sent automatically) ──────▶ │ JwtAuthGuard: verify access_token cookie
   │                                       │   → attaches { id: userId } to the request
   │                                       │ AccountsController.list(@CurrentUser)
   │                                       │   → AccountsService.list(userId)
   │                                       │      → AccountsRepository.list(userId)  // scoped!
   │                                       │   → map Decimal → string, Date → ISO
   │ ◀── 200 [ {id,name,currentBalance:"…"} ]
```

Two rules are always enforced here:

- **Per-user isolation:** the repository query is filtered by the `userId` from the token — a user
  can never see another's data.
- **Money as strings:** amounts cross the wire as decimal strings (e.g. `"1240.5000"`), parsed with
  `@finance/money` on both sides, never as floats.

### c) When the access token expires

The frontend calls `POST /api/v1/auth/refresh`; the backend validates the refresh cookie, issues a
fresh access+refresh pair (rotation), and the request is retried. Logout clears both cookies.

### d) Errors

The API answers failures with a stable code, e.g. `401 { "error": { "code": "INVALID_CREDENTIALS" } }`.
The frontend maps that code to a localized message (`errors.INVALID_CREDENTIALS` in es/en) — the API
never sends human prose, so language stays a frontend concern.

## 6. How the frontend runs (`apps/web`)

1. `index.html` loads `src/main.tsx`, which mounts React inside `<Providers>` (TanStack Query +
   i18n + `AuthProvider`) and a `RouterProvider`.
2. On load, `AuthProvider` calls `GET /auth/me`. If it succeeds → user is logged in; if it fails →
   `RequireAuth` redirects protected routes to `/login`.
3. Each screen lives in `domains/<domain>/routes`, fetches via a `domains/<domain>/hooks` query that
   calls `domains/<domain>/api` (typed with `@finance/contracts`), which uses the shared `apiClient`.
4. `apiClient` always sends `credentials: "include"` (the cookies) and converts non-2xx into a typed
   `ApiRequestError(code)` the UI can translate.

## 7. Why the shared packages matter at runtime vs build time

- `@finance/contracts` is **build-time glue**: both apps import the same zod schema/type for, say, a
  transaction, so if the shape changes, both sides break at compile time (not in production).
- `@finance/money` is **runtime logic**: the actual decimal math (sums, installment schedules,
  interest) runs the same way wherever it's called.
- Neither app imports the other; `scripts/check-boundaries.mjs` fails the build if that's ever
  violated. That's what keeps the two halves genuinely independent.

## 8. Tests, quality gates, build & deploy

```bash
pnpm test              # Vitest across api + web + packages
pnpm typecheck         # tsc --noEmit per package
pnpm check:boundaries  # web↛api/db, api↛web, packages↛apps
pnpm build             # Turborepo builds packages, then both apps
```

CI (`.github/workflows/ci.yml`) runs the same gates on every PR. Build outputs:

- `apps/api` → compiled Node app (`dist/main.js`), shipped as a Node container (`apps/api/Dockerfile`).
- `apps/web` → static bundle (`dist/`), served by nginx (`apps/web/Dockerfile` + `nginx.conf`),
  baked with `VITE_API_URL` at build time.

Because they build and deploy separately, you can ship a frontend fix without redeploying the API,
and scale the API independently of the static frontend.

## 9. Where to look when…

| You want to…                 | Go to                                                      |
| ---------------------------- | ---------------------------------------------------------- |
| Change an endpoint's shape   | `packages/contracts/src/<domain>/` (then both apps follow) |
| Add business logic / a query | `apps/api/src/domains/<domain>/{service,repository}.ts`    |
| Change a screen              | `apps/web/src/domains/<domain>/routes/`                    |
| Touch auth                   | `apps/api/src/domains/auth/` + `apps/api/src/infra/auth/`  |
| Add a translation            | `apps/web/src/i18n/{es,en}.json`                           |
| Money math                   | `packages/money/src/`                                      |
| Add a whole new domain       | the recap in [ARCHITECTURE.md §12](./ARCHITECTURE.md)      |
