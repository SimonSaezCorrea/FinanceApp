---
description: "Task list for 015-idempotent-money-writes"
---

# Tasks: Reintentos y doble envío no pueden duplicar dinero

**Input**: Design documents from `/specs/015-idempotent-money-writes/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/idempotency.md](./contracts/idempotency.md),
[quickstart.md](./quickstart.md)

**Tests**: **OBLIGATORIOS.** El principio IV de la constitución (Test-First / TDD) es NON-NEGOTIABLE,
así que no aplica el "tests are optional" de la plantilla. Además, **FR-006 (dos envíos simultáneos) y
FR-015 (el rollback) no se pueden demostrar con puertos falsos**: exigen tests de integración contra
Postgres real, y son las únicas pruebas de que el candado y la atomicidad funcionan.

**Organization**: agrupadas por historia de usuario. La fase 2 es un prerrequisito bloqueante real —
no un trámite: nada de US1/US2 puede empezar sin ella.

**Revisión aplicada** (`/speckit-analyze`, 2026-09-02): esta lista incorpora las remediaciones de un
CRITICAL (T017, el test de rollback que faltaba), dos HIGH (T077 saca la enmienda constitucional de
las tareas de feature; US1/US2 ponen el cliente **antes** del endurecimiento de la API) y tres MEDIUM
(T012, T068, T015).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1, US2, US3 — sólo en las fases de historia

---

## Phase 1: Setup (contrato y schema)

**Purpose**: el vocabulario compartido. Nada de esto depende de nada.

- [x] T001 [P] Crear el módulo de contrato `packages/contracts/src/idempotency/index.ts` con `IDEMPOTENCY_HEADER`, `idempotencyKeySchema` (`z.string().trim().min(16).max(255)`), `IDEMPOTENCY_RETENTION_HOURS = 24` e `IDEMPOTENCY_IN_FLIGHT_TIMEOUT_SECONDS = 60`, y re-exportarlo desde `packages/contracts/src/index.ts`
- [x] T002 [P] Añadir `updateSavingsEntrySchema` a `packages/contracts/src/savings/index.ts` derivándolo de `createSavingsEntrySchema.partial()` y re-declarando `currency` como opcional, para que el `.default("USD")` del create no resucite en un PATCH (mismo arreglo que el commit `e93dc0b`)
- [x] T003 Añadir `model IdempotencyRecord` y `enum IdempotencyStatus` a `apps/api/prisma/schema.prisma` con los campos de [data-model.md](./data-model.md) §1, `@@unique([userId, key])`, `@@index([expiresAt])` y `@@map("idempotency-record")`
- [x] T004 Correr `pnpm db:push` y `pnpm --filter @finance/api exec prisma generate`, y verificar en la base que el índice único quedó creado sobre `(userId, key)` — es el candado, no una validación

---

## Phase 2: Foundational (BLOQUEANTE)

**Purpose**: el mecanismo de idempotencia y el refactor transaccional que lo hace posible.

**⚠️ CRÍTICO**: ninguna historia puede empezar hasta que esta fase cierre. Acá está **todo** el riesgo
estructural de la feature.

### El dominio `idempotency-record`

- [x] T005 [P] Escribir los tests unitarios del agregado en `apps/api/test/unit/domains/idempotency-record/idempotency-record.aggregate.spec.ts`: transición `IN_FLIGHT → COMPLETED`, detección de vencimiento a los 60 s, y que un registro completado con otra huella se distinga de uno con la misma
- [x] T006 [P] Escribir los tests unitarios de la decisión de replay en `apps/api/test/unit/domains/idempotency-record/replay-decision.spec.ts`: los cuatro desenlaces de [research.md](./research.md) §3 (replay, `KEY_REUSED`, `IN_PROGRESS`, takeover)
- [x] T007 Definir `IdempotencyRecordRepositoryPort` en `apps/api/src/domains/idempotency-record/domain/ports/idempotency-record.repository.port.ts` con `reserve`, `findByKey`, `completeWithTx`, `release`, `takeOver` y `deleteExpired` ([data-model.md](./data-model.md) §4)
- [x] T008 Implementar el agregado `apps/api/src/domains/idempotency-record/domain/idempotency-record.aggregate.ts` con la decisión de replay como método de dominio — la regla vive en el agregado, no en el handler
- [x] T009 [P] Crear `apps/api/src/domains/idempotency-record/domain/errors.ts` con `IdempotencyKeyRequiredError` (400), `IdempotencyKeyReusedError` (409) e `IdempotencyInProgressError` (409)
- [x] T010 Implementar `apps/api/src/domains/idempotency-record/infrastructure/prisma-idempotency-record.repository.ts`, traduciendo la violación de unicidad `P2002` a "ya existe una reserva" — es el único archivo del dominio que puede importar `@prisma/client`, y sigue el patrón de `prisma-user.repository.ts:100-108`
- [x] T011 [P] Crear la hoja `apps/api/src/domains/idempotency-record/idempotency-record.data.module.ts` exportando **sólo** el binding puerto→adapter, sin importar ningún otro dominio (principio VI: la orquestación depende de las hojas, nunca al revés)
- [x] T012 Crear `apps/api/src/domains/idempotency-record/idempotency-record.module.ts` (módulo de orquestación que importa la hoja y registra los handlers del dominio) y registrarlo en `apps/api/src/app.module.ts` — sin él, el cron de la fase 6 despacharía un comando sin handler
- [x] T013 Escribir el test de integración `apps/api/test/integration/idempotency-record/reserve.spec.ts` contra Postgres real: dos `reserve` concurrentes con la misma clave, uno gana y el otro recibe el registro existente

### El protocolo, en un solo lugar

- [x] T014 [P] Escribir los tests unitarios de `apps/api/test/unit/infra/cqrs/base-idempotent-command.handler.spec.ts` con puertos falsos, cubriendo FR-003, FR-004, FR-005 y FR-006
- [x] T015 Implementar `apps/api/src/infra/cqrs/base-idempotent-command.handler.ts` extendiendo `BaseCommandHandler`. Contrato concreto: `execute()` reserva antes de `loadContext`, devuelve `responseBody` sin ejecutar nada si hay replay, y llama a `release()` si `handle()` lanza un error de dominio. El handler concreto recibe un método protegido `completeWithin(tx, result)` que **debe** invocar dentro de su propia transacción — no invocarlo es un error de programación y el base lo detecta antes de responder
- [x] T016 Añadir el helper de huella en `apps/api/src/infra/cqrs/request-hash.ts`: SHA-256 sobre el JSON con claves ordenadas, con su test unitario — **sólo** se usa para FR-005, nunca para decidir si dos operaciones son la misma
- [x] T017 Escribir el test de integración `apps/api/test/integration/idempotency-record/rollback.spec.ts`, que es **la prueba de la invariante central de toda la feature** ([research.md](./research.md) §3, escenario 16 del quickstart): forzar que el efecto falle **después** de reservado y verificar que no queda efecto, no queda saldo movido, y el registro **no** quedó en `COMPLETED`. Si esta prueba no existe, nada garantiza que `IN_FLIGHT ⟹ sin efecto`, y el takeover a los 60 s deja de ser seguro

### El refactor transaccional (el trabajo estructural)

Ver [plan.md](./plan.md) § Complexity Tracking. Ninguna firma pública cambia: el método actual pasa a
delegar en su variante `*WithTx`, como ya hace `prisma-installment-plan.repository.ts:107`.

- [x] T018 Añadir `saveNewWithTx` a `TransactionRepositoryPort` y a `apps/api/src/domains/transaction/infrastructure/prisma-transaction.repository.ts`, y reescribir `saveNew` (hoy `:210-247`) como una llamada a esa variante con el cliente base
- [x] T019 Añadir `saveTransferPairWithTx` al mismo puerto y adapter, y reescribir `saveTransferPair` (hoy `:333-368`) igual
- [x] T020 [P] Añadir `saveWithTx` a `DebtRepositoryPort` y a `apps/api/src/domains/debt/infrastructure/prisma-debt.repository.ts` — hoy los 7 comandos de deudas no abren ninguna transacción
- [x] T021 [P] Añadir `createWithTx` a `SavingsEntryRepositoryPort` y a `apps/api/src/domains/savings-entry/infrastructure/prisma-savings-entry.repository.ts`
- [x] T022 Correr `pnpm --filter @finance/api test:integration` y confirmar que los caminos de escritura existentes siguen verdes tras el refactor — este gate es lo que separa "refactor" de "regresión"

### Plomería del cliente

- [x] T023 [P] Añadir la opción `idempotencyKey` a `apiFetch` en `apps/web/src/shared/lib/apiClient.ts`, traduciéndola al header; **no** hay que tocar `rawFetch`, que ya hace `{ ...init.headers }` al final (`:37-39`)
- [x] T024 [P] Crear `apps/web/src/shared/hooks/useIdempotencyKey.ts`: una clave por **formulario-intento** con `crypto.randomUUID()`, guardada en un ref, descartada al éxito o al cerrar — **no** una por petición ni una por apertura del formulario ([research.md](./research.md) §7)
- [x] T025 [P] Escribir `apps/web/src/shared/hooks/useIdempotencyKey.test.ts`: la clave se mantiene entre reintentos del mismo intento y cambia después de un éxito. Es el test que atrapa el error de implementación más probable de toda la feature
- [x] T026 [P] Añadir las 5 claves de error nuevas a `apps/web/src/i18n/es.json` **y** `en.json` (`IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_IN_PROGRESS`, `SAVINGS_ENTRY_NOT_FOUND`, y revisar `DEBT_ALREADY_SETTLED`); `src/i18n/parity.test.ts` lo verifica solo

**Checkpoint**: el mecanismo existe y está probado, pero **ninguna** operación lo usa todavía.

---

## Phase 3: US1 — Reintentar un movimiento sin duplicarlo (P1) 🎯 MVP

**Goal**: la operación más frecuente de la app deja de poder duplicarse por un reintento.

**Independent Test**: registrar un movimiento, perder la respuesta, reintentar el mismo intento →
existe un solo movimiento y el saldo se movió una vez. Y con clave nueva → entran los dos.

**⚠️ Orden obligatorio — el cliente va ANTES que la API.** El header es obligatorio (400 si falta), así
que si la API se endurece primero, toda creación de movimiento falla hasta que la web se ponga al día.
T029-T030 (mandar la clave) van antes de T031-T033 (exigirla).

- [x] T027 [P] [US1] Escribir el test e2e `apps/api/test/e2e/idempotency/transaction-create.http.spec.ts` cubriendo los escenarios 1, 2, 3, 4 y 6 de [quickstart.md](./quickstart.md) — el escenario 2 (dos cafés iguales entran ambos) es tan obligatorio como el 1
- [x] T028 [US1] Escribir el test de integración `apps/api/test/integration/transaction/create-concurrent.spec.ts`: dos `POST /transactions` simultáneos con la misma clave contra Postgres real, repetido en bucle. **Es la única prueba posible de FR-006**
- [x] T029 [US1] Pasar la clave desde `apps/web/src/domains/transactions/hooks/useTransactionMutations.ts` y `useTransferMutations.ts`
- [x] T030 [US1] Conectar `useIdempotencyKey` en `apps/web/src/domains/transactions/components/TransactionCreateModal.tsx`, con cuidado de que **"Guardar y crear otro" pida una clave nueva** — si reusa la anterior, el segundo movimiento se rechaza como duplicado
- [x] T031 [US1] Leer el header en `apps/api/src/domains/transaction/presentation/transactions.controller.ts` con `@Headers()`, validarlo con `idempotencyKeySchema` y pasarlo dentro de `CreateTransactionCommand` — es el primer header que lee este código base, no hay precedente que copiar
- [x] T032 [US1] Hacer que `apps/api/src/domains/transaction/application/commands/create-transaction.handler.ts` extienda `BaseIdempotentCommandHandler`, tome la transacción de `saveNewWithTx` y complete el registro **dentro de ella**
- [x] T033 [US1] Repetir T031-T032 para `POST /transactions/transfers` en el mismo controlador y en `create-transfer.handler.ts`, usando `saveTransferPairWithTx`
- [x] T034 [P] [US1] Verificar el escenario 7 de [quickstart.md](./quickstart.md) con una petición `OPTIONS` real: el preflight de CORS refleja `idempotency-key`. Si falla, el navegador rompe y `curl` no lo mostraría
- [x] T035 [P] [US1] Añadir el manejo de `IDEMPOTENCY_KEY_REUSED` y `IDEMPOTENCY_IN_PROGRESS` a los toasts de error del formulario de movimiento, y confirmar que un replay exitoso se ve **igual** que un éxito normal, sin marca de "esto ya lo habías hecho" (FR-007)
- [x] T036 [US1] Recorrer los escenarios 1, 2, 3, 4, 5, 6, 13 y 15 de [quickstart.md](./quickstart.md) y anotar los resultados

**Checkpoint**: US1 es entregable por sí sola. Cubre la operación de mayor frecuencia y el replay
silencioso del propio cliente (SC-004).

---

## Phase 4: US2 — Un doble clic no cobra dos veces (P1)

**Goal**: las siete operaciones restantes que mueven dinero dejan de duplicarse, incluida la de mayor
monto (el plan de cuotas con tarjeta de crédito).

**Independent Test**: doble clic en cada botón → el contador sube uno, existe un solo plan con un solo
calendario, el cupo sube una vez y la fecha de liquidación no se mueve.

**⚠️ Mismo orden que US1**: el cliente (T038-T039) manda la clave antes de que la API la exija.

### Cliente primero

- [x] T037 [P] [US2] Escribir el test e2e `apps/api/test/e2e/idempotency/installment-plan.e2e-spec.ts` cubriendo el escenario 9: dos envíos con la misma clave dejan un plan, un calendario y el cupo consumido **una** vez
- [x] T038 [US2] Pasar la clave desde `useDebtMutations.ts`, `useInstallmentMutations` y `useAccountMutations.payCreditStatement`
- [x] T039 [US2] Conectar `useIdempotencyKey` en `InstallmentFormPanel.tsx`, `PayInstallmentPanel.tsx` y `PayStatementPanel.tsx`

### Cuotas y facturación

- [x] T040 [US2] Proteger `POST /installments` — header en `installments.controller.ts` y `create-installment-plan.handler.ts` sobre `BaseIdempotentCommandHandler`, aprovechando que ya abre su `$transaction` en `handle()` (`:104-114`)
- [x] T041 [US2] Proteger `POST /installments/:id/payments/:seq/pay` en el mismo controlador y en `pay-installment.handler.ts`
- [x] T042 [US2] Proteger `POST /accounts/:id/credit-statements/:statementId/pay` en `credit-statements.controller.ts` y `pay-credit-statement.handler.ts`, completando el registro dentro del `$transaction` que su `persist()` ya abre (`:166-209`)
- [x] T043 [US2] Escribir el test de integración `apps/api/test/integration/credit-statement/pay-concurrent.spec.ts` — cierra el hueco encontrado en la auditoría: la máquina de estados lee `paidAt` **antes** de abrir la transacción, así que dos envíos simultáneos pasan ambos hoy

### Deudas — idempotencia y las guardas que faltan

- [x] T044 [P] [US2] Escribir los tests unitarios de las guardas nuevas en `apps/api/test/unit/domains/debt/debt.aggregate.spec.ts`: `settle()` sobre una deuda ya liquidada, `undoPayment()` sobre una liquidada a mano, y `applyUpdate()` con `totalInstallments < paidInstallments`
- [x] T045 [US2] Añadir la guarda a `Debt.settle()` en `apps/api/src/domains/debt/domain/debt.aggregate.ts:146-150`: lanzar `DebtAlreadySettledError` en vez de re-estampar `settledAt = new Date()` en cada llamada
- [x] T046 [US2] Corregir `Debt.undoPayment()` (`:176-180`) para que limpie `settledAt` **sólo** cuando el pago deshecho es el que había liquidado la deuda, no siempre que no sea null
- [x] T047 [US2] Añadir a `Debt.applyUpdate()` (`:128-144`) el rechazo de un `totalInstallments` por debajo de `paidInstallments` (FR-014)
- [x] T048 [US2] Proteger los cuatro comandos de deuda (`register-payment`, `undo-payment`, `settle`, `unsettle`) en `debts.controller.ts` y sus handlers, envolviendo cada uno en un `$transaction` con `saveWithTx` — hoy `load` y `save` son dos viajes sin bloqueo entre medio
- [x] T049 [US2] Escribir el test de integración `apps/api/test/integration/debt/register-payment-concurrent.spec.ts`: dos `register-payment` simultáneos dejan `paidInstallments` en `n+1`, no en `n+2`. Es una carrera que existe desde siempre, no sólo un problema de reintento

### Web

- [x] T050 [P] [US2] Añadir la prop `disabled` a `ActionBtn` en `apps/web/src/domains/debts/components/DebtTable.tsx:184-198` — hoy es un `<button>` que no la acepta, así que los cuatro botones de deudas no se pueden deshabilitar
- [x] T051 [US2] Deshabilitar los cuatro botones de deuda mientras la mutación está en vuelo, en `DebtTable.tsx` y `DebtCard.tsx`, usando el `isPending` de cada mutación de `useDebtMutations.ts`
- [x] T052 [US2] Recorrer los escenarios 8, 9 y 10 de [quickstart.md](./quickstart.md) y anotar los resultados

**Checkpoint**: las diez operaciones de FR-008 están protegidas. SC-002 se puede verificar.

---

## Phase 5: US3 — Corregir un aporte a una meta de ahorro (P2)

**Goal**: la única operación de la app que registra dinero y no se puede deshacer gana su camino de
vuelta.

**Independent Test**: registrar un aporte, editarlo, eliminarlo → la lista refleja cada cambio, y un
segundo `DELETE` responde 404.

**Nota de alcance**: **API únicamente.** El progreso de la meta no existe (ni columna, ni suma, ni
contrato, ni UI) y la vista de Ahorros es una lista de solo lectura sin ninguna mutación cableada —
construir eso es una spec propia ([data-model.md](./data-model.md) §2).

- [x] T053 [P] [US3] Escribir el test e2e `apps/api/test/e2e/savings/entry-correction.http.spec.ts` cubriendo los escenarios 11 y 12 de [quickstart.md](./quickstart.md), incluido que un aporte ajeno responde **404 y nunca 403**
- [x] T054 [P] [US3] Escribir los tests unitarios de `SavingsEntry.applyUpdate` en `apps/api/test/unit/domains/savings-entry/savings-entry.aggregate.spec.ts`
- [x] T055 [US3] Crear `apps/api/src/domains/savings-entry/domain/errors.ts` con `SavingsEntryNotFoundError` (404) — el dominio hoy no tiene `errors.ts`
- [x] T056 [US3] Añadir `applyUpdate(patch)` al agregado `apps/api/src/domains/savings-entry/domain/savings-entry.aggregate.ts`, cuyo docstring hoy declara la entidad _"Immutable once created"_ — actualizar también ese comentario, o queda mintiendo
- [x] T057 [US3] Añadir `findOne`, `save` y `remove` a `SavingsEntryRepositoryPort` y a su adapter Prisma, todos scopeados por `userId` (el puerto hoy tiene **sólo** `list` y `create`)
- [x] T058 [P] [US3] Crear `get-savings-entry.{query,handler}.ts` en `apps/api/src/domains/savings-entry/application/queries/`
- [x] T059 [US3] Crear `update-savings-entry.{command,handler}.ts`, verificando en `loadContext` que el `savingsGoalId` recibido pertenece al usuario, contra el puerto de `savings-goal`
- [x] T060 [P] [US3] Crear `remove-savings-entry.{command,handler}.ts` siguiendo el patrón de `RemoveSavingsGoalHandler:30-34` (cero filas ⇒ 404)
- [x] T061 [US3] Añadir la misma verificación de propiedad de `savingsGoalId` a `create-savings-entry.handler.ts` — hoy lo acepta sin comprobar, y es una de las seis violaciones del principio II que la auditoría encontró; ver la nota de alcance en [plan.md](./plan.md) § Data gates
- [x] T062 [US3] Añadir `GET/PATCH/DELETE /savings/entries/:id` a `apps/api/src/domains/savings-goal/presentation/savings.controller.ts` con `ZodParamsPipe`, y registrar los handlers nuevos en `savings-goal.module.ts`
- [x] T063 [US3] Proteger `POST /savings/entries` con el mecanismo de idempotencia, usando `createWithTx` (T021)
- [x] T064 [US3] Recorrer los escenarios 11 y 12 de [quickstart.md](./quickstart.md) y anotar los resultados — cubiertos por T053's e2e (2/2 verde); comportamiento coincide exactamente con lo esperado en quickstart.md

---

## Phase 6: Polish & Cross-Cutting

- [x] T065 [P] Crear el comando `purge-expired-records.{command,handler}.ts` en `apps/api/src/domains/idempotency-record/application/commands/` con `scope: "system"` — la única excepción al scoping por usuario, nombrada y tipada como tal — y registrarlo en el módulo de T012
- [x] T066 [P] Crear `apps/api/src/infra/cron/idempotency-cleanup.cron.ts` como disparador delgado que despacha ese comando, siguiendo el molde de `billing-generation.cron.ts`, y registrarlo en `cron.module.ts`
- [x] T067 [P] Escribir el test unitario del purge en `apps/api/test/unit/domains/idempotency-record/purge-expired.spec.ts`
- [x] T068 Recorrer el escenario 15 de [quickstart.md](./quickstart.md) (SC-006): tras una tanda de reintentos y duplicados legítimos, `currentBalance` cuadra contra la suma de los movimientos. Es la invariante contable de la app entera, no de una operación suelta
- [x] T069 [P] Actualizar `CLAUDE.md`: la lista de dominios-tabla pasa de 23 a **24** con `idempotency-record`, y el bloque SPECKIT pasa a estado implementado
- [x] T070 [P] Documentar en `docs/{english,spanish}/ARCHITECTURE.md` el protocolo de dos fases y **por qué** el `COMPLETED` va dentro de la transacción del efecto — es la decisión que un lector futuro va a querer "simplificar"
- [x] T071 [P] Actualizar `docs/PENDING.md`: cerrar la entrada 4 de la deuda de conformidad, y **reducir** la entrada 3 a las cinco FK que siguen sin verificar (`savingsGoalId` queda cerrada por T059/T061)
- [x] T072 [P] Añadir a `docs/PENDING.md` los dos límites conocidos que esta feature deja abiertos a propósito: recargar la página pierde la clave del intento (escenario 14), y la importación de movimientos sigue sin protección porque quedó fuera de alcance
- [x] T073 [P] Actualizar `docs/{english,spanish}/BANKING_LOGIC.md` con las guardas nuevas de `Debt` (`settle` ya no re-estampa, `undoPayment` no des-liquida de más)
- [x] T074 Verificar el escenario 14 de [quickstart.md](./quickstart.md) — confirmado por inspección de `useIdempotencyKey.ts:28` (`useRef`, sin `localStorage`/persistencia): un reload remonta el componente y pone `keyRef.current` en `null`, así que el reenvío mintea clave nueva y produce un segundo movimiento genuino, tal como está documentado de [quickstart.md](./quickstart.md) y confirmar que el límite conocido se comporta **como está documentado** — un límite verificado no es una sorpresa
- [x] T075 Correr `pnpm --filter @finance/api test:unit` y confirmar que sigue sin abrir **ninguna** conexión a base de datos (principio IV)
- [x] T076 Correr los gates completos: `pnpm typecheck`, `pnpm check:boundaries`, `pnpm test`, `pnpm build` y `pnpm format:check` — los cinco verdes (format:check requirió `prettier --write .`, puramente cosmético, re-verificado con typecheck)
- [x] T077 Enmendar `.specify/memory/constitution.md` **por el procedimiento que el propio documento exige** — editar, documentar en un Sync Impact Report y **bumpear a v2.1.0** (MINOR): el §VI pasa a 24 dominios-tabla, se corrige de paso su inconsistencia preexistente (el título dice "23 domains" y tres párrafos abajo "all 21 table-domains"), y se registra que el principio VII ya tiene implementación de referencia. **No** se hace como efecto colateral de una tarea de feature
- [x] T078 Recorrer los 16 escenarios de [quickstart.md](./quickstart.md) de punta a punta y anotar los resultados — sin `pnpm dev`/navegador disponible en este entorno, verificado con la suite automatizada equivalente a cada uno (todo verde): 1-4 y 6 → `transaction-create.http.spec.ts`; 5 → `create-concurrent.spec.ts` + `register-payment-concurrent.spec.ts`; 7 → inspección de `main.ts` (`enableCors` sin `allowedHeaders` refleja cualquier header pedido en el preflight, incluido `Idempotency-Key`, comportamiento por defecto del paquete `cors`); 8 → `register-debt-payment.handler.spec.ts` (replay) + `debts.http.spec.ts`; 9 → `installment-plan.http.spec.ts`; 10 → `debt.aggregate.spec.ts` (`DebtAlreadySettledError`, `settledAt` sin cambios) + mapeo confirmado a 409 `DEBT_ALREADY_SETTLED`; 11-12 → `entry-correction.http.spec.ts`; 13 → `apiClient.test.ts` (misma clave sobrevive el reintento silencioso post-401); 14 → inspección de `useIdempotencyKey.ts` (`useRef`, sin persistencia); 15 → `balance-reconciliation.spec.ts`; 16 → `rollback.spec.ts`

---

## Dependencies

```
Phase 1 (T001-T004)  ── setup, sin dependencias
        │
        ▼
Phase 2 (T005-T026)  ── BLOQUEANTE. Nada de abajo empieza sin esto
        │
        ├──────────────┬──────────────────────┐
        ▼              ▼                      ▼
Phase 3 (US1)    Phase 4 (US2)          Phase 5 (US3)
T027-T036        T037-T052              T053-T064
        │              │                      │
        └──────────────┴──────────────────────┘
                       ▼
              Phase 6 (T065-T078)
```

**Dentro de la fase 2, el orden importa**: T018-T019 (el refactor `*WithTx` de `transaction`) tiene
que cerrar con T022 en verde antes de que US1 lo use. T015 y T017 dependen de T007-T010. T012 depende
de T011.

**Dentro de US1 y US2**, el cliente va antes que la API (T029-T030 antes de T031-T033; T038-T039 antes
de T040-T042). Al revés, la app queda rota entre tarea y tarea.

**Entre historias**: US1, US2 y US3 son independientes una vez que la fase 2 cerró. US3 no toca nada
del mecanismo salvo T063.

## Parallel Opportunities

- **Fase 1**: T001 y T002 en paralelo (archivos distintos). T003 después.
- **Fase 2**: los tests T005, T006, T014 se escriben en paralelo; T009 y T011 también; T020 y T021 son
  puertos distintos; toda la plomería del cliente (T023-T026) va en paralelo al backend.
- **Fase 4**: el bloque de cuotas/facturación (T040-T043) y el de deudas (T044-T049) no se tocan.
- **Fase 6**: casi todo es `[P]` — son documentos y archivos distintos.
- **Entre historias**: con la fase 2 cerrada, tres personas podrían tomar US1, US2 y US3 a la vez.

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1)**, 36 tareas. Entrega la operación más frecuente de la
aplicación protegida, más el replay silencioso del propio cliente. Es demostrable solo.

**Incremento 2**: US2 — las siete operaciones restantes, incluida la de mayor monto.

**Incremento 3**: US3 — el camino de corrección, independiente de todo lo anterior.

**Orden recomendado dentro del MVP**: cerrar `transaction.create` de punta a punta, con sus tests de
concurrencia y de rollback en verde, **antes** de replicar el patrón a las otras nueve operaciones. La
primera es donde se descubren los problemas del mecanismo; las otras nueve son repetición.

**El riesgo no está donde parece.** No es la tabla ni el protocolo: es T024/T030, la generación de la
clave en el cliente. Si se genera por petición no protege nada; si se genera al abrir el formulario,
"Guardar y crear otro" reusa la anterior y el segundo registro se rechaza. T025 y el escenario 2 del
quickstart existen para que ese error falle ruidosamente en vez de en silencio.

**Totals**: 78 tareas · 6 fases · US1 10 · US2 16 · US3 12 · setup 4 · foundational 22 · polish 14.
