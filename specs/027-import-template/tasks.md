# Tasks: Plantilla oficial de importación en bloque

**Input**: Design documents from `specs/027-import-template/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/import-template.md, quickstart.md

**Tests**: incluidos — Principio IV (Test-First, NON-NEGOTIABLE). En cada historia, los tests se
escriben primero y deben fallar antes de implementar.

**Organization**: por historia de usuario (spec.md), en orden de prioridad: US1, US2, US6 (P1) →
US3, US4 (P2) → US5 (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US6)
- Rutas relativas a la raíz del repo. Tests del API en `apps/api/test/{unit,integration,e2e}/domains/<dominio>/`.
- Ejecutar SIEMPRE tests acotados (ver quickstart.md), nunca la suite completa por defecto.

---

## Phase 1: Setup

- [X] T001 Agregar `exceljs@4.4.0` como dependencia de `apps/web/package.json` (`pnpm --filter @finance/web add exceljs@4.4.0`) y verificar `pnpm audit --audit-level=high` limpio (research R1; si CI lo exige, `pnpm.overrides.uuid` en `package.json` raíz)
- [X] T002 [P] Crear `packages/contracts/src/import/template.ts` vacío exportado desde `packages/contracts/src/import/index.ts` (namespace `imports`, mismo que `importRowSchema`)

---

## Phase 2: Foundational (bloquea todas las historias)

**Purpose**: contrato completo, puertos `*WithTx` que faltan, esqueleto del comando/consulta y del lector web. Ninguna historia puede empezar sin esto.

### Contrato

- [X] T003 Test de contrato en `packages/contracts/src/import/template.test.ts`: acepta un request mínimo por hoja; rechaza 0 filas y > `TEMPLATE_IMPORT_MAX_ROWS` (5000); todo id es `rowId`; montos `moneyString` positivos; `TemplatePlanPayment` y `balanceModes` según data-model.md
- [X] T004 Implementar en `packages/contracts/src/import/template.ts`: `TEMPLATE_VERSION = 1`, `TEMPLATE_IMPORT_MAX_ROWS`, `templateSheetKey` (enum de 9 claves), schemas de las 9 filas (cada una con `row: z.number().int().min(2)`), `balanceModeSchema`, `templateImportRequestSchema` (refine de conteo), `templatePreviewResponseSchema` y `templateImportResultSchema` — exactamente como data-model.md y contracts/import-template.md

### Puertos y adapters (API)

- [X] T005 [P] Test de integración `apps/api/test/integration/domains/debt/create-with-tx.integration.spec.ts`: `createWithTx` persiste y hace rollback con la transacción que lo envuelve — *(hecho: T005–T009 y T014b en un solo archivo, `apps/api/test/integration/domains/import/tx-ports.spec.ts`)*
- [X] T006 [P] Test de integración `apps/api/test/integration/domains/recurring-expense/create-with-tx.integration.spec.ts` (mismo patrón)
- [X] T007 [P] Test de integración `apps/api/test/integration/domains/savings-goal/create-with-tx.integration.spec.ts` (mismo patrón)
- [X] T008 [P] Test de integración `apps/api/test/integration/domains/bank-account/adjust-opening.integration.spec.ts`: `adjustOpeningWithTx` mueve `initialBalance` y `creditUsedInitial` y no toca `currentBalance`/`creditUsed`
- [X] T009 [P] Test de integración `apps/api/test/integration/domains/transaction/create-many-with-ids.integration.spec.ts`: `createManyWithTx` respeta un `id` provisto y acuña uno si falta
- [X] T010 [P] `createWithTx(tx, userId, plan)` en `apps/api/src/domains/debt/domain/ports/debt.repository.port.ts` + `apps/api/src/domains/debt/infrastructure/prisma-debt.repository.ts` (`create` delega en él con `this.prisma`)
- [X] T011 [P] `createWithTx` en `apps/api/src/domains/recurring-expense/domain/ports/recurring-expense.repository.port.ts` + su adapter Prisma (mismo patrón que T010)
- [X] T012 [P] `createWithTx` en `apps/api/src/domains/savings-goal/domain/ports/savings-goal.repository.port.ts` + su adapter Prisma (mismo patrón)
- [X] T013 [P] `adjustOpeningWithTx(tx, accountId, balanceDelta, creditDelta)` en `apps/api/src/domains/bank-account/domain/ports/bank-account.repository.port.ts` + `apps/api/src/domains/bank-account/infrastructure/prisma-bank-account.repository.ts` (`increment` atómico de ambas columnas)
- [X] T014 [P] `id` opcional por fila en `createManyWithTx` de `apps/api/src/domains/transaction/domain/ports/transaction-writer.repository.port.ts` y su adapter; incluir en cada fila `debtId`/`installmentPlanId`/`savingsEntryId`/`transferGroupId` opcionales
- [X] T014b [P] `findOrCreateOpenForAccountWithTx(tx, accountId, fallbackPeriodStart)` en `apps/api/src/domains/credit-statement/domain/ports/credit-statement.repository.port.ts` + su adapter Prisma (`findOrCreateOpenForAccount` delega en él con `this.prisma`), con test de integración en `apps/api/test/integration/domains/credit-statement/find-or-create-open-with-tx.integration.spec.ts` (hace rollback con su transacción) — research R9
- [X] T015 Agregar los métodos nuevos a los fakes de `apps/api/test/unit/support/fake-ports.ts` y a los fakes inline que implementen esos puertos (grep por `implements DebtRepositoryPort` etc. y por objetos fake en `apps/api/test/unit/`) para que el typecheck siga limpio

### Dominio `import` (API)

- [X] T016 Códigos nuevos en `apps/api/src/domains/import/domain/errors.ts`: `TemplateRowRejectedError` (`field: "<sheet>.<row>"`, envuelve cualquier `DomainError` con su propio código/status, como `ImportRowRejectedError.from`) y los `IMPORT_*` de data-model.md (`IMPORT_ACCOUNT_INACTIVE`, `IMPORT_CURRENCY_MISMATCH`, `IMPORT_DUPLICATE_REF`, `IMPORT_UNKNOWN_REF`, `IMPORT_TOO_MANY_PAYMENTS`, `IMPORT_INVALID_SEQUENCE`, `IMPORT_PAYMENT_BEFORE_START`, `IMPORT_PAYMENT_AMOUNT_MISMATCH`, `IMPORT_PLAN_PAYMENT_FIELDS`)
- [X] T017 Test unit `apps/api/test/unit/domains/import/domain/template-plan.spec.ts` (núcleo): línea de tiempo por cuenta ordenada por fecha → orden de hoja → fila; un error devuelve `{code, sheet, row}`; en modo preview se acumulan TODOS los errores, en modo aplicar el primero lanza; efecto neto por cuenta (`netCash`, `netCredit`) con modo `INCLUDED` (contexto parte de saldo actual − neto) y `ADD`
- [X] T018 Implementar el núcleo de `planTemplateImport` en `apps/api/src/domains/import/domain/template-plan.ts` (puro): contexto corriente por cuenta (`AccountContext` + tarjetas como `planImport`), timeline, recolección de errores, totales por cuenta, conteos por hoja. Sin hojas aún (cada historia agrega las suyas)
- [X] T019 `apps/api/src/domains/import/application/template-context.loader.ts`: resuelve TODAS las FKs del body con ownership (contrato §Ownership) — cuentas vía `BankAccountRepositoryPort.findById` + `loadAccountContext`, tarjetas por cuenta (`CardAccountRepositoryPort.listByAccounts`, `CardLimitRepositoryPort`, `sumsForCard`, igual que `ImportTransactionsHandler.accountCards`), categorías una vez por `(id, tipo)` con `assertSelectableCategory`; una FK ajena → `ACCOUNT_NOT_FOUND`/`CARD_NOT_FOUND`/`CATEGORY_NOT_FOUND` con `sheet`/`row`; una cuenta `INACTIVE` → `IMPORT_ACCOUNT_INACTIVE`. **Solo lee**: nunca llama a `findOrCreateOpenForAccount` ni a nada que escriba (research R9)
- [X] T020 Test unit `apps/api/test/unit/domains/import/application/preview-template.handler.spec.ts`: devuelve `valid`, `counts`, `accounts[]`, `errors[]` sin llamar a ningún `*WithTx` ni a `findOrCreateOpenForAccount` (fake que falla si se invoca); una cuenta inactiva → `IMPORT_ACCOUNT_INACTIVE` — *(cubierto por el e2e `import-template.http.spec.ts`: "preview … writes nothing" cuenta filas antes/después, y el caso de todo-o-nada verifica que no se crea `CreditStatement`)*
- [X] T021 `PreviewTemplateQuery` + handler en `apps/api/src/domains/import/application/queries/preview-template.{query,handler}.ts` (loader + `planTemplateImport` en modo colectar)
- [X] T022 Test unit `apps/api/test/unit/domains/import/application/import-template.handler.spec.ts` (núcleo): operación `import.template`; una sola `$transaction` con `timeout: 60_000`; `complete()` dentro de la misma transacción; un error de plan lanza `TemplateRowRejectedError` y no escribe — *(cubierto por el e2e: reintento con la misma clave, 400 con `field: "<sheet>.<row>"` sin escribir nada, y `IDEMPOTENCY_KEY_REQUIRED`)*
- [X] T023 `ImportTemplateCommand` + `ImportTemplateHandler` en `apps/api/src/domains/import/application/commands/import-template.{command,handler}.ts` extendiendo `BaseIdempotentCommandHandler` (plan en `loadContext`, escritura en `handleIdempotent`); aplica el neto por cuenta con `incrementBalanceWithTx`/`incrementCreditUsedWithTx` (`ADD`) o `adjustOpeningWithTx` (`INCLUDED`)
- [X] T024 Rutas `POST /import/template/preview` y `POST /import/template` (con `requireIdempotencyKey`) en `apps/api/src/domains/import/presentation/import.controller.ts` usando `ZodValidationPipe(imports.templateImportRequestSchema)`; registrar handlers y data modules (`DebtDataModule`, `InstallmentPlanDataModule`, `InstallmentPaymentDataModule`, `RecurringExpenseDataModule`, `SavingsGoalDataModule`, `SavingsEntryDataModule`) en `apps/api/src/domains/import/import.module.ts`
- [X] T025 Mapear los códigos nuevos en `apps/web/src/i18n/es.json` y `en.json` bajo `errors.*`

### Web (lector y superficie comunes)

- [X] T026 [P] `apps/web/src/domains/import/lib/templateSpec.ts`: por hoja, clave estable, clave i18n del nombre, columnas (clave, clave i18n del encabezado, tipo: fecha/monto/texto/entero/lista, obligatoria), orden de hoja; `TEMPLATE_VERSION` desde el contrato
- [X] T027 [P] Test `apps/web/src/domains/import/lib/readTemplate.test.ts`: sin hoja `_cuadra` → `notTemplate`; versión distinta → `outdated`; hojas y encabezados reconocidos en es y en; filas vacías ignoradas; celda obligatoria vacía/fecha o monto ilegible → error `{sheet,row,column}`; fecha escrita como texto "28/11/2025" se lee día primero y una fecha de Excel también; archivo sin filas → `empty`
- [X] T028 `apps/web/src/domains/import/lib/readTemplate.ts`: lee todas las hojas con `read-excel-file` (reutiliza parseo de fechas/montos de `lib/importParsing.ts`), identifica hojas/columnas por rótulo en ambos idiomas, devuelve filas tipadas por hoja + errores de forma
- [X] T029 [P] Test `apps/web/src/domains/import/lib/resolveTemplate.test.ts` (núcleo): cuenta por nombre sin distinguir mayúsculas/espacios; nombre de cuenta duplicado → error en cada fila; tarjeta `"<cuenta> · ····1234"` o últimos 4 de la cuenta de la fila; categoría por nombre es/en o código (reutiliza `matchCategory`); produce el `TemplateImportRequest`
- [X] T030 `apps/web/src/domains/import/lib/resolveTemplate.ts` (núcleo de resolución compartido por todas las hojas)
- [X] T031 `apps/web/src/domains/import/api/importApi.ts` + `apps/web/src/domains/import/hooks/useTemplateImport.ts`: `preview(body)` y `commit(body)` (este con `useIdempotencyKey`, invalida `accounts`, `transactions`, `debts`, `installments`, `recurring`, `savings`)

**Checkpoint**: contrato, puertos, comando/consulta vacíos de hojas y lector web listos.

---

## Phase 3: User Story 1 — Descargar una plantilla hecha a la medida (P1) 🎯 MVP

**Goal**: el usuario descarga un `.xlsx` con sus cuentas activas, tarjetas y categorías elegibles en listas desplegables.

**Independent Test**: descargar con un usuario de 3 cuentas y 2 tarjetas; el archivo trae las 11 hojas visibles (Instrucciones, 9 de datos, Referencia) + `_cuadra` oculta, y las listas solo ofrecen esos valores (quickstart §1).

- [X] T032 [P] [US1] Test `apps/web/src/domains/import/lib/buildTemplate.test.ts`: genera un workbook (exceljs en memoria) con hojas en el orden de contracts §Plantilla, encabezados en el idioma pedido, hoja Referencia con solo cuentas ACTIVAS, tarjetas `"<cuenta> · ····last4"`, categorías que pasan `reference.isCategorySelectable` (nunca de sistema), `_cuadra` con `state: "veryHidden"`/`hidden` y `version`/`locale`, y validación de lista en las columnas cerradas
- [X] T033 [US1] `apps/web/src/domains/import/lib/buildTemplate.ts`: `buildTemplate({accounts, categories, t, locale})` → `Blob`, con `import("exceljs")` dinámico; formato de fecha y numérico por columna; un ejemplo por hoja SOLO en Instrucciones — las hojas de datos quedan vacías, para que ningún ejemplo se importe por olvido (spec US1 escenario 1)
- [X] T034 [US1] Textos de la plantilla (nombres de hoja, encabezados, instrucciones incl. qué mueve dinero y el aviso de reimportación) en `apps/web/src/i18n/es.json` y `en.json` bajo `import.template.*`
- [X] T035 [US1] Tarjeta "Plantilla Cuadra" en `apps/web/src/domains/import/routes/ImportRoute.tsx`: explicación breve + botón "Descargar plantilla" (usa `useAccounts({status:"active"})` y `useCategoryCatalog`) + botón "Subir plantilla" (abre T041); el selector de cuenta del importador de cartolas queda igual
- [X] T036 [US1] Test `apps/web/src/domains/import/routes/ImportRoute.test.tsx`: la tarjeta aparece, "Descargar" llama a `buildTemplate` con las cuentas activas, y el importador de cartolas sigue listando cuentas

**Checkpoint**: US1 entrega valor sola (plantilla descargable y usable como guía).

---

## Phase 4: User Story 2 — Importar movimientos y traspasos (P1)

**Goal**: las hojas Movimientos y Traspasos se aplican con el mismo efecto que la carga manual.

**Independent Test**: 20 movimientos en 3 cuentas + 2 traspasos → cada saldo cambia por su neto exacto; el traspaso no suma en totales (quickstart §2).

- [X] T037 [P] [US2] Tests unit en `apps/api/test/unit/domains/import/domain/template-plan.spec.ts` (hojas movements/transfers): gasto con tarjeta CREDIT toca `netCredit` y no `netCash`; gasto en cuenta de tarjeta de crédito sin tarjeta va a la primaria (como `planImport`); prepago negativo → `PREPAID_INSUFFICIENT_BALANCE` en su fila; traspaso a cuenta de tarjeta de crédito → `TRANSFER_TO_CREDIT_ACCOUNT`; moneda ≠ cuenta → `IMPORT_CURRENCY_MISMATCH`; tarjeta de otra cuenta → `CARD_ACCOUNT_MISMATCH`
- [X] T038 [P] [US2] Test e2e `apps/api/test/e2e/domains/import/import-template.http.spec.ts` (movimientos + traspasos): preview → commit → saldos y `GET /transactions/summary` excluye traspasos; reintento con el mismo `Idempotency-Key` no duplica; cuenta ajena → `ACCOUNT_NOT_FOUND`
- [X] T039 [US2] Hojas movements y transfers en `apps/api/src/domains/import/domain/template-plan.ts` (`MovementPolicy`, `TransferPolicy`, `cashDelta`/`isChargedToCredit`) y su escritura en `import-template.handler.ts`: `createManyWithTx` para movimientos (enlazando los que tocan cupo al período abierto vía `findOrCreateOpenForAccountWithTx`, resuelto DENTRO de la transacción, una vez por cuenta de crédito), `saveTransferPairWithTx` por traspaso (un `transferGroupId` por par)
- [X] T040 [US2] Resolución de las hojas Movimientos y Traspasos en `apps/web/src/domains/import/lib/resolveTemplate.ts` (+ casos en `resolveTemplate.test.ts`)
- [X] T041 [US2] `apps/web/src/domains/import/components/TemplateImportPanel.tsx` (`ResponsiveSurface`, mismo tamaño que `ImportMovementsPanel`): elegir/arrastrar archivo → `readTemplate` → `resolveTemplate` → `preview`; muestra conteos por hoja y "Importar"; éxito con toast y cierre
- [X] T042 [US2] Test `apps/web/src/domains/import/components/TemplateImportPanel.test.tsx`: flujo feliz con API mockeada (lee, previsualiza, confirma con `Idempotency-Key`)

**Checkpoint**: migración de movimientos completa (el grueso del caso de referencia).

---

## Phase 5: User Story 6 — Ver qué se va a importar y por qué falla (P1)

**Goal**: resumen previo con efecto por cuenta y modo de saldo; errores con hoja/fila/motivo; todo o nada; aviso de reimportación.

**Independent Test**: plantilla con 2 errores en hojas distintas → ambos listados, nada creado; corregida → importa completa (quickstart §3, §7, §8, §9).

- [X] T043 [P] [US6] Tests unit `template-plan.spec.ts` (modos): con `INCLUDED` el contexto de `MovementPolicy` parte de `saldo actual − neto` y `balanceAfter` = saldo actual; con `ADD` parte del saldo actual; una cuenta afectada sin entrada en `balanceModes` = `INCLUDED`
- [X] T044 [P] [US6] Test de integración `apps/api/test/integration/domains/import/import-template.integration.spec.ts`: un fallo en la última fila de la última hoja deja la base intacta (ningún `Transaction`, `Debt`, `CreditStatement` nuevo, saldo ni registro de idempotencia `COMPLETED`); preview no crea ninguna fila; modo `INCLUDED` mueve `initialBalance` y deja `currentBalance` igual — *(escrito como caso del e2e "all or nothing…", contra Postgres real)*
- [X] T045 [US6] Resumen por cuenta en `TemplateImportPanel.tsx`: nombre, neto, saldo (o cupo usado) resultante, y un `Segmented` "Mi saldo ya incluye estos movimientos" (por defecto) / "Súmalos a mi saldo" que re-dispara `preview`
- [X] T046 [US6] Lista de errores en `TemplateImportPanel.tsx` agrupada por hoja ("Movimientos · fila 12: …", mensaje vía `errors.<CODE>`), une errores locales (T028/T030) y del servidor; con al menos uno, "Importar" deshabilitado; un error del commit (`field: "<sheet>.<row>"`) se muestra igual
- [X] T047 [US6] Mensajes específicos para `notTemplate` (con enlace al importador de cartolas), `outdated` (con botón de descarga), `empty` y > 5.000 filas; y el aviso de reimportación (FR-027) sobre el botón Importar — textos en `import.template.*` es/en
- [X] T048 [US6] Casos en `TemplateImportPanel.test.tsx`: errores de dos hojas listados y botón deshabilitado; cambio de modo re-pide preview con `balanceModes`; aviso de reimportación visible; `notTemplate` muestra el enlace

**Checkpoint**: las tres historias P1 completas — MVP entregable.

---

## Phase 6: User Story 3 — Importar deudas con sus pagos (P2)

**Goal**: deudas creadas sin mover dinero; cada fila de pago es un movimiento real enlazado a su deuda.

**Independent Test**: "Me deben" 200.000 en 4 cuotas + 3 pagos → deuda 3/4, 50.000 pendiente, cuenta +150.000 (quickstart §4).

- [X] T049 [P] [US3] Tests unit `template-plan.spec.ts` (deudas): crear deuda no genera efecto; pago de "me deben" = INCOME, de "debo" = EXPENSE, por el monto de ESA cuota (`nextInstallmentAmount()`, o `pendingAmount()` si es la última — puede diferir por redondeo y NO es error); monto distinto de ese → `IMPORT_PAYMENT_AMOUNT_MISMATCH`; más pagos que cuotas → `IMPORT_TOO_MANY_PAYMENTS`; ref duplicada / huérfana → `IMPORT_DUPLICATE_REF`/`IMPORT_UNKNOWN_REF`; pago antes de `openedAt` → `IMPORT_PAYMENT_BEFORE_START`; pagar desde cuenta de tarjeta de crédito → `DEBT_PAYMENT_FROM_CREDIT_ACCOUNT`; todas las cuotas pagadas → liquidada
- [X] T050 [P] [US3] Caso e2e en `import-template.http.spec.ts`: la deuda de Victor; `GET /debts` muestra 3/4; los 3 movimientos tienen `debtId` (origen "Deuda"); la `ref` no aparece en ninguna respuesta (FR-014)
- [X] T051 [US3] Hojas debts y debtPayments en `template-plan.ts` (`Debt.planCreation`, `registerPayment`/`settle` en orden de fecha) y su escritura en el handler (`DebtRepositoryPort.createWithTx`, movimientos con `id` pre-acuñado y `debtId`, `saveWithTx` con `lastPayment*` del último pago)
- [X] T052 [US3] Resolución de Deudas y Pagos de deudas en `resolveTemplate.ts` (dirección, frecuencia, refs únicas y huérfanas detectadas localmente) + casos en `resolveTemplate.test.ts`

---

## Phase 7: User Story 4 — Importar planes de cuotas con sus pagos (P2)

**Goal**: planes con avance real; cuotas sin crédito mueven dinero con arrastre; cuotas con crédito pagadas fuera de la app nunca se facturan y liberan cupo.

**Independent Test**: plan 6 cuotas con crédito + 4 pagos → cupo ocupa 2 cuotas; la facturación posterior trae solo cuotas 5–6; plan sin crédito con 2 pagos → 2 gastos reales (quickstart §5).

- [X] T053 [P] [US4] Test de integración `apps/api/test/integration/domains/installment-payment/unbilled-excludes-paid.integration.spec.ts`: `listUnbilledDueForPlans` ya no devuelve una cuota con `paidAt` sin `creditStatementId`, y sigue devolviendo las impagas
- [X] T054 [US4] Agregar `paidAt: null` al `where` de `listUnbilledDueForPlans` en `apps/api/src/domains/installment-payment/infrastructure/prisma-installment-payment.repository.ts` (research R7) y correr los tests de `generate-statements`/`pay-credit-statement` existentes para confirmar que no cambian
- [X] T055 [P] [US4] Tests unit `template-plan.spec.ts` (planes): plan con crédito → compra (+ interés como `financeCharge`) suma a `netCredit` SIN validar cupo (research R12: una compra que excede el cupo se importa, igual que a mano); todas las cuotas pagadas → plan liquidado (FR-019), con y sin crédito; su pago de cuota libera `−monto` de cupo, sin movimiento; pago con cuenta/monto en plan de crédito o sin ellos en plan sin crédito → `IMPORT_PLAN_PAYMENT_FIELDS`; cuota inexistente o repetida → `IMPORT_INVALID_SEQUENCE`; plan sin crédito: pago = EXPENSE con arrastre de `payInstallment`; pagar desde tarjeta de crédito → `INSTALLMENT_PAYMENT_FROM_CREDIT_ACCOUNT`
- [X] T056 [P] [US4] Caso e2e en `import-template.http.spec.ts`: el notebook (crédito, 6 cuotas, 4 pagos) y un plan de débito con 3 de 3 pagos (queda liquidado, FR-019) más otro con 2 de 3; luego `POST /accounts/:id/generate-statements` tras el vencimiento de la 5ª trae solo esa cuota
- [X] T057 [US4] Hojas plans y planPayments en `template-plan.ts` (`InstallmentPlan.planCreation`, `assertPaymentAccountAllowed`, `payInstallment`) y escritura en el handler: `createWithTx` del plan + calendario, compra/interés como en `create-installment-plan.handler.ts#recordCreditCharges`, estado de cuota con `savePaymentWithTx` (crédito: `paidAt`/`paidAmount` sin `transactionId`; sin crédito: con su movimiento `installmentPlanId`)
- [X] T058 [US4] Resolución de Cuotas y Pagos de cuotas en `resolveTemplate.ts` + casos de test

---

## Phase 8: User Story 5 — Importar recurrentes, metas de ahorro y aportes (P3)

**Goal**: recurrentes activos sin mover dinero; metas abiertas; aportes como gasto real.

**Independent Test**: 3 recurrentes + 1 meta con 2 aportes → meta muestra la suma; la cuenta de origen baja por ella (quickstart §6).

- [X] T059 [P] [US5] Tests unit `template-plan.spec.ts` (recurrentes/metas/aportes): recurrente sin efecto; aporte = EXPENSE en su cuenta vía `MovementPolicy`; aporte antes de la creación de la meta → `IMPORT_PAYMENT_BEFORE_START`; ref huérfana → `IMPORT_UNKNOWN_REF`
- [X] T060 [P] [US5] Caso e2e en `import-template.http.spec.ts`: `GET /savings/goals` muestra `savedAmount` = suma de aportes; `GET /recurring` trae la serie activa con `nextDueAt`
- [X] T061 [US5] Hojas recurring, goals y contributions en `template-plan.ts` y escritura en el handler (`RecurringExpenseRepositoryPort.createWithTx`, `SavingsGoalRepositoryPort.createWithTx`, `SavingsEntryRepositoryPort.createWithTx` + movimiento con `savingsEntryId`)
- [X] T062 [US5] Resolución de Recurrentes, Metas y Aportes en `resolveTemplate.ts` + casos de test

---

## Phase 9: Polish & Cross-Cutting

- [X] T063 [P] Rendimiento (SC-005): test de integración con 2.000 filas de movimientos en `import-template.integration.spec.ts` — preview y commit bajo 10 s; ajustar consultas N+1 si aparecen. La lectura en el navegador (`readTemplate` + `resolveTemplate`) se mide a mano en T065 — *(e2e de 2.000 filas; destapó que Express rechazaba cuerpos > 100 KB con un 500 — también el importador de cartolas; se subió a 5 MB en `infra/http/body-limit.ts`)*
- [X] T064 [P] `apps/web/src/i18n/parity.test.ts` pasa (claves es/en idénticas)
- [ ] T065 Validación manual de quickstart.md §1–§10, incluido traspasar la hoja `Finanza` de `Finanzas Completo.xlsx` a la plantilla (SC-001); registrar lo no verificable — **pendiente**: sin herramienta de navegador en este entorno; la ida y vuelta real del `.xlsx` (exceljs → read-excel-file) sí está cubierta en `template.test.ts`
- [X] T066 Gates: `pnpm --filter @finance/contracts test`, typecheck/lint de `@finance/api` y `@finance/web`, `pnpm check:boundaries`, `pnpm format:check`, `pnpm audit --audit-level=high`, más los tests acotados de quickstart.md
- [X] T067 Memory sync: `CLAUDE.md` (bullet `import`: plantilla, endpoints, `exceljs`; bullet `installment-plan`: cuotas pagadas fuera de la app no se facturan; Current plan → implementado) y `.specify/memory/constitution.md` (versión PATCH + Sync Impact Report)

---

## Dependencies & Execution Order

- **Setup (Ph1)** → **Foundational (Ph2)** → historias.
- **US1** depende solo de Ph2 (usa `templateSpec`). **US2** depende de Ph2; su panel (T041) es la base de US6.
- **US6** depende de US2 (extiende `TemplateImportPanel` y usa hojas reales para probar modos/errores).
- **US3, US4, US5** dependen de Ph2 y de T041 (panel); son independientes entre sí. **US4** además requiere T054 antes de T056.
- **Polish** al final.

Dentro de cada historia: tests → dominio (`template-plan.ts`) → handler → web.

## Parallel Opportunities

- Ph2: T005–T009 (tests de puertos) juntos; T010–T014 (implementaciones) juntos; T026/T027/T029 en web mientras el API avanza.
- US3, US4 y US5 pueden ir en paralelo tras US6 si hay más de una persona (tocan secciones distintas de `template-plan.ts`/`resolveTemplate.ts` — coordinar merges).
- Los tests [P] de cada historia se escriben a la vez.

### Ejemplo — US4

```text
T053 test integración listUnbilledDueForPlans  |  T055 tests unit planes  |  T056 e2e notebook
→ T054 filtro paidAt → T057 plan + escritura → T058 resolución web
```

## Implementation Strategy

**MVP = US1 + US2 + US6** (las tres P1): descargar plantilla, importar movimientos y traspasos con
resumen, modos de saldo y errores. Cubre ~90 % de las filas del caso de referencia. Luego US3
(deudas, el caso de Victor), US4 (cuotas, el notebook) y US5. Cada checkpoint deja la app usable y
todos los tests acotados en verde.
