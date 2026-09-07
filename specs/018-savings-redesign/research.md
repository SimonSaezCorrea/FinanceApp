# Research: Rediseño de Ahorros con progreso real y dinero real

**Feature**: 018-savings-redesign

Todas las decisiones de abajo resuelven un "NEEDS CLARIFICATION" de diseño técnico (no de producto —
esas ya se resolvieron en `spec.md` §Clarifications). Cada una replica un patrón que ya existe en el
repo en vez de inventar uno nuevo, siguiendo la instrucción de la constitución de mirar `debt` /
`installment-plan` / `specs/015` antes de escribir código nuevo.

---

## 1. Reversibilidad del cierre de meta → mismo patrón que `Debt.lastPayment*`

**Decisión**: `SavingsGoal` gana columnas de bookkeeping planas (no FKs), exactamente como
`Debt.lastPaymentTransactionId`/`lastPaymentAccountId`/`lastPaymentAmount`
(`apps/api/src/domains/debt/domain/debt.aggregate.ts:49-51`, schema en
`apps/api/prisma/schema.prisma:664-673`): `closeTransactionId`, `closeAccountId`, `closeAmount` —
solo se llenan cuando el destino es "retirar a cuenta", y son lo único que "reabrir" necesita para
revertir el movimiento real.

**Por qué bookkeeping plano y no una FK**: una FK con `onDelete: SetNull` pierde el dato en cuanto se
borra la cuenta/movimiento referenciado; un valor plano sobrevive esa eliminación — el mismo
razonamiento documentado en el schema de `Debt` ("plain bookkeeping columns, not FKs… should survive
[account deletion]"). `closeAmount` en particular es necesario porque revertir debe deshacer
EXACTAMENTE lo que se movió al cerrar, no lo que la meta sume hoy (los aportes pudieron cambiar
mientras tanto — aunque con la regla de "aportes congelados en una meta cerrada" del clarify, este
caso no debería darse en la práctica; se guarda de todos modos por la misma razón que `Debt` lo hace).

**Alternativa rechazada**: usar una FK `Transaction.savingsGoalId` normal y buscar "el movimiento de
cierre más reciente de esta meta" al reabrir. Requeriría una query adicional y una regla de
"el más reciente" that `Debt` explícitamente evitó (ver el comentario "reads back AND clears" en
`takePaymentRecord()`).

**Cierre con "ahorro libre" o "traspaso a otra meta"**: no mueve dinero real, así que no necesita
bookkeeping de reversión — solo `closedAt` + `closeDestination` (+ `closeTargetGoalId`, plano, solo
para mostrar "traspasado a «{meta}»" incluso si esa meta se borra después — mismo patrón de
degradación elegante que el resto de las FKs "de bookkeeping").

---

## 2. El aporte y el retiro son `Transaction`s reales, con FKs de procedencia nuevas

**Decisión**: dos columnas nuevas en `Transaction` (mismo patrón que `debtId`/`installmentPlanId`,
`apps/api/prisma/schema.prisma:432-505`):
- `savingsEntryId String? @unique` (FK → `SavingsEntry`, `onDelete: SetNull`) — el EXPENSE real que
  generó un aporte. `@unique` porque la relación es 1:1 (un aporte, un movimiento).
- `savingsGoalId String?` (FK → `SavingsGoal`, `onDelete: SetNull`, no único) — el INCOME real de un
  cierre con destino "retirar a cuenta". No único porque una meta puede cerrarse/reabrirse varias
  veces en su vida, generando movimientos distintos en momentos distintos (nunca dos a la vez).

**Por qué en `Transaction` y no solo en `SavingsEntry`/`SavingsGoal`**: `transactions.sourceOf()`
(`packages/contracts/src/transactions/index.ts:69-86`) deriva la procedencia de un movimiento
leyendo SOLO columnas del propio `Transaction` — es una regla explícita de esa función ("nunca
almacenado por su cuenta, para que no pueda desalinearse… solo lee campos que ya están en la fila").
Esta feature extiende `sourceOf()` con dos casos nuevos: `SAVINGS` (viene de un aporte) y
`SAVINGS_WITHDRAWAL` (viene de un retiro de meta cerrada) — coherente con el resto de "Origen" del
panel de detalle de movimiento.

**`SavingsEntry` también gana `transactionId` (plano, no FK)** — el mismo doble patrón que existe
para `Debt` (`Transaction.debtId` + `Debt.lastPaymentTransactionId`): la FK en `Transaction` sirve
para MOSTRAR procedencia; el campo plano en `SavingsEntry` es lo que el handler de editar/eliminar un
aporte usa para saber qué movimiento revertir, sin tener que hacer una query inversa por
`savingsEntryId`. `SavingsEntry` también gana `bankAccountId` (FK → `BankAccount`, `onDelete:
SetNull` — un aporte cuya cuenta se borra después sigue contando en el historial, solo pierde la
referencia, tal como pide un Edge Case de la spec).

---

## 3. "Saldo insuficiente" usa exactamente las reglas de `MovementPolicy` que ya existen — no una nueva

**Decisión**: el aporte se valida con las MISMAS tres verificaciones que `debt`/`installment-plan` ya
reutilizan tal cual (`apps/api/src/domains/debt/application/commands/register-debt-payment.handler.ts:106-108`):
`MovementPolicy.assertWithinPrepaidBalance`, `assertWithinOverdraft`, `assertWithinCeiling`
(`apps/api/src/domains/transaction/domain/movement-policy.ts`). **No se inventa una cuarta regla
"debe alcanzar el saldo"** para cuentas sin sobregiro configurado.

**Por qué**: en este app una cuenta CHECKING/SIGHT sin `overdraftLimit` configurado YA puede
quedar en negativo con un gasto normal — es un comportamiento documentado y deliberado ("sin línea
declarada la app no tiene base para rechazar un movimiento que de verdad ocurrió"). Un aporte de
ahorro es, en los hechos, un gasto más desde esa cuenta; tratarlo con una regla más estricta que
cualquier otro movimiento sería inconsistente y sorprendería al usuario. **Aclaración sobre la
spec**: FR-009/AC3 dicen "cuenta con saldo insuficiente… se rechaza" — esto se satisface exactamente
en los mismos casos donde el resto de la app ya rechaza: cuenta PREPAID (nunca negativa), cuenta con
sobregiro configurado que se excede, o techo de saldo (`balanceCeiling`) excedido en el destino de un
retiro. Fuera de esos tres casos, un aporte que deja la cuenta en negativo es tan válido como
cualquier otro gasto — no es un bug, es la regla ya vigente.

**Moneda y tipo de cuenta** (de las Assumptions del spec): rechazo explícito nuevo si la cuenta es
`CREDIT_LINE`/tiene tarjeta CREDIT-only… en realidad la regla es más simple: la cuenta de origen NO
puede ser de tipo `CREDIT_LINE` (mismo `DEBT_PAYMENT_FROM_CREDIT_ACCOUNT` /
`INSTALLMENT_PAYMENT_FROM_CREDIT_ACCOUNT` que ya existen) y debe compartir moneda con la meta/aporte
(sin conversión, como en todo el resto de la app).

---

## 4. "Ritmo actual" (pace) — derivado en el backend, no declarado

**Decisión** (siguiendo la Clarification ya resuelta): `SavingsGoal` expone un campo derivado
`pace` (moneyString), calculado como el promedio de los aportes reales de la meta en los últimos 3
meses calendario completos (o desde su creación si es más joven, dividiendo por los meses
transcurridos, mínimo 1). Se computa on-read (igual que `BankAccount.creditUsed` antes de su
persistencia, o `Card.ownUsed`) — no se persiste, para que nunca pueda desalinearse de los aportes
reales.

**Dónde vive el cálculo**: una función pura nueva en el dominio `savings-entry`
(`domain/savings-pace.ts` o similar), consumida por el query handler de `savings-goal` que arma el
DTO — mismo patrón que `credit-statement` compone el puerto de `transaction`/`installment-payment`
sin que ninguno de los dos "sepa" del otro directamente (ver `TransactionSumsRepositoryPort`).

**`savedAmount`** (el total ahorrado de la meta) también es derivado: suma de TODOS sus aportes
(abierta o cerrada — el historial nunca se pierde), igual que `creditUsed` se deriva de las
transacciones reales en vez de mantenerse como contador manual propenso a desalinearse.

---

## 5. Estado (cumplida/vencida/etc.), agrupación y proyección: se computan en el frontend

**Decisión**: el backend expone los primitivos (`savedAmount`, `pace`, `targetAmount`, `deadline`,
`closedAt`, `closeDestination`) — la clasificación de estado, la agrupación en
En curso/Fuera de plazo/Cumplidas, y la proyección de mes de llegada son **lógica de presentación
pura**, calculada en el frontend con un módulo nuevo `apps/web/src/domains/savings/lib/savingsMetrics.ts`,
igual que `recurringMetrics.ts`/`schedulePreview.ts` hacen para sus propios dominios.

**Por qué**: estas reglas (las fórmulas exactas de `pct`/`left`/`eta`/`complete`/`overdue`/`short`
del README del handoff) son puramente derivadas de datos que el backend ya expone, no requieren una
query adicional, cambian con el simple paso del tiempo (no con una escritura), y mantenerlas del lado
del cliente evita que un cambio de copy/threshold visual necesite un despliegue de backend. Es
consistente con cómo el resto de "métricas de UI" de la app ya se resuelven
(`transactionMetrics.ts`, `recurringMetrics.ts`, `projectedBalance.ts`).

**Resumen consolidado** (`GET /savings/summary`, nuevo): sí vive en el backend, porque agrega across
TODAS las metas + ahorro libre del usuario — mismo motivo que `GET /transactions/summary` existe en
vez de que el frontend sume páginas cargadas.

---

## 6. Idempotencia — 4 operaciones nuevas + 1 extendida

Siguiendo el Principio VII y el patrón de `BaseIdempotentCommandHandler`
(`apps/api/src/infra/cqrs/base-idempotent-command.handler.ts`, usado por los 4 handlers de `debt`):

| Operación (`IDEMPOTENT_OPERATIONS`) | Ruta | Nota |
| --- | --- | --- |
| `savingsEntry.create` | `POST /savings/entries` | Ya existe — se EXTIENDE para mover dinero real dentro del mismo `handleIdempotent` |
| `savingsEntry.update` | `PATCH /savings/entries/:id` | Nueva — ahora mueve dinero real (revierte el monto/cuenta anterior, aplica el nuevo) |
| `savingsEntry.remove` | `DELETE /savings/entries/:id` | Nueva — revierte el movimiento real, mismo patrón que `DELETE /debts/:id/payments` |
| `savingsGoal.close` | `POST /savings/goals/:id/close` | Nueva — mueve dinero real solo si el destino es "retirar a cuenta"; se exige el header siempre, por consistencia (no condicional) |
| `savingsGoal.reopen` | `POST /savings/goals/:id/reopen` | Nueva — revierte el movimiento real solo si el cierre fue "retirar a cuenta" |

`update`/`remove` de un aporte no tenían protección de idempotencia hasta ahora porque no movían
dinero (specs/015 los dejó fuera a propósito). Ahora que sí mueven dinero, entran al mecanismo — igual
razonamiento que llevó a proteger `DELETE /debts/:id/payments` en specs/015 y no, por ejemplo,
`DELETE /savings/goals/:id` (que sigue sin mover dinero directamente — solo desvincula entries).

**Lectura+escritura atómica**: igual que `debt`, el `SavingsGoal`/`SavingsEntry` afectado se lee con
`findOneForUpdateWithTx` (`SELECT … FOR UPDATE`) DENTRO de la misma transacción que aplica el efecto
y llama a `complete(tx, …)` — nunca en `loadContext()` por separado (la lección explícita de
specs/015: "wrapping only the write is NOT enough to close a concurrent-request race").

---

## 7. Grafo de dependencias entre dominios: falta un `SavingsGoalDataModule`

**Hallazgo** (de la investigación de precedentes): `savings-goal` es hoy el único de los dominios
tocados por esta feature que NO tiene su propio `*.data.module.ts` leaf — solo el
`savings-goal.module.ts` de orquestación, del que `savings-entry` ya depende de forma ad-hoc (mismo
módulo Nest registra los handlers de ambos). Esta feature agrega dependencias reales de
`savings-entry`/`savings-goal` hacia `bank-account` y `transaction` (para mover dinero), así que es
el momento de formalizar:

- **`SavingsGoalDataModule`** (nuevo, leaf) — exporta `SAVINGS_GOAL_REPOSITORY`, igual forma que
  `BankAccountDataModule`/`InstallmentPlanDataModule`.
- `savings-goal.module.ts` (orquestación) pasa a `imports: [SavingsEntryDataModule,
BankAccountDataModule, TransactionDataModule, IdempotencyRecordDataModule]` — mismo patrón que
  `debt.module.ts:36-41`.
- `savings-entry`'s handlers siguen importando el puerto de `savings-goal` para verificar ownership
  de `savingsGoalId` (como ya hacían), ahora vía el `SavingsGoalDataModule` leaf en vez de la
  dependencia ad-hoc al módulo de orquestación.

Esto no es un requisito funcional del spec — es una corrección de deuda estructural que esta feature
expone al ser la primera en necesitar composición real cross-tabla desde `savings-*`. Se documenta
aquí para que quede en `tasks.md`, no como descubrimiento de última hora durante `implement`.

---

## 8. Íconos y colores — determinísticos, sin nueva columna

**Decisión**: NO se agrega columna `icon`/`color` a `SavingsGoal`. Se deriva en el frontend con una
función pura `goalVisual(goalId)` (mismo patrón que `accountVisuals.ts` para cuentas) que rota un set
fijo de íconos Lucide (`home`, `shield`, `plane`, `laptop`, `graduation-cap`, y algunos más para
cuando haya más de 5 metas — el README no limita la cantidad de metas) y colores-token
(`--brand`, `--success`, `--accent`, `--warning`, `--muted-foreground`, ampliado con más tokens si
hace falta) mediante un hash estable del `id` de la meta (p. ej. suma de código de caracteres módulo
el tamaño del set). Determinístico y sin estado — la misma meta siempre pinta igual, sin persistir
nada ni tocar el backend.

---

## 9. Categoría y descripción de los movimientos generados

- Aporte (EXPENSE en la cuenta de origen): `category: "Ahorro"`, `description: "Aporte a «{meta}»"` o
  `"Aporte a ahorro libre"` si no hay meta — mismo estilo que `debt`/`installment-plan` generan su
  propia descripción legible (`category: "Deudas"` en `register-debt-payment.handler.ts`).
- Retiro al cerrar (INCOME en la cuenta destino): `category: "Ahorro"`,
  `description: "Retiro de meta «{meta}»"`.

Ninguna de las dos lleva `cardId` (los aportes/retiros de ahorro no tienen tarjeta, como una
transferencia).
