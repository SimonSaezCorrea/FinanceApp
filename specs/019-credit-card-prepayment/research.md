# Research: Prepago de tarjeta de crédito (período abierto)

## R1 — `OpenState.canPay()` ya es `true`, pero `payTowards` cierra el período

**Hallazgo (no documentado en `CLAUDE.md` hasta ahora):** `apps/api/src/domains/credit-statement/domain/states/open-state.ts` ya declara `canPay(): true`, y `BillingSection.tsx` ya muestra el botón "Pagar" sobre el período OPEN (línea 237, dentro de `CurrentPeriodCard`, que renderiza todo `statement` no liquidado — OPEN incluido). Es decir: **hoy ya se puede pagar el período abierto**, pero `CreditStatement.payTowards()` (aggregate) SIEMPRE:

- estampa `paidAt`,
- congela `amount`,
- y cierra el período si no lo estaba (`this.props.closedAt = this.props.closedAt ?? when`).

Esto significa que el botón "Pagar" existente sobre un período OPEN hoy en realidad **lo liquida** (lo convierte en PAID/PARTIALLY_PAID) en vez de dejarlo корriendo. No es lo que esta spec pide: el prepago debe reducir la deuda SIN cerrar el período, permitiendo múltiples abonos antes del cierre real (por ciclo).

**Decision**: No reutilizar `payTowards` para el prepago. Se introduce un método de dominio nuevo y distinto, y el botón "Pagar" de `BillingSection` sobre el período OPEN se reemplaza por el nuevo flujo de prepago (ver R2). El comportamiento de `payTowards` (liquidar) queda intacto para períodos PENDING/PARTIALLY_PAID — no se toca.

**Alternativas consideradas**:
- Añadir un flag a `payTowards` para "no cerrar" — rechazado: mezclaría dos operaciones con reglas de validación distintas (liquidar vs. abonar parcial) en un solo método, y `payTowards` ya está bien cubierto por tests que asumen que SIEMPRE liquida.

## R2 — Nuevo campo `prepaidAmount` en `CreditStatement`, no una entidad nueva

**Decision**: `CreditStatement` gana una columna `prepaidAmount` (Decimal, default 0) — el acumulado de todos los prepagos aplicados a ESE período mientras estuvo (o estuvo cuando se hicieron) abierto. `CreditStatement.totalFor(linkedAmount, instalmentAmount)` pasa a restar `prepaidAmount`:

```
totalFor = linked + carriedOver + instalment - prepaidAmount   (nunca negativo)
```

Como **todo** llamador existente de `totalFor` (el propio `pay-credit-statement.handler.ts`, `sync-statement.handler.ts`, `statement-dto.mapper.ts` indirectamente vía el `amount` que le pasan) ya pasa por este método, este único cambio basta para que:

- el período OPEN muestre en vivo lo que realmente falta (FR-007's caso simple, sin correr ningún job nuevo),
- una facturación PENDING (cerrada, no pagada) también se recalcule sola (su `amount` sigue siendo "vivo" hasta que se paga — ver `saveWithTx`: `amount: state.paidAt ? state.amount : undefined`),
- y `SyncStatementHandler`'s `syncAmount()` siga siendo el único mecanismo que corrige un período YA LIQUIDADO (PAID/PARTIALLY_PAID) — sin escribir una segunda ruta de reconciliación.

**Rationale**: Evita una entidad `Prepago` con su propia tabla/repositorio (dominio 25) para lo que en esencia es un acumulador simple con una lista de movimientos que lo respaldan (los movimientos mismos, vía `Transaction.prepaymentStatementId`, ya son el registro — ver R3). Menos superficie, reutiliza `totalFor`/`syncAmount` que ya son código probado.

**Alternativas consideradas**:
- Tabla `CreditStatementPrepayment` (id, statementId, transactionId, amount) — rechazada por ahora: no aporta nada que `Transaction.prepaymentStatementId` + `SUM()` no den ya, y el una-tabla-un-dominio (Constitution VI) obligaría a un dominio 25 nuevo solo para esto.

## R3 — El movimiento de prepago es un `Transaction` normal con una FK nueva, no un tipo de movimiento nuevo

**Decision**: `Transaction` gana **`prepaymentStatementId`** (FK nullable → `CreditStatement`, `onDelete: SetNull`, SIN `@unique` — un período puede recibir muchos prepagos, a diferencia de `paidTransactionId` que es 1:1) y **`prepaymentAccountId`** (plano, denormalizado — la cuenta CREDIT_CARD que recibió el abono; se escribe una sola vez al crear, igual que `paidStatementAccountId` mostrado en el detalle, pero SIN necesitar el lookup port porque acá sí es un campo real de la fila, no algo derivado de la relación inversa de `CreditStatement.paidTransactionId`). El `TransactionType` sigue siendo `INCOME | EXPENSE` — el prepago ES un EXPENSE ordinario, solo que trae estas dos referencias.

`transactions.sourceOf()` gana un caso nuevo, en el mismo estilo que `STATEMENT_PAYMENT`:

```ts
| { kind: "CREDIT_CARD_PREPAYMENT"; statementId: string; accountId: string }
```

**Rationale**: Igual que `installmentPlanId`/`debtId`/`savingsEntryId`, es "otra FK de procedencia" sobre la misma fila — no un tipo de movimiento nuevo. Mantiene `EXCLUDE_TRANSFERS`, keyset pagination y todo el resto de agregados de `transaction` sin tocar.

**Consecuencia importante**: como el prepago vive en la cuenta de ORIGEN (no en la CREDIT_CARD), y NO debe sumarse como "consumo" de la tarjeta, `prisma-transaction-sums.repository.ts`'s `netForStatement`/`netForPeriod` (que escanean movimientos de la cuenta/tarjeta CREDIT_CARD, no de la cuenta de origen) nunca lo verían de todos modos — no hace falta excluirlo ahí. Sí hay que asegurarse de que la creación del prepago **no** intente engancharlo también a `creditStatementId` (el campo que sí usan esos sums) — debe quedar `creditStatementId: null` en la fila de prepago.

## R4 — Aplicar / revertir un prepago: un solo método de dominio para los tres casos

**Decision**: Un único método en el aggregate, parametrizado por contribución vieja/nueva (mismo patrón que `update-transaction.handler.ts` ya usa para `creditUsedDeltas`/`balanceDeltas` — viejo vs. nuevo, nunca "solo el nuevo"):

```ts
// grossTotal = lo que el período debe SIN restar ningún prepago (linked+carry+instalment)
changePrepayment(grossTotal: string, oldContribution: string, newContribution: string): void
```

- Crear un prepago: `oldContribution = "0"`, `newContribution = amount`. Requiere además `state.canPrepay()` (nuevo método de `CreditStatementState`, `true` solo en `OpenState`) — no se puede crear un prepago nuevo contra un período ya cerrado (para eso existe pagar la facturación).
- Editar el monto de un prepago existente: `oldContribution = montoAnterior`, `newContribution = montoNuevo`. Sin gate de estado — corregir un prepago ya aplicado es válido pase lo que pase con el período después (FR-012/FR-013).
- Eliminar un prepago: `oldContribution = montoAnterior`, `newContribution = "0"`. Mismo sin gate de estado.

Invariante verificada siempre: `0 <= prepaidAmount_after <= grossTotal` — un `PaymentExceedsRemainingError` (reutilizado, mismo código que ya usa `payTowards`) si se excede.

## R5 — Reversión atómica cross-agregado, mismo patrón que `PayCreditStatementHandler`

**Decision**: Crear el prepago es un comando nuevo en `credit-statement` (`PrepayOpenPeriodCommand`/`Handler`, idempotente vía `BaseIdempotentCommandHandler`, `operation = "creditStatement.prepay"`) que — igual que `PayCreditStatementHandler` — abre UN `prisma.$transaction` para: crear el `Transaction` (vía `TransactionWriterRepositoryPort.createWithTx`), decrementar `creditUsed` de la cuenta CREDIT_CARD (`BankAccountRepositoryPort.incrementCreditUsedWithTx` — ya existe), y guardar el `CreditStatement` actualizado.

Editar/eliminar el `Transaction` de un prepago (FR-012/FR-013) es más delicado: hoy `UpdateTransactionHandler`/`RemoveTransactionHandler` viven en `transaction` y NO abren una transacción cross-agregado propia — delegan todo a `TransactionRepositoryPort.saveUpdate`/`removeWithCreditAdjustment`, que solo tocan `transaction` + `bank-account` (vía deltas). Para revertir un prepago, esos dos handlers necesitan, cuando `current.prepaymentStatementId !== null`:

1. Cargar el `CreditStatement` (vía `CreditStatementRepositoryPort`, ya importado en ambos handlers para el chequeo `isPaid`) y la `BankAccount` CREDIT_CARD que `prepaymentAccountId` señala.
2. Recalcular `grossTotal` de ese período (mismo cómputo que `SyncStatementHandler.loadContext` — `sums.netForPeriod(...)` + `plans.billedInstallmentsForStatement(...)` + `carriedOverAmount`).
3. Llamar `statement.changePrepayment(grossTotal, oldAmount, newAmount)`.
4. Ajustar `creditUsed` de la cuenta CREDIT_CARD por la diferencia (`newAmount - oldAmount`, con signo invertido — igual que `SyncStatementHandler` hace con `paidDelta`).
5. Si el período ya estaba liquidado (`paidAt !== null`), la corrección de `prepaidAmount` cambia `grossTotal`'s papel en `totalFor`, así que hay que re-ejecutar el mismo ajuste de `paidAmount`/`carryOverDelta` que `syncAmount()` ya calcula — **se reutiliza `CreditStatement.syncAmount()` llamando `statement.totalFor(...)` de nuevo tras `changePrepayment`**, en vez de escribir una segunda fórmula.
6. Envolver TODO (el guardado normal de `transaction` + los pasos 1-5) en un solo `prisma.$transaction`, igual que `PayCreditStatementHandler`.

Esto convierte a `UpdateTransactionHandler`/`RemoveTransactionHandler` en handlers que, SOLO quirúrgicamente cuando hay un `prepaymentStatementId` de por medio, dejan de usar su camino simple (`this.repo.saveUpdate(...)`) y pasan por un `prisma.$transaction` explícito — exactamente la misma excepción documentada que `PayCreditStatementHandler` ya introdujo para el pago de facturación ("Cross-aggregate persistence... a documented pragmatic exception, not a violation of it").

**Riesgo/alcance más grande de esta feature**: esto es lo más nuevo del diseño (nada existente hace hoy "una edición de `transaction` dispara una escritura en otro dominio") — se marca explícitamente en Complexity Tracking del plan.

## R6 — El tab "Prepagar" en el formulario de movimiento

**Decision**: `TransactionFormPanel` gana un tercer valor de `mode` — no un `TransactionType` nuevo (la API sigue viendo esto como un `EXPENSE` con FKs propias, igual que `"TRANSFER"` ya es un modo de formulario que tampoco es un `TransactionType` real, ver `mode: transactions.TransactionType | "TRANSFER"`). Se añade `"PREPAY"` al mismo union, ofrecido en `typeOptions` SOLO cuando `isCreditLine` (cuenta CREDIT_CARD) — reemplazando ahí lo que hoy es únicamente "Gasto" (que sigue disponible aparte, para un cargo financiero o compra manual). Al elegir "Prepagar" el formulario cambia a un layout parecido a `PayStatementPanel` (cuenta de origen + monto, con el remaining/breakdown del período abierto) en vez de los campos category/card/etc. de un gasto ordinario.

**Rationale**: Mismo patrón ya usado para "Traspaso" — un tercer modo de UI que internamente pega a un endpoint completamente distinto (`POST .../prepay`, no `POST /transactions`), sin inflar el `TransactionType` de dos valores del dominio.

## R8 — Bloqueo de fila contra la carrera de concurrencia (hallazgo de `/speckit-analyze`)

**Hallazgo**: `PrepayOpenPeriodHandler.loadContext` (R5) calcula `grossTotal` y lee `prepaidAmount`
con lecturas normales, sin bloquear la fila del período. Dos prepagos concurrentes con
**`Idempotency-Key` distintas** (la reserva de idempotencia solo serializa reintentos de la MISMA
clave, no dos abonos genuinamente distintos) pueden leer el mismo remanente, validar cada uno por
separado contra él, y ambos pasar aunque juntos excedan lo debido — dejando el período con "saldo
a favor" pese a que `FR-005`/`SC-004` lo prohíben en el 100% de los casos.

Este es exactamente el mismo bug que ya apareció y se corrigió en el dominio `debt`
(`docs` de specs/015: "6 concurrent `register-payment` requests advanced the counter by only 2
until the read moved inside the lock; fixed, 6 concurrent → exactly 6") — la lección de esa feature
fue que envolver SOLO la escritura en una transacción no alcanza; el `SELECT` que decide "cuánto
queda" debe ir DENTRO de esa misma transacción, con bloqueo de fila.

**Decision**: `CreditStatementRepositoryPort` gana **`findByIdForUpdateWithTx(tx, userId, accountId,
statementId): Promise<CreditStatement | null>`** — mismo rol que `debt`'s
`findOneForUpdateWithTx` (`SELECT ... FOR UPDATE` vía Prisma `$queryRaw`/`.findFirst` bajo un
`FOR UPDATE` según el driver, siguiendo el mismo mecanismo ya implementado ahí). `PrepayOpenPeriodHandler`
deja de resolver el `CreditStatement` en `loadContext` (fuera de transacción) y en su lugar lo
resuelve DENTRO del `prisma.$transaction` de `handleIdempotent`, bloqueado, justo antes de llamar
`changePrepayment`. Lo mismo aplica al camino de reversión (R5 / `UpdateTransactionHandler`/
`RemoveTransactionHandler`): el `CreditStatement` afectado se relee bloqueado dentro de la misma
transacción cruzada, no antes.

**Consecuencia estructural**: igual que en `debt`, esto mueve el ciclo completo
"leer→validar→escribir" del período DENTRO de una única transacción bloqueada, en vez de
repartirlo entre `loadContext` (sin lock) y `handle`/`persist` (con transacción). El resto de
`grossTotal` (breakdown de compras/instalments) puede seguir calculándose antes del lock, ya que
esos números no cambian por la concurrencia de OTRO prepago (solo `prepaidAmount` sí puede
cambiar entre dos prepagos simultáneos — que es justamente lo que el lock protege).

**Alternativas consideradas**:
- Confiar en que la validación de `PaymentExceedsRemainingError` en la escritura final (un
  `UPDATE ... WHERE prepaidAmount + amount <= grossTotal` condicional) detecte el conflicto —
  rechazada: más compleja de expresar en Prisma que un `FOR UPDATE` directo, y este repo ya tiene
  el patrón `FOR UPDATE` como precedente probado para exactamente este problema.
- No proteger contra esto (aceptar el riesgo) — rechazado: es dinero real y el propio `SC-004`
  promete 100%, no "casi siempre".

## R7 — Multi-currency y cuenta de origen

Sin cambios de diseño respecto a lo ya asumido en la spec: la validación de "misma moneda" NO se aplica (esta app no convierte divisas); el criterio de cuenta de origen elegible reutiliza el mismo filtro que `PayStatementPanel` ya usa (`type !== "CREDIT_CARD" && status === "ACTIVE"`).
