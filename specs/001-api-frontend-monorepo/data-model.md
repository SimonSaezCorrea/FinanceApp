# Phase 1 Data Model: API/Frontend Monorepo Architecture

The data model is **unchanged** by this restructure — it is the existing finance schema, now
**owned exclusively by `apps/api`** (Prisma). Listed here so the blueprint is self-contained and
the domain↔entity mapping is explicit. Money fields use `Prisma.Decimal`; all domain rows are
scoped to a `userId` (Principle II).

## Domain → entity map

| Domain (folder) | Owns entities                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `auth`          | `User`, `Account`, `Session`, `VerificationToken` (NextAuth tables; `User.passwordHash` for credentials) |
| `accounts`      | `BankAccount`                                                                                            |
| `transactions`  | `Transaction` (+ enum `TransactionType`)                                                                 |
| `installments`  | `InstallmentPlan`, `InstallmentPayment`                                                                  |
| `debts`         | `Debt` (+ enum `DebtDirection`)                                                                          |
| `savings`       | `SavingsGoal`, `SavingsEntry`                                                                            |
| `investments`   | `Investment` (+ enum `InvestmentKind`), `EtfPriceCache`                                                  |
| `import`        | none (operates on `Transaction`; stateless Excel parsing)                                                |

## Entities (key fields & rules)

- **User**: `id`, `name?`, `email? @unique`, `emailVerified?`, `image?`, `passwordHash?`. Root of
  per-user isolation; all domain entities reference it via `userId` (onDelete: Cascade).
- **BankAccount**: `name`, `currency`, `institution?`, `currentBalance: Decimal(18,4)` (cached;
  reconciled via transactions in app logic).
- **Transaction**: `type: INCOME|EXPENSE`, `amount: Decimal(18,4)`, `occurredAt`, optional links to
  `BankAccount` and `InstallmentPlan`.
- **InstallmentPlan / InstallmentPayment**: plan principal + count + per-sequence due dates;
  payments carry `paidAt?`. Equal-principal schedule logic lives in shared/money + backend service.
- **Debt**: `direction: OWED_TO_YOU|YOU_OWE`, counterparty, principal, dates, `interestApr?: Decimal(8,4)`.
- **SavingsGoal / SavingsEntry**: goal target; entries optionally linked to a goal, `contributedAt`.
- **Investment**: `ETF` (symbol, shares) or `REMUNERATED_ACCOUNT` (annual rate, principal, optional
  `bankAccountId`).
- **EtfPriceCache**: one row per `symbol`; `fetchedAt` + OHLCV; 24h TTL refresh-on-read.

## Validation & contracts

- Each domain's request/response shapes are defined once as **zod schemas in `packages/contracts`**
  and reused by the backend DTOs and the frontend typed client (single source of truth, FR-005/FR-009).
- Money values cross the boundary as **strings** (not JS floats) to preserve precision; both sides
  parse with `decimal.js` from `packages/money`.

## State transitions

- `InstallmentPayment`: unpaid → paid (`paidAt` set). `Debt`: open → settled (`settledAt`).
  `EtfPriceCache`: fresh → stale (age > 24h) → refreshed. No schema changes this cycle.
