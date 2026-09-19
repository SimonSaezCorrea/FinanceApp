# Feature Specification: Prepago de tarjeta de crédito (período abierto)

**Feature Branch**: `019-credit-card-prepayment`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Prepago de tarjeta de crédito (período abierto)

Hoy una cuenta de tipo tarjeta de crédito (CREDIT_CARD) solo puede saldar deuda pagando una facturación ya cerrada (PENDING o parcialmente pagada). No existe forma de abonar contra el consumo del período que está corriendo actualmente (OPEN) antes de que cierre — que es exactamente lo que un usuario real puede hacer con su tarjeta de crédito (prepagar antes de la fecha de corte).

Qué debe pasar:

- Un usuario puede registrar un abono contra el período OPEN de una cuenta CREDIT_CARD, desde otra cuenta propia con saldo (igual que hoy funciona pagar una facturación cerrada).
- Ese abono es dinero real: genera un gasto (EXPENSE) en la cuenta de origen y baja el cupo usado (creditUsed) de la tarjeta de inmediato.
- Se puede abonar más de una vez dentro del mismo período abierto (varios prepagos parciales antes del cierre).
- El monto de cada abono no puede superar lo actualmente adeudado en ese período (no se permite dejar saldo a favor).
- Cuando el período finalmente cierra (por el ciclo de facturación normal), lo que queda por cobrar en la facturación resultante ya descuenta todo lo prepagado — el usuario nunca ve un cobro duplicado.
- En el formulario de 'Nuevo movimiento', al elegir una cuenta de tarjeta de crédito aparece la opción de registrar este abono (junto a 'Gasto', que es la única otra opción disponible hoy para ese tipo de cuenta).

Fuera de alcance:

- Pagos automáticos o programados.
- Prepago desde una cuenta CREDIT_CARD hacia otra (siempre sale de una cuenta con saldo real).
- Cualquier noción de 'crédito a favor' o saldo positivo en la tarjeta."

## Clarifications

### Session 2026-09-13

- Q: ¿Se puede editar o eliminar después el movimiento de gasto que creó un prepago? → A: Sí, es editable/borrable como cualquier otro movimiento — editarlo o borrarlo DEBE revertir automáticamente el efecto que tuvo sobre el cupo usado de la tarjeta (consistente con el principio de que el usuario puede corregir cualquier cosa que registró, siendo esto finanzas personales de uso totalmente manual).
- Q: ¿Qué pasa si el prepago se edita o elimina después de que el período al que aplicó ya cerró (ya existe una facturación generada a partir de él)? → A: La facturación ya cerrada se corrige automáticamente en la misma operación de editar/borrar el prepago — no requiere que el usuario presione "Sincronizar pagos" a mano.
- Q: ¿El movimiento de prepago debe identificarse como tal en Movimientos (origen distinguible, como ya pasa con `STATEMENT_PAYMENT`), o debe verse como un gasto manual común? → A: Debe tener un origen distinguible propio (p. ej. "Prepago") en el detalle del movimiento, con link a la tarjeta — mismo patrón que ya usan `STATEMENT_PAYMENT`/`INSTALLMENT` vía `transactions.sourceOf()`.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Abonar contra el período corriente antes de que cierre (Priority: P1)

Un usuario con una tarjeta de crédito quiere adelantar un pago antes de la fecha de corte, para reducir su deuda ahora en vez de esperar a que llegue la próxima facturación. Desde el formulario de "Nuevo movimiento", elige su cuenta de tarjeta de crédito, selecciona la opción de prepago, indica desde qué otra cuenta propia sale el dinero y cuánto abona.

**Why this priority**: Es la funcionalidad completa que resuelve el problema — sin esto, prepagar simplemente no existe en la app, que es la brecha reportada.

**Independent Test**: Con una cuenta CREDIT_CARD que tiene consumo en su período abierto, registrar un abono parcial desde una cuenta con saldo y verificar que: se crea un gasto real en la cuenta de origen, el cupo usado de la tarjeta baja de inmediato, y el período abierto sigue acumulando movimientos normalmente.

**Acceptance Scenarios**:

1. **Given** una cuenta CREDIT_CARD con $200.000 de cupo usado en su período abierto, **When** el usuario registra un prepago de $50.000 desde una cuenta con saldo suficiente, **Then** el cupo usado de la tarjeta baja a $150.000 y aparece un gasto de $50.000 en los movimientos de la cuenta de origen.
2. **Given** un prepago recién registrado, **When** el usuario revisa el período abierto de la tarjeta, **Then** el período sigue mostrando su actividad (compras, cuotas facturadas) sin haberse cerrado ni marcado como pagado.

---

### User Story 2 - Varios abonos dentro del mismo período (Priority: P2)

El mismo usuario, más adelante en el mismo ciclo, quiere hacer un segundo abono antes de que el período cierre — por ejemplo porque recibió un ingreso extra y quiere seguir bajando la deuda.

**Why this priority**: Un solo abono por período no refleja el uso real de una tarjeta de crédito; permitir varios es lo que hace la función utilizable en la práctica, pero el sistema ya es útil con un solo abono por período (P1) mientras se construye esto.

**Independent Test**: Sobre un período que ya recibió un prepago, registrar un segundo prepago antes del cierre y verificar que ambos montos se acumulan correctamente contra el cupo usado.

**Acceptance Scenarios**:

1. **Given** un período abierto que ya recibió un prepago de $50.000, **When** el usuario registra un segundo prepago de $30.000, **Then** el cupo usado total baja en $80.000 acumulados y ambos movimientos de gasto existen por separado en la cuenta de origen.

---

### User Story 3 - El cierre normal de facturación descuenta lo ya prepagado (Priority: P1)

Cuando llega la fecha de corte y el período abierto cierra por el ciclo normal de facturación, el usuario espera que la facturación resultante refleje solo lo que realmente queda por pagar — no el total del período ignorando lo ya abonado.

**Why this priority**: Sin este comportamiento, el prepago sería contraproducente: el usuario pagaría dos veces por la misma deuda, lo cual es peor que no tener la función. Es tan crítico como la propia acción de prepagar.

**Independent Test**: Prepagar parte de un período abierto y luego forzar/esperar su cierre; verificar que la facturación resultante (PENDING) muestra como monto adeudado el total del período menos lo ya prepagado, y que el cupo usado no vuelve a bajar por el mismo monto una segunda vez al pagar esa facturación.

**Acceptance Scenarios**:

1. **Given** un período con $200.000 de actividad y $50.000 ya prepagados, **When** el período cierra por el ciclo de facturación, **Then** la facturación resultante queda pendiente por $150.000, no por $200.000.
2. **Given** la facturación anterior de $150.000, **When** el usuario la paga en su totalidad, **Then** el cupo usado de la tarjeta llega a $0 (no queda un remanente de los $50.000 ya prepagados antes).

---

### Edge Cases

- ¿Qué pasa si el usuario intenta prepagar más de lo que actualmente está usado en el período abierto (dejando "saldo a favor")? → Se rechaza; el monto máximo de un prepago es lo actualmente adeudado en ese momento (ver FR-005).
- ¿Qué pasa si el período abierto no tiene ningún consumo todavía (cupo usado = 0)? → No hay nada que prepagar; la opción no debería llevar a un estado inconsistente (monto mínimo mayor a cero, ver FR-005).
- ¿Qué pasa si, entre que el usuario abre el formulario de prepago y confirma, otro movimiento ya cambió cuánto se debe (p. ej. una cuota se facturó)? → La validación del monto máximo se aplica contra el estado real al momento de confirmar el prepago, no contra una cifra congelada al abrir el formulario.
- ¿Qué pasa si la cuenta de origen elegida no tiene saldo suficiente para cubrir el prepago? → Mismo criterio que ya aplica hoy al pagar una facturación cerrada: se advierte pero no se bloquea (la cuenta puede tener sobregiro u otra fuente que la app no modela).
- ¿Qué pasa si se intenta prepagar una cuenta que no es de tipo CREDIT_CARD? → La opción de prepago no debe estar disponible; es exclusiva de cuentas CREDIT_CARD.
- ¿Qué pasa si se reintenta el mismo envío de prepago dos veces (doble clic, reintento de red)? → No debe duplicar el efecto (mismo estándar de escritura idempotente que ya aplica a pagar una facturación).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE permitir registrar un abono (prepago) contra el período actualmente abierto de una cuenta CREDIT_CARD, sin necesidad de que ese período haya cerrado primero.
- **FR-002**: Un prepago DEBE originarse desde otra cuenta propia del usuario que mantenga saldo real (no puede salir de otra cuenta CREDIT_CARD ni de la misma cuenta que se está prepagando).
- **FR-003**: Registrar un prepago DEBE crear un movimiento de gasto (EXPENSE) real en la cuenta de origen, reduciendo su saldo disponible de la misma forma que cualquier otro gasto.
- **FR-004**: Registrar un prepago DEBE reducir de inmediato el cupo usado (creditUsed) de la cuenta CREDIT_CARD por el monto abonado.
- **FR-005**: El sistema DEBE rechazar un prepago cuyo monto sea mayor a lo actualmente adeudado en el período abierto en el momento de confirmar la operación, y DEBE rechazar un monto de cero o negativo.
- **FR-006**: El sistema DEBE permitir registrar más de un prepago dentro del mismo período abierto, antes de que este cierre.
- **FR-007**: Cuando el período abierto cierra por el ciclo de facturación normal, el monto que queda pendiente de pago en la facturación resultante DEBE ser el total de la actividad del período menos la suma de todos los prepagos ya realizados sobre él.
- **FR-008**: Pagar posteriormente esa facturación (total o parcialmente) NO DEBE volver a descontar del cupo usado lo que ya fue descontado por los prepagos — cada abono (sea prepago o pago de facturación) afecta el cupo usado una sola vez.
- **FR-009**: En el formulario de registrar un nuevo movimiento, al seleccionar una cuenta de tipo CREDIT_CARD, el usuario DEBE poder elegir entre registrar un Gasto ordinario o registrar un prepago — ninguna otra opción de tipo de movimiento (Ingreso, Traspaso) DEBE ofrecerse para ese tipo de cuenta.
- **FR-010**: Un reintento del mismo intento de prepago (p. ej. por un doble envío o un reintento de red) NO DEBE aplicar el efecto más de una vez.
- **FR-011**: El sistema DEBE registrar solo prepagos con monto y fecha reales — no se contempla en esta feature ninguna forma de prepago automático o programado.
- **FR-012**: El movimiento de gasto creado por un prepago DEBE seguir siendo editable y eliminable desde Movimientos como cualquier otro movimiento — el usuario puede corregir o revertir cualquier registro que haya hecho. Editar su monto o eliminarlo DEBE ajustar en consecuencia, en la misma operación, tanto el saldo de la cuenta de origen como el cupo usado que ese prepago había reducido en la tarjeta (si el prepago se elimina, el cupo usado sube de vuelta por el monto completo; si el monto se corrige, el cupo usado se ajusta por la diferencia).
- **FR-013**: Si el período al que aplicó un prepago ya cerró (existe una facturación generada a partir de él) al momento de editar o eliminar ese prepago, la cifra pendiente de esa facturación DEBE recalcularse automáticamente como parte de la misma operación — el usuario no debe tener que sincronizarla manualmente para que refleje el cambio.
- **FR-014**: El movimiento de gasto creado por un prepago DEBE identificarse con un origen propio y distinguible al revisarlo en el detalle de Movimientos (no debe verse como un gasto manual indistinguible), con un enlace a la tarjeta que recibió el abono — mismo criterio de trazabilidad que ya aplica al pago de una facturación o a una cuota de un plan.

### Key Entities _(include if feature involves data)_

- **Prepago**: Un abono de dinero real contra el período de facturación actualmente abierto de una cuenta de tarjeta de crédito. Se identifica por la cuenta de tarjeta de crédito que recibe el abono, la cuenta de origen desde la que sale el dinero, el monto y la fecha. Cada prepago reduce el cupo usado de la tarjeta y disminuye lo que la próxima facturación de ese período cobrará.
- **Período de facturación (abierto)**: El tramo de actividad de una tarjeta de crédito que aún no ha cerrado por el ciclo normal de facturación. Hoy solo acumula consumo; con esta feature también acumula lo prepagado, de forma que al cerrar, lo pendiente de cobro ya refleja los abonos hechos durante ese tramo.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un usuario puede reducir el cupo usado de su tarjeta de crédito sin tener que esperar a que llegue una facturación cerrada — la reducción es visible inmediatamente después de confirmar el prepago.
- **SC-002**: El monto que una facturación cobra, después de haber recibido uno o más prepagos durante su período, nunca incluye una deuda ya saldada por esos prepagos — cero casos de cobro duplicado.
- **SC-003**: Un usuario puede completar el registro de un prepago (elegir cuenta, monto, confirmar) en menos pasos que los que hoy toma pagar una facturación cerrada, reutilizando un flujo ya familiar.
- **SC-004**: El sistema impide, en el 100% de los intentos, dejar un período con "saldo a favor" (prepago mayor a lo adeudado).

## Assumptions

- Un prepago siempre se cubre completamente por dinero de una cuenta propia distinta y con saldo real — no existe en esta app conversión de moneda, así que un prepago entre cuentas de distinta moneda queda sujeto a la misma limitación (sin conversión) que ya aplica hoy al pagar una facturación cerrada.
- El límite de "no dejar saldo a favor" se evalúa contra el cupo usado del período abierto en el momento de confirmar, consistente con cómo ya se valida un pago de facturación cerrada (`PAYMENT_EXCEEDS_REMAINING`).
- Un prepago no cierra ni afecta el estado del período (sigue OPEN) — solo el ciclo de facturación normal (o el cierre manual ya existente) lo cierra.
- Esta feature no introduce ningún concepto de "crédito a favor", pago automático/programado, ni prepago hacia/desde otra cuenta de tarjeta de crédito — quedan explícitamente fuera de alcance.
- La cuenta CREDIT_CARD sigue sin ofrecer Ingreso ni Traspaso como tipos de movimiento (comportamiento ya existente); el prepago se suma como una opción adicional junto a Gasto, no los reemplaza.
