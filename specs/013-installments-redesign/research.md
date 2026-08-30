# Phase 0 — Research: Vista Cuotas

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-15

No quedó ningún `NEEDS CLARIFICATION` en el Technical Context. Lo que sigue son las decisiones
técnicas que la spec dejó abiertas a propósito (la spec dice el _qué_), más las dos que
`/speckit-clarify` difirió explícitamente a esta fase.

---

## R1 — Dónde vive el arrastre

**Decision**: columna persistida `InstallmentPayment.carriedOverAmount` (`Decimal(18,4)`, default
`0`), que representa lo que la cuota ANTERIOR no alcanzó a cubrir y esta cuota hereda. Lo adeudado
por una cuota es `amount + carriedOverAmount`. Un excedente se guarda como valor negativo en la
misma columna.

**Rationale**: es literalmente el mecanismo que `CreditStatement.carriedOverAmount` ya implementa en
este repo para el mismo problema (un pago que no cubre el período), incluida la decisión de que el
arrastre sea _una cifra propia_ y no un movimiento sintético. Copiar ese patrón cuesta menos que
inventar otro y mantiene una sola explicación para "lo que faltó pagar" en toda la aplicación.
Persistirlo —no derivarlo— es lo que permite que deshacer un pago revierta exactamente lo que ese
pago provocó.

**Alternatives considered**:

- _Derivar el arrastre en lectura_, recorriendo las cuotas en orden. Rechazado: no distingue un
  faltante arrastrado de un monto programado distinto, obliga a recorrer todo el plan en cada
  lectura, y hace imposible deshacer con precisión.
- _Reescribir el monto de la siguiente cuota_. Rechazado: viola FR-020 (el calendario programado no
  se toca) y borra la información de por qué esa cuota vale más.
- _Una tabla de ajustes_. Rechazado: una tabla nueva para un escalar por fila, contra la regla "una
  tabla = un dominio" que obligaría a un dominio-tabla más.

---

## R2 — Vínculo cuota ↔ gasto, y qué pasa si el gasto se borra

**Decision**: `InstallmentPayment.transactionId` (FK nullable → `Transaction`, **`onDelete:
SetNull`**). Además el gasto creado lleva `Transaction.installmentPlanId` (columna que **ya existe**,
hoy usada por el cargo financiero) para que sea reconocible desde Movimientos.

**Rationale**: `SetNull` es exactamente FR-028: si el usuario borra ese movimiento desde la vista de
Movimientos, la cuota queda sin respaldo pero **no** rota — se puede seguir deshaciendo, y ningún
`include` explota. La alternativa `Cascade` borraría la cuota al borrar el movimiento, que es lo
contrario de lo que la spec pide. La unicidad de FR-025 ("una cuota, un gasto") sale del propio
tipo: es una columna escalar, no una lista.

**Alternatives considered**:

- _Sólo `Transaction.installmentPaymentId`_ (el vínculo del lado del movimiento). Rechazado: leer la
  cuota exigiría entonces una consulta a la tabla `transaction` desde el dominio de cuotas, y el
  puerto tendría que crecer con un buscador sólo para eso.
- _Sin vínculo, buscando el gasto por monto y fecha_. Rechazado: dos cuotas del mismo plan y monto
  en el mismo mes son indistinguibles; deshacer borraría el gasto equivocado.

---

## R3 — Atomicidad de pagar y de deshacer

**Decision**: `PayInstallmentHandler` sobreescribe `persist()` con un único
`prisma.$transaction(async (tx) => …)` que hace, en este orden: crear el EXPENSE
(`TransactionWriterRepositoryPort.createWithTx`), descontar el saldo de la cuenta origen
(`BankAccountRepositoryPort.incrementBalanceWithTx`), guardar la cuota (`paidAt`, `paidAmount`,
`transactionId`) y aplicar el arrastre sobre la siguiente cuota impaga.
`UnpayInstallmentHandler` hace lo simétrico: borrar el gasto (`deleteWithTx`, método nuevo del
puerto), restituir el saldo, limpiar la cuota y revertir el arrastre.

**Rationale**: es el patrón exacto de
[`pay-credit-statement.handler.ts`](../../apps/api/src/domains/credit-statement/application/commands/pay-credit-statement.handler.ts),
que ya escribe `CreditStatement` + `Transaction` + `BankAccount` en una sola transacción y está
documentado en la constitución como excepción pragmática a "un agregado por transacción". Abrir una
segunda forma de resolver el mismo problema sería peor que la desviación.

**Alternatives considered**:

- _Emitir un evento de dominio y que un listener cree el gasto_. Rechazado: los eventos aquí son
  síncronos, así que no compra desacoplamiento real, y un listener que falla deja la cuota pagada
  sin gasto — el descuadre que la feature venía a arreglar.
- _Dos requests desde el cliente_ (marcar cuota, luego crear movimiento). Rechazado por lo mismo,
  agravado: la ventana de inconsistencia queda en manos de la red del usuario.

---

## R4 — Que la previsualización dé exactamente el número del servidor (FR-042)

**Decision**: el cliente llama a **la misma función** que el agregado: `equalPrincipalSchedule` de
`@finance/money`. El web ya depende de ese paquete (`apps/web` lo usa para `balanceAfter` y
`projectedBalance`), así que no hay dependencia nueva; sólo un envoltorio delgado
(`domains/installments/lib/schedulePreview.ts`) que adapta los campos del formulario a la entrada de
la función.

**Rationale**: "coincide exactamente" no se consigue reimplementando la misma fórmula con cuidado,
se consigue no reimplementándola. Cualquier divergencia futura del redondeo se propaga a los dos
lados a la vez, que es la propiedad que queremos.

**Alternatives considered**:

- _Endpoint de previsualización_ (`POST /installments/preview`). Rechazado: una llamada de red por
  cada tecla en un cálculo que es aritmética pura y determinista; además hace inútil el formulario
  sin conexión. Se reconsideraría sólo si el cálculo pasara a depender de datos del servidor.
- _Reimplementar la división en el cliente_. Rechazado: es exactamente cómo se rompe FR-042, y en
  coma flotante rompería además el Principio I.

---

## R5 — El ícono compartido entre Movimientos y Cuotas

**Decision**: mover `apps/web/src/domains/transactions/lib/categoryIcons.ts` →
`apps/web/src/shared/lib/categoryIcons.ts` y `components/CategoryIcon.tsx` →
`shared/ui/category-icon.tsx`, con su test. Ambos dominios importan desde `shared/`.

**Rationale**: el mapa ya existe, está probado (el test verifica que el ícono **renderiza un svg**,
no sólo que el mapa resuelve) y cumple SC-011 por construcción. Lo que no puede pasar es que
`domains/installments` importe de `domains/transactions`: un dominio web dependiendo de otro es el
atajo que convierte la estructura por dominios en una bola de barro. `shared/` es donde este repo
pone lo que sirve a más de un dominio.

**Alternatives considered**:

- _Duplicar el mapa en installments_. Rechazado: dos mapas divergen, y SC-011 exige que un plan y un
  movimiento de igual categoría muestren el mismo ícono — un requisito que sólo una fuente única
  garantiza.
- _Importar cruzado entre dominios web_. Rechazado por la regla de fronteras del repo.

---

## R6 — Validación del saldo al pagar (FR-026)

**Decision**: la validación de que la cuenta admite el cargo (prepago que no puede quedar negativo,
sobregiro declarado, techo de saldo) se hace reutilizando las funciones puras de
`transaction/domain/movement-policy.ts` (`assertWithinPrepaidBalance`, `assertWithinOverdraft`),
invocadas desde el handler de pago con el `AccountContext` que ya arma el repositorio de cuentas.

**Rationale**: son funciones puras sobre un contexto, no métodos de un agregado ajeno, así que
importarlas no viola el aislamiento del agregado. Reimplementar el "nunca negativo" del prepago en
un segundo lugar es como se consigue que las dos versiones discrepen.

**Observación honesta**: el pago de facturación (`PayCreditStatementHandler`) **hoy no corre estas
comprobaciones** — crea el EXPENSE y descuenta el saldo sin consultarlas. Este plan no arregla ese
camino (está fuera de alcance y tocarlo sin spec sería exceder el encargo), pero lo deja anotado:
son dos caminos que deberían validar igual y hoy no lo hacen. Se registra para `docs/PENDING.md`.

---

## R7 — Bloqueo del plan con tarjeta de crédito (FR-035..FR-038)

**Decision**: la regla se decide **en el contrato** (`installments.generatesMovementOnPay(cardKind)`)
y se aplica en los dos lados: el agregado la impone al pagar (error
`INSTALLMENT_CARD_IS_CREDIT` si llega una cuenta de pago en un plan con tarjeta CREDIT) y la UI no
ofrece el formulario de cuenta. El `kind` de la tarjeta se resuelve componiendo el puerto de
`card-account` que este dominio **ya inyecta** (`create-installment-plan.handler.ts` usa
`cards.accountIdForCard`); sólo hace falta exponer el `kind`.

**Rationale**: es el criterio que el repo ya aplica para "número de cuenta válido" y para "esta
cuenta se puede eliminar": la regla vive en `@finance/contracts` para que la UI y el API digan lo
mismo, y la UI oculta la acción en vez de ofrecer una que va a fallar.

**Alternatives considered**: validar sólo en el frontend (rechazado: el API quedaría aceptando el
doble conteo); validar sólo en el backend (rechazado: la UI ofrecería un formulario que siempre
falla).

---

## R8 — De dónde salen las cuatro cifras del encabezado

**Decision**: derivadas en el cliente sobre la lista completa que ya devuelve `GET /installments`
(que incluye `payments`), en `domains/installments/lib/installmentMetrics.ts`, agrupadas por moneda.

**Rationale**: el endpoint ya trae todo lo necesario y el volumen es de decenas de filas. Un
endpoint de resumen se justificó en Movimientos porque **allí la lista está paginada** y derivar
sobre las páginas cargadas da números falsos; aquí no hay paginación, así que la misma justificación
no aplica. Añadirlo sería infraestructura sin problema que resolver.

**Alternatives considered**: `GET /installments/summary` espejando el de movimientos (rechazado por
lo anterior; se reconsidera el día que la lista se pagine).

---

## R9 — Umbrales de formato (escritorio / tablet / móvil)

**Decision**: sin píxeles nuevos. El panel lateral usa `FormSurface surface="panel"` /
`SidePanel`, que ya resuelven Modal↔Window por `SHEET_QUERY`; la lista alterna tabla ↔ tarjetas con
`useElementWidth` sobre **el ancho del propio contenedor**, no del viewport, como ya hace
`TransactionTable` con `FULL_TABLE_MIN_WIDTH`.

**Rationale**: la constitución y `CLAUDE.md` estipulan la escala de Tailwind y prohíben
`min-[NNNpx]:` arbitrarios; el repo ya se quemó dos veces con una consulta JS y una clase CSS que
cambiaban a anchos distintos. Además la barra lateral colapsable cambia el espacio disponible sin
cambiar el viewport, que es justo el caso que `useElementWidth` existe para cubrir.

---

## R10 — Migración de los datos existentes

**Decision**: ninguna. `pnpm db:push` añade las columnas con sus valores por defecto
(`carriedOverAmount = 0`, el resto nullable) y `pnpm db:seed` regenera los datos de desarrollo. Las
cuotas ya marcadas como pagadas quedan con `paidAmount = null` y `transactionId = null`.

**Rationale**: es el flujo declarado del repo (no existe `prisma/migrations`) y coincide con lo que
la spec asume: a un pago viejo no se le inventa un gasto que nunca ocurrió. `paidAmount = null` se
lee como "pagada, monto real desconocido" y se muestra con el monto programado, que es lo único
honesto que se puede decir de ella.

**Consecuencia a respetar en el código**: "pagada" se prueba con `paidAt !== null`, **nunca** con
`paidAmount !== null` — el mismo tipo de trampa que en facturación obligó a probar `paidAt !== null`
en vez de `status === "PAID"`.
