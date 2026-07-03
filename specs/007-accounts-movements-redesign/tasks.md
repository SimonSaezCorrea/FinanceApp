# Tasks: Rediseño Cuentas y Movimientos con tarjetas secundarias

**Feature**: 007-accounts-movements-redesign · **Branch**: `007-accounts-movements-redesign`
**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [research.md](./research.md), [quickstart.md](./quickstart.md)

**Tests**: incluidos (Principio IV Test-First es NON-NEGOTIABLE en la constitución). Los tests de lógica de dinero/cupo y reglas se escriben antes de la implementación.

**Convenciones**: money nunca float (decimal strings + `@finance/money`); toda query scoped por `userId`; i18n es/en paridad; errores como códigos. `[P]` = paralelizable (archivos distintos, sin dependencias pendientes).

---

## Phase 1: Setup

- [x] T001 Verificar entorno: `pnpm install` y `pnpm --filter @finance/api exec prisma generate` corren limpios; confirmar branch `007-accounts-movements-redesign` activo.

---

## Phase 2: Foundational (bloquea todas las user stories)

Cambios de esquema y contrato compartidos por varias historias.

- [x] T002 Extender `apps/api/prisma/schema.prisma`: `BankAccount.accountNumber String?`; `Card.parentCardId String?` con auto-relación `@relation("CardChildren", fields:[parentCardId], references:[id], onDelete: Cascade)` + inversa `children Card[]` + `@@index([parentCardId])`; `CardLimit.initialUsed Decimal @default(0) @db.Decimal(18,4)`.
- [x] T003 Crear migración Prisma `secondary_cards` en `apps/api/prisma/migrations/`: añade columnas y **backfill `initialUsed = used`**; luego elimina la columna `CardLimit.used` (pasa a derivada). Verificar con `prisma migrate dev`.
- [x] T004 [P] Actualizar contrato accounts en `packages/contracts/src/accounts/index.ts`: `bankAccountSchema.accountNumber` (nullable) + create/update `accountNumber` opcional; `cardLimitSchema` → `initialUsed` (entrada) + `used` (salida derivada); `cardSchema.parentCardId` (nullable) + `createCardSchema.parentCardId` opcional. (ver contracts/accounts.md)
- [x] T005 [P] Actualizar contrato transactions en `packages/contracts/src/transactions/index.ts`: `createTransactionSchema.bankAccountId` **requerido** + refine `INCOME ⇒ !cardId`. (ver contracts/transactions.md)
- [x] T006 [P] Definir/registrar nuevos códigos de error en el mapa i18n de errores del frontend (`apps/web/src/i18n/es.json` y `en.json`, sección `errors`): `CARD_REQUIRED`, `CARD_NOT_ALLOWED`, `CARD_ACCOUNT_MISMATCH`, `CARD_LIMIT_EXCEEDED`, `CARD_SUBLIMIT_EXCEEDED`, `PARENT_CARD_INVALID` (paridad es/en).
- [x] T007 Compilar contratos (`pnpm --filter @finance/contracts build`) y `pnpm typecheck` para propagar tipos a apps.

**Checkpoint**: esquema migrado, contratos y tipos disponibles para las historias.

---

## Phase 3: User Story 1 — Tarjeta secundaria de crédito con cupo compartido (P1) 🎯 MVP

**Goal**: modelar secundarias de crédito con pool compartido + sub-tope; `used` derivado.
**Independent Test**: crear principal (tope 1M) + secundaria (sub-tope 300k); gasto 100k en secundaria ⇒ used principal=100k y secundaria=100k; gasto 100k en principal ⇒ principal=200k, secundaria=100k; exceder sub-tope/pool ⇒ rechazo.

### Tests (TDD — escribir primero, deben fallar)

- [x] T008 [P] [US1] Test unitario del cálculo de `used` derivado + agregación de secundarias en `apps/api/src/domains/accounts/accounts.service.spec.ts` (initialUsed + Σ gastos; principal agrega hijas; secundaria solo propia).
- [x] T009 [P] [US1] Test de integridad de padre en `apps/api/src/domains/accounts/cards.service.spec.ts` (padre inexistente/otra cuenta/otro user/ya-secundario/kind incompatible ⇒ `PARENT_CARD_INVALID`); incluir caso **débito secundario**: `parentCardId` permitido pero SIN lógica de tope/pool (FR-016).

### Implementación

- [x] T010 [US1] `apps/api/src/domains/accounts/cards.repository.ts`: crear/actualizar con `parentCardId` e `initialUsed`; incluir `parent`/`children` donde haga falta.
- [x] T011 [US1] `apps/api/src/domains/accounts/cards.service.ts`: aceptar `parentCardId` + `initialUsed`; validar integridad del padre (mismo user/cuenta, 1 nivel, kind compatible) → `PARENT_CARD_INVALID`; `limitsFor` mapea `initialUsed`.
- [x] T012 [US1] `apps/api/src/domains/accounts/accounts.repository.ts`: método `sumExpensesByCard(userId, cardIds[])` (`groupBy cardId`, `type=EXPENSE`, `sum(amount)`, scoped `userId`).
- [x] T013 [US1] `apps/api/src/domains/accounts/accounts.service.ts`: computar `used` derivado por tarjeta/moneda on-read (una query por listado, patrón `attachSeries`); principal = propio + Σ hijas; exponer `initialUsed` + `used` en `toContract`; incluir `accountNumber` y `parentCardId`.
- [x] T014 [P] [US1] Frontend `apps/web/src/domains/accounts/components/CardForm.tsx`: campo selector de tarjeta principal (parentCardId, opcional) y campo `initialUsed` para crédito; `api/cardsApi.ts` + `hooks/useCards.ts` envían los nuevos campos.

**Checkpoint**: US1 verificable vía API + creación de tarjeta secundaria en UI.

---

## Phase 4: User Story 2 — Registrar movimientos por banco y tarjeta (P1)

**Goal**: banco obligatorio; gasto no-efectivo exige tarjeta; gasto efectivo/ingreso sin tarjeta; enforcement de cupo.
**Independent Test**: gasto no-efectivo sin tarjeta ⇒ `CARD_REQUIRED`; gasto efectivo con tarjeta ⇒ `CARD_NOT_ALLOWED`; ingreso con tarjeta ⇒ `CARD_NOT_ALLOWED`; gasto de crédito que excede ⇒ `CARD_LIMIT_EXCEEDED`/`CARD_SUBLIMIT_EXCEEDED`.

### Tests (TDD)

- [x] T015 [P] [US2] Tests de reglas banco/tarjeta/tipo en `apps/api/src/domains/transactions/transactions.service.spec.ts` (los 4 casos de reglas + banco requerido).
- [x] T016 [P] [US2] Tests de enforcement de cupo (sub-tope y pool) en `apps/api/src/domains/transactions/transactions.service.spec.ts`.

### Implementación

- [x] T017 [US2] `apps/api/src/domains/transactions/transactions.service.ts`: al crear, resolver cuenta (scoped `userId`); aplicar reglas tipo/tarjeta/efectivo (`CARD_REQUIRED`/`CARD_NOT_ALLOWED`/`CARD_ACCOUNT_MISMATCH`); si tarjeta de crédito, enforcement de cupo (`used(card)+amount ≤ subLimit`; `usedTotal(principal)+amount ≤ limit`).
- [x] T018 [US2] Exponer helper de cálculo de `used` reutilizable (compartir con accounts.service o mover a un util del dominio) para el enforcement en escritura sin duplicar lógica.
- [x] T019 [P] [US2] Frontend `apps/web/src/domains/transactions/components/TransactionCreateModal.tsx`: banco requerido; al elegir banco, cargar sus tarjetas; para EXPENSE en cuenta no-efectivo exigir tarjeta; ocultar/limpiar tarjeta si INCOME o cuenta CASH; mostrar errores de cupo mapeados.

**Checkpoint**: creación de movimientos cumple reglas y actualiza `used` derivado.

---

## Phase 5: User Story 3 — CRUD de movimientos desde ambas vistas (P1)

**Goal**: crear/editar/eliminar movimientos desde vista global y vista de Cuenta, con formato unificado y recálculo de saldos/cupos.
**Independent Test**: editar un gasto (cambiar tarjeta A→B) recalcula used en A y B; eliminar recalcula saldo y cupo; ambas vistas usan el mismo formato.

### Tests (TDD)

- [x] T020 [P] [US3] Tests de edición con traspaso de `used` entre tarjetas y de eliminación (recálculo) en `apps/api/src/domains/transactions/transactions.service.spec.ts`.

### Implementación

- [x] T021 [US3] `apps/api/src/domains/transactions/transactions.service.ts`: en `update`, re-validar reglas y re-aplicar enforcement excluyendo el estado previo del movimiento (traspaso correcto); `remove` ya recalcula por ser `used` derivado.
- [x] T022 [US3] Frontend: unificar el componente de fila/tabla — usar `apps/web/src/domains/transactions/components/TransactionTable.tsx` con acciones **editar** y **eliminar** por fila (botones + `ConfirmDialog`); wire `useTransactionMutations.update/remove` en `apps/web/src/domains/transactions/routes/TransactionsRoute.tsx`.
- [x] T023 [US3] `TransactionCreateModal.tsx`: soportar modo edición (prefill + `update.mutate`); reutilizar como create/edit.
- [x] T024 [US3] `apps/web/src/domains/accounts/routes/AccountDetailRoute.tsx`: reemplazar la lista `<ul>` propia de movimientos por `TransactionTable` (mismo formato) con CRUD, filtrado por `bankAccountId` de la cuenta.

**Checkpoint**: CRUD completo y congruente en ambas vistas.

---

## Phase 6: User Story 4 — Filtro banco→tarjeta e inactivas con tag (P2)

**Goal**: filtrar por banco y luego por tarjeta (server-side), incluir inactivas con tag.
**Independent Test**: seleccionar banco muestra filtro de tarjeta; seleccionar tarjeta envía `cardId` y filtra; activar "incluir inactivas" muestra inactivas con tag "Inactiva".

- [x] T025 [US4] **FIX** `apps/web/src/domains/transactions/api/transactionsApi.ts`: `toQuery` debe serializar `cardId` (hoy se omite).
- [x] T026 [US4] `apps/web/src/domains/transactions/routes/TransactionsRoute.tsx`: al elegir tarjeta, mantener `bankAccountId` del padre y enviar `cardId` (no ponerlo en `undefined`).
- [x] T027 [P] [US4] `apps/web/src/domains/transactions/components/TransactionFiltersBar.tsx`: filtro banco→tarjeta claro; cuentas inactivas (con `showInactiveAccounts`) muestran tag/badge "Inactiva" (primitivo `badge`).
- [x] T028 [P] [US4] i18n: clave del tag "Inactiva"/"Inactive" en `es.json`/`en.json` (paridad).

**Checkpoint**: filtro banco→tarjeta funcional server-side; inactivas etiquetadas.

---

## Phase 7: User Story 5 — Vista de Cuenta rediseñada y congruente (P2)

**Goal**: quitar duplicados (Tarjetas/Información), tarjetas uniformes, número de cuenta en preview, "Añadir tarjeta" en modal.
**Independent Test**: cuenta con 3 tarjetas ⇒ 3 visuales uniformes sin duplicado; sin secciones Tarjetas/Información en el main; info en sidebar; número de cuenta visible; "Añadir tarjeta" abre modal.

- [x] T029 [US5] `apps/web/src/domains/accounts/routes/AccountDetailRoute.tsx`: eliminar del cuerpo principal las tabs `cards` e `info` (quitar `CardsTab`/`InfoTab` del main); dejar movimientos como contenido principal.
- [x] T030 [US5] Sidebar: renderizar **todas** las tarjetas de la cuenta con un único visual (`AccountVisualCard`), sin el listado duplicado; mover el contenido de "Información" (DetailRows) al sidebar.
- [x] T031 [P] [US5] `apps/web/src/domains/accounts/components/AccountVisualCard.tsx`: mostrar `accountNumber` (completo) en la preview; asegurar formato uniforme para principal y secundarias (indicar "secundaria" si `parentCardId`).
- [x] T032 [US5] Crear `apps/web/src/domains/accounts/components/CardCreateModal.tsx` (envuelve `CardForm` en `Dialog`); "Añadir tarjeta" del sidebar abre este modal (reemplaza el toggle inline / `setTab`).
- [x] T033 [P] [US5] `apps/web/src/domains/accounts/components/AccountForm.tsx` + `AccountCreateModal.tsx`: campo "número de cuenta" (accountNumber) en crear/editar cuenta.

**Checkpoint**: vista de Cuenta limpia, uniforme y con modal.

---

## Phase 8: Polish & Cross-Cutting

- [x] T034 [P] i18n: revisar paridad completa es/en de todas las claves nuevas (número de cuenta, initialUsed, parentCardId/secundaria, edit/delete movimiento, tag inactiva, errores CARD_*).
- [x] T035 [P] Actualizar READMEs de dominio si aplica y limpiar componentes muertos (`CardPreview.tsx` si queda sin uso; listas `<ul>` reemplazadas).
- [x] T036 Ejecutar gates: `pnpm check:boundaries`, `pnpm typecheck`, `pnpm test`, `pnpm build` — todos verdes.
- [x] T037 Validar escenarios de [quickstart.md](./quickstart.md) end-to-end (pool, reglas, CRUD, filtro, vista).
- [x] T038 Memory-sync (fase `/sdd`): actualizar `.specify/memory/constitution.md` (bump versión) y `CLAUDE.md` (accounts: accountNumber, parentCardId/pool, CardLimit initialUsed+derivado; transactions: reglas + CRUD + filtro; nuevos error codes).

---

## Dependencies & Order

- **Setup (P1)** → **Foundational (P2)** bloquea todo.
- **US1 (P3)** es el MVP; **US2 (P4)** depende de US1 (usa `used`/enforcement). **US3 (P5)** depende de US2 (edición/eliminación sobre las reglas). **US4 (P6)** y **US5 (P7)** son en gran parte frontend independientes; US4/US5 pueden ir en paralelo tras US3. **Polish (P8)** al final.
- Backend antes que su frontend dentro de cada historia.

## Parallel Opportunities

- Foundational: T004, T005, T006 en paralelo (archivos distintos) tras T002/T003.
- US1: T008/T009 (tests) en paralelo; T014 (frontend) en paralelo con backend una vez definido el contrato.
- US4 y US5 pueden desarrollarse en paralelo (dominios/archivos distintos) tras US3.
- Polish: T034/T035 en paralelo.

## MVP

**User Story 1** (Phase 3) sobre Setup+Foundational = MVP demostrable: modelar y verificar el pool de cupo compartido de tarjetas secundarias de crédito.
