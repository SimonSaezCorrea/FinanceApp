# Implementation Plan: Plantillas de movimientos

**Branch**: `037-movement-templates` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/037-movement-templates/spec.md`

## Summary

A person keeps up to 50 reusable movement templates (everything a hand-made income/expense
carries except its date; the amount optional). A new table-domain `movement-template` (four DDD
layers + leaf data module) exposes `GET/POST /movement-templates` and `PUT/DELETE
/movement-templates/:id`, ownership-verifying every reference and keeping them as `SetNull` FKs so
a deleted account/card/category/series degrades the template instead of blocking the delete. The
web gains a "Plantillas" screen (`/templates`, sidebar group Configuración) that edits templates
with the movement form itself (`TransactionFormPanel` in a new `templateMode`), and the
new-movement form gains "Usar plantilla" (pure `applyTemplate` pre-fill) and "Guardar como
plantilla". Using a template creates nothing: the movement is saved by the existing `POST
/transactions`.

## Technical Context

**Language/Version**: TypeScript 6, Node 22

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs`, Prisma 7 (adapter-pg), zod 4 (`@finance/contracts`), React 19 + TanStack Query + react-router v8 (web). No new dependency.

**Storage**: PostgreSQL 16 — one new table `movement-template` via a hand-written expand-only migration `20261025120000_movement_templates`.

**Testing**: Vitest — contracts unit; API unit (aggregate, handlers with fake ports), integration (Prisma adapter, SetNull behaviour), e2e (HTTP); web component/lib tests; i18n parity.

**Target Platform**: AWS EC2 API + Cloudflare Pages SPA.

**Project Type**: web-service + SPA (monorepo).

**Performance Goals**: list ≤ 50 rows per user; trivial.

**Constraints**: no change to `POST /transactions` nor to `MovementPolicy`; migration must be compatible with the previous code (new table only).

**Scale/Scope**: ≤ 50 templates per user.

## Constitution Check

- **I Money**: `amount` is `Decimal(18,4)` / `moneyString`; never a float. ✅
- **II Isolation**: every query scoped by `userId`; every body FK (account, card, category,
  recurring series, custom field ids) verified before persisting in
  `application/template-references.ts` (R4); foreign id → 404, never 403. ✅
- **III i18n**: `templates.*`, `nav.templates`, `errors.MOVEMENT_TEMPLATE_*` in es + en. ✅
- **IV Test-first**: aggregate/handler/adapter/e2e/web tests written with the code. ✅
- **V SDD**: this spec chain; memory sync handed to the coordinator. ✅
- **VI DDD/CQRS**: new folder `domains/movement-template/` (domain/application/infrastructure/
  presentation), the only adapter touching `prisma.movementTemplate`; other tables read only via
  their leaf ports (`BankAccountDataModule`, `CardAccountDataModule`, `CategoryDataModule`,
  `RecurringExpenseDataModule`, `CustomFieldDataModule`). No other domain depends on it (acyclic). ✅
- **VII Idempotency**: POST form (b) unique `(userId, nameKey)`; PUT form (b) absolute state;
  DELETE form (a) terminal. No money moves. ✅
- **VIII Identifiers**: `@default(uuid(7))`; every id param/body field is `rowId`. ✅

**Data gates:**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de Identificadores.
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface.
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership.

## Project Structure

### Documentation (this feature)

```text
specs/037-movement-templates/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/contracts/src/movement-templates/{index.ts,movement-templates.test.ts}
packages/contracts/src/index.ts                      # export * as movementTemplates
packages/i18n/src/{es,en}.json                       # templates.*, nav.templates, errors.*
apps/api/prisma/schema.prisma                        # MovementTemplate + back-relations
apps/api/prisma/migrations/20261025120000_movement_templates/migration.sql
apps/api/src/domains/movement-template/
├── domain/{movement-template.aggregate.ts,errors.ts,ports/movement-template.repository.port.ts}
├── application/template-references.ts
├── application/commands/{movement-template.commands.ts,create-*.handler.ts,replace-*.handler.ts,remove-*.handler.ts}
├── application/queries/{movement-template.queries.ts,list-movement-templates.handler.ts}
├── infrastructure/prisma-movement-template.repository.ts
├── presentation/movement-templates.controller.ts
├── movement-template.data.module.ts
└── movement-template.module.ts
apps/api/src/app.module.ts
apps/api/test/{unit,integration,e2e}/domains/movement-template/
apps/web/src/domains/movement-templates/
├── api/movementTemplatesApi.ts  hooks/useMovementTemplates.ts
├── lib/{applyTemplate.ts,templateFromForm.ts}(+tests)
├── components/{TemplateFormModal.tsx,TemplatePicker.tsx,SaveAsTemplateDialog.tsx}
└── routes/TemplatesRoute.tsx(+test)
apps/web/src/domains/transactions/components/{TransactionFormPanel.tsx,TransactionCreateModal.tsx}
apps/web/src/app/{AppLayout.tsx,router.tsx,lazyPages.ts}
apps/web/src/domains/profile/lib/personalData.ts     # JSON export includes templates
```

**Structure Decision**: mirror `custom-field` (specs/036): table-domain in the API, frontend domain
`movement-templates`, route `/templates`.

## Complexity Tracking

None.
