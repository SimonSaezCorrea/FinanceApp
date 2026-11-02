# Tasks: Cupos por moneda en la cuenta y cambio de tarjeta principal

**Input**: `specs/039-primary-card-swap/` (plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md)

**Tests**: obligatorios (Constitución IV, TDD): cada historia escribe sus tests primero y los ve fallar.

**Formato**: `- [ ] T### [P?] [US?] Descripción con ruta`. `[P]` = archivos distintos, sin dependencia
pendiente. Rutas relativas a la raíz del repo; `api/` = `apps/api/`, `web/` = `apps/web/`.

## Phase 1: Setup (contrato e i18n compartidos)

- [x] T001 [P] Agregar a `packages/contracts/src/accounts/index.ts`: `extraCreditLimitSchema`, campo
      `extraCreditLimits` en `bankAccountFieldsSchema` (refine de create: solo `CREDIT_CARD`, monedas distintas a
      `currency`, sin repetir, `limitAmount > 0`), `usedInitial` opcional en `creditPoolSchema`,
      `newPrimaryCardSchema`, `replacePrimaryCardSchema`, helper `needsPrimaryCard(account)` (hay CREDIT y ninguna
      principal activa) y actualizar los comentarios de `cardSchema.isPrimary`/`limits` y `createCardSchema`
      (principal sin sub-topes; `limits` de la principal = espejo deprecado de los cupos de la cuenta)
- [x] T002 [P] Tests en `packages/contracts/src/accounts/accounts.test.ts` (o el archivo de tests existente del
      módulo): refines de `extraCreditLimits`, `replacePrimaryCardSchema` (cardId vs newCard), `needsPrimaryCard`
- [x] T003 [P] Agregar en `packages/i18n/src/es.json` y `en.json`: `errors.PRIMARY_CARD_REPLACEMENT_REQUIRED`,
      `PRIMARY_CARD_INVALID_REPLACEMENT`, `PRIMARY_CARD_HAS_HISTORY`, `CARD_NOT_PRIMARY`,
      `CREDIT_POOL_CURRENCY_NOT_FOUND`, `CREDIT_POOL_IN_USE`; y los textos de UI `accounts.primary.*` (título del
      panel, "Tarjeta nueva", "Los cupos de la cuenta no cambian", "Marcar como principal", aviso de cuenta sin
      principal, botón "Elegir principal", confirmaciones, toasts) y `accounts.pools.*` ("Cupos en otras monedas",
      "Usa el 100% del cupo de la cuenta", "Sub-tope", "Máximo {{amount}}")

## Phase 2: Foundational (datos y dominio nuevo — bloquea todas las historias)

- [x] T004 Agregar el modelo `AccountCreditLimit` (`@@map("account-credit-limit")`, campos de data-model.md,
      `@@unique([accountId, currency])`, `onDelete: Cascade`) y la relación inversa en `BankAccount` en
      `api/prisma/schema.prisma`
- [x] T005 Generar la migración con `pnpm db:migrate` (nombre `account_credit_limits`) y editar a mano
      `api/prisma/migrations/<ts>_account_credit_limits/migration.sql`: después del `CREATE TABLE`, un
      `INSERT … SELECT` que por cuenta y moneda ≠ `bank-account.currency` con filas en `card-limit` de sus tarjetas
      CREDIT escribe `limitAmount = (límite de la principal o 0) + Σ límites de adicionales` y
      `usedInitial = Σ usedInitial` (ids UUID v7, ver T006); y `CREATE UNIQUE INDEX "card-account_primary_per_account" ON "card-account"("accountId")
WHERE "isPrimary"`. No borra `card-limit` de principales (contracción posterior)
- [x] T006 Resolver la generación de ids UUID v7 en la migración SQL (Principio VIII): definir una función
      temporal `pg_temp.uuid_v7()` en el mismo `migration.sql` (timestamp ms + bits aleatorios, versión 7, variante
      RFC) y usarla en el `INSERT` de T005; verificar con un test de integración que los ids migrados pasan
      `z.uuidv7()`
- [x] T007 [P] Crear el dominio `api/src/domains/account-credit-limit/`: `domain/account-credit-limit.entity.ts`
      (props), `domain/ports/account-credit-limit.repository.port.ts` (`listByAccounts(userId, accountIds)`,
      `replaceForAccountWithTx(tx, accountId, list)`, `upsertWithTx`, token `ACCOUNT_CREDIT_LIMIT_REPOSITORY`),
      `infrastructure/prisma-account-credit-limit.repository.ts` (única que consulta la tabla, filtra por
      `account.userId`) y `account-credit-limit.data.module.ts` (leaf)
- [x] T008 [P] Crear `api/src/domains/account-credit-limit/domain/ports/currency-usage-lookup.port.ts` + su
      adapter en `infrastructure/` (¿el usuario tiene un cupo de cuenta en la moneda X?) y exportarlo del leaf
- [x] T009 Test de integración del adapter en
      `api/test/integration/domains/account-credit-limit/prisma-account-credit-limit.repository.spec.ts`
      (listar por cuentas del usuario, aislamiento entre usuarios, reemplazo del conjunto, unique por moneda)
- [x] T010 Test de integración de la migración en
      `api/test/integration/domains/account-credit-limit/migration.spec.ts`: dentro de una transacción que se
      revierte al final, armar una cuenta CLP con principal (tope USD 1.000, usado 100) + adicional (USD 300, usado
      50), leer de `migration.sql` el bloque entre `-- backfill:start` y `-- backfill:end` (más la función
      `pg_temp.uuid_v7` de T006), ejecutarlo y verificar cupo USD 1.300 / usado inicial 150, sub-tope de la
      adicional intacto e ids v7 (`z.uuidv7()`); el bloque de T005 lleva esos dos marcadores
- [x] T011 Cargar los cupos de la cuenta en el agregado: `creditPools: AccountCreditLimitProps[]` en
      `BankAccountProps` (`api/src/domains/bank-account/domain/bank-account.aggregate.ts`), composición del puerto
      nuevo en `api/src/domains/bank-account/infrastructure/prisma-bank-account.repository.ts` (lectura y
      `saveWithTx`/`createWithCardsWithTx` escriben el conjunto), e importar el leaf en
      `api/src/domains/bank-account/bank-account.data.module.ts`; ignorar en la carga los `CardLimit` en otra moneda
      de la principal (legado, R11)
- [x] T012 Agregar `findByIdForUpdateWithTx(tx, userId, id)` (`SELECT … FOR UPDATE` sobre la fila de la cuenta,
      luego la carga completa) en `api/src/domains/bank-account/domain/ports/bank-account.repository.port.ts` y su
      adapter
- [x] T013 [P] Actualizar los fakes en `api/test/unit/support/fake-ports.ts` (puerto de cupos de cuenta,
      `findByIdForUpdateWithTx`, `accountAggregate` con `creditPools`) y el compositor de integración
      `api/test/integration/support/repositories.ts`

**Checkpoint**: la tabla existe, migra, y el agregado la carga; nada observable cambió todavía.

## Phase 3: User Story 1 — Cupos de la cuenta en cada moneda (P1) 🎯 MVP

**Goal**: el cupo en otra moneda es de la cuenta; todo cargo en esa moneda (cualquier tarjeta) lo consume; pagar
lo libera; sin cupo, el cargo se rechaza; nunca suma al cupo en pesos.

**Independent Test**: cuenta con cupo $2.000.000 y USD 3.000, titular + adicional sin sub-tope; USD 1.000 con la
adicional → disponible USD 2.000 para ambas, pesos sin cambio (spec US1).

### Tests (primero, deben fallar)

- [x] T014 [P] [US1] Unit de `MovementPolicy` en `api/test/unit/domains/transaction/domain/movement-policy.spec.ts`:
      gasto USD sin cupo → `CreditPoolCurrencyNotFoundError`; gasto USD que excede el cupo de la cuenta →
      `CardLimitExceededError`; gasto USD con cualquier tarjeta → contribución "0" al cupo en pesos; cargo del emisor
      en USD con cupo → acepta; INCOME USD con o sin tarjeta → paga el cupo USD, contribución "0"
- [x] T015 [P] [US1] Unit de `creditPoolUsage` en
      `api/test/unit/domains/transaction/application/credit-pool-usage.spec.ts` (usado inicial + gastos − ingresos
      adeudados + arrastre; excluye el movimiento editado)
- [x] T016 [P] [US1] Unit del agregado en `api/test/unit/domains/bank-account/domain/bank-account.aggregate.spec.ts`:
      `setExtraCreditLimits` (moneda = la de la cuenta → error, repetida → error, `> 0`), `planCreation`/
      `resolveCardPlacement` traducen los `limits` extranjeros de la principal a cupos de cuenta y la principal queda
      sin `limits`; primera CREDIT sin límite propio usa `creditLimit` de la cuenta
- [x] T017 [P] [US1] Unit del mapper en `api/test/unit/domains/bank-account/application/account-dto.mapper.spec.ts`:
      `creditPools` = moneda de la cuenta + cupos de cuenta con `used` (uso + arrastre) y `usedInitial`; principal con
      `limits` espejo de los cupos de la cuenta
- [x] T018 [P] [US1] Unit de `planForeignSettlement` en
      `api/test/unit/domains/credit-statement/application/foreign-settlement.spec.ts`: INCOME sin `cardId`; sin cupo
      en la moneda → `CreditPoolCurrencyNotFoundError`
- [x] T019 [P] [US1] E2E en `api/test/e2e/domains/bank-account/credit-pools.http.spec.ts`: crear cuenta con
      `extraCreditLimits` USD, gasto USD con adicional baja el disponible USD de la cuenta y no el de pesos, gasto que
      excede → 400 `CARD_LIMIT_EXCEEDED`, gasto EUR → 400 `CREDIT_POOL_CURRENCY_NOT_FOUND`, `PATCH` quita un cupo en
      uso → 409 `CREDIT_POOL_IN_USE`, cliente viejo (PATCH de la principal con `limits` USD) actualiza el cupo de la
      cuenta
- [x] T020 [P] [US1] E2E en `api/test/e2e/domains/credit-statement/foreign-pay-account-pool.http.spec.ts`: pagar
      una facturación USD libera el cupo USD de la cuenta y el INCOME no lleva tarjeta

### Implementación

- [x] T021 [US1] Agregar `CreditPoolCurrencyNotFoundError` (`CREDIT_POOL_CURRENCY_NOT_FOUND`, 400) como una
      clase por dominio con el mismo código — en `api/src/domains/transaction/domain/errors.ts`,
      `api/src/domains/credit-statement/domain/errors.ts` y `api/src/domains/bank-account/domain/errors.ts` (sub-tope
      en moneda sin cupo) —, y `CreditPoolInUseError` (`CREDIT_POOL_IN_USE`, 409) en
      `api/src/domains/bank-account/domain/errors.ts`
- [x] T022 [US1] Agregar `sumsForAccountCurrency(userId, accountId, currency, excludeTxId?)` (con `STILL_OWED`)
      en `api/src/domains/transaction/domain/ports/transaction.repository.port.ts` + adapter
      `api/src/domains/transaction/infrastructure/prisma-transaction.repository.ts`, y
      `sumsByAccountCurrency(userId, accountIds)` (lote, `groupBy` por cuenta/moneda/tipo) en
      `transaction-sums.repository.port.ts` + `prisma-transaction-sums.repository.ts`
- [x] T023 [US1] Crear `api/src/domains/transaction/application/credit-pool-usage.ts` (`creditPoolUsage`, usa
      `sumsForAccountCurrency` + `carriedOverOwed`) y quitar de `card-limit-usage.ts` la rama de arrastre de la
      principal (un sub-tope nunca incluye el arrastre)
- [x] T024 [US1] Reescribir la parte multi-moneda de `api/src/domains/transaction/domain/movement-policy.ts`:
      `validate` recibe `creditPool: CreditPoolContext | null`; en `CREDIT_CARD`, movimiento en otra moneda sin cupo
      → error; EXPENSE (tarjeta o `financeCharge`) chequea el cupo extranjero; `contribution` devuelve "0" para todo
      movimiento en otra moneda; reemplazar `paysCardOwnLimit` por "INCOME en moneda con cupo de la cuenta"
- [x] T025 [US1] Pasar el `CreditPoolContext` desde `create-transaction.handler.ts`, `update-transaction.handler.ts`
      y `remove-transaction.handler.ts` (`api/src/domains/transaction/application/commands/`), leyendo el cupo por el
      puerto de `account-credit-limit` (importar el leaf en `api/src/domains/transaction/transaction.module.ts`) y el
      uso por `creditPoolUsage`
- [x] T026 [US1] Implementar en el agregado (`bank-account.aggregate.ts`): `setExtraCreditLimits`, traducción de
      `limits` extranjeros de la principal a cupos de cuenta en `planCreation`/`resolveCardPlacement`, principal
      siempre con `limits: []`, primera CREDIT sin límite propio usa el `creditLimit` de la cuenta
- [x] T027 [US1] `create-account.handler.ts` y `update-account.handler.ts`
      (`api/src/domains/bank-account/application/commands/`): aplicar `extraCreditLimits`; en update, antes de quitar
      un cupo cargar su uso (`sumsByAccountCurrency`), facturaciones sin liquidar de esa moneda
      (`CreditStatementRepositoryPort`) y sub-topes → `CreditPoolInUseError`; todo en la transacción de la cuenta
- [x] T028 [US1] `add-card.handler.ts` y `update-card.handler.ts`: `limits` extranjeros enviados para la principal
      se escriben como cupos de la cuenta (compat R10), nunca como `CardLimit`
- [x] T029 [US1] `api/src/domains/bank-account/application/queries/account-dto.mapper.ts` (+ los handlers de
      list/get que lo alimentan): `creditPools` desde los cupos de la cuenta con `sumsByAccountCurrency` +
      `carriedOverOwed`; principal con `limits` espejo (ids del cupo de cuenta); quitar `foreignLimitWithCarry`
- [x] T030 [US1] `api/src/domains/credit-statement/application/foreign-settlement.ts`: INCOME sin `cardId`,
      borrar `settlementCardId`, validar cupo de la cuenta en la moneda; ajustar `pay-credit-statement.handler.ts`,
      `prepay-open-period.handler.ts`, `update-statement-payment.handler.ts` y `transfer-statement.handler.ts`
      (su INCOME de cierre usa hoy `settlementCardId`, R15) — importar el leaf de `account-credit-limit` en
      `credit-statement.module.ts`; extender T018/T020 con un caso de traspaso USD → pesos sin tarjeta
- [x] T031 [P] [US1] Web: `web/src/domains/accounts/components/ExtraCurrencyLimits.tsx` escribe en el estado del
      formulario de cuenta (`extraCreditLimits`) en vez de la principal, ofreciendo las monedas del perfil
      (`useAllowedCurrencies`) menos la de la cuenta; `AccountForm.tsx` y `AccountCreateModal.tsx` lo envían en
      `PATCH`/`POST /accounts`; los valores iniciales salen de `account.creditPools`
- [x] T032 [P] [US1] Web: `web/src/domains/accounts/components/CardDetailPanel.tsx` y `AccountVisualCard.tsx`
      muestran los cupos por moneda desde `account.creditPools` (no desde `primary.limits`) y se quita el aviso de
      cupo único multimoneda
- [x] T033 [P] [US1] Tests web: `ExtraCurrencyLimits`/`AccountForm` envían `extraCreditLimits`
      (`web/src/domains/accounts/components/AccountForm.test.tsx` o archivo nuevo junto al componente)
- [x] T034 [P] [US1] Web `web/src/domains/transactions/components/TransactionFormPanel.tsx`: en una cuenta
      `CREDIT_CARD`, el selector de moneda ofrece la de la cuenta + las de `account.creditPools` (R16); test en
      `TransactionFormPanel` (o su test existente) y mapear `errors.CREDIT_POOL_CURRENCY_NOT_FOUND`

**Checkpoint**: US1 completa y demostrable por sí sola.

## Phase 4: User Story 2 — Sub-topes parciales en adicionales (P1)

**Goal**: una adicional tiene sub-topes por moneda dentro del cupo de la cuenta; la principal no tiene.

**Independent Test**: adicional con sub-tope USD 500 en cuenta con cupo USD 3.000: 400 acepta, 200 más rechaza
por sub-tope; usado USD de la cuenta = 400 (spec US2).

### Tests

- [x] T035 [P] [US2] Unit del agregado (`bank-account.aggregate.spec.ts`): sub-tope en moneda sin cupo →
      `CREDIT_POOL_CURRENCY_NOT_FOUND`; sub-tope > cupo de esa moneda → `CardSubLimitExceedsAccountError`; bajar el
      cupo de la cuenta bajo un sub-tope → mismo error; principal con `limits` → se ignoran/traducen (nunca sub-tope)
- [x] T036 [P] [US2] Unit de `MovementPolicy`: gasto USD con adicional que excede su sub-tope pero cabe en la
      cuenta → `CardSubLimitExceededError`; cabe en el sub-tope pero no en la cuenta → `CardLimitExceededError`
- [x] T037 [P] [US2] E2E en `api/test/e2e/domains/bank-account/card-sublimits.http.spec.ts` (escenarios 1–4 de US2)

### Implementación

- [x] T038 [US2] `BankAccount.normalizeLimits`/`resolveCardPlacement`/`setExtraCreditLimits` en
      `bank-account.aggregate.ts`: reglas de sub-tope por moneda contra los cupos de la cuenta (moneda propia =
      `creditLimit`; otra = cupo de cuenta)
- [x] T039 [US2] `create-transaction.handler.ts`/`update-transaction.handler.ts`: el sub-tope de una adicional en
      otra moneda se chequea con `cardLimitUsage` además del cupo de la cuenta (T024/T025)
- [x] T040 [P] [US2] Web `web/src/domains/accounts/components/CardForm.tsx`: principal sin sección de tope (texto
      "Usa el 100% del cupo de la cuenta"); adicional "Tope propio" ofrece solo las monedas de `account.creditPools`
      y muestra/valida el máximo de cada una
- [x] T041 [P] [US2] Tests web de `CardForm` (`web/src/domains/accounts/components/CardFormPanel.primary.test.tsx`
      y un test de adicional): principal sin tope; adicional con monedas limitadas y máximo

**Checkpoint**: US1 + US2 funcionan juntas.

## Phase 5: User Story 3 — Desactivar la principal eligiendo su reemplazo (P1)

**Goal**: desactivar la principal exige un reemplazo (existente o nuevo) en la misma acción; la cuenta nunca queda
sin principal activa.

**Independent Test**: cuenta con solo su principal → desactivarla creando una nueva → nueva principal activa,
vieja inactiva y adicional, cupos idénticos, facturación generable (spec US3).

### Tests

- [x] T042 [P] [US3] Unit del agregado: `changePrimary` (destino no CREDIT / inactivo / de otra cuenta / el mismo
      → `PrimaryCardInvalidReplacementError`; roles intercambiados; ambos sin `limits`; cupos intactos) y
      `assertPrimaryInvariant` (desactivar la principal por `applyCardUpdate` → `PrimaryCardReplacementRequiredError`)
- [x] T043 [P] [US3] Unit en `api/test/unit/domains/bank-account/application/replace-primary-card.handler.spec.ts`:
      `DEACTIVATE` con existente; con tarjeta nueva (se crea una sola); `:cardId` no principal → `CardNotPrimaryError`;
      todo en una transacción con el `COMPLETED` de idempotencia
- [x] T044 [P] [US3] E2E en `api/test/e2e/domains/bank-account/replace-primary.http.spec.ts`: sin
      `Idempotency-Key` → 400; reemplazo por tarjeta nueva → 200 y estado correcto; mismo key repetido → misma
      respuesta y UNA tarjeta nueva; `PATCH` de la principal con `isActive:false` → 409
      `PRIMARY_CARD_REPLACEMENT_REQUIRED`; tras el cambio, `POST /accounts/:id/generate-statements` → 200;
      reactivar la vieja → sigue adicional; un movimiento hecho con la vieja antes del cambio conserva su `cardId`
      (FR-016)
- [x] T045 [P] [US3] Integración en
      `api/test/integration/domains/bank-account/replace-primary-concurrency.spec.ts`: dos `replace-primary` con keys
      distintas en paralelo → una gana, la otra `CARD_NOT_PRIMARY`; nunca dos principales (índice parcial)

### Implementación

- [x] T046 [US3] Errores en `api/src/domains/bank-account/domain/errors.ts`: `PrimaryCardReplacementRequiredError`
      (409), `PrimaryCardInvalidReplacementError` (400), `CardNotPrimaryError` (409)
- [x] T047 [US3] Agregado: `changePrimary(newPrimaryId)`, `assertPrimaryInvariant()`, y que el cambio de
      `isActive`/eliminación de la principal por los caminos existentes lo dispare
- [x] T048 [US3] `update-card.handler.ts`: llamar al invariante (rechazo de `isActive:false` sobre la principal);
      reactivar nunca devuelve el rol de principal
- [x] T049 [US3] Crear `replace-primary-card.command.ts` + `replace-primary-card.handler.ts`
      (`BaseIdempotentCommandHandler`, operación `card.replacePrimary`): dentro de una `$transaction`,
      `findByIdForUpdateWithTx`, verificar `:cardId` principal, crear la nueva con
      `CardAccountRepositoryPort.createWithTx` o resolver la existente (ownership por el agregado), `changePrimary`,
      desactivar el origen, `saveWithTx`, `complete`; responder la cuenta como DTO
- [x] T050 [US3] `accounts.controller.ts`: `POST /accounts/:id/cards/:cardId/replace-primary` (`ZodParamsPipe`,
      `ZodValidationPipe(replacePrimaryCardSchema)`, `requireIdempotencyKey`) y registrar el handler en
      `bank-account.module.ts`
- [x] T051 [P] [US3] Web: `cardsApi.ts` (`replacePrimary(accountId, cardId, body, key)`) y mutación en
      `web/src/domains/accounts/hooks/useCards.ts` (`useIdempotencyKey`, invalida `["accounts"]`, `["transactions"]`,
      `["wallet"]`)
- [x] T052 [US3] Web: crear `web/src/domains/accounts/components/ReplacePrimaryPanel.tsx` (`FormSurface` panel:
      radios con las CREDIT activas de la cuenta + "Tarjeta nueva" con últimos 4, vencimiento y red; aviso
      "los cupos de la cuenta no cambian"; `action` por prop)
- [x] T053 [US3] Web: en `CardForm.tsx`/`CardFormPanel.tsx`, apagar "Activa" en la principal abre
      `ReplacePrimaryPanel` (`DEACTIVATE`) en vez de guardar; `errors.PRIMARY_CARD_REPLACEMENT_REQUIRED` mapeado
- [x] T054 [P] [US3] Tests web en `web/src/domains/accounts/components/ReplacePrimaryPanel.test.tsx`: elegir
      existente, crear nueva (validación de 4 dígitos y vencimiento), envía `Idempotency-Key`

**Checkpoint**: el caso principal (plástico reemplazado) resuelto de punta a punta.

## Phase 6: User Story 4 — Marcar como principal (P2)

**Goal**: cualquier CREDIT adicional activa puede pasar a principal sin desactivar nada; aviso para cuentas sin
principal activa.

**Independent Test**: principal + adicional activas → marcar la adicional → roles intercambiados, ambas activas,
cupos iguales (spec US4).

### Tests

- [x] T055 [P] [US4] Unit en `api/test/unit/domains/bank-account/application/make-primary-card.handler.spec.ts`:
      intercambio; ya principal → no-op; inactiva → `PrimaryCardInvalidReplacementError`; cuenta con principal
      inactiva (datos viejos) → la elegida pasa a principal
- [x] T056 [P] [US4] E2E en `api/test/e2e/domains/bank-account/make-primary.http.spec.ts` (US4 escenarios 1–3,
      repetir la llamada = mismo estado)
- [x] T057 [P] [US4] Tests web: botón "Marcar como principal" solo en CREDIT adicional activa
      (`web/src/domains/accounts/components/CardDetailPanel.test.tsx`) y aviso `PrimaryCardNotice` cuando
      `needsPrimaryCard` (`web/src/domains/accounts/components/PrimaryCardNotice.test.tsx`)

### Implementación

- [x] T058 [US4] Crear `make-primary-card.command.ts` + `make-primary-card.handler.ts` (`BaseCommandHandler`,
      `$transaction` + `findByIdForUpdateWithTx`, `changePrimary`, `saveWithTx`) y la ruta
      `POST /accounts/:id/cards/:cardId/make-primary` en `accounts.controller.ts`; registrar en `bank-account.module.ts`
- [x] T059 [P] [US4] Web: `cardsApi.makePrimary` + mutación en `useCards.ts`; acción "Marcar como principal" con
      `ConfirmModal` en `CardDetailPanel.tsx` (y su forma inline en `CardsAside.tsx`)
- [x] T060 [US4] Web: crear `web/src/domains/accounts/components/PrimaryCardNotice.tsx` y mostrarlo en
      `web/src/domains/accounts/routes/AccountDetailRoute.tsx` cuando `accounts.needsPrimaryCard(account)`; su botón
      abre `ReplacePrimaryPanel` en modo "elegir" (existente → `make-primary`; nueva → `replace-primary DEACTIVATE`
      sobre la principal inactiva)

## Phase 7: User Story 5 — Eliminar la principal con reemplazo (P3)

**Goal**: eliminar la principal solo con reemplazo y solo si no tiene historia.

**Independent Test**: principal sin movimientos + adicional activa → eliminar eligiendo la adicional → la cuenta
queda con esa principal y factura (spec US5).

### Tests

- [x] T061 [P] [US5] Unit de `replace-primary-card.handler.spec.ts` (`DELETE`): sin historia → elimina; con un
      movimiento o un plan → `PrimaryCardHasHistoryError`; `remove-card.handler` sobre la principal →
      `PrimaryCardReplacementRequiredError` (`api/test/unit/domains/bank-account/application/remove-card.handler.spec.ts`)
- [x] T062 [P] [US5] E2E en `replace-primary.http.spec.ts`: `DELETE` con nueva y con existente; con historia →
      409 `PRIMARY_CARD_HAS_HISTORY`; `DELETE /accounts/:id/cards/:cardId` sobre la principal → 409

### Implementación

- [x] T063 [US5] `existsForCard(userId, cardId)` en `transaction.repository.port.ts` + adapter, y en
      `api/src/domains/installment-plan/domain/ports/installment-plan.repository.port.ts` + su adapter; importar el
      leaf de `installment-plan` donde haga falta en `bank-account.module.ts`
- [x] T064 [US5] Agregar `PrimaryCardHasHistoryError` (409) y la rama `DELETE` en `replace-primary-card.handler.ts`
      (chequeo de historia antes de cambiar; eliminación con el `removeWithTx` del puerto de tarjetas dentro de la
      misma transacción); `remove-card.handler.ts` rechaza la principal
- [x] T065 [US5] Web: en `CardDetailPanel.tsx`, "Eliminar" sobre la principal abre `ReplacePrimaryPanel`
      (`DELETE`); `errors.PRIMARY_CARD_HAS_HISTORY` sugiere desactivar

## Phase 8: Polish & cross-cutting

- [x] T066 [P] Importación: `api/src/domains/import/domain/template-plan.ts` y
      `application/template-context.loader.ts` — el tope extranjero de la principal se planifica como cupo de cuenta
      (uso por cuenta+moneda, eventos `settle` sobre la cuenta), el de una adicional como sub-tope validado;
      `import-template.handler.ts` escribe cupos de cuenta; tests en `api/test/unit/domains/import/` actualizados
- [x] T067 [P] Web: `web/src/domains/import/lib/templateData.ts` exporta los cupos de la cuenta en la fila de su
      principal (formato de plantilla sin cambios); test de ida y vuelta en `template.test.ts`
- [x] T068 [P] `user`: componer el puerto de monedas en uso de `account-credit-limit` en
      `api/src/domains/user/application/commands/update-preferences.handler.ts` + `user.module.ts`; test unit
- [x] T069 [P] Semilla `api/prisma/seed.ts`: los topes USD de las principales sembradas pasan a
      `accountCreditLimit`; ninguna principal con `CardLimit`
- [x] T070 [P] Verificar el preview de "Reemplazar todo" (`api/src/domains/import/application/template-replacement.ts`):
      si cuenta filas por tabla, agregar `account-credit-limit` (se borra por cascada)
- [x] T071 Docs: `docs/english/BANKING_LOGIC.md` y `docs/spanish/BANKING_LOGIC.md` (cupos por moneda en la
      cuenta, principal sin sub-topes, cambio de principal) y `docs/PENDING.md` (contracción: borrar `card-limit` de
      principales y el espejo `primary.limits` en una entrega posterior)
- [x] T072 Memoria: `CLAUDE.md` (bullet de `card-account`/`card-limit` + nueva tabla-dominio, 35 tablas, endpoints,
      códigos, plan 039 verificado) y `.specify/memory/constitution.md` 2.9.0 (Principio VI y VIII: 35 tablas; Sync
      Impact Report)
- [x] T073 Verificación acotada (quickstart.md): tests de contracts/api/web de los dominios tocados,
      `pnpm typecheck`, lint, `format:check`, `check:boundaries`, `prisma migrate diff` sin diferencias

## Dependencies & Execution Order

- Phase 1 → Phase 2 → historias. T004 → T005/T006 → T010; T007 → T009/T011; T011/T012 → todo lo de bank-account.
- **US1** (Phase 3) es base de **US2** (sub-topes validan contra cupos de cuenta) — US2 después de US1.
- **US3** depende de Phase 2 (y del modelo sin topes en la principal de US1: T026); **US4** reutiliza
  `changePrimary` de US3 (T047) y `ReplacePrimaryPanel` (T052); **US5** reutiliza el handler de US3 (T049).
- Polish al final; T072/T073 últimos.

## Parallel Opportunities

- Phase 1: T001, T002, T003 en paralelo.
- Phase 2: T007, T008 en paralelo tras T004; T013 en paralelo con T011/T012 una vez fijadas las firmas.
- US1: tests T014–T020 en paralelo; web T031–T034 en paralelo con la API (T021–T030) una vez fijo el contrato.
- US3: T042–T045 en paralelo; T051/T054 en paralelo con T046–T050.
- Polish: T066–T070 en paralelo.

## Implementation Strategy

1. **MVP**: Phase 1 + 2 + US1 (cupos en la cuenta) — ya corrige el hueco de cargos extranjeros sin cupo.
2. US2 (sub-topes) → modelo completo.
3. US3 (reemplazo al desactivar) → resuelve el problema que originó la feature.
4. US4, US5, Polish.
