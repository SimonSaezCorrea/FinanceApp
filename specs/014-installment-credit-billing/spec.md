# Feature Specification: Facturación de compras en cuotas con tarjeta de crédito

**Feature Branch**: `014-installment-credit-billing`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "Facturación de compras en cuotas con tarjeta de crédito. Hoy, una compra en cuotas hecha con tarjeta de crédito es invisible en el dinero de la app: el plan existe en la vista Cuotas con su calendario, pero la cuenta de la tarjeta no registra nada — ni la compra, ni el consumo de cupo, ni un cobro mensual en la facturación. Se busca que se comporte como en la vida real, donde el cupo y la facturación se mueven distinto."

## Contexto del problema

Cuando una persona compra en cuotas con su tarjeta de crédito, dos cosas ocurren a ritmos distintos:

- **El cupo** (cuánto le queda disponible para gastar) se compromete **completo el día de la compra**. El emisor reserva el monto total de inmediato.
- **La facturación** (cuánto le cobran este mes) toma **una cuota por período**. Nunca le llega una cuenta por el total de la compra.

La aplicación hoy no refleja ninguna de las dos. Una compra en cuotas con tarjeta de crédito queda registrada únicamente como un calendario en la vista Cuotas, desconectada del dinero:

1. La cuenta de la tarjeta no registra la compra, así que **el cupo disponible que muestra la app es mayor que el que el emisor reconoce**. Alguien puede creer que puede gastar un monto que en realidad ya está comprometido.
2. **El desglose de cada facturación reporta siempre cero en cuotas**, aunque el período efectivamente incluya cuotas.
3. **No hay forma de saber cuántas cuotas ya se facturaron.** Y pagar la facturación que las contenía no las marca como pagadas, así que el plan queda eternamente pendiente aunque la deuda ya se haya saldado.

Como efecto colateral, la aplicación ofrece una acción de "pagar esta cuota" que en estos planes no mueve dinero ni corresponde a nada que ocurra en la realidad: en una tarjeta de crédito uno nunca paga una cuota suelta, paga la facturación completa.

## Clarifications

### Session 2026-08-22

- Q: ¿Qué cuotas incorpora un período de facturación al cerrarse? → A: Solo las de planes cuya tarjeta pertenece a esa misma cuenta. Un usuario puede tener varias tarjetas de crédito en cuentas distintas, y cada emisor cobra únicamente lo suyo.
- Q: ¿Se puede editar un plan cuya primera cuota ya fue facturada? → A: No en lo que define el compromiso. Monto total, número de cuotas, fecha de inicio y tarjeta quedan inmutables desde que se facturó la primera cuota; los campos descriptivos (título, categoría, notas) siguen editables.
- Q: ¿Se puede eliminar un plan que tiene cuotas en un período ya liquidado? → A: No. Revertirlo exigiría deshacer un pago real ya efectuado. Se rechaza con una explicación; eliminarlo sigue siendo posible mientras ninguna de sus cuotas haya sido saldada.
- Q: ¿Qué pasa con una cuota en moneda distinta a la de la cuenta de la tarjeta? → A: No se incorpora a la facturación, y el plan lo advierte. La aplicación no convierte monedas, así que facturarla obligaría a inventar un tipo de cambio.
- Q: ¿Qué ve el usuario si la cuenta de la tarjeta no tiene día de facturación configurado? → A: Una advertencia en el plan, que lleva a configurarlo — el mismo recurso que la cuenta ya usa hoy para el mismo vacío.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - El cupo refleja la deuda comprometida (Priority: P1)

Como titular de una tarjeta de crédito, cuando registro una compra en cuotas hecha con esa tarjeta, quiero que mi cupo disponible baje de inmediato por el monto total de la compra, para no creer que tengo un disponible que el emisor ya me reservó.

**Why this priority**: Es el defecto con consecuencia financiera directa. Un disponible sobrestimado induce a gastar dinero que no existe. Además es la base de las demás historias: sin la compra registrada, no hay nada que facturar.

**Independent Test**: Se puede probar sola creando un plan en cuotas asociado a una tarjeta de crédito y verificando el cupo de esa cuenta antes y después. Entrega valor por sí misma aunque no se implemente nada más: el cupo deja de mentir.

**Acceptance Scenarios**:

1. **Given** una cuenta de tarjeta de crédito con cupo 2.000.000 y sin deuda, **When** registro una compra de 1.080.000 en 12 cuotas con esa tarjeta, **Then** el cupo disponible pasa a 920.000 inmediatamente.
2. **Given** el plan del escenario anterior, **When** reviso los movimientos filtrados por esa tarjeta, **Then** veo un movimiento de compra por 1.080.000 con la fecha de inicio del plan.
3. **Given** un plan en cuotas con interés (las cuotas suman más que el precio), **When** lo registro, **Then** el cupo baja por el precio de la compra **más** el cargo por intereses, sin duplicar ninguno de los dos.
4. **Given** un plan en cuotas **sin** tarjeta de crédito (débito, prepago, o un crédito bancario sin plástico), **When** lo registro, **Then** no se genera movimiento de compra ni se mueve ningún cupo: ese plan sigue funcionando como hasta ahora.
5. **Given** un plan con tarjeta de crédito ya registrado, **When** lo elimino, **Then** el movimiento de compra se revierte y el cupo vuelve a su valor anterior, y la confirmación previa declara ese impacto.

---

### User Story 2 - Cada facturación cobra las cuotas que vencieron (Priority: P1)

Como titular de una tarjeta de crédito, quiero que cada facturación incluya únicamente las cuotas cuyo vencimiento cae en ese período, para que la cuenta que me presenta la aplicación coincida con la que me cobra el emisor.

**Why this priority**: Sin esto, la única alternativa es facturar el total de la compra en un solo período — una cuenta que no existe en la realidad y que haría inútil toda la vista de Facturación para quien compra en cuotas.

**Independent Test**: Se puede probar cerrando períodos sucesivos sobre una cuenta con un plan en cuotas vigente y verificando el monto de cada facturación y su desglose.

**Acceptance Scenarios**:

1. **Given** una compra de 1.080.000 en 12 cuotas de 90.000 y una tarjeta con día de facturación configurado, **When** se cierra el primer período posterior a la compra, **Then** esa facturación cobra 90.000 por concepto de cuotas, no 1.080.000.
2. **Given** la facturación del escenario anterior, **When** reviso su desglose, **Then** distingue el monto de compras del monto de cuotas e indica cuántas cuotas incluye.
3. **Given** un período que ya incorporó la cuota 1, **When** se cierra el período siguiente, **Then** incorpora la cuota 2 y **no** vuelve a facturar la cuota 1.
4. **Given** un mes sin ningún consumo en la tarjeta —en el que la aplicación no genera facturación—, **When** se cierra el período siguiente, **Then** la cuota que venció en ese lapso se factura exactamente una vez, sin perderse ni duplicarse.
5. **Given** un plan cuya última cuota ya fue facturada, **When** se cierran períodos posteriores, **Then** ese plan no aporta nada más a ninguna facturación.
6. **Given** una facturación que incluye cuotas, **When** se ejecuta la reconciliación de esa facturación contra los movimientos reales, **Then** el monto resultante sigue incluyendo las cuotas del período y no las descarta.

---

### User Story 3 - Pagar la facturación salda las cuotas que contenía (Priority: P1)

Como titular de una tarjeta de crédito, cuando pago una facturación, quiero que las cuotas incluidas en ella queden marcadas como pagadas, para no tener que ir plan por plan repitiendo a mano algo que ya hice.

**Why this priority**: Cierra el ciclo. Sin esto el plan queda eternamente pendiente aunque la deuda esté saldada, que es exactamente el defecto que se reporta hoy.

**Independent Test**: Se puede probar pagando una facturación que incluye cuotas y verificando el estado del plan en la vista Cuotas.

**Acceptance Scenarios**:

1. **Given** una facturación de 130.000 que incluye la cuota 1 de un plan (90.000) y una compra suelta (40.000), **When** la pago completa, **Then** la cuota 1 queda pagada en el plan.
2. **Given** la misma facturación, **When** la pago **en parte** (por ejemplo 100.000), **Then** la cuota 1 **también** queda pagada, y lo no cubierto queda como saldo arrastrado al período siguiente — no como cuota impaga.
3. **Given** una cuota saldada por una facturación que se pagó en parte, **When** miro el plan, **Then** la vista lo indica explícitamente en vez de mostrar solo "pagada", y permite llegar a la facturación que la saldó.
4. **Given** una facturación pagada que incluía cuotas, **When** reviso el cupo de la cuenta, **Then** bajó exactamente por lo que pagué, sin descontar dos veces la parte correspondiente a las cuotas.

---

### User Story 4 - Ver en qué va cada plan (Priority: P2)

Como usuario con varios planes en cuotas, quiero ver de un vistazo cuántas cuotas de cada plan ya se facturaron, cuántas pagué y cuántas faltan por facturar, para saber cuánto tengo comprometido hacia adelante.

**Why this priority**: Es el valor visible de las tres historias anteriores. Sin ella el modelo es correcto pero el usuario no lo percibe. Va después porque depende de que los estados existan.

**Independent Test**: Se puede probar sobre un plan con cuotas en los tres estados y verificando que la lista y el detalle los distinguen.

**Acceptance Scenarios**:

1. **Given** un plan de 12 cuotas con 5 pagadas, 1 facturada y pendiente de pago, y 6 aún no facturadas, **When** miro la lista de planes, **Then** distingo las tres cantidades.
2. **Given** un plan comprado con tarjeta de crédito, **When** abro su detalle, **Then** no se me ofrece pagar una cuota suelta, y se explica que estas cuotas se pagan al pagar la facturación de la tarjeta.
3. **Given** un plan **no** comprado con tarjeta de crédito, **When** abro su detalle, **Then** la acción de pagar la cuota sigue disponible tal como hoy.
4. **Given** una cuota ya facturada pero cuya facturación aún no se paga, **When** la miro en el detalle del plan, **Then** se distingue de una cuota simplemente vencida y de una pagada.

---

### Edge Cases

- **Compra anterior al primer período**: un plan registrado con fecha de inicio anterior a cualquier facturación existente. Sus cuotas ya vencidas deben incorporarse al primer período que se cierre, todas, una sola vez.
- **Tarjeta sin día de facturación configurado**: la cuenta nunca cierra períodos. Las cuotas quedan como no facturadas indefinidamente, el plan lo advierte (FR-023a) y no las marca vencidas por error.
- **Cuenta o tarjeta desactivada**: si la cuenta deja de ser elegible para facturar, las cuotas siguen acumulándose sin facturarse, y se incorporan todas al primer período que se cierre cuando vuelva a ser elegible — el mismo mecanismo que cubre los lapsos sin consumo (FR-009).
- **Eliminar un plan con cuotas ya saldadas**: se rechaza (FR-006a). Mientras ninguna cuota haya sido saldada, la eliminación procede revirtiendo compra y cupo (FR-006).
- **Editar un plan con cuotas ya facturadas**: lo que define el compromiso queda fijo (FR-006b); lo descriptivo sigue editable.
- **Eliminar el movimiento de compra** desde la vista de Movimientos: impedido (FR-024), para que un plan no quede sin su respaldo de cupo.
- **Cuota en una moneda distinta a la de la cuenta de la tarjeta**: no se incorpora y el plan lo advierte (FR-009a).
- **Facturación pagada y luego corregida**: corregir el pago no altera el estado de las cuotas que el período incorporó (FR-017).
- **Varias tarjetas de crédito en cuentas distintas**: cada período cobra únicamente las cuotas de los planes de su propia tarjeta (FR-008).
- **Dos planes de la misma tarjeta venciendo en el mismo período**: ambos se incorporan y el desglose reporta la cantidad total de cuotas incluidas.
- **Tarjeta eliminada después de crear el plan**: el plan sobrevive a la eliminación de su tarjeta (la deuda no desaparece con el plástico), pero deja de tener cuenta a la que facturar. Sus cuotas no incorporadas quedan sin facturar, y el plan lo advierte igual que en los otros dos casos de FR-023a; las ya incorporadas conservan su vínculo y su estado.
- **Reintento tras un fallo parcial de generación**: repetir la operación termina en el mismo estado que una ejecución única (FR-013a).

## Requirements _(mandatory)_

### Functional Requirements

**Registro de la compra y consumo de cupo**

- **FR-001**: Al registrar un plan en cuotas asociado a una tarjeta de crédito, el sistema MUST generar un movimiento de gasto por el monto total de la compra, en la cuenta a la que pertenece esa tarjeta, con la fecha de inicio del plan y atribuido a esa tarjeta.
- **FR-002**: Ese movimiento MUST consumir el cupo de la cuenta por su monto completo en el momento en que se registra.
- **FR-002a**: Ese movimiento MUST NOT alterar el saldo en efectivo de ninguna cuenta. Un cargo a una línea de crédito no saca plata: la plata sale una sola vez, después, al pagar la facturación.
- **FR-003**: El movimiento de compra MUST quedar identificado como perteneciente a ese plan, de forma que el sistema pueda distinguirlo de una compra ordinaria.
- **FR-004**: El sistema MUST seguir registrando el cargo por intereses ya existente (la diferencia entre lo que suman las cuotas y el precio de la compra) sin duplicar ni el precio ni el interés.
- **FR-005**: Un plan en cuotas **no** asociado a una tarjeta de crédito MUST conservar su comportamiento actual: no genera movimiento de compra, no consume cupo, y cada cuota se paga contra una cuenta generando su propio gasto.
- **FR-006**: Eliminar un plan asociado a una tarjeta de crédito MUST revertir su movimiento de compra y el cupo consumido, y la confirmación previa MUST declarar ese impacto usando la misma lógica que lo ejecuta.
- **FR-006a**: Eliminar un plan MUST estar impedido cuando alguna de sus cuotas pertenece a una facturación ya liquidada, con una explicación de por qué: revertirlo exigiría deshacer un pago real ya efectuado. Mientras ninguna de sus cuotas haya sido saldada, eliminarlo sigue permitido.
- **FR-006b**: Una vez que la primera cuota de un plan fue incorporada a una facturación, el monto total, el número de cuotas, la fecha de inicio y la tarjeta del plan MUST volverse inmutables; los campos descriptivos (título, categoría, notas) MUST seguir editables. La interfaz MUST declarar cuáles quedaron fijos y por qué.

**Composición de la facturación**

- **FR-007**: El movimiento de compra de un plan MUST NOT aportar su monto al total de ninguna facturación. Lo que aporta al período es lo que el calendario del plan tenga vencido en esa ventana.
- **FR-008**: Al cerrar un período de facturación, el sistema MUST incorporar a ese período las cuotas que hayan vencido hasta el cierre, que no hayan sido incorporadas a ningún período anterior, y que pertenezcan a planes cuya tarjeta es de **esa misma cuenta**. Las cuotas de planes de otra tarjeta MUST quedar fuera.
- **FR-009**: Una cuota MUST incorporarse a exactamente un período de facturación, incluso cuando existan lapsos sin facturación generada.
- **FR-009a**: Una cuota cuya moneda difiere de la moneda de la cuenta de la tarjeta MUST NOT incorporarse a ninguna facturación, y el plan MUST advertirlo. La aplicación no convierte monedas.
- **FR-010**: El total de una facturación MUST ser la suma de sus movimientos, más el saldo arrastrado del período anterior, más las cuotas incorporadas a ese período.
- **FR-011**: El desglose de una facturación MUST reportar por separado el monto de compras y el monto de cuotas, junto con la cantidad de cuotas incluidas, con cifras reales.
- **FR-012**: La reconciliación de una facturación contra los movimientos reales MUST preservar las cuotas ya incorporadas a ese período.
- **FR-013**: Una vez incorporada la última cuota de un plan, ese plan MUST dejar de aportar a facturaciones posteriores sin requerir ninguna acción del usuario. Esto MUST ser consecuencia de la regla de selección (ya no vence nada sin incorporar), no de un contador aparte que pueda desviarse de ella.
- **FR-013a**: La incorporación de cuotas MUST ser idempotente: repetir la generación sobre un período ya cerrado no cobra ninguna cuota de nuevo. Un reintento tras un fallo parcial MUST terminar en el mismo estado que una ejecución única.
- **FR-013b**: El límite temporal de "vencida hasta el cierre" MUST estar definido de forma inequívoca, incluyendo qué ocurre con una cuota cuyo vencimiento coincide exactamente con el instante de cierre.

**Pago de la facturación**

- **FR-014**: Al liquidar una facturación —sea con un pago total o parcial— el sistema MUST marcar como pagadas todas las cuotas incorporadas a ese período.
- **FR-014a**: "Liquidada" MUST evaluarse por el hecho de haberse pagado, nunca por el nombre de un estado concreto: una facturación pagada en parte también está liquidada. El proyecto ya registró esta confusión como trampa; la regla se declara aquí para que no reaparezca.
- **FR-015**: El monto no cubierto por un pago parcial MUST arrastrarse al período siguiente como saldo, y MUST NOT quedar además como cuota impaga.
- **FR-016**: El cupo de la cuenta MUST descontarse exactamente por lo pagado, sin descontar dos veces la porción correspondiente a cuotas.
- **FR-017**: Corregir el pago de una facturación ya liquidada MUST NOT alterar el estado de las cuotas que incorporó.

**Visibilidad**

- **FR-018**: Cada cuota MUST distinguir tres situaciones: aún no facturada, facturada y a la espera del pago de su facturación, y pagada.
- **FR-019**: La lista de planes MUST mostrar, para cada plan, cuántas cuotas están en cada una de esas tres situaciones.
- **FR-020**: Una cuota saldada por una facturación que se pagó en parte MUST indicarlo explícitamente en vez de presentarse como una cuota pagada sin más, y MUST permitir llegar a la facturación que la saldó.
- **FR-021**: El detalle de un plan asociado a una tarjeta de crédito MUST NOT ofrecer la acción de pagar una cuota individual, y MUST explicar que esas cuotas se saldan al pagar la facturación de la tarjeta.
- **FR-022**: El detalle de un plan **no** asociado a una tarjeta de crédito MUST conservar la acción de pagar la cuota individualmente.
- **FR-022a**: Pagar una cuota individual de un plan con tarjeta de crédito MUST ser rechazado también fuera de la interfaz. Ocultar el botón evita el error accidental; rechazar la operación es lo que impide la doble contabilización que esta funcionalidad existe para eliminar.
- **FR-023**: Los movimientos filtrados por una tarjeta de crédito MUST incluir el movimiento de compra de los planes asociados a esa tarjeta.
- **FR-023a**: Cuando algo impide que las cuotas de un plan lleguen a facturarse —la cuenta de su tarjeta no tiene día de facturación, la moneda no coincide (FR-009a), o la tarjeta fue eliminada— el plan MUST advertirlo y, cuando exista un remedio, ofrecer llegar a él. Cuotas que nunca se facturarán sin explicación visible NO son aceptables.

**Integridad**

- **FR-024**: Eliminar el movimiento de compra de un plan directamente desde la vista de Movimientos MUST estar impedido, con una explicación de que ese movimiento pertenece a un plan en cuotas — igual que ya ocurre con el movimiento que respalda una cuota.
- **FR-025**: El sistema MUST documentar que el saldo no cubierto se arrastra en un nivel distinto según el tipo de plan: entre facturaciones para los planes con tarjeta de crédito, y entre cuotas para los demás.

### Key Entities

- **Plan en cuotas**: una compra que se paga en cuotas fijas. Puede estar asociado a una tarjeta o no. Cuando la tarjeta es de crédito, su comportamiento frente al dinero cambia por completo: la deuda vive en la cuenta de la tarjeta, no en cuentas de pago.
- **Cuota**: una fila del calendario del plan, con su número de orden, vencimiento y monto. Gana una situación nueva —"facturada"— entre "programada" y "pagada", y un vínculo con la facturación que la facturó.
- **Facturación (período)**: el corte de cuenta de una tarjeta de crédito. Su total deja de ser únicamente la suma de sus movimientos: incorpora también el saldo arrastrado y las cuotas vencidas en su ventana.
- **Movimiento**: un gasto o ingreso. Gana un rol nuevo: el movimiento que representa la compra de un plan, que consume cupo pero no se factura en el período en que ocurrió.
- **Cupo de la cuenta**: la deuda viva de una tarjeta de crédito. Sube con la compra completa y baja con lo que se paga de cada facturación.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Registrar una compra en cuotas con tarjeta de crédito reduce el cupo disponible por el 100% del monto comprometido, en el momento del registro.
- **SC-002**: El monto que la aplicación presenta para un período de facturación coincide con el que cobraría el emisor: una cuota por período, no el total de la compra.
- **SC-003**: A lo largo de la vida completa de un plan de N cuotas, la suma de lo facturado es exactamente el compromiso del plan: ninguna cuota se factura dos veces ni deja de facturarse, incluso con períodos sin consumo de por medio.
- **SC-004**: Pagar una facturación deja en cero las acciones manuales que el usuario debe hacer sobre los planes que esa facturación incluía.
- **SC-005**: El desglose de facturación deja de reportar cero en cuotas cuando el período efectivamente incluye cuotas.
- **SC-006**: Un usuario puede determinar, sin abrir el detalle, cuántas cuotas de un plan ya se facturaron y cuántas faltan.
- **SC-007**: No existe ninguna acción ofrecida en la interfaz que, al ejecutarse sobre un plan con tarjeta de crédito, no produzca ningún efecto sobre el dinero.

## Assumptions

- **Alcance por tipo de plan**: el cambio afecta únicamente a los planes asociados a una tarjeta de crédito. Los planes con tarjeta de débito, prepago, o sin tarjeta, conservan su comportamiento actual sin modificación.
- **Sin cálculo de tasas**: la aplicación no calcula intereses ni comisiones. Cualquier cargo del emisor se lee del estado de cuenta y se anota, como ya ocurre hoy.
- **Sin conversión de moneda**: la aplicación no convierte entre monedas. Un plan en una moneda distinta a la de la cuenta de la tarjeta mantiene ambas cifras separadas, como ya hace el resto del sistema.
- **Datos existentes**: no se migra la información ya cargada. Es información de desarrollo y se regenera. Los planes creados antes de este cambio no tendrán movimiento de compra ni cuotas facturadas.
- **La reserva de cupo es total desde el día uno**: se asume el comportamiento del emisor chileno, que compromete el monto completo al momento de la compra y libera disponible a medida que se paga. No se modela un emisor que libere cupo cuota a cuota.
- **El calendario nunca se reescribe**: los montos y fechas acordados al crear el plan no se alteran para absorber diferencias, en línea con la regla ya establecida en el proyecto.
- **Una cuota pertenece a un solo período**: no se contempla dividir una cuota entre dos facturaciones.
- **El día de facturación es requisito para facturar**: una cuenta sin día de facturación configurado no cierra períodos, por lo que sus cuotas quedan sin facturar hasta que se configure (advertido por FR-023a).
- **Una cuota facturada es un hecho, no una proyección**: por eso lo que define el compromiso deja de editarse desde la primera cuota facturada (FR-006b) y el plan deja de poder eliminarse desde la primera cuota saldada (FR-006a). Ambas restricciones existen para que no haya forma de dejar una facturación emitida describiendo algo que ya no existe.
