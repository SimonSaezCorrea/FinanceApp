# Phase 1 Data Model: Accounts Management

## Enums (new)

- `AccountType` = `CHECKING | SAVINGS | CREDIT_CARD | DEBIT_CARD | CASH | OTHER`
- `AccountStatus` = `ACTIVE | INACTIVE`

## BankAccount (extended)

| Field                 | Type            | Notes                                                   |
| --------------------- | --------------- | ------------------------------------------------------- |
| id                    | String (cuid)   |                                                         |
| userId                | String          | owner; all queries scoped by it                         |
| name                  | String          |                                                         |
| type                  | `AccountType`   | **new**, default `OTHER`                                |
| status                | `AccountStatus` | **new**, default `ACTIVE`                               |
| institution           | String?         | optional                                                |
| currency              | String          | default `USD`                                           |
| initialBalance        | Decimal(18,4)   | **new**, default 0 — user-set seed                      |
| currentBalance        | Decimal(18,4)   | reconciled/cached = initialBalance + Σincome − Σexpense |
| createdAt / updatedAt | DateTime        |                                                         |

Relations (unchanged): `transactions Transaction[]` (a transaction links via nullable
`bankAccountId`, `onDelete: SetNull` → deleting an account unlinks, never deletes, transactions).

## Reconciliation rule

```
currentBalance = initialBalance
              + Σ(amount where bankAccountId = id AND userId = u AND type = INCOME)
              − Σ(amount where bankAccountId = id AND userId = u AND type = EXPENSE)
```

Computed with decimal precision; persisted to `currentBalance` on reconcile.

## State transitions

- status: `ACTIVE ⇄ INACTIVE` (toggle); no auto-transitions.

## Contract types (`packages/contracts/src/accounts`)

- `accountType`, `accountStatus` zod enums (+ inferred types).
- `BankAccount` response gains `type`, `status`, `initialBalance` (money string), keeps
  `currentBalance` (money string).
- `createBankAccount`/`updateBankAccount` gain `type`, `status?`, `initialBalance?` (money string).
- `accountFilters` = `{ status?: "active" | "inactive" }` (list query).
- money fields remain **decimal strings** across the boundary.
