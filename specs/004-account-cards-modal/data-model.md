# Phase 1 Data Model: Account Modal + Cards

## Enums

- `AccountType` += `VISTA` (now CHECKING, SAVINGS, VISTA, + legacy CREDIT_CARD, DEBIT_CARD, CASH, OTHER).
- `CardKind` = `CREDIT | DEBIT` (new).

## Card (new)

| Field                 | Type          | Notes                                                   |
| --------------------- | ------------- | ------------------------------------------------------- |
| id                    | String (cuid) |                                                         |
| accountId             | String        | FK → BankAccount, `onDelete: Cascade`                   |
| userId                | String        | owner; scoping (denormalized for direct scoped queries) |
| name                  | String        |                                                         |
| kind                  | `CardKind`    | CREDIT or DEBIT                                         |
| last4                 | String        | **exactly 4 digits** — the only PAN data stored         |
| expiryMonth           | Int           | 1–12                                                    |
| expiryYear            | Int           | e.g. 2028                                               |
| createdAt / updatedAt | DateTime      |                                                         |
| limits                | CardLimit[]   | only for credit cards                                   |

Indexes: `@@index([accountId])`, `@@index([userId])`.

## CardLimit (new)

| Field    | Type          | Notes                          |
| -------- | ------------- | ------------------------------ |
| id       | String (cuid) |                                |
| cardId   | String        | FK → Card, `onDelete: Cascade` |
| currency | String        | ISO code                       |
| limit    | Decimal(18,4) | credit limit                   |
| used     | Decimal(18,4) | used amount                    |
|          |               | `@@unique([cardId, currency])` |

## Validation rules

- `last4`: matches `^\d{4}$`. The full PAN is never accepted/stored (client sends only last4).
- `kind = DEBIT` ⇒ `limits` empty. `kind = CREDIT` ⇒ 0..N limits, unique currency each.
- `expiryMonth ∈ [1,12]`; `expiryYear` a 4-digit year.
- money (limit/used) as decimal strings on the boundary.

## Contract types (`packages/contracts/src/accounts`)

- `cardKind` enum; `cardLimitSchema { currency, limit, used }`;
- `cardSchema { id, name, kind, last4, expiryMonth, expiryYear, limits[] }` (response);
- `createCardSchema { name, kind, last4 (regex ^\d{4}$), expiryMonth, expiryYear, limits? }`;
- `createBankAccountSchema` gains optional `cards: createCardSchema[]`;
- `bankAccountSchema` response gains `cards: cardSchema[]`.
- masking is a display concern (UI shows `•••• <last4>`).
