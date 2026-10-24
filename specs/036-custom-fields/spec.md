# Feature Specification: Campos personalizados en los movimientos

**Feature Branch**: `036-custom-fields`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Campos personalizados en los movimientos. Cada persona sigue sus finanzas con hábitos propios que la app no puede prever (ejemplo real: gastar con tarjeta de crédito y traspasar el mismo monto a una cuenta remunerada; en la planilla una columna 'Transferido' dice qué gastos faltan por traspasar y cuánto suman). Que cada persona defina sus propios campos en los movimientos —nombre, tipo (sí/no, texto, número, fecha, lista), alcance (tipo de movimiento, cuentas, clase de tarjeta), valor por defecto— y los use para filtrar, sumar y marcar en bloque; importarlos con la plantilla; y (P2) 'Transferir pendientes': crear el traspaso por la suma de los pendientes y marcarlos. Fuera de alcance: campos en cuotas, deudas, gastos fijos o metas; campos compartidos; fórmulas; reglas automáticas; campos obligatorios."

## Clarifications

### Session 2026-10-24

- Q: ¿Dónde se configuran los campos? → A: En una sección propia de la barra lateral ("Campos", en el grupo "Tu dinero", después de Importar), no en Perfil ni como panel de Movimientos.
- Q: ¿Qué suma "Transferir pendientes" si la selección mezcla gastos e ingresos? → A: No se permite: todos los seleccionados deben ser del mismo tipo (todos gastos o todos ingresos); si no, la acción pide acotar la selección.
- Q: ¿Se puede deshacer un marcado en bloque? → A: Ambas protecciones: confirmación previa cuando la acción cambia más de 20 movimientos (dice cuántos y cuántos tenían otro valor), y un aviso con "Deshacer" (~10 s) que devuelve a cada movimiento su valor anterior.
- Q: ¿Qué muestra la sección "Campos"? → A: Configuración más un resumen por campo (conteo y totales por valor, incluido "sin valor"); cada valor abre Movimientos ya filtrado. "Transferir pendientes" se inicia desde Movimientos, no desde aquí.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Definir mis propios campos (Priority: P1)

Una persona abre la sección "Campos" de la barra lateral y crea "Transferido": tipo sí/no,
aplica solo a gastos hechos con tarjeta de crédito, valor por defecto "No". Al crearlo, la app le
dice cuántos movimientos existentes cumplen ese alcance y le ofrece aplicarles el valor por defecto.
Más adelante puede renombrar el campo, cambiar su alcance o su valor por defecto, o eliminarlo.

**Why this priority**: sin campos definidos no hay nada que guardar, filtrar ni importar; todo lo
demás depende de esto.

**Independent Test**: crear, editar y eliminar un campo de cada tipo y comprobar que aparece (y
desaparece) en la lista de campos de esa persona y en ninguna otra cuenta.

**Acceptance Scenarios**:

1. **Given** una persona sin campos, **When** crea "Transferido" (sí/no, gastos con tarjeta de crédito, por defecto No) sin pedir aplicarlo a los existentes, **Then** el campo queda guardado y sus movimientos existentes quedan "sin valor" para ese campo.
2. **Given** 40 gastos con tarjeta de crédito ya registrados, **When** crea el campo y marca "aplicar el valor por defecto a los 40 movimientos existentes", **Then** los 40 quedan en "No" y el resto de sus movimientos sigue sin valor.
3. **Given** un campo con al menos un valor guardado, **When** intenta cambiar su tipo, **Then** la app no lo permite y explica por qué; nombre, alcance, valor por defecto y opciones nuevas de lista sí se guardan.
4. **Given** un campo con 120 valores guardados, **When** lo elimina, **Then** la confirmación dice que se borrarán 120 valores y, al confirmar, el campo y sus valores desaparecen sin tocar los movimientos.
5. **Given** "Transferido" con 12 gastos en "No" que suman $184.500, **When** abre la sección "Campos", **Then** el campo muestra "No: 12 · $184.500" (y lo mismo para "Sí" y "sin valor") y al tocar "No" se abre Movimientos con "Transferido = No" aplicado.
6. **Given** dos personas distintas, **When** una crea un campo, **Then** la otra no lo ve ni puede leer o escribir sus valores.

---

### User Story 2 - Ver y editar el valor en cada movimiento (Priority: P1)

Cuando la persona registra un gasto con su tarjeta de crédito, el formulario ya muestra
"Transferido: No". En el detalle de cualquier movimiento ve los campos que le aplican y puede
cambiarlos. Puede pedir que "Transferido" se muestre como columna en la tabla de Movimientos.

**Why this priority**: es donde el dato nace y se corrige; sin esto el filtro no tiene qué mostrar.

**Independent Test**: con un campo creado, registrar movimientos dentro y fuera de su alcance y
verificar valor por defecto, edición, ocultamiento y columna.

**Acceptance Scenarios**:

1. **Given** el campo "Transferido" (gastos con crédito, por defecto No), **When** registra un gasto con tarjeta de crédito, **Then** el movimiento nace con "No" y el formulario lo mostraba así antes de guardar.
2. **Given** el mismo campo, **When** registra un ingreso o un gasto con débito, **Then** el campo no aparece en el formulario ni en el detalle, y el movimiento no tiene valor.
3. **Given** un movimiento con "Transferido: No", **When** lo cambia a "Sí" desde el detalle, **Then** el valor queda guardado y la tabla lo refleja.
4. **Given** un campo sí/no, **When** la persona deja el valor vacío, **Then** el movimiento queda "sin valor", distinto de "No", y así se muestra.
5. **Given** "Transferido" marcado "mostrar como columna", **When** abre Movimientos, **Then** la tabla tiene esa columna con el valor de cada fila (vacía donde no aplica).

---

### User Story 3 - Filtrar y sumar por un campo (Priority: P1)

En Movimientos la persona filtra "Transferido = No" y ve exactamente los gastos pendientes, cuántos
son y cuánto suman, combinable con los filtros que ya existen (cuenta, fechas, categoría, búsqueda).

**Why this priority**: es la pregunta que motivó la función ("¿qué me falta traspasar y cuánto
es?").

**Independent Test**: con valores conocidos, aplicar el filtro y comparar conteo y totales con el
cálculo manual.

**Acceptance Scenarios**:

1. **Given** 12 gastos en "No" que suman $184.500, 30 en "Sí" y 5 sin valor, **When** filtra "Transferido = No", **Then** ve los 12, el conteo dice 12 y el total de gastos es $184.500.
2. **Given** el mismo estado, **When** filtra "Transferido = sin valor", **Then** ve solo los 5.
3. **Given** el filtro activo, **When** además filtra por mes, **Then** el resultado es la intersección y el conteo y totales la reflejan.
4. **Given** el filtro activo con más movimientos que una página, **When** baja en la lista, **Then** se cargan los siguientes del mismo conjunto, sin duplicados ni omisiones.

---

### User Story 4 - Marcar varios movimientos a la vez (Priority: P1)

La persona selecciona varios gastos (o todos los del filtro actual) y les pone "Transferido: Sí" en
una sola acción.

**Why this priority**: marcar uno por uno decenas de gastos haría la función impracticable.

**Independent Test**: seleccionar un conjunto mixto (dentro y fuera del alcance), asignar un valor y
verificar el resultado y el aviso.

**Acceptance Scenarios**:

1. **Given** 12 gastos seleccionados dentro del alcance, **When** asigna "Transferido: Sí", **Then** los 12 quedan en "Sí" y el filtro "No" queda vacío.
2. **Given** una selección con 10 gastos con crédito y 2 ingresos, **When** asigna "Transferido: Sí", **Then** los 10 quedan en "Sí" y la app informa que 2 quedaron fuera porque el campo no les aplica.
3. **Given** un filtro con 300 resultados de los que solo 20 están cargados, **When** elige "seleccionar todos los del filtro" y asigna un valor, **Then** la app pide confirmar el cambio de 300 movimientos y, al confirmar, los 300 reciben el valor.
4. **Given** una asignación en bloque recién hecha, **When** elige "Deshacer" en el aviso, **Then** cada movimiento vuelve al valor que tenía antes de la acción.

---

### User Story 5 - Importar y exportar los valores con la plantilla (Priority: P1)

La persona descarga la plantilla oficial de importación, que trae una columna por cada uno de sus
campos; pega su historial con la columna "Transferido" y al importar los valores quedan guardados.
La plantilla con sus datos actuales también trae esos valores.

**Why this priority**: sin esto la persona tendría que remarcar a mano todo su historial, que es
justo donde vive hoy el dato.

**Independent Test**: importar una planilla con valores de cada tipo y comparar lo guardado; exportar
con datos actuales y verificar que los valores aparecen.

**Acceptance Scenarios**:

1. **Given** el campo "Transferido", **When** descarga la plantilla, **Then** la hoja de movimientos tiene una columna "Transferido" con sus valores posibles ofrecidos (Sí / No) y su descripción en las instrucciones.
2. **Given** 200 filas con "Sí" o "No" en esa columna, **When** importa, **Then** cada movimiento queda con su valor.
3. **Given** una fila con un valor ilegible para el tipo (p. ej. "tal vez" en un sí/no, una opción que no existe en una lista), **When** revisa la vista previa, **Then** la fila aparece como problema indicando hoja, fila y campo, y no se importa nada hasta corregirla.
4. **Given** movimientos con valores guardados, **When** descarga la plantilla con sus datos actuales, **Then** cada fila trae sus valores en las columnas de campos.

---

### User Story 6 - Transferir los pendientes en un paso (Priority: P2)

Con el filtro "Transferido = No" activo, la persona elige "Transferir pendientes": elige la cuenta de
origen y la de destino (su cuenta remunerada), ve la suma y la cantidad de movimientos, confirma, y la
app registra un traspaso por ese monto y deja esos gastos en "Sí", cada uno con referencia al traspaso
que lo cubrió.

**Why this priority**: cierra el ciclo del caso motivador, pero los P1 ya resuelven la necesidad
(filtrar, sumar, traspasar a mano y marcar en bloque).

**Independent Test**: con pendientes conocidos, ejecutar la acción y verificar el traspaso, los
saldos de ambas cuentas, los valores marcados y la referencia; repetir el envío y verificar que no se
duplica.

**Acceptance Scenarios**:

1. **Given** 12 gastos en "No" que suman $184.500, **When** transfiere desde su cuenta corriente a su cuenta remunerada y confirma, **Then** existe un traspaso de $184.500 entre esas cuentas, ambos saldos se movieron y los 12 gastos quedan en "Sí" con referencia a ese traspaso.
2. **Given** la confirmación abierta, **When** la revisa, **Then** ve monto, cantidad de movimientos, cuenta de origen y de destino antes de confirmar.
3. **Given** que el traspaso no puede registrarse (p. ej. la cuenta de origen es prepago y no tiene saldo suficiente), **When** confirma, **Then** no se crea el traspaso y ningún gasto cambia de valor.
4. **Given** una confirmación enviada dos veces (doble clic o reintento), **When** se procesa, **Then** existe un solo traspaso y los gastos quedan marcados una vez.
5. **Given** pendientes en dos monedas distintas, o que mezclan gastos e ingresos, **When** intenta transferirlos juntos, **Then** la app pide acotar la selección a una moneda y un tipo.

---

### Edge Cases

- **Un movimiento editado sale del alcance** (p. ej. un gasto con crédito pasa a débito): conserva su valor; el campo sigue visible en su formulario y detalle mientras tenga valor, para poder verlo o borrarlo. Al vaciarlo, deja de mostrarse.
- **Se cambia el alcance de un campo**: los valores ya guardados no se borran ni se rellenan; el nuevo alcance rige para movimientos nuevos y para qué campos se ofrecen en el formulario.
- **Se elimina un movimiento**: sus valores se eliminan con él.
- **Un traspaso** son dos movimientos (salida y entrada); si un campo aplica a traspasos, cada lado lleva su propio valor.
- **Se elimina una cuenta incluida en el alcance de un campo**: sale del alcance; si el campo se limitaba solo a cuentas eliminadas, deja de aplicar a movimientos nuevos y la configuración de campos lo señala para que la persona lo corrija.
- **Opciones de una lista**: se pueden agregar y renombrar; una opción solo se puede quitar si ningún movimiento la usa. El valor por defecto de una lista debe ser una de sus opciones.
- **Nombres repetidos**: dos campos de la misma persona no pueden llamarse igual (sin distinguir mayúsculas ni tildes).
- **Duplicar un movimiento**: la copia lleva los mismos valores que el original.
- **Movimientos de solo lectura** (los que respaldan una cuota, un pago de facturación, un prepago, etc.): sus campos personalizados sí se pueden editar, porque no afectan dinero.
- **Importar una fila sin valor en la columna de un campo que le aplica**: recibe el valor por defecto, igual que un movimiento creado a mano.
- **Importar un valor para un campo que no aplica a esa fila**: se informa como problema de esa fila.
- **Se elimina el traspaso creado por "Transferir pendientes"**: los movimientos que cubrió vuelven al valor que tenían antes de la acción (p. ej. "No") y pierden la referencia, en la misma operación que elimina el traspaso (ver FR-025).

## Requirements _(mandatory)_

### Functional Requirements

**Definición de campos**

- **FR-001**: Cada persona MUST poder crear, ver, editar y eliminar sus propios campos de movimientos desde una sección propia "Campos" de la barra lateral (grupo "Tu dinero"), disponible en todas las formas de la navegación (barra completa, riel de íconos y menú "Más" del teléfono); ningún campo ni valor es visible ni editable por otra persona.
- **FR-002**: Un campo MUST tener nombre (único por persona, sin distinguir mayúsculas ni tildes), tipo (sí/no, texto, número, fecha o lista de opciones), alcance y valor por defecto opcional compatible con su tipo.
- **FR-003**: El alcance MUST poder restringirse por tipo de movimiento (gasto, ingreso, traspaso), por cuentas específicas y por clase de tarjeta usada (crédito, débito, prepago); cada restricción vacía significa "sin restricción" en esa dimensión, y un movimiento cumple el alcance solo si cumple todas las dimensiones restringidas. Un movimiento sin tarjeta no cumple una restricción por clase de tarjeta.
- **FR-004**: El tipo de un campo MUST quedar fijo desde que tiene al menos un valor guardado; nombre, alcance, valor por defecto y opciones (agregar, renombrar, quitar las no usadas) MUST seguir siendo editables.
- **FR-005**: Al crear un campo con valor por defecto, la app MUST informar cuántos movimientos existentes cumplen el alcance y MUST permitir, opcionalmente, aplicarles ese valor; si no se elige, quedan sin valor.
- **FR-006**: Eliminar un campo MUST borrar todos sus valores, y la confirmación MUST indicar cuántos valores se borrarán.
- **FR-007**: Cada campo MUST poder marcarse "mostrar como columna" en la tabla de Movimientos.

**Valores en los movimientos**

- **FR-008**: Un movimiento creado (a mano, duplicado o importado) que cumple el alcance de un campo con valor por defecto MUST nacer con ese valor, salvo que se indique otro; un duplicado lleva los valores del original.
- **FR-009**: El formulario y el detalle de un movimiento MUST mostrar y permitir editar los campos cuyo alcance cumple, más los que ya tengan valor aunque ya no lo cumpla; los demás no se muestran.
- **FR-010**: "Sin valor" MUST ser un estado propio, distinto de cualquier valor (incluido "No"), y la persona MUST poder volver un valor a "sin valor".
- **FR-011**: Un valor MUST ser válido para su tipo: sí/no; texto de hasta 200 caracteres; número decimal; fecha; o una de las opciones vigentes de la lista.
- **FR-012**: Editar los campos personalizados de un movimiento MUST estar permitido aunque el movimiento sea de solo lectura por otras razones, y MUST NOT alterar saldos, cupos, facturaciones ni ningún otro dato del movimiento.

**Filtrar, sumar y marcar**

- **FR-013**: Movimientos MUST permitir filtrar por el valor de un campo, combinado con los filtros existentes: sí/no y lista por valor exacto o "sin valor"; texto por contenido o "sin valor"; número y fecha por rango o "sin valor".
- **FR-014**: El conteo, los totales y las categorías del resumen de Movimientos MUST calcularse sobre exactamente el conjunto filtrado, con las mismas reglas que los filtros actuales (incluida la exclusión de flujos internos de los totales).
- **FR-015**: La persona MUST poder asignar un valor de un campo (o "sin valor") a varios movimientos en una sola acción, seleccionándolos uno a uno o eligiendo todos los que cumplen el filtro actual.
- **FR-016**: Una asignación en bloque MUST aplicarse solo a los movimientos a los que el campo aplica y MUST informar cuántos quedaron fuera y por qué.
- **FR-016a**: Si la asignación cambia más de 20 movimientos, la app MUST pedir confirmación antes, indicando cuántos cambiarán y cuántos tenían otro valor (distinto de "sin valor").
- **FR-016b**: Tras una asignación en bloque, la app MUST ofrecer "Deshacer" durante unos 10 segundos; deshacer devuelve a cada movimiento afectado exactamente el valor que tenía antes (incluido "sin valor"), salvo los que se hayan editado entretanto.
- **FR-016c**: La sección "Campos" MUST mostrar, para cada campo, un resumen: por cada valor posible (sí/no y lista) más "sin valor" —o, en texto, número y fecha, "con valor" y "sin valor"— cuántos movimientos lo tienen y sus totales de gastos e ingresos por moneda, con las mismas reglas que el resumen de Movimientos (sin convertir monedas, sin flujos internos). Cada valor MUST abrir Movimientos con ese filtro ya aplicado.

**Importación**

- **FR-017**: La plantilla oficial MUST incluir una columna por campo de la persona en las hojas de movimientos y traspasos (en esta última, solo para campos cuyo alcance incluye traspasos), con sus valores posibles ofrecidos cuando el tipo los tiene y una descripción en las instrucciones.
- **FR-018**: Importar MUST guardar los valores de esas columnas con las mismas reglas de FR-008 a FR-011; un valor inválido o para un campo que no aplica a la fila MUST reportarse como problema con hoja, fila y campo, y la importación sigue siendo todo o nada.
- **FR-019**: La plantilla con los datos actuales MUST traer los valores guardados de cada movimiento en las columnas de campos.

**Transferir pendientes (P2)**

- **FR-020**: Con un filtro por un campo sí/no activo, la persona MUST poder iniciar "Transferir pendientes" sobre los movimientos seleccionados (o todos los del filtro), eligiendo cuenta de origen, cuenta de destino y el valor que quedarán (por defecto el opuesto al filtrado).
- **FR-021**: Antes de confirmar, la app MUST mostrar el monto total, la cantidad de movimientos y ambas cuentas.
- **FR-022**: Confirmar MUST registrar un traspaso por la suma de los movimientos —con las mismas reglas que cualquier traspaso— y marcar esos movimientos con el valor elegido y una referencia al traspaso, todo o nada.
- **FR-023**: Todos los movimientos incluidos MUST estar en una misma moneda, igual a la de ambas cuentas, y MUST ser del mismo tipo (todos gastos o todos ingresos; los lados de traspasos no se incluyen); si no, la acción MUST pedir acotar la selección. El monto del traspaso es la suma de sus montos.
- **FR-024**: Un reintento o doble envío de la misma confirmación MUST NOT crear un segundo traspaso ni volver a marcar.
- **FR-025**: Eliminar un traspaso que cubrió movimientos MUST devolver cada uno de esos movimientos al valor que tenía antes de "Transferir pendientes" (incluido "sin valor") y quitar su referencia, en la misma operación; si el valor se cambió a mano después, se respeta el cambio manual y solo se quita la referencia. La confirmación de eliminar el traspaso MUST decir cuántos movimientos volverán a su valor anterior.

### Key Entities _(include if feature involves data)_

- **Campo personalizado**: definición que pertenece a una persona — nombre, tipo, opciones (si es lista), alcance (tipos de movimiento, cuentas, clases de tarjeta), valor por defecto, "mostrar como columna".
- **Valor de campo**: el valor de un campo en un movimiento concreto; a lo más uno por campo y movimiento; su ausencia es "sin valor". Puede llevar la referencia al traspaso que lo cubrió y el valor que tenía antes de esa acción, para poder deshacerla (P2).
- **Movimiento**: el existente; gana valores de campos, sin cambiar ninguna de sus reglas de dinero.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Una persona crea el campo "Transferido" con su alcance y valor por defecto en menos de 1 minuto.
- **SC-002**: El conteo y el total de un filtro por campo coinciden en el 100 % de los casos con el cálculo manual sobre los mismos movimientos.
- **SC-003**: Marcar 500 movimientos en bloque termina en menos de 5 segundos.
- **SC-004**: Importar 2.000 filas con valores de campos tarda como máximo un 20 % más que las mismas filas sin campos.
- **SC-005**: El historial de la planilla personal con su columna "Transferido" se migra sin remarcar ningún movimiento a mano.
- **SC-006**: "Transferir pendientes" nunca deja movimientos marcados sin el traspaso correspondiente, ni un traspaso sin sus movimientos marcados (0 casos en pruebas de fallo y doble envío).

## Assumptions

- Reciben el valor por defecto los movimientos que crea la persona (a mano, duplicados, traspasos e importados). Los que el sistema crea como efecto de otra acción (pago o prepago de facturación, pago de cuota o deuda, aporte o retiro de ahorro, el traspaso de "Transferir pendientes") nacen sin valor; se pueden marcar a mano.
- Solo movimientos (incluidos los lados de un traspaso) llevan campos en esta versión; cuotas, deudas, gastos fijos y metas quedan fuera.
- Los campos se crean en la app; la plantilla trae las columnas de los campos que ya existen al descargarla (no define campos nuevos).
- Límites razonables por persona: hasta 20 campos y hasta 50 opciones por lista.
- Se filtra por un campo a la vez en esta versión (combinable con los filtros existentes), en la pantalla principal de Movimientos; la pestaña Movimientos del detalle de una cuenta no gana el filtro todavía.
- "Transferir pendientes" crea un traspaso ordinario entre cuentas propias; si el destino es una tarjeta de crédito rige la regla actual de pagar la tarjeta.
- Los textos de la interfaz están en español e inglés; los nombres y opciones de los campos son los que escribe la persona y no se traducen.
- Eliminar la cuenta de la persona elimina sus campos y valores, como el resto de sus datos.
