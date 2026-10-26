# Tasks: Plantillas de movimientos

**Input**: Design documents from `/specs/037-movement-templates/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

**Tests**: included (Constitution IV, test-first).

## Phase 1: Setup

- [x] T001 Add the `movementTemplates` contract module (schema, `saveMovementTemplateSchema` with refines, `MOVEMENT_TEMPLATE_MAX`=50, `MOVEMENT_TEMPLATE_NAME_MAX`=60, `normalizeTemplateName`) in packages/contracts/src/movement-templates/index.ts and export it from packages/contracts/src/index.ts
- [x] T002 [P] Contract tests (refines, positive amount, name trim/limits) in packages/contracts/src/movement-templates/movement-templates.test.ts

## Phase 2: Foundational (blocking)

- [x] T003 Add model `MovementTemplate` + back-relations on User/BankAccount/CardAccount/Category/RecurringExpense in apps/api/prisma/schema.prisma
- [x] T004 Hand-write expand-only migration apps/api/prisma/migrations/20261025120000_movement_templates/migration.sql and run `prisma generate`
- [x] T005 [P] Domain errors in apps/api/src/domains/movement-template/domain/errors.ts
- [x] T006 Aggregate `MovementTemplate` (planFromInput, replace, invariants, toContract filtering stale field ids) in apps/api/src/domains/movement-template/domain/movement-template.aggregate.ts
- [x] T007 [P] Repository port in apps/api/src/domains/movement-template/domain/ports/movement-template.repository.port.ts
- [x] T008 Prisma adapter (scoped by userId, P2002 → NAME_TAKEN) in apps/api/src/domains/movement-template/infrastructure/prisma-movement-template.repository.ts and leaf module movement-template.data.module.ts
- [x] T009 Reference verification helper (account, card on account, category, recurring, custom fields) in apps/api/src/domains/movement-template/application/template-references.ts
- [x] T010 Commands/queries + handlers (create with limit, replace, remove, list) in apps/api/src/domains/movement-template/application/
- [x] T011 Facade controller `GET/POST /movement-templates`, `PUT/DELETE /movement-templates/:id` in apps/api/src/domains/movement-template/presentation/movement-templates.controller.ts; module movement-template.module.ts; register in apps/api/src/app.module.ts
- [x] T012 [P] Unit tests for the aggregate and handlers (fake ports) in apps/api/test/unit/domains/movement-template/
- [x] T013 [P] Integration test for the adapter incl. SetNull on deleting the account/card/category and the unique name in apps/api/test/integration/domains/movement-template/
- [x] T014 [P] e2e HTTP test (CRUD, isolation 404, foreign FK 404, limit 409, name 409, card of another account 404) in apps/api/test/e2e/domains/movement-template/movement-templates.http.spec.ts
- [x] T015 [P] i18n keys `templates.*`, `nav.templates`, `errors.MOVEMENT_TEMPLATE_*` in packages/i18n/src/es.json and en.json

## Phase 3: User Story 2 — Gestionar mis plantillas (P1)

**Goal**: list/create/edit/delete templates on `/templates`. **Independent test**: CRUD from the screen.

- [x] T016 [US2] Web API client + hooks in apps/web/src/domains/movement-templates/api/movementTemplatesApi.ts and hooks/useMovementTemplates.ts
- [x] T017 [US2] `templateMode` prop on apps/web/src/domains/transactions/components/TransactionFormPanel.tsx (no date, no projected balance, no Prepagar/Traspaso)
- [x] T018 [US2] Pure `templateFromForm` (+ test) in apps/web/src/domains/movement-templates/lib/templateFromForm.ts
- [x] T019 [US2] `TemplateFormModal` (name + TransactionFormPanel) in apps/web/src/domains/movement-templates/components/TemplateFormModal.tsx
- [x] T020 [US2] `TemplatesRoute` (list, empty state, edit, delete confirm) in apps/web/src/domains/movement-templates/routes/TemplatesRoute.tsx + test
- [x] T021 [US2] Nav item (group Configuración + Más sheet), route `/templates`, lazy page in apps/web/src/app/{AppLayout.tsx,router.tsx,lazyPages.ts}

## Phase 4: User Story 1 — Usar una plantilla (P1)

**Goal**: "Usar plantilla" pre-fills the new-movement form. **Independent test**: pick a template, form filled, save normally.

- [x] T022 [US1] Pure `applyTemplate` (+ tests for every degradation edge case) in apps/web/src/domains/movement-templates/lib/applyTemplate.ts
- [x] T023 [US1] `TemplatePicker` in apps/web/src/domains/movement-templates/components/TemplatePicker.tsx and wire into apps/web/src/domains/transactions/components/TransactionCreateModal.tsx (create only), with a test in apps/web/src/domains/transactions/components/TransactionCreateModal.test.tsx (picking a template fills the form; nothing is created until Guardar)

## Phase 5: User Story 3 — Guardar como plantilla (P2)

- [x] T024 [US3] `SaveAsTemplateDialog` (name + keep amount) in apps/web/src/domains/movement-templates/components/SaveAsTemplateDialog.tsx and "Guardar como plantilla" action in TransactionCreateModal.tsx (EXPENSE/INCOME only, create only)
- [x] T025 [US3] Test for the save-as flow (written in apps/web/src/domains/transactions/components/TransactionCreateModal.test.tsx, where the action lives)

## Phase 6: Polish

- [x] T026 [P] JSON personal-data export includes `movementTemplates` in apps/web/src/domains/profile/lib/personalData.ts
- [x] T027 Remove "plantillas" from docs/PENDING.md (Movimientos §1) as resolved
- [x] T028 Run scoped tests, typecheck, lint, check:boundaries, prettier, integration via `pnpm test:integration:local`

## Dependencies

Setup → Foundational → US2 → US1 → US3 → Polish. US1 needs templates to exist (US2 or the API).
T012–T015 parallel after T011.

## Implementation Strategy

MVP = Foundational + US2 + US1. US3 is an accelerator.

## Analysis (speckit-analyze, 2026-10-25)

- C1 (MEDIUM, coverage): the form wiring of US1 had no test task → T023 now includes one. Fixed.
- F1 (LOW, consistency): FR-010 names "categoría" although the category catalogue is global and only the seed removes rows; kept (SetNull covers it, harmless).
- No constitution conflicts; every FR has ≥ 1 task (FR-015 → T003 cascade + T026).
