# Data Model: Plantillas de movimientos (037)

## MovementTemplate (table `movement-template`)

| Column                    | Type                           | Notes                                                     |
| ------------------------- | ------------------------------ | --------------------------------------------------------- |
| id                        | String `uuid(7)` PK            | Principio VIII                                            |
| userId                    | String FK → `user`             | `onDelete: Cascade`                                       |
| name                      | String                         | 1–60, trimmed                                             |
| nameKey                   | String                         | `normalizeFieldName(name)`; `@@unique([userId, nameKey])` |
| type                      | `TransactionType`              | EXPENSE / INCOME                                          |
| amount                    | Decimal(18,4)?                 | positive when set                                         |
| currency                  | String?                        | ISO 4217; required when `amount` set                      |
| bankAccountId             | String? FK → bank-account      | `SetNull`                                                 |
| cardId                    | String? FK → card-account      | `SetNull`; requires `bankAccountId` when written          |
| categoryId                | String? FK → category          | `SetNull`                                                 |
| recurringExpenseId        | String? FK → recurring-expense | `SetNull`                                                 |
| description               | String?                        | ≤ 500                                                     |
| observation               | String?                        | ≤ 500                                                     |
| emisor / receptor / lugar | String?                        | ≤ 200                                                     |
| financeCharge             | Boolean default false          | only EXPENSE, never with card                             |
| customFieldValues         | Json default `{}`              | `{ [customFieldId]: boolean \| string }`                  |
| createdAt/updatedAt       | DateTime                       |                                                           |

Indexes: `@@unique([userId, nameKey])`, `@@index([bankAccountId])`, `@@index([cardId])`,
`@@index([categoryId])`, `@@index([recurringExpenseId])` (FK lookups for `SET NULL`).

## Invariants (aggregate `MovementTemplate`)

- Name non-empty after trim, ≤ 60; `nameKey` derived.
- `financeCharge ⇒ type = EXPENSE ∧ cardId = null`.
- `cardId ⇒ bankAccountId`.
- `amount ⇒ currency`.
- At most `MOVEMENT_TEMPLATE_MAX` (50) per user (checked by the create handler).

## Read model

`toContract(existingFieldIds)` drops `customFieldValues` keys whose field no longer exists.
No lifecycle states: a template exists or it doesn't.
