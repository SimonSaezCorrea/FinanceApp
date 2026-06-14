# @finance/web — Vite + React SPA

Pure client. Talks to the backend ONLY through `@finance/contracts` + the `apiClient`
(`VITE_API_URL`). Never imports backend internals and never touches the database. Owns the es/en
translation catalogs (Clarify Q1 / Principle III).

## Per-domain skeleton (`src/domains/<domain>/`)

```
src/domains/<domain>/
├── api/         # typed calls built on shared/lib/apiClient + @finance/contracts
├── hooks/       # data hooks (TanStack Query) / context
├── components/  # presentational pieces for this domain
├── routes/      # screens/pages
└── <domain>.test.tsx
```

Shared, non-domain code: `src/app/` (router, providers), `src/shared/` (UI primitives, apiClient),
`src/i18n/` (es/en). Add a domain's routes to `src/app/router.tsx`.

Rules: surface API errors by their `code` mapped through i18n (`errors.<CODE>`); render money via
`@finance/money`; keep es/en keys in parity.
