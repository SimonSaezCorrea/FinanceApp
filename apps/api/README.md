# @finance/api — NestJS backend

Sole owner of the database (Prisma). Exposes the HTTP API under `/api/v1`. The frontend talks to
it only over HTTP. Validation uses **zod** schemas from `@finance/contracts` (not class-validator).

## Per-domain skeleton (`src/domains/<domain>/`)

Every business domain follows the same layout:

```
src/domains/<domain>/
├── <domain>.module.ts       # wires controller + providers
├── <domain>.controller.ts   # HTTP routes; ZodValidationPipe on bodies; @CurrentUser
├── <domain>.service.ts      # business logic (money via @finance/money)
├── <domain>.repository.ts    # the ONLY place this domain touches Prisma; always scope by userId
├── <domain>.service.spec.ts  # unit tests (TDD)
└── dto/                      # (optional) domain-local types beyond @finance/contracts
```

Cross-cutting code lives in `src/infra/` (`prisma`, `auth` guard + `@CurrentUser`, `http` error
filter + `ZodValidationPipe`, `config`) and `src/common/`. Domain modules are registered in
`src/app.module.ts`.

Rules: every query/mutation is scoped by `session.user.id` (Principle II); money stays in
`Decimal`/strings (Principle I); errors are language-agnostic codes (the frontend localizes).

## Extraction

The backend depends only on `@finance/*` shared packages (never on `apps/web`), so `apps/api` +
those packages are a self-contained subset that can be lifted into its own repo (SC-007).
