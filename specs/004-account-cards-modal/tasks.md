# Tasks: Account Creation Modal + Cards

**Feature**: specs/004-account-cards-modal | **Plan**: [plan.md](./plan.md)

## Phase 1: Schema & contracts
- [x] T001 Prisma: `AccountType += VISTA`; add `CardKind` enum, `Card`, `CardLimit` models (Card `onDelete: Cascade` from account; CardLimit `@@unique([cardId,currency])`) in `apps/api/prisma/schema.prisma`; db push + generate
- [x] T002 Contracts (`packages/contracts/src/accounts/index.ts`): `cardKind`, `cardLimitSchema`, `cardSchema`, `createCardSchema` (last4 `^\d{4}$`), add `cards?` to create + `cards` to response; +VISTA; rebuild

## Phase 2: Backend
- [x] T003 `cards.repository.ts`: create/update/remove scoped via account+userId; include limits
- [x] T004 `accounts.repository.ts`: include `cards.limits` on findOne/list; support nested create-with-cards
- [x] T005 `cards.service.ts`: validate last4 (4 digits), DEBIT⇒no limits, unique currency; CRUD; toContract
- [x] T006 `accounts.service.ts`: create accepts `cards`; `toContract` maps `cards`
- [x] T007 `accounts.controller.ts`: `POST/PATCH/DELETE /accounts/:id/cards[/:cardId]`; create accepts cards
- [x] T008 [P] Tests `cards.service.spec.ts`: rejects >4-digit, debit-no-limits, dup-currency, scoping
- [x] T009 Register `CardsService`/`CardsRepository` in `accounts.module.ts`

## Phase 3: Frontend
- [x] T010 Add `@radix-ui/react-dialog`; `shared/ui/dialog.tsx` primitive (tokens, a11y)
- [x] T011 [P] `domains/accounts/api/cardsApi.ts` + `hooks/useCards.ts` (create/update/remove, invalidate account)
- [x] T012 [P] `components/CardPreview.tsx` — card-style visual from form state (masked `•••• last4`)
- [x] T013 `components/CardForm.tsx` — name, kind, number→**last4 client-side only**, expiry MM/YY, limits (credit)
- [x] T014 `components/AccountCreateModal.tsx` — Dialog: account fields + live `CardPreview` + add/remove cards → create
- [x] T015 `routes/AccountsRoute.tsx` — "new account" opens the modal (replace inline form)
- [x] T016 `routes/AccountDetailRoute.tsx` — list cards (masked) + add/edit/remove via dialog
- [x] T017 [P] i18n es/en: VISTA, card kind, limit/used, expiry, card actions, modal labels
- [x] T018 [P] Web tests: modal opens + preview; CardForm sends only last4 (mask); detail card list

## Phase 4: Polish & verify
- [x] T019 Memory sync: CLAUDE.md data-model (Card/CardLimit, VISTA) + dep `@radix-ui/react-dialog` + `dialog` primitive
- [x] T020 Verify: api+web tests, `pnpm build`, `pnpm check:boundaries`; security check (payload shows only last4)

**Totals**: 20 tasks. Dependencies: T001-002 → backend T003-009 → frontend T010-018 → T019-020.
