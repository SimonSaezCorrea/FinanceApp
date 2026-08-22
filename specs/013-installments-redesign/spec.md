# Feature Specification: Vista Cuotas — rediseño funcional y pago real de la cuota

**Feature Branch**: `013-installments-redesign`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Rediseño funcional de la vista Cuotas (planes de cuotas), en los tres formatos del handoff. Una fila = un plan; detalle, crear y editar en panel lateral; previsualización en vivo al crear; lo inmutable se muestra en vez de esconderse; categoría con ícono; interés visible; pagar una cuota registra el gasto real en una cuenta, con la cuenta de pago recordada en el plan y bloqueada en planes con tarjeta de crédito."

## Clarifications

### Session 2026-08-15

- Q: Si una cuota se paga por menos (o por más) de lo programado, ¿qué pasa con la diferencia? → A: El faltante se arrastra a la siguiente cuota (mismo mecanismo de arrastre que ya usa la facturación de crédito); el calendario programado no se reescribe.
- Q: ¿Se mantiene el cargo financiero automático que hoy genera un plan con interés y tarjeta? → A: Sí, tal cual; el campo de interés ahora visible sólo hace explícito lo que ya ocurría, y la previsualización debe avisar del cargo.
- Q: ¿Qué hace el formulario de pago si la cuenta está en distinta moneda que el plan? → A: Permite pagar, mostrando ambas monedas sin convertir; el gasto se registra en la moneda de la cuenta por el monto que el usuario escriba.
- Q: ¿De dónde sale la categoría del plan y el ícono de su fila? → A: La categoría es la misma de los movimientos (texto libre con las opciones que el usuario ya usó) y el ícono sale del mapa estático categoría→ícono que ya existe y comparte la vista de Movimientos.

### Session 2026-08-15 (tras la revisión de checklists)

- Q: Al eliminar un plan con cuotas pagadas, ¿qué pasa con sus gastos reales? → A: Se borran y se restituyen los saldos; eliminar el plan revierte todo su historial. La confirmación debe declarar cuántos movimientos se borrarán y qué saldo vuelve.
- Q: ¿Se puede pagar una cuota desde una cuenta de tarjeta de crédito? → A: No; se bloquea, igual que un traspaso no puede tener destino de crédito.
- Q: ¿Qué pasa si se edita desde Movimientos el gasto que respalda una cuota? → A: Se bloquea: un movimiento vinculado a una cuota sólo se modifica desde su plan.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Ver mis planes de cuotas de un vistazo (Priority: P1)

Quien tiene tres o cuatro compras en cuotas abre la vista y necesita responder en un segundo: cuánto me toca pagar este mes, cuánto debo en total, qué está vencido y cuántos planes siguen vivos. Hoy la vista le entrega una lista de cuotas sueltas de todos los planes mezclados, donde el mismo plan aparece doce veces y ningún renglón representa la deuda completa.

La lista pasa a mostrar **una fila por plan**: su nombre con el ícono de su categoría, el rango de fechas del plan, el progreso (cuotas pagadas sobre el total), la próxima cuota con su estado, el monto de la cuota, lo que resta por pagar y la tarjeta con que se compró. Encima, cuatro indicadores: cuota de este mes, pendiente total, próxima cuota (destacada cuando está vencida) y cantidad de planes activos.

**Why this priority**: es la razón de existir de la vista. Sin esto, todo lo demás cuelga de una lista que no se entiende. Entregable por sí solo.

**Independent Test**: con planes ya existentes en la cuenta, abrir Cuotas y verificar que hay exactamente una fila por plan, que el progreso y el restante de cada fila coinciden con sus cuotas, y que los cuatro indicadores cuadran con la suma de los planes mostrados.

**Acceptance Scenarios**:

1. **Given** un usuario con 4 planes, uno de ellos completado, **When** abre la vista Cuotas, **Then** ve 4 filas, una por plan, y el indicador "planes activos" dice 3.
2. **Given** un plan con 6 de 12 cuotas pagadas, **When** ve su fila, **Then** el progreso dice 6/12 y el restante es la suma de las 6 cuotas impagas.
3. **Given** un plan cuya cuota más próxima impaga venció hace 5 días, **When** ve la lista, **Then** esa fila se marca como vencida y el indicador "próxima cuota" muestra el vencimiento en tratamiento de alerta.
4. **Given** un plan con todas sus cuotas pagadas, **When** ve su fila, **Then** se marca como pagado, su restante es cero y no ofrece la acción de pagar.
5. **Given** planes en más de una moneda, **When** ve los indicadores, **Then** cada moneda se totaliza por separado y ningún importe de monedas distintas se suma entre sí.

---

### User Story 2 - Abrir un plan sin perder la lista (Priority: P1)

Al elegir un plan, quien lo consulta quiere ver su calendario completo de cuotas sin que la lista de atrás se reordene ni se comprima bajo el cursor, y quiere volver exactamente a donde estaba.

El detalle se abre como **panel lateral** desde el borde derecho, sobre el fondo atenuado, con el mismo patrón que ya usan el detalle de movimiento y el pago de facturación. Dentro: pagado, restante y total; la barra de progreso; y la lista completa de cuotas, cada una con su número, fecha, monto y estado. La acción principal es pagar la siguiente cuota impaga; cada cuota ya pagada ofrece deshacer.

**Why this priority**: es el único lugar donde se ve el calendario del plan y desde donde se paga. Sin él la lista es de sólo lectura.

**Independent Test**: abrir un plan desde la lista, comprobar que la lista de fondo no cambia de orden ni de tamaño, recorrer las cuotas y cerrar el panel verificando que la posición de scroll de la lista se conserva.

**Acceptance Scenarios**:

1. **Given** la lista de planes, **When** se elige una fila, **Then** el detalle entra desde el borde derecho y la lista de fondo mantiene su orden, su ancho y su posición de scroll.
2. **Given** el detalle abierto de un plan de 12 cuotas con 6 pagadas, **When** se lee el panel, **Then** muestra 12 cuotas en orden, las 6 primeras marcadas como pagadas con opción de deshacer, y la séptima destacada como la siguiente a pagar.
3. **Given** el detalle abierto, **When** se cierra, **Then** vuelve la lista sin recargar ni saltar de posición.
4. **Given** un plan con todas sus cuotas pagadas, **When** se abre su detalle, **Then** no hay acción de pago y el restante es cero.

---

### User Story 3 - Pagar una cuota y que el dinero se mueva (Priority: P1)

Marcar una cuota como pagada hoy no deja rastro: el plan queda al día pero ninguna cuenta refleja la salida de dinero, así que el saldo de la app y el del banco se separan un poco más cada mes.

Pagar una cuota pasa a **registrar el gasto real** en una cuenta. Al pagar se abre un formulario con los datos ya rellenados —la cuenta con la que se paga, el monto de la cuota y la fecha— y quien paga puede corregir cualquiera de ellos antes de confirmar: pagó tarde, pagó de más o pagó de menos. La corrección **no reescribe el calendario**: los montos y fechas programados de las demás cuotas quedan intactos. Lo que no se alcanzó a cubrir se **arrastra a la siguiente cuota impaga** como saldo pendiente —el mismo mecanismo de arrastre que ya usa la facturación de crédito— y lo pagado de más la reduce en la misma medida. Deshacer el pago revierte el gasto registrado y el arrastre que hubiera provocado.

**Why this priority**: es la corrección de fondo que justifica el rediseño. Cambia el significado del dato, no su presentación.

**Independent Test**: pagar una cuota eligiendo una cuenta, verificar que aparece un gasto por ese monto en los movimientos de esa cuenta y que su saldo baja en la misma cifra; deshacer y verificar que el gasto desaparece y el saldo vuelve.

**Acceptance Scenarios**:

1. **Given** un plan pagadero y una cuota impaga, **When** se pulsa pagar, **Then** se abre un formulario con la cuenta de pago del plan, el monto de la cuota y la fecha de hoy ya rellenados.
2. **Given** ese formulario, **When** se confirma sin cambiar nada, **Then** la cuota queda pagada y aparece un gasto por ese monto, en esa fecha, en la cuenta elegida, con el saldo de la cuenta reducido en el mismo importe.
3. **Given** ese formulario, **When** se cambia la fecha a una posterior al vencimiento, **Then** la cuota se registra pagada en esa fecha y las demás cuotas conservan su monto y su fecha programada.
4. **Given** una cuota de 41.583, **When** se paga por 30.000, **Then** la cuota queda saldada con 30.000, la siguiente cuota impaga muestra un arrastre de 11.583 sobre su monto programado, y ninguna otra cuota cambia.
5. **Given** esa misma cuota, **When** se paga por 50.000, **Then** la siguiente cuota impaga se reduce en 8.417 respecto de su monto programado.
6. **Given** una cuota pagada que arrastró un faltante, **When** se deshace el pago, **Then** la cuota vuelve a impaga, el gasto se elimina, el saldo se restituye y el arrastre sobre la siguiente cuota desaparece.
7. **Given** un plan cuya cuenta de pago fue eliminada o desactivada, **When** se pulsa pagar, **Then** el formulario pide elegir una cuenta y no permite confirmar hasta que haya una válida.
8. **Given** un intento de pago con una cuenta cuyo saldo no alcanza y cuyo tipo no admite quedar en negativo, **When** se confirma, **Then** el pago se rechaza con un motivo claro y la cuota permanece impaga.
9. **Given** un plan en USD y una cuenta de pago en CLP, **When** se abre el formulario, **Then** muestra el monto de la cuota en USD y pide por separado el monto en CLP realmente cargado, sin convertir ni proponer una cifra.

---

### User Story 4 - Un plan comprado con tarjeta de crédito no se paga dos veces (Priority: P1)

Cuando el plan nació de una compra con tarjeta de crédito, esa compra ya está registrada como movimiento en la cuenta de crédito y ya vive en su facturación. Registrar además un gasto por cada cuota contaría la misma deuda dos veces y ensuciaría el patrimonio.

En esos planes la cuota **sólo se marca como pagada**, sin generar movimiento, y el panel explica por qué: la deuda ya está en la facturación de la tarjeta.

**Why this priority**: sin esta regla, la historia 3 introduce un error de contabilidad en el caso más común de compra en cuotas.

**Independent Test**: crear un plan asociado a una tarjeta de crédito, pagar una cuota y verificar que no se crea movimiento alguno, que ningún saldo cambia, y que el panel muestra la explicación.

**Acceptance Scenarios**:

1. **Given** un plan asociado a una tarjeta de crédito, **When** se abre su detalle, **Then** el panel indica que las cuotas de este plan no generan movimiento porque la deuda ya está en la facturación de esa tarjeta.
2. **Given** ese plan, **When** se paga una cuota, **Then** la cuota queda pagada sin formulario de cuenta de pago, sin movimiento creado y sin cambio de saldo en ninguna cuenta.
3. **Given** ese plan, **When** se edita, **Then** no se ofrece elegir cuenta de pago.
4. **Given** un plan asociado a una tarjeta que no es de crédito (débito o prepago), **When** se paga una cuota, **Then** sí se registra el gasto real, porque en esas tarjetas el dinero sale en el momento de cada cuota.

---

### User Story 5 - Crear un plan sabiendo de antemano en qué me meto (Priority: P2)

El formulario actual pide monto, número de cuotas y fecha, pero nunca dice cuánto se pagará por cuota ni hasta cuándo. Quien crea el plan tiene que hacer la división de cabeza y descubrir el calendario después de guardarlo.

Crear pasa a ser un **panel lateral con previsualización en vivo**: mientras se escribe, se ve el monto por cuota, la fecha de la primera y la última cuota, el total del plan y el ajuste por redondeo que recibe la última cuota. La previsualización usa exactamente los mismos números que quedarán guardados. El formulario pide además la **tasa de interés por período** de forma explícita, y la previsualización refleja el total con interés cuando la hay.

**Why this priority**: mejora fuerte de la creación, pero la vista ya es útil sin ella.

**Independent Test**: escribir monto, número de cuotas y fecha, comparar la previsualización con el calendario que aparece en el detalle después de guardar, y verificar que coinciden hasta el último peso, incluido el ajuste de la última cuota.

**Acceptance Scenarios**:

1. **Given** el panel de creación, **When** se escriben monto total, número de cuotas, fecha de primera cuota y frecuencia, **Then** la previsualización muestra el monto por cuota, la fecha de la primera y la última cuota y el total del plan.
2. **Given** un monto que no se divide exacto entre las cuotas, **When** se mira la previsualización, **Then** indica el monto de la última cuota ajustado y explica que el resto por redondeo se suma a ella.
3. **Given** una previsualización cualquiera, **When** se guarda el plan y se abre su detalle, **Then** cada cuota del calendario coincide exactamente con lo previsualizado.
4. **Given** el panel de creación con una tasa de interés por período declarada, **When** se mira la previsualización, **Then** el total del plan es mayor que el monto financiado y la diferencia corresponde al interés.
5. **Given** una tasa de interés declarada y una tarjeta seleccionada, **When** se mira la previsualización, **Then** avisa que además se registrará un cargo financiero por el interés en la cuenta de esa tarjeta, e indica su monto.
6. **Given** el panel de creación con datos incompletos, **When** falta un dato necesario para calcular, **Then** la previsualización indica que faltan datos en vez de mostrar una cifra provisional.

---

### User Story 6 - Editar sin que desaparezcan los campos (Priority: P2)

El formulario de edición actual simplemente esconde monto, número de cuotas y fecha de inicio, y quien edita cree que perdió esos datos.

Editar pasa a **mostrar lo inmutable como dato de sólo lectura**, con su razón (cambiarlos regeneraría el calendario y borraría los pagos ya registrados) y su salida (eliminar el plan y crearlo de nuevo). Lo que sí se puede cambiar —título, categoría, tarjeta, frecuencia, cuenta de pago, notas— se edita normalmente.

**Why this priority**: corrige una confusión concreta, con poco alcance técnico.

**Independent Test**: abrir la edición de un plan con cuotas pagadas y verificar que monto, número de cuotas y primera cuota se leen en pantalla, no se pueden modificar, y llevan la explicación y la alternativa.

**Acceptance Scenarios**:

1. **Given** un plan con cuotas pagadas, **When** se abre su edición, **Then** monto total, número de cuotas y fecha de primera cuota se muestran con sus valores, en sólo lectura, junto a la razón y la salida.
2. **Given** esa edición, **When** se cambia el título y se guarda, **Then** el plan conserva íntegro su calendario y sus pagos.
3. **Given** esa edición, **When** se elimina el plan desde ahí, **Then** se pide confirmación antes de borrarlo.

---

### User Story 7 - Reconocer cada plan por su categoría (Priority: P3)

Una lista de nombres escritos a mano se lee lento. Cada plan declara a qué **categoría** pertenece —la misma categoría que ya usan los movimientos, elegida del mismo listado de las que el usuario ya utilizó y admitiendo una nueva— y de ella sale el ícono que lo identifica en la lista y en el detalle, resuelto con el mismo criterio con que hoy se le pone ícono a un movimiento. Una categoría que ese criterio no reconoce recibe el ícono neutro, nunca uno equivocado.

**Why this priority**: puramente de reconocimiento visual; la vista funciona sin ello.

**Independent Test**: asignar categorías distintas a dos planes y verificar que cada fila muestra el mismo ícono que un movimiento de esa categoría, y que ambos planes se distinguen a simple vista.

**Acceptance Scenarios**:

1. **Given** el formulario de creación, **When** se elige una categoría, **Then** el plan queda guardado con ella y su fila muestra el ícono que le corresponde a esa categoría.
2. **Given** un plan y un movimiento con la misma categoría, **When** se ven ambos, **Then** muestran el mismo ícono.
3. **Given** un plan sin categoría, o con una que el criterio de íconos no reconoce, **When** se ve en la lista, **Then** muestra el ícono neutro y sigue siendo plenamente utilizable.
4. **Given** un plan existente, **When** se edita su categoría, **Then** el ícono cambia en la lista y en el detalle.

---

### User Story 8 - La misma vista en teléfono, tablet y escritorio (Priority: P2)

La vista debe ser usable completa en los tres formatos del handoff, sin que ninguna acción quede fuera de alcance en la pantalla chica.

- **Escritorio**: lista a ancho completo; detalle, crear y editar como panel lateral sobre el fondo atenuado.
- **Tablet**: lista de tarjetas sin las columnas de detalle; detalle, crear y editar como panel lateral.
- **Teléfono**: lista compacta con la información apilada; detalle, crear y editar como pantalla completa, con la acción principal fijada al pie.

**Why this priority**: sin esto, la mitad de los usos queda inservible; pero depende de que las historias 1-3 existan.

**Independent Test**: recorrer el ciclo completo (ver lista → abrir plan → pagar cuota → crear plan → editar plan) en cada uno de los tres anchos y comprobar que ninguna acción queda inaccesible ni exige desplazamiento horizontal.

**Acceptance Scenarios**:

1. **Given** un ancho de escritorio, **When** se abre un plan, **Then** el detalle es un panel lateral y la lista permanece visible detrás.
2. **Given** un ancho de tablet, **When** se ve la lista, **Then** cada plan es una tarjeta con su información apilada y sin columnas de detalle, y el detalle sigue siendo un panel lateral.
3. **Given** un ancho de teléfono, **When** se abre el detalle, la creación o la edición, **Then** ocupa la pantalla completa y su acción principal está fijada al pie, siempre visible.
4. **Given** cualquiera de los tres anchos, **When** se recorre la vista, **Then** no hay desplazamiento horizontal de la página.

---

### Edge Cases

- **Sin planes**: la vista muestra un estado vacío con la acción de crear el primero, y no muestra indicadores en cero como si fueran datos.
- **Plan de una sola cuota**: el progreso es 0/1 o 1/1 y la previsualización no habla de ajuste por redondeo.
- **Todas las cuotas vencidas**: el indicador de próxima cuota muestra la más antigua impaga, marcada como vencida.
- **Cuota pagada fuera de orden**: si se deshace una cuota intermedia, la "siguiente a pagar" pasa a ser esa, no la que sigue cronológicamente.
- **Cuenta de pago eliminada**: el plan pierde su cuenta recordada y el formulario de pago la pide de nuevo; los pagos ya registrados no se alteran.
- **El movimiento del pago se borra desde la vista de Movimientos**: la cuota deja de estar respaldada por un gasto; la app no debe mostrar un vínculo roto ni impedir deshacer la cuota.
- **Cambiar la tarjeta del plan a una de crédito** cuando ya había pagos con movimiento: los movimientos existentes se conservan; sólo las cuotas futuras dejan de generarlos.
- **Cambiar la cuenta de pago del plan**: no toca ningún pago ya registrado; sólo prellena los siguientes.
- **Monedas distintas**: si la cuenta de pago está en otra moneda que el plan, el sistema no convierte; pide los dos montos por separado y deja claro cuál se registra en la cuenta y cuál se abona a la cuota.
- **Plan completado**: no ofrece pagar, y sigue apareciendo bajo el filtro Pagados.
- **Doble confirmación rápida del mismo pago**: no debe registrar dos gastos para la misma cuota.
- **Arrastre encadenado**: si varias cuotas seguidas se pagan de menos, cada arrastre se suma al de la siguiente; lo adeudado nunca se pierde por el camino.
- **Arrastre sobre una cuota que luego se deshace**: deshacer la cuota que RECIBIÓ el arrastre no borra ese arrastre — pertenece al pago anterior, que sigue en pie.
- **Pago de cero o negativo**: se rechaza; deshacer es la forma de anular un pago, no pagar cero.
- **Cargo financiero por interés**: existe hoy y sigue existiendo; eliminar el plan lo elimina también (FR-050a).
- **Excedente que absorbe varias cuotas**: pagar muy por encima de lo adeudado salda las cuotas siguientes en cadena hasta agotarse, y se rechaza si supera lo que el plan entero debe (FR-021a/FR-021b).
- **Eliminar un plan cuya cuenta de pago ya no existe**: los gastos de esa cuenta se eliminan igual; no hay saldo que restituir en una cuenta borrada.
- **Editar el movimiento de una cuota desde Movimientos**: no se permite (FR-028a). La vía es deshacer la cuota y volver a pagarla.

## Requirements _(mandatory)_

### Functional Requirements

**Lista y encabezado**

- **FR-001**: La vista Cuotas MUST mostrar una fila por plan, nunca una fila por cuota.
- **FR-002**: Cada fila MUST mostrar: nombre del plan, ícono de su categoría, rango de fechas (primera y última cuota), progreso como cuotas pagadas sobre total, estado de la próxima cuota, monto de la cuota, monto restante y la tarjeta asociada cuando exista.
- **FR-003**: El sistema MUST derivar el estado de un plan como uno de: **vencida** (su cuota impaga más antigua tiene fecha anterior a hoy), **próxima** (vence dentro de los próximos 7 días), **al día** (vence más adelante), **parcialmente pagado** (no quedan cuotas impagas pero la última quedó cubierta sólo en parte, según FR-023) o **pagado** (no queda nada por pagar). "Parcialmente pagado" MUST contar como plan activo.
- **FR-004**: El encabezado MUST mostrar cuatro indicadores: total a pagar este mes, pendiente total, próxima cuota (fecha y estado) y número de planes activos.
- **FR-005**: Los indicadores MUST separarse por moneda y NUNCA sumar importes de monedas distintas.
- **FR-006**: El indicador de próxima cuota MUST distinguirse visualmente cuando la cuota está vencida.
- **FR-007**: El sistema MUST considerar "plan activo" a aquel que conserva al menos una cuota impaga.

**Filtros**

- **FR-008**: La vista MUST ofrecer filtros por estado del plan: todos, por pagar (con alguna cuota impaga) y pagados (sin cuotas impagas).
- **FR-009**: La vista MUST ofrecer un filtro adicional que limite la lista a los planes cuya próxima cuota impaga cae dentro de los próximos 3 meses.
- **FR-010**: La vista MUST mostrar el número de planes visibles bajo los filtros activos.

**Detalle**

- **FR-011**: El detalle de un plan MUST presentarse como panel lateral en escritorio y tablet, y como pantalla completa en teléfono; NUNCA como modal centrado ni como columna que reordene o comprima la lista.
- **FR-012**: Abrir y cerrar el detalle MUST conservar el orden, el ancho y la posición de desplazamiento de la lista de fondo.
- **FR-013**: El detalle MUST mostrar monto pagado, monto restante, total del plan, progreso y la lista completa de cuotas con número, fecha, monto y estado de cada una.
- **FR-014**: El detalle MUST ofrecer como acción principal pagar la cuota impaga más antigua, y MUST ofrecer deshacer en cada cuota ya pagada.
- **FR-015**: El detalle MUST ofrecer editar y eliminar el plan.

**Pago de una cuota**

- **FR-016**: Pagar una cuota MUST abrir un formulario con cuenta de pago, monto y fecha ya rellenados: la cuenta de pago recordada por el plan, el monto de la cuota y la fecha de hoy.
- **FR-017**: El usuario MUST poder modificar cuenta, monto y fecha antes de confirmar el pago.
- **FR-018**: Confirmar el pago MUST registrar un gasto real en la cuenta elegida, por el monto y en la fecha confirmados, y MUST reducir el saldo de esa cuenta en ese importe.
- **FR-019**: El sistema MUST registrar, en la cuota pagada, el monto realmente pagado y la fecha real de pago, que pueden diferir del monto y la fecha programados.
- **FR-020**: Pagar o corregir un pago MUST NOT reescribir el calendario: los montos programados y las fechas de vencimiento de las demás cuotas MUST permanecer intactos.
- **FR-021**: Cuando lo pagado es menor que lo adeudado por esa cuota, la diferencia MUST arrastrarse a la **siguiente cuota impaga** como saldo pendiente que se suma a su monto programado; cuando es mayor, el excedente MUST restarse de esa misma siguiente cuota.
- **FR-021a**: Un excedente mayor que lo adeudado por la siguiente cuota impaga MUST seguir propagándose a las cuotas impagas posteriores, en orden, hasta agotarse. **Lo adeudado por una cuota nunca puede quedar negativo**: una cuota completamente absorbida por el excedente queda saldada sin pago propio.
- **FR-021b**: Un pago MUST rechazarse cuando excede lo que el plan entero adeuda, con el código de error correspondiente; el excedente que no tiene deuda donde aplicarse no se convierte en saldo a favor. Esto resuelve también el pago de más sobre la última cuota impaga.
- **FR-022**: Lo adeudado por una cuota MUST ser su monto programado más el arrastre que haya recibido de la cuota anterior, y ese arrastre MUST mostrarse por separado del monto programado.
- **FR-023**: Si la cuota pagada de forma insuficiente es la última impaga del plan, el faltante MUST NOT desaparecer: esa cuota MUST quedar como parcialmente pagada, seguir siendo pagable por el remanente y mantener el plan como activo hasta cubrirlo.
- **FR-024**: Deshacer un pago MUST devolver la cuota a impaga, eliminar el gasto asociado, restituir el saldo de la cuenta y deshacer el arrastre que ese pago hubiera provocado.
- **FR-025**: El sistema MUST impedir que una misma cuota quede con más de un gasto asociado.
- **FR-026**: Un pago MUST rechazarse, con un motivo comprensible y sin marcar la cuota, cuando la cuenta elegida no admite ese cargo (por ejemplo, dejaría en negativo un saldo que no puede serlo).
- **FR-027**: El gasto generado MUST ser reconocible en la vista de Movimientos como cualquier otro gasto de esa cuenta.
- **FR-028**: Si el gasto asociado a una cuota deja de existir por cualquier vía, el sistema MUST seguir permitiendo deshacer o mantener esa cuota sin error.
- **FR-028a**: Un movimiento que respalda una cuota MUST NOT poder editarse ni eliminarse desde la vista de Movimientos: la única forma de modificarlo es deshacer o volver a pagar la cuota desde su plan. La vista de Movimientos MUST explicar el motivo y ofrecer el camino, en vez de limitarse a impedirlo.
- **FR-028b**: Un pago MUST rechazarse cuando la cuenta de origen es una cuenta de tarjeta de crédito: pagar deuda con deuda no registra salida de dinero y distorsionaría el cupo. El selector de cuenta MUST NOT ofrecer esas cuentas — misma regla que ya impide que un traspaso tenga destino de crédito.
- **FR-029**: Cuando la moneda de la cuenta de pago difiere de la del plan, el formulario MUST mostrar ambas por separado —el monto adeudado en la moneda del plan y el monto a registrar en la de la cuenta— y MUST NOT convertir ni proponer una cifra convertida.
- **FR-030**: El gasto MUST registrarse siempre en la moneda de la cuenta de pago, por el monto que el usuario confirme.
- **FR-031**: Cuando las monedas difieren, lo abonado a la cuota (y por tanto el arrastre de FR-021) MUST calcularse con el monto declarado en la moneda del plan, no con el importe del gasto.

**Cuenta de pago del plan**

- **FR-032**: Un plan MUST poder recordar la cuenta con la que se pagan sus cuotas.
- **FR-033**: Cambiar la cuenta de pago del plan MUST afectar únicamente a los pagos futuros y NUNCA a los ya registrados.
- **FR-034**: Si el plan no tiene cuenta de pago recordada o la recordada ya no es utilizable, el formulario de pago MUST exigir elegir una antes de confirmar.

**Planes con tarjeta de crédito**

- **FR-035**: En un plan asociado a una tarjeta de crédito, pagar una cuota MUST limitarse a marcarla como pagada, sin crear movimiento ni alterar saldo alguno.
- **FR-036**: El detalle de esos planes MUST explicar por qué no se genera movimiento: la deuda ya está registrada en la facturación de esa tarjeta.
- **FR-037**: Esos planes MUST NOT ofrecer cuenta de pago ni formulario de pago con cuenta.
- **FR-038**: Un plan asociado a una tarjeta que no sea de crédito MUST comportarse como uno sin tarjeta y sí generar el gasto real.

**Creación**

- **FR-039**: Crear un plan MUST presentarse como panel lateral (pantalla completa en teléfono), no como modal centrado.
- **FR-040**: El formulario MUST mostrar, en vivo mientras se escribe, el monto por cuota, la fecha de la primera cuota, la fecha de la última cuota y el total del plan.
- **FR-041**: Cuando el monto no se divide exacto entre las cuotas, la previsualización MUST mostrar el monto ajustado de la última cuota y explicar el ajuste.
- **FR-042**: La previsualización MUST coincidir exactamente, hasta la unidad mínima de la moneda, con el calendario que quedará guardado.
- **FR-043**: Con datos insuficientes, la previsualización MUST indicarlo en vez de mostrar una cifra provisional.
- **FR-044**: El formulario MUST permitir declarar explícitamente una tasa de interés por período, y la previsualización MUST reflejar el total con interés cuando la haya.
- **FR-045**: El sistema MUST conservar el comportamiento actual por el cual un plan con interés asociado a una tarjeta registra el interés como cargo financiero en la cuenta de esa tarjeta; la previsualización MUST anunciarlo, con su monto, antes de guardar.
- **FR-046**: El formulario MUST permitir elegir título, monto total, moneda, número de cuotas, fecha de primera cuota, frecuencia, categoría, tarjeta, cuenta de pago y notas.

**Edición**

- **FR-047**: Editar un plan MUST presentarse como panel lateral (pantalla completa en teléfono).
- **FR-048**: La edición MUST mostrar monto total, número de cuotas y fecha de primera cuota como datos de sólo lectura con sus valores visibles, acompañados de la razón por la que no se pueden cambiar y de la alternativa (eliminar el plan y crearlo de nuevo).
- **FR-049**: La edición MUST permitir cambiar título, categoría, tarjeta, frecuencia, cuenta de pago y notas sin alterar el calendario ni los pagos registrados.
- **FR-050**: Eliminar un plan MUST pedir confirmación.
- **FR-050a**: Eliminar un plan MUST revertir todo su historial: los gastos generados por sus cuotas se eliminan y los saldos de las cuentas afectadas se restituyen, en una sola operación indivisible. El cargo financiero por interés, si existe, se elimina igual.
- **FR-050b**: La confirmación de borrado MUST declarar de antemano cuántos movimientos se eliminarán y qué saldo se restituirá en cada cuenta. Es una operación irreversible sobre dinero ya registrado y no puede presentarse como un borrado cualquiera.

**Categoría**

- **FR-051**: Un plan MUST poder declarar una categoría, elegida del mismo repertorio que usan los movimientos: las categorías que el usuario ya utilizó, admitiendo escribir una nueva.
- **FR-052**: El ícono del plan MUST derivarse de su categoría con el mismo criterio y el mismo resultado con que hoy se le asigna ícono a un movimiento; un plan y un movimiento de igual categoría MUST mostrar el mismo ícono.
- **FR-053**: Un plan sin categoría, o con una que el criterio de íconos no reconoce, MUST mostrar el ícono neutro y seguir siendo plenamente utilizable.

**Formatos**

- **FR-054**: En teléfono, el detalle, la creación y la edición MUST ocupar la pantalla completa y fijar su acción principal al pie, siempre visible.
- **FR-055**: En tablet, la lista MUST presentarse como tarjetas apiladas sin columnas de detalle, y detalle/crear/editar como panel lateral.
- **FR-056**: En ningún ancho la página MUST requerir desplazamiento horizontal.

**General**

- **FR-057**: Toda etiqueta nueva de la interfaz MUST existir en español e inglés.
- **FR-058**: Cuando no hay planes, la vista MUST mostrar un estado vacío con la acción de crear el primero, sin indicadores en cero presentados como datos.

**Precisiones incorporadas tras la revisión de checklists**

Resuelven ambigüedades detectadas en [checklists/ux.md](./checklists/ux.md) y
[checklists/money.md](./checklists/money.md). Ninguna cambia el alcance: cierran huecos de redacción
que habrían llegado a la implementación como decisiones improvisadas.

- **FR-001a**: El orden por defecto de la lista MUST ser por próxima cuota impaga ascendente (lo más urgente arriba); los planes sin cuotas impagas van al final. No hay ordenación configurable por el usuario en esta iteración.
- **FR-002a**: Un plan sin tarjeta MUST mostrar un marcador explícito de ausencia en esa columna, nunca una celda vacía indistinguible de un dato faltante.
- **FR-004a**: «Cuota de este mes» MUST contar las cuotas cuyo vencimiento cae en el **mes calendario en curso**, estén pagadas o no. Es lo que compromete el mes, no lo que aún falta pagar — para eso está «pendiente total». No usa el ciclo de facturación del usuario, que pertenece a otra cuenta y no a este plan.
- **FR-004b**: «Pendiente total» MUST sumar lo **adeudado** por las cuotas impagas (programado + arrastre), no sólo lo programado.
- **FR-005a**: Con más de una moneda, los cuatro indicadores MUST repetirse por moneda como un grupo propio y rotulado, empezando por la moneda preferida del usuario. Nunca se muestra un indicador sin su moneda.
- **FR-008a**: El filtro de estado y el de «próximos 3 meses» MUST **intersecarse**: un plan visible cumple ambos.
- **FR-011a**: El panel lateral MUST atrapar el foco mientras está abierto, cerrarse con Escape, devolver el foco a la fila que lo abrió, y exponer un nombre accesible. Reutiliza el comportamiento del panel ya existente en lugar de definir uno propio.
- **FR-011b**: El panel de detalle MUST NOT ofrecer navegación ‹ › entre planes. Exclusión deliberada: a diferencia de un movimiento, un plan se consulta de a uno y su panel ya contiene una lista larga con la que ese gesto competiría.
- **FR-014a**: Tras pagar o deshacer, el panel de detalle MUST permanecer abierto mostrando el estado actualizado. Cerrarlo obligaría a reabrirlo para comprobar el resultado de la acción.
- **FR-016a**: El monto prellenado del formulario de pago MUST ser lo **adeudado** por la cuota (programado + arrastre), no su monto programado.
- **FR-018a**: Mientras un pago se confirma, la acción MUST quedar deshabilitada y señalar que está en curso; es la primera defensa contra el doble gasto que FR-025 prohíbe.
- **FR-019a**: Marcar la cuota, crear el gasto, mover el saldo y aplicar el arrastre MUST ocurrir de forma indivisible: los cuatro efectos se aplican o no se aplica ninguno. Lo mismo vale para deshacer y para eliminar un plan (FR-050a).
- **FR-021c**: El arrastre MUST aplicarse a la siguiente cuota impaga **por número de cuota**, no por fecha ni a la inmediatamente siguiente: una cuota intermedia puede estar pagada, porque deshacer permite pagar fuera de orden.
- **FR-021d**: El arrastre MUST calcularse con la misma precisión monetaria que el resto del dominio, sin acumular error a lo largo de las cuotas. El ajuste por redondeo de la última cuota forma parte de su **monto programado** y es independiente de cualquier arrastre que reciba; son dos cifras distintas y se muestran distintas.
- **FR-026a**: Un pago MUST rechazarse únicamente cuando la cuenta no admite el cargo por una regla ya existente en el sistema (saldo prepago insuficiente, límite de sobregiro superado, techo de saldo). Un saldo bajo en una cuenta que sí admite quedar negativa NO es motivo de rechazo.
- **FR-053a**: Los títulos y categorías largos MUST truncarse con indicación visual en cada formato, conservando el texto completo accesible; nunca desbordan ni fuerzan desplazamiento horizontal.
- **FR-054a**: En móvil, la acción principal fijada al pie de un plan sin nada que pagar MUST ser editar el plan; nunca una acción de pago inerte.
- **FR-055a**: La tarjeta de tablet y móvil MUST conservar, como mínimo: ícono, título, estado de la próxima cuota, progreso, monto de cuota y restante. Lo que cede respecto del escritorio es el rango de fechas y la tarjeta asociada.
- **FR-058a**: La vista MUST tener estado de carga y estado de error propios, además del vacío; un error de carga no puede presentarse como «no tienes planes».
- **FR-058b**: Crear, editar, pagar, deshacer y eliminar MUST confirmar su resultado con el mismo mecanismo de aviso que ya usa el resto de la aplicación.
- **FR-058c**: La lista de cuotas del panel MUST poder recorrerse cómodamente en un plan de muchas cuotas, con la acción principal siempre visible y sin depender de llegar al final de la lista.

### Key Entities

- **Plan de cuotas**: una compra o crédito que se paga en cuotas fijas. Ya existe. Gana: una **categoría** (compartida con los movimientos, de la que sale su ícono) y una **cuenta de pago recordada** (la que prellena el formulario de cada cuota). Conserva su tarjeta asociada, que determina si sus cuotas generan movimiento.
- **Cuota**: cada pago programado del plan (número, fecha de vencimiento y monto programado). Gana: el **monto realmente pagado**, la **fecha real de pago** —que pueden diferir de lo programado—, el **arrastre recibido** de la cuota anterior y el **vínculo al gasto** que la respalda cuando existe. Lo adeudado por la cuota es monto programado + arrastre recibido.
- **Arrastre**: la diferencia entre lo adeudado por una cuota y lo efectivamente pagado, trasladada a la siguiente cuota impaga. Es una cifra propia de la cuota que la recibe, no un movimiento ni una reescritura del calendario — el mismo criterio con el que la facturación de crédito ya traslada su saldo no cubierto.
- **Gasto de la cuota**: el movimiento real registrado en la cuenta de pago al confirmar una cuota. Es un gasto ordinario de esa cuenta, visible en Movimientos, en la moneda de la cuenta, y se elimina si la cuota se deshace.
- **Categoría**: la misma categoría con la que se clasifican los movimientos. No es una lista propia del dominio de cuotas ni participa de ningún cálculo del plan; sólo clasifica y determina el ícono.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Con 4 planes cargados, quien abre la vista puede decir cuánto paga este mes, cuánto debe en total y si hay algo vencido **sin abrir ningún plan** y sin desplazarse.
- **SC-002**: La lista muestra exactamente tantas filas como planes tiene el usuario, en los tres formatos.
- **SC-003**: El calendario previsualizado antes de guardar coincide **al 100%**, cuota por cuota y hasta la unidad mínima de la moneda, con el calendario guardado — incluido el ajuste por redondeo de la última cuota.
- **SC-004**: Tras pagar una cuota desde el plan, el gasto correspondiente aparece en los movimientos de la cuenta elegida y el saldo de esa cuenta baja exactamente en el monto confirmado; deshacer lo revierte por completo.
- **SC-005**: En un plan con tarjeta de crédito, pagar todas sus cuotas produce **cero** movimientos nuevos y **cero** variación de saldo en cualquier cuenta.
- **SC-006**: Pagar una cuota por un monto distinto al programado no altera el monto programado ni la fecha de ninguna otra cuota; la diferencia aparece íntegra como arrastre en la siguiente cuota impaga, y la suma de lo adeudado por el plan permanece igual.
- **SC-011**: Un plan y un movimiento de la misma categoría muestran el mismo ícono, sin excepción.
- **SC-012**: Tras una cadena de pagos con faltantes y excedentes, la suma de lo pagado más lo que el plan aún adeuda iguala exactamente el total programado del plan. Ninguna cifra se pierde ni se inventa por el camino.
- **SC-013**: Eliminar un plan con N cuotas pagadas deja las cuentas afectadas exactamente con el saldo que tenían antes del primer pago de ese plan, y sin ninguno de sus N movimientos.
- **SC-007**: Cambiar la cuenta de pago de un plan no modifica ningún pago ya registrado ni ningún saldo.
- **SC-008**: El ciclo completo —ver, abrir, pagar, crear, editar— se puede completar en teléfono, tablet y escritorio sin que ninguna acción quede inaccesible y sin desplazamiento horizontal.
- **SC-009**: Abrir y cerrar el detalle de un plan deja la lista en la misma posición y el mismo orden en que estaba.
- **SC-010**: Ninguna etiqueta de la vista aparece sin traducir en ninguno de los dos idiomas.

## Assumptions

- **Los planes existentes siguen funcionando sin categoría ni cuenta de pago**: ambos datos son opcionales; un plan anterior a esta funcionalidad se ve y se paga igual, pidiendo la cuenta al pagar.
- **Las cuotas ya marcadas como pagadas antes de esta funcionalidad no tienen gasto asociado y no se les inventa uno**; conservan su estado y pueden deshacerse sin efectos sobre saldos.
- **"Próxima" significa dentro de los próximos 7 días**; es el umbral elegido para distinguirla de "al día", sin más fundamento que la legibilidad de la lista.
- **La moneda del gasto es la de la cuenta de pago y la app no convierte**: si el plan está en otra moneda, el formulario pide los dos montos por separado y no propone ninguna conversión. No hay fuente de tipo de cambio en la aplicación.
- **La categoría no es una lista propia de este dominio**: es la misma de los movimientos, con las mismas opciones (las que el usuario ya usó) y el mismo criterio de ícono, ya existente y probado. No se crea un catálogo paralelo que envejecería aparte.
- **El faltante de la ÚLTIMA cuota no tiene a dónde arrastrarse**, así que esa cuota queda parcialmente pagada y sigue siendo pagable por el remanente (FR-023). Es la única decisión de esta spec que no se preguntó: es la consecuencia forzosa del arrastre, no una alternativa entre varias.
- **Lo pagado de más reduce la siguiente cuota** en vez de generar un saldo a favor: el plan es deuda, no una cuenta, y un saldo a favor no tendría dónde vivir.
- **La interfaz reutiliza el patrón de panel lateral ya existente** en el detalle de movimiento y el pago de facturación, en vez de inventar uno nuevo.
- **El plan sigue siendo deuda registrada, no un movimiento en sí**: la compra completa no se anota como gasto al crear el plan; sólo sus cuotas, cuando se pagan y cuando corresponde.
- **El patrimonio neto no debe contar dos veces la misma deuda**: por eso el caso de la tarjeta de crédito se excluye del registro de movimiento.
- **Fuera de alcance** (confirmado con el usuario): presupuestos por categoría, conversión de moneda, recordatorios o notificaciones de vencimiento, pago automático de cuotas, e importación de planes desde una cartola.
