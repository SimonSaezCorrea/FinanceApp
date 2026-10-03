# Research: Plantilla oficial de importación en bloque (027)

Cada decisión cita el código que la motivó. Formato: Decisión / Motivo / Alternativas.

## R1 — Dónde se genera la plantilla: en el navegador

**Decisión**: la plantilla `.xlsx` se genera en `apps/web`, al hacer clic en "Descargar plantilla",
con **`exceljs`** cargado bajo demanda (`import()`, su propio chunk, igual que `read-excel-file`
hoy). El web ya tiene todo lo que la personaliza: cuentas (`useAccounts`), tarjetas (vienen en cada
cuenta) y categorías (`useCategoryCatalog`, filtradas por `reference.isCategorySelectable`).

**Motivo**: la plantilla es texto localizado (nombres de hoja, encabezados, instrucciones). La
constitución (III) y la convención de errores dicen que el API **nunca** devuelve texto localizado y
que los catálogos es/en viven en `apps/web/src/i18n`. Generarla en el servidor obligaría a duplicar
catálogos en el API o a romper esa regla. Además evita un endpoint binario nuevo.

**Verificado**: `exceljs@4.4.0` escribe listas desplegables que apuntan a otra hoja
(`dataValidations.add('B2:B5000', {type:'list', formulae:["Ref!$A$1:$A$3"]})`), probado en el
scratchpad. `pnpm audit --audit-level=high` pasa: su único aviso es **moderado** (`uuid <11.1.1`,
GHSA-w5hq-g745-h8pq, ruta `exceljs>uuid`, afecta v3/v5/v6 con buffer — exceljs usa v4). No hace falta
override; si CI lo pide, `pnpm.overrides.uuid` como los demás.

**Alternativas**: generar en el API (`GET /import/template`) — rechazado por i18n. `write-excel-file`
(mismo autor que `read-excel-file`) — no soporta validación de datos (listas desplegables), que es
FR-004. SheetJS — ya descartado en el importador de cartolas (build npm abandonado con avisos altos).

## R2 — Dónde se lee la plantilla: en el navegador, validación autoritativa en el servidor

**Decisión**: el navegador lee el archivo con `read-excel-file` (ya dependencia, lee todas las hojas),
reconoce la plantilla, convierte cada hoja en filas tipadas, resuelve nombres → ids con los mismos
catálogos con que generó la plantilla, y marca localmente lo que ya sabe que está mal (celda vacía
obligatoria, nombre desconocido, referencia huérfana). Envía JSON. El servidor revalida TODO
(ownership, reglas de negocio, referencias) y es el único que puede decir "se puede importar".

**Motivo**: mismo reparto que el importador de cartolas (`resolveRows.ts` en web, `planImport` en
API). Las reglas de saldo/cupo/sobregiro solo existen en el servidor (`MovementPolicy`).

**Alternativas**: subir el `.xlsx` al API y parsearlo allá (multipart, como adjuntos) — duplicaría el
lector y el API no tiene los rótulos localizados para reconocer encabezados.

## R3 — Reconocer la plantilla y su versión

**Decisión**: una hoja oculta `_cuadra` con `version` (entero, empieza en 1) y `locale`. Cada hoja de
datos tiene su encabezado visible localizado en la fila 1; el lector identifica hojas y columnas por
**clave estable**, buscando el rótulo en los catálogos es y en (una plantilla bajada en inglés se
puede subir con la app en español). Sin `_cuadra` → "no es una plantilla de Cuadra" (FR-028, con
enlace al importador de cartolas); versión distinta → "descarga la plantilla actual".

**Motivo**: FR-005/FR-028 exigen distinguir tres rechazos. Una hoja oculta sobrevive a que el usuario
edite y guarde en Excel.

## R4 — Un solo comando, una sola `$transaction`, en el dominio `import`

**Decisión**: `ImportTemplateHandler` (dominio `import`, sin tabla propia) extiende
`BaseIdempotentCommandHandler`, operación **`import.template`**, y escribe todo en UNA
`prisma.$transaction` con `timeout` explícito (60 s: 5.000 filas no caben en los 5 s por defecto de
Prisma). Cada tabla se escribe por el puerto de su dominio (`*WithTx`), nunca con Prisma directo.

**Motivo**: FR-025 (todo o nada) y FR-026 (reintento seguro, Principio VII forma (c)). Precedente
exacto: `ImportTransactionsHandler` y `PayCreditStatementHandler` (transacción cruzada documentada).

**Faltan `*WithTx`** (verificado en los puertos): `DebtRepositoryPort.createWithTx`,
`RecurringExpenseRepositoryPort.createWithTx`, `SavingsGoalRepositoryPort.createWithTx`,
`BankAccountRepositoryPort.adjustOpeningWithTx` (R8), y una variante de
`TransactionWriterRepositoryPort.createManyWithTx` que acepte ids pre-acuñados (los pagos de deuda,
cuota y aporte necesitan el id del movimiento para enlazarlo). Los demás existen:
`InstallmentPlanRepositoryPort.createWithTx`, `savePaymentWithTx`, `SavingsEntryRepositoryPort.createWithTx`,
`TransactionRepositoryPort.saveTransferPairWithTx`, `incrementBalanceWithTx`,
`incrementCreditUsedWithTx`.

**Alternativas**: llamar a los comandos existentes uno por uno por el `CommandBus` — cada uno abre su
propia transacción y su propia clave de idempotencia: no hay todo-o-nada posible.

## R5 — Las reglas de negocio se reutilizan, no se reescriben

**Decisión**: la planificación es una función pura nueva, `planTemplateImport`
(`import/domain/template-plan.ts`), que construye cada registro con el `planCreation` del agregado
dueño (`Debt.planCreation`, `InstallmentPlan.planCreation` — que ya calcula el calendario con
`equalPrincipalSchedule` —, `RecurringExpense.planCreation`, `SavingsGoal.planCreation`,
`SavingsEntry.planCreation`), aplica los pagos con los métodos del agregado (`Debt.registerPayment`,
`InstallmentPlan.payInstallment` con su arrastre) y valida cada efecto en dinero con
`MovementPolicy`/`TransferPolicy`, igual que `planImport`.

**Motivo**: FR-015 ("mismo efecto que a mano") y SC-006 solo se sostienen si la regla es literalmente
la misma función.

## R6 — Orden de aplicación: línea de tiempo por cuenta

**Decisión**: todo lo que mueve dinero (movimientos, las dos patas de un traspaso, pagos de deuda,
pagos de cuota sin crédito, la compra de un plan con crédito y su interés, aportes) se ordena en una
línea de tiempo por fecha (desempate: orden de hoja fijo, luego número de fila) y se valida contra
el contexto corriente de cada cuenta (FR-024). Un error lleva `{sheet, row}` de la fila culpable.

**Punto de partida del contexto** según el modo de saldo elegido (R8): con "ya incluye", el replay
arranca en `saldo actual − efecto neto importado` (el saldo de apertura resultante); con "súmalos",
en el saldo actual.

**Limitación documentada**: el replay no intercala los movimientos que la cuenta YA tiene en la app;
valida la plantilla sobre su propio saldo de partida.

## R7 — Cuotas pagadas de un plan con tarjeta de crédito (Clarificación Q1)

**Decisión**: la cuota se guarda con `paidAt` = fecha de la fila y `paidAmount` = su monto, **sin**
`creditStatementId` ni `transactionId`, y el cupo se libera con
`incrementCreditUsedWithTx(−Σ cuotas pagadas)` en la misma transacción. Para que la facturación no la
vuelva a cobrar, **`listUnbilledDueForPlans` agrega `paidAt: null`** a su filtro
(`prisma-installment-payment.repository.ts:45`), que alimenta tanto `closeIfDue` como
`seedPeriodFromSchedule` (`generate-statements.handler.ts:62`).

**Motivo**: hoy la selección es `creditStatementId IS NULL AND dueDate <= closedAt` y **no mira
`paidAt`** — sin ese filtro, el primer cierre cobraría como facturación cuotas ya pagadas (el
problema que motivó la Q1). El filtro nuevo no cambia nada existente: en un plan con crédito,
`paidAt` solo se estampa hoy por `settleForStatementWithTx`, que exige `creditStatementId` ya puesto.

## R8 — Modo de saldo por cuenta (Clarificación Q2)

**Decisión**: el request trae `balanceModes: {accountId, mode: "INCLUDED" | "ADD"}[]` (por defecto
`INCLUDED` para toda cuenta afectada). Con `INCLUDED`, el handler NO llama a
`incrementBalanceWithTx`/`incrementCreditUsedWithTx` por el neto, y en su lugar llama a
`adjustOpeningWithTx(accountId, −netCash, −netCredit)`, que mueve `initialBalance` y
`creditUsedInitial`: se mantiene `currentBalance = initialBalance + Σ` y el saldo visible no cambia.
Con `ADD`, se aplican los incrementos como en el importador actual.

La liberación de cupo de R7 es parte del neto de crédito de la cuenta: con `INCLUDED` también se
absorbe en `creditUsedInitial`, así que el cupo usado visible queda igual que antes de importar —
que es exactamente lo que el usuario afirmó al elegir ese modo. Con `ADD` se aplica.

## R9 — Vista previa sin escribir

**Decisión**: `POST /import/template/preview` corre `loadContext` + `planTemplateImport` y devuelve
`{counts por hoja, efecto por cuenta (netCash, netCredit, saldo y cupo resultantes por modo),
errors[]}` sin tocar la base. No lleva `Idempotency-Key` (no escribe). El web la vuelve a pedir si el
usuario cambia un modo de saldo (las reglas dependen del modo, R6).

**Motivo**: FR-022/FR-023: el usuario ve el efecto y los errores de negocio antes de confirmar;
un error de `MovementPolicy` solo lo puede calcular el servidor.

**Nada de lo que corre en preview puede escribir**: el período abierto de facturación al que se
enlazan los movimientos que tocan cupo NO se resuelve en el loader (hoy `findOrCreateOpenForAccount`
lo crea fuera de transacción, y el importador de cartolas lo llama en `loadContext`). En la plantilla
se resuelve dentro de la `$transaction` del commit con un `findOrCreateOpenForAccountWithTx` nuevo,
lo que además mantiene el todo-o-nada: un commit fallido no deja un período OPEN huérfano.

## R12 — La compra de un plan con crédito no se valida contra el cupo

**Decisión**: igual que al crear un plan a mano (`create-installment-plan.handler.ts#charge` solo
incrementa `creditUsed`), la compra y el interés de un plan importado se suman al cupo sin pasar por
`CARD_LIMIT_EXCEEDED`. Los movimientos de la hoja Movimientos sí se validan.

**Motivo**: FR-015 ("mismo efecto que a mano") prevalece; validar solo en la importación haría que
un plan que se puede crear a mano no se pueda importar.

## R13 — Códigos de moneda

**Decisión**: la plantilla usa `IMPORT_CURRENCY_MISMATCH` para toda hoja (incluidos pagos de deuda,
donde el flujo manual usa `DEBT_PAYMENT_CURRENCY_MISMATCH`): un solo mensaje uniforme por fila.

## R10 — Referencias

**Decisión**: `ref` es texto libre, único por hoja (comparación sin mayúsculas ni espacios en los
extremos), resuelto dentro del mismo request; no se persiste (FR-014). El cliente ya detecta
duplicadas y huérfanas; el servidor lo revalida.

## R11 — Límite y rendimiento

**Decisión**: `TEMPLATE_IMPORT_MAX_ROWS = 5000` (suma de todas las hojas) en el schema de contrato.
Movimientos y patas de traspaso se insertan en bloque (`createMany`); deudas, planes, metas y
recurrentes (decenas) uno por uno dentro de la misma transacción. Categorías se validan una vez por
par `(categoría, tipo)` distinto, como `ImportTransactionsHandler`.
