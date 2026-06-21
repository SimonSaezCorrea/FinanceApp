# Accounts API Contract

Base: `/api/v1/accounts` (JwtAuthGuard; every op scoped to the authenticated `userId`).
Money fields are decimal strings. Shapes defined in `@finance/contracts` (`accounts`).

| Method | Path | Body / Query | Returns |
|--------|------|--------------|---------|
| GET | `/accounts` | `?status=active\|inactive` (optional) | `BankAccount[]` |
| GET | `/accounts/:id` | — | `BankAccount` (404 if not owner) |
| POST | `/accounts` | `createBankAccount` | `BankAccount` (201) |
| PATCH | `/accounts/:id` | `updateBankAccount` (partial) | `BankAccount` |
| POST | `/accounts/:id/status` | `{ status: "ACTIVE" \| "INACTIVE" }` | `BankAccount` |
| POST | `/accounts/:id/reconcile` | — | `BankAccount` (currentBalance recomputed) |
| DELETE | `/accounts/:id` | — | 204 (transactions unlinked) |

## Shapes

```
BankAccount {
  id, name, type: AccountType, status: AccountStatus,
  institution: string|null, currency,
  initialBalance: moneyString, currentBalance: moneyString,
  createdAt, updatedAt
}
createBankAccount { name, type, currency(=USD), institution?, initialBalance?(money), status? }
updateBankAccount = partial(createBankAccount)
accountFilters { status?: "active" | "inactive" }
```

## Errors (language-agnostic codes)

- `ACCOUNT_NOT_FOUND` (404), `VALIDATION_FAILED` (400), `UNAUTHORIZED` (401).

## Rules

- Create defaults: `status=ACTIVE`, `currency=USD`, `initialBalance=0`, `currentBalance=initialBalance`.
- Reconcile sets `currentBalance = initialBalance + Σincome − Σexpense` (scoped to user+account).
- Filter `status` is case-insensitive against the enum; omitted → all.
