# Feature Specification: Facturación separada por moneda en tarjetas de crédito

**Feature Branch**: `028-multi-currency-billing`

**Created**: 2026-09-26

**Status**: Draft

**Input**: User description: "Facturación separada por moneda en tarjetas de crédito. Cuando una tarjeta de crédito tiene cupo en más de una moneda (por ejemplo pesos y dólares), el usuario debe ver y manejar una facturación por moneda: los cargos en dólares se acumulan en una facturación en dólares y los cargos en pesos en la de pesos, sin mezclarse ni convertirse. Ambas se cierran en el mismo ciclo (automático o con "Generar facturación"). La facturación en dólares se puede pagar desde una cuenta en pesos: el usuario indica cuántos pesos salieron de su cuenta y cuántos dólares se liquidaron (la app no conoce el tipo de cambio). Si la facturación en dólares vence sin pagarse, la app lo avisa ("Vencida — traspasar a pesos"); el usuario confirma el traspaso escribiendo el monto en pesos que cobró el banco: eso deja saldada la deuda en dólares (libera ese cupo) y agrega ese monto como cargo a la facturación en pesos abierta (pasa a usar cupo en pesos). Fuera de alcance: tipo de cambio automático, traspaso automático sin confirmación, priorizar más de una moneda extra por tarjeta. Terminado es: con cargos en dólares y en pesos, al cerrar el ciclo existen dos facturaciones con sus montos; pagar la de dólares desde pesos o traspasarla deja ambos cupos y el saldo de la cuenta de origen correctos."

## Clarifications

### Session 2026-09-26

- Q: ¿Se puede deshacer un traspaso? → A: Sí; deshacerlo deja la facturación en otra moneda impaga otra vez, elimina el cargo en pesos y restaura ambos cupos exactamente.
- Q: ¿El cargo en pesos del traspaso se puede editar o borrar desde Movimientos? → A: No; es de solo lectura allí (con enlace a su facturación) y se corrige deshaciendo el traspaso.
- Q: ¿Cómo se ve una facturación en otra moneda saldada por traspaso? → A: Con un estado propio "Traspasada", mostrando el monto saldado → el monto en pesos cargado, con enlace a la facturación en pesos que lo recibió.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Una facturación por moneda (Priority: P1)

Tengo una tarjeta de crédito con cupo en pesos y un tope en dólares. Cada cargo en dólares
(Spotify, Steam, Netflix) se acumula en una facturación en dólares y cada cargo en pesos en la
facturación en pesos. En la vista de facturación de la cuenta veo ambas, cada una con su moneda,
su período, su monto y su estado, sin que ninguna cifra se mezcle o se convierta. Al cerrarse el
ciclo —automáticamente o con "Generar facturación"— se cierran las dos en la misma fecha y cada
una tiene su propia fecha de vencimiento.

**Why this priority**: sin esto el cargo en dólares no aparece en ninguna facturación y la deuda
en dólares no se puede pagar ni seguir; es la base de las otras dos historias.

**Independent Test**: registrar cargos en pesos y en dólares en una misma tarjeta, cerrar el
ciclo y comprobar que existen dos facturaciones, una por moneda, cada una con exactamente la
suma de sus cargos.

**Acceptance Scenarios**:

1. **Given** una tarjeta con cupo en CLP y tope en USD sin movimientos, **When** registro un
   cargo de US$9,06, **Then** aparece una facturación USD abierta con US$9,06 y la facturación CLP
   no cambia.
2. **Given** facturaciones abiertas en CLP ($120.000) y USD (US$30), **When** se cierra el
   ciclo, **Then** quedan dos facturaciones pendientes de pago, con la misma fecha de cierre y
   montos $120.000 y US$30.
3. **Given** que solo hubo cargos en pesos durante el ciclo, **When** se cierra, **Then** solo
   existe la facturación CLP (no se crea una facturación USD vacía).
4. **Given** una tarjeta sin tope en otra moneda, **When** uso la app, **Then** la facturación
   se ve y se comporta exactamente como hoy.

---

### User Story 2 - Pagar la facturación en dólares desde una cuenta en pesos (Priority: P1)

Mi facturación en dólares está cerrada y la pago desde mi cuenta corriente en pesos. Como la app
no conoce el tipo de cambio, escribo cuántos dólares estoy pagando y cuántos pesos salieron de
mi cuenta. La cuenta de origen baja por los pesos, la deuda en dólares baja por los dólares, y
queda un movimiento de pago visible en la cuenta de origen.

**Why this priority**: es la forma normal de saldar la deuda en dólares a tiempo; sin ella la
facturación USD existiría pero no se podría liquidar.

**Independent Test**: con una facturación USD cerrada de US$30, pagarla desde una cuenta CLP
indicando US$30 y $28.500, y comprobar el saldo de la cuenta de origen, el uso del tope USD y el
estado de la facturación.

**Acceptance Scenarios**:

1. **Given** una facturación USD pendiente de US$30 y una cuenta corriente CLP con $500.000,
   **When** pago US$30 indicando que salieron $28.500, **Then** la cuenta queda en $471.500, el
   tope USD usado baja en US$30, la facturación queda pagada y el cupo CLP no cambia.
2. **Given** la misma facturación, **When** pago solo US$20 (con $19.000), **Then** la
   facturación queda liquidada con faltante y los US$10 restantes pasan a la siguiente
   facturación USD, igual que ocurre hoy con un pago parcial en pesos.
3. **Given** una facturación USD, **When** intento pagar más dólares de los que debe, **Then** la
   app lo rechaza.
4. **Given** una cuenta de origen en dólares, **When** pago la facturación USD, **Then** basta un
   solo monto (dólares) y la cuenta baja por ese monto.

---

### User Story 3 - Traspasar a pesos una facturación en dólares vencida (Priority: P2)

Mi facturación en dólares venció y no la pagué: el banco la convirtió a pesos y la cargó a mi
facturación en pesos. En la app, esa facturación aparece marcada "Vencida — traspasar a pesos".
Confirmo el traspaso escribiendo el monto en pesos que aparece en mi cartola. La deuda en dólares
queda saldada (libera el tope USD) y ese monto en pesos se suma como cargo a la facturación en
pesos abierta, ocupando cupo en pesos.

**Why this priority**: es lo que hace el banco real si no se paga a tiempo; sin ello la deuda en
dólares quedaría viva para siempre y el cupo en pesos no reflejaría el cargo real. Va después del
pago porque solo aplica a facturaciones que no se pagaron.

**Independent Test**: con una facturación USD vencida e impaga de US$70,72, traspasarla
indicando $66.052 y comprobar que el tope USD queda libre, la facturación USD queda saldada y la
facturación CLP abierta aumenta en $66.052.

**Acceptance Scenarios**:

1. **Given** una facturación USD de US$70,72 cuya fecha de vencimiento ya pasó y no tiene pagos,
   **When** veo la facturación, **Then** aparece marcada como vencida con la acción "Traspasar a
   pesos".
2. **Given** esa facturación, **When** confirmo el traspaso con $66.052, **Then** la facturación
   USD queda en estado "Traspasada" (US$70,72 → $66.052), el tope USD usado baja en US$70,72, la facturación CLP abierta
   sube en $66.052 y el cupo CLP usado también.
3. **Given** una facturación USD que pagué en parte (US$20 de US$30), **When** se liquida, **Then**
   los US$10 que faltan pasan a la siguiente facturación USD, y es **esa** la que se ofrecerá
   traspasar cuando cierre y venza sin pagarse (la facturación pagada en parte ya quedó liquidada).
4. **Given** una facturación USD que aún no vence, **When** la veo, **Then** no se ofrece el
   traspaso, solo el pago.
5. **Given** un traspaso confirmado por error, **When** lo deshago, **Then** la facturación USD
   vuelve a estar impaga y el cargo en pesos desaparece de la facturación CLP.

---

### Edge Cases

- ¿Qué pasa con un cargo en dólares registrado **antes** de esta funcionalidad? Debe poder quedar
  en su facturación USD correspondiente (por fecha) con la misma herramienta de sincronización que
  ya existe para las facturaciones en pesos.
- ¿Qué pasa si se edita o elimina un cargo en dólares de una facturación ya pagada? Mismas reglas
  que hoy para pesos: no se toca lo ya liquidado y la sincronización lo corrige.
- ¿Qué pasa si el usuario elimina el tope en dólares de la tarjeta teniendo una facturación USD
  impaga? No se permite mientras haya deuda en esa moneda.
- ¿Qué pasa si no hay fecha de pago configurada en la cuenta? No hay fecha de vencimiento, así
  que el traspaso se ofrece desde que la facturación USD está cerrada e impaga.
- ¿Qué pasa si se importa un cargo en dólares con la plantilla? Queda en la facturación USD
  abierta, igual que uno hecho a mano.
- ¿Qué pasa con el pago mínimo? Se calcula por facturación, con el mismo porcentaje de la
  cuenta, en la moneda de cada facturación.
- ¿Qué pasa si el monto en pesos del traspaso deja el cupo CLP sobre el límite? Se acepta igual
  (el banco ya lo cargó) y el cupo se muestra excedido.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Toda facturación MUST tener una moneda; las facturaciones existentes quedan en la
  moneda de su cuenta.
- **FR-002**: Un cargo o pago en una moneda distinta a la de la cuenta MUST quedar asociado a la
  facturación abierta de **esa** moneda, nunca a la de la moneda de la cuenta.
- **FR-003**: El cierre de ciclo (automático y manual) MUST cerrar en la misma fecha todas las
  facturaciones abiertas de la cuenta que tengan consumo, una por moneda.
- **FR-004**: Una facturación sin consumo MUST NOT crearse, en ninguna moneda.
- **FR-005**: La vista de facturación MUST mostrar cada facturación con su moneda, período,
  monto, fecha de vencimiento y estado, y MUST distinguir claramente las monedas.
- **FR-006**: Los montos de facturaciones en monedas distintas MUST NOT sumarse ni convertirse
  entre sí en ningún total.
- **FR-007**: Los usuarios MUST poder pagar una facturación en otra moneda desde una cuenta en la
  moneda de la tarjeta, indicando por separado el monto liquidado (moneda de la facturación) y el
  monto debitado (moneda de la cuenta de origen).
- **FR-008**: Un pago MUST descontar de la cuenta de origen el monto debitado, bajar el uso del
  tope de esa moneda por el monto liquidado y dejar un movimiento de pago visible en la cuenta de
  origen.
- **FR-009**: Un pago parcial de una facturación en otra moneda MUST seguir la misma regla de
  arrastre que las facturaciones en pesos: liquida el período y el faltante pasa a la siguiente
  facturación de **esa misma moneda**.
- **FR-010**: Un pago mayor a lo adeudado MUST rechazarse.
- **FR-011**: Una facturación en otra moneda cerrada, sin liquidar (ni pagada ni traspasada), con
  saldo pendiente y con fecha de vencimiento pasada —o sin fecha de vencimiento configurada— MUST
  mostrarse como vencida con la acción "Traspasar a pesos" (la moneda de la cuenta). El saldo
  pendiente incluye lo que le arrastró una facturación anterior pagada en parte.
- **FR-012**: El traspaso MUST pedir al usuario el monto en la moneda de la cuenta; la app MUST NOT
  calcularlo ni sugerir un tipo de cambio.
- **FR-013**: Confirmar un traspaso MUST, en una sola operación: saldar lo que falta de la
  facturación en otra moneda, liberar ese uso del tope, y registrar un cargo por el monto indicado
  en la facturación abierta de la moneda de la cuenta, aumentando su cupo usado.
- **FR-014**: El cargo generado por un traspaso MUST identificarse como tal (origen visible) y
  enlazar a la facturación que saldó. MUST ser de solo lectura en Movimientos: editarlo o
  eliminarlo desde ahí se rechaza, y la vista explica que se corrige deshaciendo el traspaso.
- **FR-014a**: Una facturación saldada por traspaso MUST mostrarse con un estado propio
  "Traspasada" (distinto de "Pagada" y "Pagada en parte"), indicando el monto saldado en su moneda
  → el monto cargado en la moneda de la cuenta, con enlace a la facturación que lo recibió. Si
  antes del traspaso tuvo un pago parcial, se muestran ambos.
- **FR-015**: Los usuarios MUST poder deshacer un traspaso, restaurando exactamente el estado
  anterior de ambas facturaciones y cupos. Antes de confirmar, la app MUST mostrar qué se
  revertirá (monto en otra moneda que vuelve a deberse, monto en pesos que se quita), calculado por
  la misma lógica que ejecuta la reversión. No se puede deshacer si la facturación en pesos que
  recibió el cargo ya fue liquidada.
- **FR-016**: La app MUST NOT permitir quitar el tope de una moneda mientras exista deuda
  pendiente en esa moneda.
- **FR-017**: La sincronización de una facturación MUST considerar solo los movimientos de su
  moneda.
- **FR-018**: Las operaciones de pago y traspaso MUST ser seguras ante reintentos o doble envío
  (no duplicar el efecto).
- **FR-019**: Una tarjeta sin topes en otras monedas MUST comportarse exactamente como antes de
  esta funcionalidad.

### Key Entities

- **Facturación (período de facturación)**: el período de una cuenta de tarjeta de crédito en una
  moneda. Nueva información: su moneda; y, cuando corresponda, que fue saldada por traspaso, con
  el monto en la moneda de la cuenta y el cargo que lo representa.
- **Tope por moneda**: el cupo propio de la tarjeta principal en una moneda distinta a la de la
  cuenta (ya existe). Su uso sube con los cargos y baja con pagos y traspasos de esa moneda.
- **Pago de facturación**: el movimiento que sale de la cuenta de origen. Nuevo: puede liquidar
  un monto en una moneda distinta a la debitada.
- **Cargo por traspaso**: un cargo en la moneda de la cuenta, en su facturación abierta, que
  representa la deuda en otra moneda convertida por el banco.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Con cargos en dos monedas en un ciclo, el 100% de los cierres produce exactamente una
  facturación por moneda con consumo, cada una igual a la suma de sus cargos.
- **SC-002**: Tras pagar una facturación en dólares desde pesos, el saldo de la cuenta de origen,
  el uso del tope en dólares y el cupo en pesos cuadran al centavo con lo indicado por el usuario.
- **SC-003**: Tras un traspaso, el tope en dólares queda libre por lo saldado y la facturación en
  pesos abierta aumenta exactamente en el monto indicado; deshacerlo deja todo como estaba.
- **SC-004**: El usuario completa un pago o un traspaso en menos de 1 minuto desde la vista de
  facturación.
- **SC-005**: Reproducir el caso real del Excel de referencia (cargos USD de julio–agosto,
  traspasos de US$70,72 → $66.052 y US$12,29 → $11.798) deja el tope USD usado en US$50,41 y el
  cupo CLP igual al del Excel.
- **SC-006**: Ninguna cuenta sin topes en otras monedas cambia su comportamiento de facturación.

## Assumptions

- La monedas extra y los topes por moneda ya existen (Perfil → Monedas extra, tope en la tarjeta
  principal); esta funcionalidad no cambia cómo se configuran.
- El ciclo de cierre y la fecha de pago de la cuenta aplican igual a todas sus monedas; no hay
  configuración de facturación por moneda.
- El pago desde una cuenta en la misma moneda que la facturación (por ejemplo una cuenta en
  dólares) usa un solo monto.
- Los planes en cuotas con tarjeta siguen siendo solo en la moneda de la cuenta (fuera de
  alcance).
- El prepago de tarjeta (abonar antes del cierre) se mantiene solo para la moneda de la cuenta.
- No se necesita migración de datos de producción; los datos de desarrollo se regeneran y los
  cargos en otra moneda ya registrados se ordenan con la sincronización existente.
- La cuenta de origen de un pago no puede ser otra tarjeta de crédito (regla existente).
- Registrar a mano un ingreso en otra moneda con la tarjeta (por ejemplo una devolución en USD) se
  puede por la plantilla o la API; el formulario de movimientos no ofrece tarjeta en un ingreso y
  cambiarlo queda fuera de alcance.
