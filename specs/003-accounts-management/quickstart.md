# Quickstart & Validation: Accounts Management

Run: `pnpm dev` (api :3001, web :5173). Log in (`demo@finance.local` / `demo1234`).

| # | Scenario | Expected | Maps to |
|---|----------|----------|---------|
| 1 | Create one account of each type | All 6 types listed with correct label, status badge, balance | SC-001 |
| 2 | Open detail → edit a field → save | Change persists | SC-002 |
| 3 | Delete an account that has transactions | Account gone; its transactions remain (bankAccountId null) | SC-002 |
| 4 | Toggle status; set filter all/active/inactive | Badge updates; filtered list matches | SC-003 |
| 5 | Set initialBalance, ensure linked income/expense exist, reconcile | currentBalance = initial + Σincome − Σexpense (exact) | SC-004 |
| 6 | Reconcile with no linked transactions | currentBalance = initialBalance | SC-004 |
| 7 | Switch language es/en | All type/status/action/filter labels translate | SC-005 |
| 8 | Try another user's account id | 404 (not found) | SC-006 |
| 9 | Visual review | Page header + form + card/badges + states from design system | SC-007 |
| 10 | `pnpm test`, `pnpm build`, `pnpm check:boundaries` | All green | — |

See [contracts/accounts-api.md](./contracts/accounts-api.md) and [data-model.md](./data-model.md).
