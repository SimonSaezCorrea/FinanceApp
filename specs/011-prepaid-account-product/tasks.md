---
description: "Task list for 011 — Cuenta prepago como producto independiente"
---

# Tasks: Cuenta prepago como producto independiente

**Input**: Design documents from `/specs/011-prepaid-account-product/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/accounts.md](./contracts/accounts.md)

**Tests**: incluidos y **obligatorios** — la constitución declara TDD NO NEGOCIABLE (Principio IV):
cada regla nueva entra primero como test que falla.

**Organization**: por historia de usuario, en orden de prioridad. Cada fase es un incremento
entregable y verificable por separado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1..US4 según [spec.md](./spec.md)

## Path Conventions

Monorepo: `packages/contracts/src/`, `apps/api/src/` + `apps/api/test/{unit,integration,e2e}/`,
`apps/web/src/`. Rutas exactas en cada tarea.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dejar el esquema y el cliente Prisma listos para el modelo nuevo.

- [x] T001 Añadir `PREPAID` al `enum AccountType` en `apps/api/prisma/schema.prisma` (comentario: cuenta prepago, fondos provisionados)
- [x] T002 Eliminar las columnas `prepaidInitialBalance` y `prepaidBalance` del `model CardAccount` en `apps/api/prisma/schema.prisma`
- [x] T003 Regenerar el cliente y sincronizar la base local: `pnpm --filter @finance/api exec prisma generate` + `pnpm db:push` (documentado en `specs/011-prepaid-account-product/quickstart.md`)

**Checkpoint**: el esquema compila y el cliente Prisma expone `AccountType.PREPAID` sin campos de pote.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: el contrato compartido y las reglas puras de las que dependen TODAS las historias.
⚠️ Ninguna historia puede empezar antes de terminar esta fase.

### Contrato (`@finance/contracts`)

- [x] T004 [P] Añadir `"PREPAID"` a `accountType` en `packages/contracts/src/accounts/index.ts`
- [x] T005 Reemplazar `CARDABLE_ACCOUNT_TYPES`/`isCardableAccountType` por `ALLOWED_CARD_KINDS` + `allowedCardKinds()` + `isCardKindAllowed()` (y derivar `isCardableAccountType`) en `packages/contracts/src/accounts/index.ts`, según la matriz de `contracts/accounts.md`
- [x] T006 [P] Añadir `PREPAID` a `ACCOUNT_NUMBER_REQUIRED_TYPES` y dejar `institutionKindForAccountType("PREPAID")` sin filtro en `packages/contracts/src/accounts/index.ts`
- [x] T007 Eliminar `prepaidBalance`/`prepaidInitialBalance` de `cardSchema` y `createCardSchema`, y borrar `loadPrepaidCardSchema`/`LoadPrepaidCard` en `packages/contracts/src/accounts/index.ts`
- [x] T008 Añadir a `createBankAccountSchema` los refinamientos de cuenta prepago (saldo inicial no negativo; sin `creditLimit`/`creditUsedInitial`/`billingCycleDay`/`minimumPaymentPercent`; `cards[]` inline conforme a la matriz) en `packages/contracts/src/accounts/index.ts`
- [x] T009 [P] Test de la matriz y de los refinamientos en `packages/contracts/src/accounts/accounts.test.ts` (nuevo; los tests del paquete viven junto al fuente): cada par tipo↔kind válido/ inválido, y los rechazos de `createBankAccountSchema`
- [x] T010 Actualizar `packages/contracts/src/models.ts` si expone los campos eliminados

### Reglas puras de dominio (API) — test primero

- [x] T011 [P] Reescribir `apps/api/test/unit/domains/transaction/domain/prepaid-card.spec.ts` como "cuenta prepago": gasto dentro del saldo, gasto que lo excede (`PREPAID_INSUFFICIENT_BALANCE`), gasto sin tarjeta, edición con offset propio, contribución "0" al pozo de crédito
- [x] T012 [P] Test de `TransferPolicy` en `apps/api/test/unit/domains/transaction/domain/transfer-policy.spec.ts`: destino PREPAID permitido, origen PREPAID acotado por su saldo, resto sin cambios
- [x] T013 [P] Test del agregado en `apps/api/test/unit/domains/bank-account/domain/bank-account.aggregate.spec.ts`: matriz kind↔tipo (`CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT`), tipo inmutable (`ACCOUNT_TYPE_CHANGE_NOT_ALLOWED`), saldo inicial negativo (`INVALID_INITIAL_BALANCE`), sin cupo/facturación en PREPAID
- [x] T014 Añadir `currentBalance` al `AccountContext` y la regla "cuenta PREPAID nunca negativa" en `MovementPolicy.validate` (reusa `PrepaidInsufficientBalanceError`; el offset de edición pasa a evaluarse sobre el saldo de la cuenta) y eliminar `prepaidDelta`/`CardContext.prepaidBalance` en `apps/api/src/domains/transaction/domain/movement-policy.ts`
- [x] T015 Aplicar la misma regla a la pata de salida en `apps/api/src/domains/transaction/domain/transfer-policy.ts` (el contexto de cuenta gana `type` tipado + `currentBalance`)
- [x] T016 Eliminar `accountBalanceDelta` de `apps/api/src/domains/transaction/domain/balance-delta.ts` (un gasto con tarjeta prepago vuelve a mover el saldo de su cuenta)
- [x] T017 Errores de dominio: añadir `CardKindNotAllowedError` (`CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT`), `AccountTypeChangeNotAllowedError` (`ACCOUNT_TYPE_CHANGE_NOT_ALLOWED`) e `InvalidInitialBalanceError` (`INVALID_INITIAL_BALANCE`), y eliminar `PrepaidBalanceNotAllowedError`/`InvalidPrepaidBalanceError` en `apps/api/src/domains/bank-account/domain/errors.ts`
- [x] T018 Agregado `BankAccount`: añadir `assertCardKindAllowed(kind)` (matriz) MANTENIENDO `assertCardable()` para los tipos sin tarjetas — matriz vacía ⇒ `ACCOUNT_CANNOT_HAVE_CARD`, kind incorrecto ⇒ `CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT` —, añadir `assertTypeChangeAllowed` y la validación de saldo inicial, y eliminar `prepaidPot` en `apps/api/src/domains/bank-account/domain/bank-account.aggregate.ts`

**Checkpoint**: `pnpm --filter @finance/contracts test` y `pnpm --filter @finance/api test:unit` en verde;
las reglas nuevas están cubiertas sin tocar base de datos.

---

## Phase 3: User Story 1 — Registrar una cuenta prepago con su tarjeta (P1) 🎯 MVP

**Goal**: crear la cuenta prepago con sus tarjetas y verla en el listado, detalle, cartera y patrimonio.

**Independent test**: crear una cuenta prepago con saldo inicial y una tarjeta prepago; aparece en el
listado, en su detalle y en el patrimonio; agregar una segunda tarjeta muestra el mismo saldo; una
tarjeta de otro kind es rechazada, y una prepago en una corriente también.

### Tests (primero)

- [x] T019 [P] [US1] Test de `AddCardHandler`/`CreateAccountHandler` con puertos falsos en `apps/api/test/unit/domains/bank-account/application/` (matriz kind↔tipo, cards inline)
- [x] T020 [P] [US1] Test e2e en `apps/api/test/e2e/prepaid-account.e2e-spec.ts` (nuevo): `POST /accounts` con `type: "PREPAID"` + `cards[]`, `POST /accounts/:id/cards` válido e inválido, `GET /accounts/:id`

### Implementación API

- [x] T021 [US1] Aplicar la matriz en `apps/api/src/domains/bank-account/application/commands/add-card.handler.ts` y `update-card.handler.ts`
- [x] T022 [US1] Aplicar la matriz + saldo inicial + rechazo de campos de crédito en `apps/api/src/domains/bank-account/application/commands/create-account.handler.ts` (incluye el camino `cards[]` inline)
- [x] T023 [US1] Quitar `prepaidBalance`/`prepaidInitialBalance` de la entidad y del puerto en `apps/api/src/domains/card-account/domain/card-account.entity.ts` y `domain/ports/card-account.repository.port.ts` (incluye `incrementPrepaidBalanceWithTx`)
- [x] T024 [US1] Ajustar el adapter `apps/api/src/domains/card-account/infrastructure/prisma-card-account.repository.ts` a las columnas eliminadas
- [x] T025 [US1] Quitar los campos del DTO en `apps/api/src/domains/bank-account/application/queries/account-dto.mapper.ts`
- [x] T025b [US1] Aplicar `assertTypeChangeAllowed` (FR-016) en `apps/api/src/domains/bank-account/application/commands/update-account.handler.ts` y cubrir el `PATCH /accounts/:id` que intenta convertir a/desde PREPAID en `apps/api/test/e2e/prepaid-account.e2e-spec.ts`
- [x] T025c [US1] Cubrir una cuenta prepago INACTIVE en el mismo e2e (se comporta como cualquier otra cuenta inactiva; sin reglas propias)

### Implementación web

- [x] T026 [P] [US1] Añadir el tipo Prepago (etiqueta, icono, orden) en `apps/web/src/domains/accounts/components/AccountTypeToggle.tsx` y `accountVisuals.ts`
- [x] T027 [US1] `apps/web/src/domains/accounts/components/AccountCreateModal.tsx`: para PREPAID pedir emisor/moneda/número/saldo inicial, ocultar cupo y facturación, y ofrecer solo tarjetas prepago
- [x] T028 [US1] `apps/web/src/domains/accounts/components/AccountForm.tsx`: mismas restricciones al editar; el selector de tipo no permite convertir a/desde prepago
- [x] T029 [US1] `apps/web/src/domains/accounts/components/CardForm.tsx` + `CardFormPanel.tsx`: eliminar la sección "saldo cargado" y derivar los kinds ofrecidos de `allowedCardKinds(account.type)`
- [x] T030 [US1] `apps/web/src/domains/accounts/components/AccountVisualCard.tsx`: la tarjeta prepago muestra el saldo de SU CUENTA (se elimina `card.prepaidBalance`), y actualizar `AccountVisualCard.test.tsx`
- [x] T031 [US1] `apps/web/src/domains/accounts/components/CardDetailPanel.tsx` + `CardDetailSurface.tsx`: sin saldo propio ni acción "Recargar"
- [x] T032 [P] [US1] Claves i18n del tipo prepago en `apps/web/src/i18n/es.json` y `en.json` (paridad verificada por `src/i18n/parity.test.ts`)
- [x] T033 [P] [US1] Claves i18n de los errores nuevos (`CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT`, `ACCOUNT_TYPE_CHANGE_NOT_ALLOWED`, `INVALID_INITIAL_BALANCE`) y borrado de `PREPAID_BALANCE_NOT_ALLOWED`/`INVALID_PREPAID_BALANCE` en ambos catálogos
- [x] T034 [US1] Actualizar los tests de formulario afectados: `AccountCreateModal.test.tsx`, `AccountForm.test.tsx`, `CardForm.test.tsx`, `CardFormPanel.primary.test.tsx`

**Checkpoint**: se puede registrar y ver una cuenta prepago completa; la matriz se respeta en API y UI.

---

## Phase 4: User Story 2 — Gastar sin poder pasarse del saldo (P1)

**Goal**: un gasto en una cuenta prepago descuenta su saldo y nunca lo deja negativo.

**Independent test**: con saldo conocido, un gasto menor pasa y descuenta; uno mayor se rechaza sin
cambiar nada; editar y borrar revierten correctamente.

### Tests (primero)

- [x] T035 [P] [US2] Actualizar `apps/api/test/unit/domains/transaction/application/commands/create-transaction.handler.spec.ts` (gasto acotado por el saldo de la cuenta, sin pote de tarjeta)
- [x] T036 [P] [US2] Idem `update-transaction.handler.spec.ts` (offset propio en la edición, cambio de cuenta)
- [x] T037 [P] [US2] Idem `remove-transaction.handler.spec.ts` (el borrado devuelve el saldo)
- [x] T038 [P] [US2] Test de integración del adapter en `apps/api/test/integration/domains/transaction/infrastructure/prisma-transaction.repository.spec.ts` sin `prepaidDeltas`

### Implementación

- [x] T039 [US2] `apps/api/src/domains/transaction/application/commands/create-transaction.handler.ts`: pasar el saldo de la cuenta al `MovementPolicy`, dejar de calcular deltas de pote
- [x] T040 [US2] Idem en `update-transaction.handler.ts` (offset sobre el saldo, incluido el traslado a otra cuenta)
- [x] T041 [US2] Idem en `remove-transaction.handler.ts`
- [x] T042 [US2] Eliminar `prepaidDeltas` del puerto en `apps/api/src/domains/transaction/domain/ports/transaction.repository.port.ts` y de `infrastructure/prisma-transaction.repository.ts`, y usar `balanceDelta` donde se usaba `accountBalanceDelta`
- [x] T043 [US2] Verificar que `apps/web/src/domains/transactions/components/TransactionFormPanel.tsx` ofrece las tarjetas de una cuenta prepago y que `projectedBalance`/`balanceAfter` funcionan con ella

**Checkpoint**: el saldo de una cuenta prepago es correcto tras crear, editar y borrar gastos, y nunca negativo.

---

## Phase 5: User Story 3 — Cargar la cuenta prepago (P2)

**Goal**: cargar = traspaso desde otra cuenta propia, o ingreso cuando el dinero viene de fuera.

**Independent test**: un traspaso corriente → prepago mueve ambos saldos y no altera el patrimonio;
un traspaso de salida que exceda el saldo se rechaza; ya no existe el endpoint de recarga.

### Tests (primero)

- [x] T044 [P] [US3] Test e2e de traspaso hacia/desde una cuenta prepago en `apps/api/test/e2e/prepaid-account.e2e-spec.ts`
- [x] T045 [P] [US3] Test que confirma que `POST /accounts/:id/cards/:cardId/load` ya no existe (404) en el mismo archivo

### Implementación

- [x] T046 [US3] Eliminar `load-prepaid-card.command.ts` y `load-prepaid-card.handler.ts` de `apps/api/src/domains/bank-account/application/commands/` y su registro en `bank-account.module.ts`
- [x] T047 [US3] Eliminar la ruta de recarga de `apps/api/src/domains/bank-account/presentation/accounts.controller.ts`
- [x] T048 [US3] Eliminar `apps/web/src/domains/accounts/components/LoadPrepaidPanel.tsx`, `cardsApi.load` y `useCardMutations.load` (`apps/web/src/domains/accounts/api/cardsApi.ts`, `hooks/useCards.ts`) y sus llamadas en `AccountDetailRoute.tsx`
- [x] T049 [P] [US3] Eliminar las claves i18n de recarga en `apps/web/src/i18n/es.json` y `en.json`

**Checkpoint**: la única forma de cargar es traspaso o ingreso; no queda código muerto de recarga.

---

## Phase 6: User Story 4 — Paridad con el resto de las cuentas (P3)

**Goal**: la prepago se ve y se usa como cualquier otra cuenta con saldo, sin cupo ni facturación.

**Independent test**: detalle sin secciones de crédito, cartera y patrimonio la incluyen, filtros de
movimientos por cuenta y por tarjeta funcionan.

- [x] T050 [US4] `apps/web/src/domains/accounts/routes/AccountDetailRoute.tsx`: ocultar pestaña/secciones de Facturación y el bloque de cupo cuando el tipo es PREPAID
- [x] T051 [P] [US4] `apps/web/src/domains/accounts/components/AccountCard.tsx` y `AccountsSummary.tsx`/`lib/grouping.ts`: agrupar y rotular el tipo nuevo
- [x] T052 [P] [US4] Verificar el patrimonio y la cartera del Panel con una cuenta prepago (`apps/web/src/domains/dashboard/`), incluido `MaskedAmount`
- [x] T053 [US4] Confirmar que `apps/api/src/domains/credit-statement/domain/billing-eligibility.strategy.ts` nunca considera elegible a una cuenta PREPAID (test unitario incluido)

**Checkpoint**: ninguna vista muestra crédito o facturación en una cuenta prepago.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T054 Rehacer el seed en `apps/api/prisma/seed.ts`: quitar la tarjeta prepago de la cuenta corriente, crear la cuenta "Tenpo Prepago" (PREPAID, emisor no bancario, número de cuenta, saldo inicial) con dos tarjetas prepago, gastos y una carga como traspaso; fijarla en la cartera
- [x] T055 [P] Ajustar el texto es/en de `PREPAID_INSUFFICIENT_BALANCE` para que hable de la cuenta y no de la tarjeta en `apps/web/src/i18n/{es,en}.json`
- [x] T056 [P] Eliminar el punto 6 ("Borrar la recarga de una tarjeta prepago no devuelve el saldo") de `docs/PENDING.md`
- [x] T057 [P] Documentar el producto prepago en `docs/english/BANKING_LOGIC.md` y `docs/spanish/BANKING_LOGIC.md` (tipo de cuenta, matriz kind↔tipo, saldo no negativo, carga por traspaso)
- [x] T058 Actualizar `.specify/memory/constitution.md` (regla de dominio: el instrumento de pago no guarda dinero propio; el saldo vive en la cuenta y una cuenta prepago nunca queda negativa) con bump de versión y Sync Impact Report
- [x] T059 Actualizar `CLAUDE.md` (modelo de datos, endpoint eliminado, matriz de tarjetas, estado del plan 011)
- [x] T060 Gates finales: `pnpm check:boundaries`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- [x] T061 Validar a mano los 6 escenarios de `specs/011-prepaid-account-product/quickstart.md` con `pnpm db:reset` + `pnpm dev`

---

## Dependencies

```text
Phase 1 (T001-T003)
   └─> Phase 2 (T004-T018)          ← bloquea TODAS las historias
          ├─> Phase 3 US1 (T019-T034)   MVP
          ├─> Phase 4 US2 (T035-T043)   depende de T014/T016 (Phase 2)
          ├─> Phase 5 US3 (T044-T049)   depende de US1 (necesita cuentas prepago)
          └─> Phase 6 US4 (T050-T053)   depende de US1
                 └─> Phase 7 (T054-T061)
```

- US2 es independiente de US3/US4; puede validarse apenas exista una cuenta prepago (US1).
- T054 (seed) va al final porque toca cuentas, tarjetas, movimientos y cartera a la vez.

## Parallel Execution Examples

- **Phase 2**: T004, T006 y T009 en paralelo; T011, T012 y T013 en paralelo (archivos de test distintos).
- **Phase 3**: T026, T032 y T033 en paralelo con las tareas de API (T021-T025).
- **Phase 4**: T035-T038 en paralelo (cuatro archivos de test distintos).
- **Phase 7**: T055, T056 y T057 en paralelo (docs e i18n).

## Implementation Strategy

- **MVP = Phase 1 + Phase 2 + Phase 3 (US1)**: ya entrega el producto nuevo registrable y visible.
- **Incremento 2 = Phase 4 (US2)**: la regla que define al prepago (no se puede gastar de más).
- **Incremento 3 = Phases 5-6**: carga por traspaso y paridad de vistas.
- **Cierre = Phase 7**: seed, documentación y memoria (constitución + `CLAUDE.md`), obligatorio por
  Principio V antes de dar el ciclo por terminado.
