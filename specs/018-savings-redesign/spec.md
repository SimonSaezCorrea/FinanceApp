# Feature Specification: Rediseño de Ahorros con progreso real y dinero real

**Feature Branch**: `018-savings-redesign`

**Created**: 2026-09-06

**Status**: Draft

**Input**: User description: "Rediseñar la vista Ahorros de la app para que las metas de ahorro reflejen su progreso real, su ritmo de aporte, y una proyección de cuándo se cumplirán según ese ritmo — en vez de solo listar metas con su monto objetivo. Incluye: aportes que mueven dinero real desde una cuenta de origen, cierre de meta con destino del monto acumulado (retirar a cuenta / ahorro libre / traspasar a otra meta) solo cuando la meta está cumplida o vencida, reapertura reversible, identidad visual por meta, y un panel de detalle con historial de aportes. Fuente de comportamiento: design_handoff_financeapp/design_handoff_ahorros/README.md."

## Clarifications

### Session 2026-09-06

- Q: ¿Se puede cambiar la moneda de una meta que ya tiene aportes registrados? → A: No — bloquear el cambio de moneda una vez que la meta tiene al menos un aporte registrado.
- Q: Al cerrar una meta con destino "traspasar a otra meta", ¿la meta de destino puede ser de otra moneda? → A: No — solo se ofrecen como destino metas abiertas de la misma moneda que la meta que se cierra.
- Q: ¿Se puede editar o eliminar un aporte que pertenece a una meta ya cerrada? → A: No — queda bloqueado mientras la meta esté cerrada; hay que reabrirla primero.
- Q: ¿Cuál es la ventana exacta para calcular el "ritmo actual" (pace) de una meta? → A: Promedio de los aportes de los últimos 3 meses calendario completos; si la meta es más nueva que eso, se divide por los meses transcurridos desde su creación (mínimo 1).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Crear y mantener una meta de ahorro (Priority: P1)

Como usuario, quiero crear una meta de ahorro con un título, un monto objetivo, una moneda y, opcionalmente, una fecha límite, y poder editarla después, para que la app sepa qué estoy juntando y pueda medir mi progreso contra eso.

**Why this priority**: Es la base de todo lo demás — sin una meta definida no hay progreso que mostrar, aporte que registrar ni cierre que hacer.

**Independent Test**: Se puede probar creando una meta sin fecha límite, verificando que aparece en "En curso" con 0% de progreso y sin datos de vencimiento, y luego editando su monto objetivo o agregándole una fecha límite y confirmando que el cambio se refleja de inmediato.

**Acceptance Scenarios**:

1. **Given** que no tengo metas, **When** creo una meta con título, monto objetivo y moneda, sin activar fecha límite, **Then** la meta aparece en el grupo "En curso" con 0% de progreso, sin datos de vencimiento, y con una identidad visual (ícono y color) propia y consistente.
2. **Given** una meta existente, **When** activo el interruptor de fecha límite y elijo una fecha, **Then** la meta pasa a evaluarse contra ese plazo (puede volverse "vencida" o "no llega a tiempo" según el ritmo).
3. **Given** una meta con fecha límite, **When** desactivo el interruptor, **Then** la meta deja de tener plazo y solo se evalúa por su ritmo de aportes.
4. **Given** una meta con aportes ya registrados, **When** edito su monto objetivo o su plazo, **Then** el progreso, el estado y la proyección se recalculan contra los nuevos valores sin perder ningún aporte histórico.

---

### User Story 2 - Ver el progreso, ritmo y proyección de cada meta (Priority: P2)

Como usuario, quiero ver de un vistazo cuánto llevo ahorrado en cada meta, qué porcentaje representa, si voy a llegar a tiempo según mi ritmo actual de aportes, y un total consolidado de todo lo ahorrado (incluido lo que no tiene meta asignada), para saber si necesito ajustar mis aportes.

**Why this priority**: Es el valor central del rediseño — pasar de una lista plana a una vista que dice si voy bien o mal.

**Independent Test**: Se puede probar con datos de ejemplo (metas con distintos ritmos y plazos) y verificando que cada una muestra el estado correcto (cumplida / vencida / no llega a tiempo / en ritmo / sin aportes) según sus propios números, y que el total consolidado suma correctamente metas abiertas y ahorro libre.

**Acceptance Scenarios**:

1. **Given** una meta cuyo ahorrado ya alcanza o supera su objetivo, **When** la veo en la lista o su detalle, **Then** su estado es "cumplida" y ya no cuenta como pendiente en el total de "falta por reunir".
2. **Given** una meta con fecha límite ya pasada y aún no cumplida, **When** la veo, **Then** su estado es "vencida" e indica cuánto falta.
3. **Given** una meta con fecha límite futura cuyo ritmo actual de aportes no alcanza para llegar a tiempo, **When** la veo, **Then** su estado indica "no llega a tiempo", muestra en qué mes llegaría al ritmo actual, y cuánto debería aportar por mes para llegar a tiempo.
4. **Given** una meta con fecha límite futura cuyo ritmo sí alcanza (o sin fecha límite pero con aportes), **When** la veo, **Then** su estado es "en ritmo" y muestra el mes proyectado de llegada.
5. **Given** una meta sin ningún aporte registrado todavía, **When** la veo, **Then** su estado indica que no tiene aportes y no se le calcula proyección.
6. **Given** varias metas en distintos estados, **When** veo la vista principal, **Then** están agrupadas en "En curso", "Fuera de plazo" y "Cumplidas" (los grupos sin metas no aparecen), y el resumen superior muestra el total ahorrado, el ritmo mensual combinado y lo que falta por reunir, sin incluir las metas cerradas.
7. **Given** aportes registrados sin meta asignada, **When** veo el resumen y la barra de progreso total, **Then** ese monto aparece identificado como ahorro libre, sumado al total pero sin objetivo ni ritmo propio.

---

### User Story 3 - Registrar un aporte real (Priority: P3)

Como usuario, quiero registrar un aporte a una meta específica o como ahorro libre, indicando desde qué cuenta sale la plata, para que el dinero realmente se descuente de esa cuenta y no quede como un simple número desconectado de mis cuentas reales.

**Why this priority**: Es lo que hace que el ahorro sea confiable — sin esto, "lo ahorrado" es una ficción que no cuadra con los saldos reales de la app.

**Independent Test**: Se puede probar registrando un aporte desde una cuenta con saldo suficiente y verificando que (a) el saldo de esa cuenta baja exactamente en el monto aportado, (b) el aporte queda visible en el historial de la meta (o del ahorro libre), y (c) el progreso de la meta sube en consecuencia.

**Acceptance Scenarios**:

1. **Given** una meta abierta y una cuenta con saldo suficiente en la misma moneda, **When** registro un aporte eligiendo esa meta y esa cuenta como origen, **Then** el saldo de la cuenta baja en el monto aportado, el ahorrado de la meta sube en el mismo monto, y el aporte queda en su historial con fecha y nota.
2. **Given** que no elijo ninguna meta al registrar el aporte, **When** confirmo, **Then** el monto queda como ahorro libre (sin meta) y también se descuenta de la cuenta de origen elegida.
3. **Given** una cuenta con saldo insuficiente o de una moneda distinta a la de la meta, **When** intento registrar un aporte desde ella, **Then** la operación se rechaza con una explicación clara y ningún saldo ni progreso cambia.
4. **Given** un aporte ya registrado, **When** lo edito (monto, cuenta o fecha) o lo elimino, **Then** el saldo de la cuenta afectada y el progreso de la meta quedan correctos, como si el aporte original nunca hubiese tenido ese valor.
5. **Given** un reintento de red o un doble clic al registrar el mismo aporte, **When** la petición se repite con la misma identidad de operación, **Then** el aporte se registra una sola vez (nunca duplica el descuento de saldo).

---

### User Story 4 - Cerrar una meta cumplida o vencida, y poder reabrirla (Priority: P4)

Como usuario, quiero cerrar una meta una vez que la cumplí o que ya venció, eligiendo qué hacer con el monto acumulado (retirarlo a una cuenta, pasarlo a ahorro libre, o traspasarlo a otra meta activa), para sacarla de mis metas activas sin perder su historial, y poder reabrirla si me equivoqué.

**Why this priority**: Cierra el ciclo de vida de una meta; depende de que ya existan metas con estado y aportes reales (historias 1-3), por eso es la última.

**Independent Test**: Se puede probar cerrando una meta cumplida con destino "retirar a cuenta" y verificando que (a) el monto aparece como ingreso real en la cuenta elegida, (b) la meta pasa al bloque de cerradas y deja de contar en el total/ritmo/falta-por-reunir, (c) su historial de aportes sigue visible, y (d) reabrirla revierte el ingreso a la cuenta y la devuelve a su grupo original.

**Acceptance Scenarios**:

1. **Given** una meta en curso (ni cumplida ni vencida), **When** intento cerrarla, **Then** la acción no está disponible.
2. **Given** una meta cumplida o vencida, **When** elijo cerrarla con destino "retirar a una cuenta" y confirmo, **Then** el monto acumulado ingresa realmente a la cuenta elegida (su saldo sube), la meta pasa al bloque de metas cerradas con la fecha y el destino, y deja de contar en el total ahorrado, el ritmo y "falta por reunir".
3. **Given** una meta cumplida o vencida, **When** la cierro con destino "pasar a ahorro libre", **Then** sus aportes pasan a contarse como ahorro libre y la meta se archiva sin mover saldo de ninguna cuenta.
4. **Given** una meta cumplida o vencida, **When** la cierro con destino "traspasar a otra meta" y elijo una meta activa de destino, **Then** sus aportes se reasignan a la meta elegida (que ve subir su progreso) y la meta original se archiva sin mover saldo de ninguna cuenta.
5. **Given** una meta cerrada con destino "retirar a una cuenta", **When** la reabro, **Then** el ingreso hecho a esa cuenta se revierte (su saldo vuelve a bajar en el mismo monto), la meta vuelve a su grupo según su estado actual, y sus aportes siguen intactos en su historial.
6. **Given** una meta cerrada, **When** la veo en el bloque de cerradas, **Then** su historial de aportes anteriores sigue disponible y su monto sigue contando en el historial general, aunque no en los totales activos.

---

### Edge Cases

- Una meta sin fecha límite nunca es "vencida" ni "no llega a tiempo": solo alterna entre "sin aportes" y "en ritmo".
- Una meta recién creada, sin ningún aporte, se considera "sin aportes" incluso si ya tiene fecha límite futura.
- Si el monto aportado deja el ahorrado exactamente igual al objetivo, la meta pasa a "cumplida" de inmediato (no hace falta superarlo).
- Cerrar con destino "traspasar a otra meta" solo permite elegir metas abiertas (no cerradas), distintas a la que se está cerrando y de su misma moneda; si no hay ninguna meta abierta disponible que cumpla eso, esa opción de destino no se ofrece.
- Reabrir una meta que se cerró con destino "traspasar a otra meta" o "pasar a ahorro libre" no revierte automáticamente la reasignación de esos aportes — deshacer ese movimiento de datos manualmente queda fuera de alcance de "reabrir" (ver Assumptions).
- Un aporte no puede quedar en una cuenta de tipo tarjeta de crédito (esa cuenta no representa plata disponible para ahorrar) ni en una moneda distinta a la de la meta o del ahorro libre.
- Si la cuenta de origen de un aporte, o la cuenta usada para "retirar a cuenta", se elimina después, el aporte/cierre ya registrado no se borra ni deja de contar en el historial — solo pierde la referencia a esa cuenta específica.
- Borrar una meta (no cerrarla) que ya tiene aportes reales asociados debe seguir dejando esos aportes en un estado consistente, igual que hoy.
- Un aporte sin meta (ahorro libre) siempre es editable/eliminable, ya que el ahorro libre nunca se "cierra".

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE permitir crear una meta de ahorro con título, monto objetivo, moneda, y opcionalmente una fecha límite; sin fecha límite, la meta nunca se evalúa como vencida ni "no llega a tiempo".
- **FR-002**: El sistema DEBE permitir editar el título, monto objetivo, nota y fecha límite (incluida su activación/desactivación) de una meta existente en cualquier momento, sin afectar sus aportes históricos. La moneda de una meta solo puede editarse mientras no tenga ningún aporte registrado; con al menos un aporte, la moneda queda fija.
- **FR-003**: El sistema DEBE asignar a cada meta una identidad visual (ícono y color) de forma automática y consistente en el tiempo, sin requerir que el usuario la elija.
- **FR-004**: El sistema DEBE calcular, para cada meta abierta, su porcentaje de avance, su ritmo actual de aportes (promedio de sus aportes reales de los últimos 3 meses calendario completos, o desde su creación si es más nueva — nunca un valor declarado por el usuario), y —cuando tiene fecha límite o ritmo mayor a cero— una proyección de en qué mes llegaría a su objetivo a ese ritmo.
- **FR-005**: El sistema DEBE clasificar el estado de cada meta abierta en uno de: cumplida, vencida, no llega a tiempo, en ritmo, o sin aportes, según las reglas de negocio provistas (ver README del diseño), y mostrar el texto, ícono y color correspondientes a ese estado.
- **FR-006**: El sistema DEBE agrupar las metas en "En curso" (incompletas y no vencidas), "Fuera de plazo" (incompletas y vencidas) y "Cumplidas"; un grupo sin metas no debe mostrarse.
- **FR-007**: El sistema DEBE mostrar un resumen con el total ahorrado (metas abiertas + cumplidas + ahorro libre, excluyendo metas cerradas), el ritmo mensual combinado de las metas abiertas, y el monto que falta por reunir en las metas abiertas.
- **FR-008**: El sistema DEBE permitir registrar un aporte de dinero real indicando monto, fecha, nota opcional, cuenta de origen, y opcionalmente una meta destino (o ninguna, quedando como "ahorro libre").
- **FR-009**: Al registrar un aporte, el sistema DEBE descontar el monto del saldo real de la cuenta de origen elegida, exactamente como cualquier otro movimiento de dinero de la app, y DEBE rechazar el aporte si la cuenta no tiene saldo suficiente, es de una moneda distinta a la de la meta/ahorro libre, o es una cuenta de tipo tarjeta de crédito.
- **FR-010**: El sistema DEBE permitir editar o eliminar un aporte ya registrado, ajustando el saldo de la cuenta afectada y el progreso de la meta para que reflejen el nuevo estado sin dejar residuos del valor anterior. Un aporte que pertenece a una meta cerrada NO puede editarse ni eliminarse mientras la meta siga cerrada; primero hay que reabrirla.
- **FR-011**: El sistema DEBE proteger el registro, edición y eliminación de aportes (y el cierre/reapertura de metas que mueve dinero) contra duplicados por reintento o doble envío, de modo que repetir la misma operación no descuente ni deposite dinero dos veces.
- **FR-012**: El sistema DEBE permitir cerrar una meta únicamente cuando su estado es "cumplida" o "vencida"; una meta "en curso" o "sin aportes" no puede cerrarse.
- **FR-013**: Al cerrar una meta, el sistema DEBE requerir que el usuario elija un destino para el monto acumulado: retirarlo a una cuenta de la misma moneda que la meta y que no sea de tipo tarjeta de crédito (dinero real, aumenta el saldo de esa cuenta), pasarlo a ahorro libre (sin mover saldo), o traspasarlo a otra meta abierta de la misma moneda (sin mover saldo, reasigna los aportes a la meta elegida); y una fecha de cierre.
- **FR-014**: Una meta cerrada NO DEBE contarse en el total ahorrado, el ritmo mensual combinado ni "falta por reunir", pero DEBE conservar su historial completo de aportes, visible en un bloque de metas cerradas colapsable.
- **FR-015**: El sistema DEBE permitir reabrir una meta cerrada, devolviéndola a su grupo según su estado actual; si el cierre fue con destino "retirar a una cuenta", reabrir DEBE revertir ese ingreso (bajar el saldo de esa cuenta en el mismo monto que había subido).
- **FR-016**: El sistema DEBE mostrar, por meta, un detalle con su progreso, plazo, ritmo actual, proyección, moneda, e historial completo de aportes (incluyendo los hechos antes de cualquier reasignación por cierre).

### Key Entities

- **Meta de ahorro (Goal)**: título, monto objetivo, moneda, fecha límite opcional, identidad visual (ícono y color). Tiene un estado derivado (abierta/cumplida/vencida en curso, o cerrada con una fecha y un destino del monto). Se relaciona con sus aportes.
- **Aporte (Entry)**: monto, moneda, fecha, nota opcional, la meta a la que pertenece (o ninguna = ahorro libre), y la cuenta bancaria real desde la que salió el dinero. Se relaciona con el movimiento de dinero real que generó.
- **Cierre de meta**: destino elegido (retirar a cuenta / ahorro libre / traspaso a otra meta), fecha de cierre, y —solo cuando el destino es "retirar a cuenta"— la cuenta y el movimiento de dinero real asociado, necesarios para poder revertirlo si la meta se reabre.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un usuario puede saber, para cualquier meta con solo mirarla, si va a llegar a tiempo, sin tener que hacer cálculos manuales.
- **SC-002**: El total ahorrado que muestra la vista de Ahorros siempre coincide con la suma real de los saldos que salieron de las cuentas del usuario hacia metas o ahorro libre, menos lo retirado — nunca es una cifra desconectada de los movimientos reales.
- **SC-003**: Cerrar y luego reabrir una meta con destino "retirar a cuenta" deja el saldo de esa cuenta exactamente igual a como estaba antes de cerrarla.
- **SC-004**: Repetir el envío de un mismo registro de aporte (por reintento de red o doble clic) nunca produce un descuento de saldo duplicado.
- **SC-005**: Una meta cerrada nunca vuelve a aparecer en el total, el ritmo o "falta por reunir" mientras siga cerrada, y su historial de aportes anteriores sigue siendo consultable en el 100% de los casos.

## Assumptions

- El "ritmo actual" de una meta se calcula a partir de sus aportes reales recientes (no es un valor que el usuario declare al crear la meta): promedio de los aportes de los últimos 3 meses calendario completos; si la meta tiene menos tiempo que eso, se divide por los meses transcurridos desde su creación (mínimo 1). Una meta sin ningún aporte tiene ritmo 0 ("sin aportes").
- La identidad visual (ícono/color) de una meta se asigna de forma determinística por el sistema (p. ej. rotando un set fijo de íconos y colores de los tokens de diseño) y no es editable por el usuario en esta primera versión.
- Un aporte y su cuenta de origen deben compartir moneda con la meta (o con el ahorro libre, que no tiene moneda propia más allá de la del aporte); no hay conversión de moneda en esta feature, igual que en el resto de la app.
- La cuenta de origen de un aporte, y la cuenta de destino al "retirar a cuenta", deben ser cuentas reales del usuario que no sean de tipo tarjeta de crédito (retirar/aportar plata "con deuda" no tiene sentido de negocio aquí), igual que en flujos equivalentes de deudas y cuotas.
- Reabrir una meta cerrada con destino "ahorro libre" o "traspaso a otra meta" revierte el estado de cierre de la meta, pero no deshace automáticamente la reasignación de los aportes ya movidos a ahorro libre o a la otra meta — esa reasignación de datos queda fuera de alcance de "reabrir" en esta versión.
- Editar el monto objetivo o el plazo de una meta con aportes reales existentes está siempre permitido (a diferencia de otras entidades de la app como los planes de cuotas, una meta de ahorro no tiene un calendario comprometido que "congelar"); la moneda es la única excepción, fija una vez que existe algún aporte.
- Notificaciones o alertas automáticas de atraso, conversión de moneda entre metas de distinta moneda, y presupuestos por categoría quedan fuera de alcance de esta feature.
