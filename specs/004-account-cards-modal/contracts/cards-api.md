# Cards API Contract (nested under accounts)

Base `/api/v1/accounts` (JwtAuthGuard, scoped to user). Money = decimal strings. **Card payloads
carry only `last4` — never a full PAN; no CVV field exists.**

## Account endpoints (extended)

- `POST /accounts` — body `createBankAccount` may include `cards: createCard[]` → creates account +
  cards + limits together; returns `BankAccount` with `cards[]`.
- `GET /accounts` / `GET /accounts/:id` — `BankAccount` now includes `cards[]`.

## Card sub-resource

| Method | Path                          | Body                 | Returns      |
| ------ | ----------------------------- | -------------------- | ------------ |
| POST   | `/accounts/:id/cards`         | `createCard`         | `Card` (201) |
| PATCH  | `/accounts/:id/cards/:cardId` | partial `createCard` | `Card`       |
| DELETE | `/accounts/:id/cards/:cardId` | —                    | 204          |

## Shapes

```
CardKind = "CREDIT" | "DEBIT"
CardLimit { currency, limit: moneyString, used: moneyString }
Card { id, name, kind, last4, expiryMonth, expiryYear, limits: CardLimit[] }
createCard {
  name, kind,
  last4: string matching ^\d{4}$,     // client-derived; full PAN never sent
  expiryMonth: 1..12, expiryYear: int,
  limits?: { currency, limit: moneyString, used: moneyString }[]   // credit only
}
createBankAccount { ...(003 fields), cards?: createCard[] }
BankAccount { ...(003 fields), cards: Card[] }
```

## Rules / errors

- `last4` must be exactly 4 digits → else `VALIDATION_FAILED`. Backend rejects longer values.
- DEBIT card with limits → `VALIDATION_FAILED`. Duplicate currency in limits → `VALIDATION_FAILED`.
- `CARD_NOT_FOUND` (404) if the card isn't under the user's account.
- All scoped to the authenticated user (account must belong to them).
