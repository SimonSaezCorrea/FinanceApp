# Research — 028 Facturación separada por moneda

Todas las decisiones parten del código actual (`credit-statement`, `transaction`, `bank-account`,
`import`) y de lo que ya aterrizó en la 027: topes por moneda en la tarjeta principal
(`CardLimit`), `MovementPolicy` que acepta un INGRESO con tarjeta como pago de su tope propio, y la
columna Moneda de la plantilla.

## R1 — La moneda es una columna del período, no un segundo modelo

- **Decision**: `CreditStatement.currency` (String, 3, `@default("CLP")`). El default existe solo
  para que `db push` pueda agregar la columna obligatoria a las filas ya guardadas —la base local tiene
  datos reales del usuario y todas sus cuentas de crédito son CLP, así que el backfill es correcto—;
  todo período nuevo se crea SIEMPRE con su moneda explícita, nunca por el default.
  Invariante: como máximo UN período abierto por `(accountId, currency)`.
- **Rationale**: el ciclo de vida (OPEN → PENDING → PAID/PARTIALLY_PAID), el arrastre, el pago
  mínimo y la sincronización son idénticos en ambas monedas; duplicar el agregado duplicaría las
  reglas del Principio I.
- **Alternatives**: una tabla `credit-statement-foreign` (rechazada: dos agregados con las mismas
  reglas, y el Principio VI pediría su propio dominio); un período por cuenta con importes por
  moneda en JSON (rechazado: rompe `totalFor`/arrastre, que son escalares).

## R2 — El ciclo es de la cuenta: todas las monedas se anclan al mismo `periodStart`

- **Decision**: al crear un período abierto de cualquier moneda, `periodStart` = el `closedAt` más
  reciente entre TODOS los períodos de la cuenta (no solo los de esa moneda); si no hay, el
  `createdAt` de la cuenta. El cierre (`closeIfDue`) recorre todos los períodos abiertos de la cuenta
  y cierra cada uno con **el mismo `boundary`**, calculado desde el `periodStart` del período en la
  moneda de la cuenta (o, si no hay, desde el propio).
- **Rationale**: con `BUSINESS_DAY` el límite se cuenta desde `periodStart`; si el período USD
  naciera con otra fecha, cerraría otro día (FR-003 exige la misma fecha). Hoy
  `findOrCreateOpenForAccount` ya toma el último `closedAt` de la cuenta; solo cambia de "el último
  creado" a "el `closedAt` máximo".
- **Alternatives**: cerrar cada moneda con su propio límite (rechazado: contradice FR-003).

## R3 — El uso del tope en otra moneda sigue siendo derivado; el pago lo baja con un movimiento

- **Decision**: el cupo en la moneda de la cuenta sigue persistido (`BankAccount.creditUsed`); el
  uso de un tope en otra moneda sigue derivado de los movimientos con esa tarjeta en esa moneda
  (`sumsForCard`: usado = inicial + Σgasto − Σingreso). Pagar o traspasar una facturación USD crea
  un **movimiento de liquidación**: un INGRESO en USD en la cuenta de crédito, con la tarjeta dueña
  del tope (la que ya acepta `MovementPolicy` desde la 027), que baja ese uso.
- **Rationale**: es exactamente lo que registra el Excel de referencia ("Ingreso · Pago tarjeta de
  crédito USD 70,72"), reutiliza la regla de dominio de la 027 y no introduce una segunda fuente de
  verdad del uso.
- **Alternatives**: persistir `CardLimit.used` (rechazado: habría que reconciliar dos cifras, y
  `sumsForCard` es lo que usan todas las validaciones de tope); bajar el uso sin movimiento
  (rechazado: el uso dejaría de ser derivable de los movimientos).

## R4 — El movimiento de liquidación se marca y queda fuera de los períodos

- **Decision**: columna nueva `Transaction.settlesStatementId` (FK nullable → `CreditStatement`,
  `onDelete: SetNull`). Un movimiento con ella: no se enlaza a ningún período
  (`creditStatementId` null), queda excluido de `netForPeriod`/`relinkToStatementWithTx` (la
  sincronización no lo absorbe), es de solo lectura en Movimientos y `transactions.sourceOf` lo
  reporta como `STATEMENT_SETTLEMENT`.
- **Rationale**: sin la marca, "Sincronizar pagos" (que recalcula por ventana de fechas y, en una
  cuenta de crédito, cuenta TODOS sus movimientos) contaría el pago como abono del período
  siguiente — el mismo pago dos veces.
- **Alternatives**: filtrar por categoría (rechazado: ya se descartó en la 019, frágil); guardar
  solo el id en el período (se hace también, `settlementTransactionId`, pero la sincronización
  consulta `transaction` y no puede leer `credit-statement` — Principio VI).

## R5 — Pagar una facturación en otra moneda desde pesos: dos montos, dos movimientos

- **Decision**: `POST .../pay` acepta `chargedAmount` (moneda de la cuenta de origen) además de
  `amount` (moneda de la facturación). Si las monedas difieren, `chargedAmount` es obligatorio
  (`STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS`, mismo patrón que `PAYMENT_CURRENCY_AMBIGUOUS` de cuotas)
  y los dos montos NO se comparan. En una transacción: GASTO en la cuenta de origen por
  `chargedAmount` (su moneda, categoría de sistema `STATEMENT_PAYMENT`), INGRESO de liquidación en
  USD por `amount` (R3/R4), período liquidado por `amount` con la regla de arrastre de siempre
  (faltante → período abierto de **la misma moneda**). El cupo en pesos NO se toca.
- **Concurrencia**: el período se relee con `findByIdForUpdateWithTx` DENTRO del `$transaction`
  antes de `payTowards` (hoy se lee en `loadContext`, sin lock). Dos pagos simultáneos con claves de
  idempotencia distintas —que la reserva de idempotencia no serializa— podrían validar ambos contra
  el mismo saldo pendiente; es el mismo agujero que la 019 cerró para el prepago (R8 de la 019). Se
  corrige para ambas monedas, con un test de concurrencia.
- **Rationale**: FR-007–FR-010; idéntico a como cuotas resolvió dos monedas sin tipo de cambio
  (specs/013).
- **Alternatives**: pedir tipo de cambio (fuera de alcance).

## R6 — El traspaso: liquidación en USD + cargo en pesos del emisor

- **Decision**: `POST .../transfer` con `{ amount }` en la moneda de la cuenta. En una transacción:
  (1) INGRESO de liquidación en USD por lo que falta (`remainingFor`), (2) GASTO en la cuenta de
  crédito, en su moneda, **sin tarjeta y como cargo del emisor** (`financeCharge: true`, así ya
  suma al cupo y entra en el período abierto por las reglas existentes), enlazado al período abierto
  en pesos, categoría de sistema nueva `CURRENCY_TRANSFER`, y (3) período USD marcado traspasado:
  `transferredAt`, `transferredAmount`, `transferTransactionId`, `settlementTransactionId`,
  `transferredToId`. Sube `creditUsed` por el monto en pesos.
- **Rationale**: FR-011–FR-014. El banco real hace exactamente esto: convierte y carga la deuda al
  siguiente estado en pesos. `financeCharge` ya es "cargo aplicado a la cuenta, sin plástico".
- **Alternatives**: cargar el monto como `carriedOverAmount` del período en pesos (rechazado: no
  sería un movimiento visible ni tendría origen propio, y FR-014 exige que se vea).

## R7 — "Traspasada" es un estado terminal propio

- **Decision**: `TransferredState` (en `domain/states/`), elegido cuando `transferredAt != null`.
  Terminal como PAID (`canPay`/`canClose`/`canPrepay` false). Contrato: `creditStatementStatus`
  gana `TRANSFERRED`. "Liquidada" sigue probándose como `paidAt !== null || transferredAt !== null`
  (helper `isSettled` del contrato, que el web ya usa por nombre).
- **Rationale**: clarify Q3 (estado propio). Mantener `paidAt` null en un traspaso evita que
  cualquier lógica de pago existente lo tome como pagado desde una cuenta.

## R8 — Cuándo se ofrece el traspaso

- **Decision**: función pura en el contrato `canTransferStatement(statement, accountCurrency,
today)`: moneda ≠ la de la cuenta, cerrada, no liquidada, con saldo pendiente > 0, y
  (`dueDate` pasada **o** `dueDate` null). El servidor la aplica igual
  (`STATEMENT_NOT_TRANSFERABLE`). Un pago parcial previo no impide el traspaso: se traspasa solo lo
  que falta.
- **Rationale**: FR-011 y el caso de borde "sin fecha de pago"; una sola función para UI y API
  (misma técnica que `isDeletableAccount`).

## R9 — Deshacer un traspaso

- **Decision**: `DELETE .../transfer`. Borra ambos movimientos, revierte `creditUsed` y deja el
  período USD impago (limpia los campos de traspaso). **Se rechaza** (`TRANSFER_ALREADY_BILLED`) si el
  período en pesos que recibió el cargo ya fue liquidado: ese dinero ya se pagó y deshacerlo
  reescribiría un período cerrado — el usuario debe corregir con "Sincronizar pagos" / corrección de
  pago primero.
- **Una sola fuente para lo que se revierte (Principio I)**: función pura del agregado
  `transferReversal()` → `{ restoredAmount, restoredCurrency, removedAmount, removedCurrency,
receivingStatementId }`, calculada solo con campos guardados en el período (`remainingFor(amount)`
  al momento del traspaso = `amount − paidAmount`, y `transferredAmount`). El handler de deshacer
  revierte EXACTAMENTE esas cifras, y el DTO las expone como `transferReversal` para que el
  `ConfirmModal` muestre lo mismo que ocurrirá — nunca una segunda implementación.
- **Rationale**: clarify Q1 exige restaurar exactamente el estado anterior; eso solo es posible
  mientras el cargo en pesos siga vivo en un período no liquidado.
- **Alternatives**: permitir deshacer siempre (rechazado: dejaría un período en pesos pagado por
  más de lo que ahora debe, sin mecanismo para devolver la diferencia).

## R10 — Movimientos protegidos (solo lectura)

- **Decision**: `UpdateTransactionHandler`/`RemoveTransactionHandler` rechazan
  (`TRANSACTION_LINKED_TO_STATEMENT`, 409) un movimiento con `settlesStatementId` o que sea el
  `transferTransactionId` de algún período (resuelto por `CreditStatementLookupPort`, que ya existe y
  gana `transferInfoFor(ids)`). Mismo patrón que `TRANSACTION_LINKED_TO_INSTALLMENT`.

## R11 — Los cargos en otra moneda se enlazan a su período

- **Decision**: al crear un movimiento en una cuenta `CREDIT_CARD` cuya moneda difiere de la cuenta y
  que pasa por un tope propio (contribución 0 al cupo), `CreateTransactionHandler` lo enlaza al
  período abierto de **esa moneda** (`findOrCreateOpenForAccount(accountId, fallback, currency)`).
  Aplica a gastos y a ingresos manuales (una devolución en USD baja la facturación USD, igual que un
  ingreso manual en pesos baja la de pesos hoy). La plantilla (`planTemplateImport`) hace lo mismo:
  sus filas en otra moneda pasan a `drawsOnCredit`-equivalente por moneda.
- **Rationale**: FR-002; hoy esos movimientos no se enlazan a nada (contribución 0 ⇒ sin período).

## R12 — Quitar un tope con deuda

- **Decision**: `UpdateCardHandler` rechaza (`CARD_LIMIT_HAS_DEBT`, 409) quitar el `CardLimit` de una
  moneda cuyo uso (`sumsForCard`) sea > 0 o que tenga un período no liquidado en esa moneda.
- **Rationale**: FR-016.

## R13 — Corregir el pago de una facturación en otra moneda

- **Decision**: `PATCH .../payment` acepta `chargedAmount` opcional. Para una facturación en otra
  moneda, corrige ambos movimientos (liquidación USD y gasto en pesos) y el arrastre; el cupo en
  pesos no se toca. Para una facturación en la moneda de la cuenta nada cambia.
- **Rationale**: la app permite corregir todo lo registrado; sin esto un pago USD mal tecleado no
  tendría arreglo.

## R14 — Fuera de alcance confirmado

Prepago en otra moneda (sigue solo en la moneda de la cuenta), planes en cuotas en otra moneda,
tipo de cambio, traspaso automático, la generación inicial de un período desde el calendario de
cuotas en otra moneda (`seedPeriodFromSchedule` sigue solo para la moneda de la cuenta).
