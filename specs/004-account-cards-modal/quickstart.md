# Quickstart & Validation: Account Modal + Cards

Run `pnpm dev`; log in (`demo@finance.local` / `demo1234`).

| # | Scenario | Expected | Maps to |
|---|----------|----------|---------|
| 1 | Click "new account" | A modal opens with a card-style preview + account fields | SC-001 |
| 2 | Type type/bank/balance/currency | Preview updates live | SC-001 |
| 3 | Add a debit card | No limit fields shown/required | SC-002 |
| 4 | Add a credit card with 2 currency limits (+used) | Both `{currency,limit,used}` captured | SC-002 |
| 5 | Type a full card number, save; inspect Network | Request body contains only `last4` (no full PAN) | SC-003 |
| 6 | View any saved card | Shows `•••• 1234` only; no CVV anywhere | SC-003, FR-013 |
| 7 | Account detail → add/edit/remove a card | Changes persist | SC-004 |
| 8 | Money values (balance/limits/used) | Exact to schema precision | SC-005 |
| 9 | Switch es/en | All new labels translate | SC-006 |
| 10 | Another user's account/card id | 404 | SC-007 |
| 11 | `pnpm test` / `pnpm build` / `pnpm check:boundaries` | green | — |

Security check (critical): in DevTools Network, the create/card request payload must show only the
4-digit `last4`, never the full number; grep the codebase — no full PAN is ever stored or logged.

See [contracts/cards-api.md](./contracts/cards-api.md) and [data-model.md](./data-model.md).
