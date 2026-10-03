# Feature Specification: Plantilla oficial de importación en bloque

**Feature Branch**: `027-import-template`

**Created**: 2026-09-26

**Status**: Draft

**Input**: User description: "Plantilla oficial de Cuadra para importar datos en bloque. PROBLEMA: quien llega a Cuadra con años de finanzas en su propio Excel (movimientos, deudas con conocidos, compras en cuotas, suscripciones, metas de ahorro) no tiene cómo traerlos: el importador actual solo entiende cartolas bancarias (movimientos de UNA cuenta) y no puede adivinar si una fila de un Excel libre es un gasto, una deuda o una cuota. SOLUCIÓN: una plantilla Excel oficial que el usuario descarga desde la sección Importar, llena y vuelve a subir, con una hoja por tipo de dato: Movimientos, Traspasos entre cuentas propias, Deudas, Pagos de deudas, Planes de cuotas, Pagos de cuotas, Recurrentes, Metas de ahorro y Aportes. […] La plantilla descargada es PERSONALIZADA […]. REGLAS: (1) Un pago de deuda que viene como fila propia MUEVE DINERO REAL […]. (2) Un pago de cuota de un plan SIN tarjeta de crédito también mueve dinero real […]. (3) Un pago de cuota de un plan CON tarjeta de crédito es SOLO ESTADO […]. (4) Lo que no venga como fila de pago queda pendiente. (5) Los pagos se vinculan a su deuda o plan mediante una referencia […]. (6) Un aporte a una meta mueve dinero; un recurrente no. (7) Mismas reglas de negocio que la carga manual. (8) TODO O NADA […]. (9) Subir dos veces la misma plantilla la importa de nuevo, con aviso. […] TERMINADO SIGNIFICA: un usuario puede migrar un Excel como el de Simón […] y ver en la app deudas, planes, recurrentes, metas, saldos y movimientos cuadrados."

## Clarifications

### Session 2026-09-26

- Q: En un plan con tarjeta de crédito, ¿qué significa una cuota marcada pagada en la plantilla,
  dado que la facturación cobra toda cuota vencida no facturada? → A: Cuenta como ya facturada y
  liquidada fuera de la app: nunca entra a una facturación y libera su parte del cupo. Las cuotas
  sin fila de pago siguen el flujo natural: se facturan al vencer y su cupo se libera al pagar la
  facturación. (Reemplaza una respuesta previa de esta sesión —"el cupo queda ocupado"— que habría
  cobrado de nuevo, vía facturación, cuotas ya pagadas.)
- Q: Si el saldo inicial de una cuenta ya refleja el saldo real de hoy, ¿cómo evitar que el
  historial importado lo cuente dos veces? → A: En el resumen previo, por cada cuenta afectada, el
  usuario elige "mi saldo actual ya incluye estos movimientos" (por defecto) o "súmalos a mi saldo";
  con la primera, la importación ajusta el saldo inicial para que el saldo actual no cambie.
- Q: ¿Una deuda importada genera el movimiento del desembolso inicial (prestar o recibir el
  préstamo)? → A: No. El desembolso es un movimiento natural que el usuario escribe en la hoja
  Movimientos, sin vínculo con la deuda; la deuda solo mueve dinero con sus pagos.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Descargar una plantilla hecha a la medida (Priority: P1)

Como usuario que quiere traer sus finanzas a Cuadra, descargo desde la sección Importar una
plantilla Excel que ya conoce mis cuentas, tarjetas y categorías, para llenarla sin tener que
adivinar cómo escribir cada cosa.

**Why this priority**: Sin plantilla no hay nada que llenar ni subir; es la puerta de entrada de
toda la feature y, por sí sola, ya le dice al usuario qué datos puede traer y en qué forma.

**Independent Test**: Descargar la plantilla con un usuario que tiene 3 cuentas, 2 tarjetas y el
catálogo de categorías, abrirla en Excel y verificar que trae una hoja por tipo de dato con sus
encabezados, una hoja de referencia con esas cuentas/tarjetas/categorías, y listas desplegables
que solo ofrecen esos valores.

**Acceptance Scenarios**:

1. **Given** un usuario con cuentas, tarjetas y categorías, **When** descarga la plantilla, **Then**
   recibe un archivo Excel con las hojas Movimientos, Traspasos, Deudas, Pagos de deudas, Planes de
   cuotas, Pagos de cuotas, Recurrentes, Metas de ahorro y Aportes, cada una con sus encabezados, y
   una hoja de Instrucciones con un ejemplo por hoja (las hojas de datos vienen vacías, para que
   ningún ejemplo se importe por olvido).
2. **Given** la plantilla descargada, **When** el usuario abre la celda "Cuenta" de cualquier hoja,
   **Then** la lista desplegable ofrece exactamente los nombres de sus cuentas activas.
3. **Given** la plantilla descargada, **When** el usuario abre la celda "Categoría" de la hoja
   Movimientos, **Then** la lista ofrece solo categorías elegibles por un usuario (nunca las que la
   app asigna sola).
4. **Given** un usuario sin ninguna cuenta más allá de "Efectivo", **When** descarga la plantilla,
   **Then** la recibe igual, con "Efectivo" como única cuenta ofrecida.

---

### User Story 2 - Importar movimientos y traspasos (Priority: P1)

Como usuario, lleno las hojas Movimientos y Traspasos con mi historial y, al subir la plantilla,
todos los movimientos quedan registrados en sus cuentas y los saldos quedan como si los hubiera
cargado uno a uno.

**Why this priority**: Es el grueso de cualquier Excel personal (en el caso de referencia, ~300
filas) y la base sobre la que se apoyan las demás hojas; entrega valor aunque ninguna otra hoja se
llene.

**Independent Test**: Subir una plantilla con 20 movimientos repartidos en 3 cuentas y 2 traspasos,
sin ninguna otra hoja llena, y comparar cada saldo resultante con el saldo esperado calculado a
mano.

**Acceptance Scenarios**:

1. **Given** una plantilla con movimientos válidos en varias cuentas, **When** el usuario la sube y
   confirma, **Then** cada movimiento aparece en la cuenta indicada con su fecha, monto, tipo,
   categoría, tarjeta y detalles, y el saldo de cada cuenta cambia exactamente por la suma de sus
   movimientos.
2. **Given** un gasto con una tarjeta de crédito, **When** se importa, **Then** consume cupo de esa
   tarjeta y no descuenta el saldo de caja, igual que al registrarlo a mano.
3. **Given** un traspaso de la cuenta BCI a la cuenta MACH, **When** se importa, **Then** aparece
   como salida en BCI y entrada en MACH, y no cuenta como ingreso ni gasto en los totales.
4. **Given** una hoja con filas vacías entre medio o al final, **When** se importa, **Then** esas
   filas se ignoran sin error.

---

### User Story 3 - Importar deudas con sus pagos (Priority: P2)

Como usuario que presta y pide plata a conocidos, cargo cada deuda en la hoja Deudas y cada pago ya
hecho en la hoja Pagos de deudas, y la app muestra cuánto se ha pagado y cuánto falta, con los
pagos reflejados en los saldos de mis cuentas.

**Why this priority**: Es el caso que motivó la plantilla (el préstamo de Victor en 4 cuotas con 3
pagadas) y lo que un importador de cartolas nunca podrá inferir; depende de que los movimientos
(US2) ya funcionen.

**Independent Test**: Subir una plantilla con una deuda "Me deben" de 200.000 en 4 cuotas y 3 filas
de pago con referencia a ella, y verificar que la deuda muestra 3 de 4 cuotas pagadas y 50.000
pendientes, y que la cuenta que recibió los pagos subió 150.000.

**Acceptance Scenarios**:

1. **Given** una deuda "Me deben" con referencia "VICTOR" y 3 pagos con esa referencia, **When** se
   importa, **Then** la deuda queda con 3 cuotas pagadas y cada pago es un ingreso real en la cuenta
   indicada, con su fecha.
2. **Given** una deuda "Debo" y un pago con su referencia, **When** se importa, **Then** el pago es
   un gasto real en la cuenta indicada.
3. **Given** una deuda sin ninguna fila de pago, **When** se importa, **Then** queda completamente
   pendiente y no mueve ningún saldo.
4. **Given** una deuda cuyos pagos cubren todas sus cuotas, **When** se importa, **Then** queda
   liquidada.
5. **Given** un pago cuya referencia no corresponde a ninguna deuda de la plantilla, **When** se
   sube, **Then** la importación completa se rechaza señalando esa fila.

---

### User Story 4 - Importar planes de cuotas con sus pagos (Priority: P2)

Como usuario que compra en cuotas, cargo cada plan en la hoja Cuotas (planes) y cada cuota ya
pagada en la hoja Pagos de cuotas, y la app muestra cada plan con su avance real.

**Why this priority**: Junto con las deudas, es lo que un Excel propio suele llevar y ningún
extracto bancario describe; comparte el mecanismo de referencia con US3.

**Independent Test**: Subir un plan de 6 cuotas con tarjeta de crédito y 6 filas de pago, más un
plan de 3 cuotas sin tarjeta de crédito con 2 pagos, y verificar el avance de cada plan y el efecto
en saldos y cupo.

**Acceptance Scenarios**:

1. **Given** un plan sin tarjeta de crédito con 2 pagos de cuota, **When** se importa, **Then** el
   plan muestra 2 cuotas pagadas y cada pago es un gasto real en la cuenta indicada.
2. **Given** un plan con tarjeta de crédito, **When** se importa, **Then** la compra consume el cupo
   de esa tarjeta, igual que al crear el plan a mano.
3. **Given** un plan con tarjeta de crédito y filas de pago de cuota, **When** se importa, **Then**
   esas cuotas quedan marcadas como pagadas sin generar ningún movimiento ni tocar ningún saldo de
   caja, liberan su parte del cupo y nunca aparecen en una facturación.
4. **Given** un plan con tarjeta de crédito de 6 cuotas con 4 filas de pago, **When** se importa,
   **Then** el cupo ocupado es el de las 2 cuotas pendientes, y esas 2 se cobran en las facturaciones
   que cierren tras su vencimiento.
5. **Given** un plan sin tarjeta de crédito con cuotas sin fila de pago, **When** se importa,
   **Then** esas cuotas quedan pendientes.

---

### User Story 5 - Importar recurrentes, metas de ahorro y aportes (Priority: P3)

Como usuario, cargo mis suscripciones en la hoja Recurrentes y mis metas de ahorro con sus aportes,
para empezar en Cuadra con el panorama completo.

**Why this priority**: Es la parte más fácil de cargar a mano después (son pocos registros por
usuario), pero completar la migración en un solo paso es parte del valor.

**Independent Test**: Subir 3 recurrentes y 1 meta con 2 aportes, y verificar que los recurrentes
aparecen con su próxima fecha, que la meta muestra lo ahorrado y que la cuenta de origen de los
aportes bajó por su suma.

**Acceptance Scenarios**:

1. **Given** un recurrente mensual, **When** se importa, **Then** aparece activo con su próxima
   fecha de cobro y no mueve ningún saldo.
2. **Given** una meta con referencia y 2 aportes con esa referencia, **When** se importa, **Then** la
   meta muestra como ahorrado la suma de los aportes y cada aporte descuenta la cuenta indicada,
   igual que un aporte registrado a mano.

---

### User Story 6 - Ver qué se va a importar y por qué falla (Priority: P1)

Como usuario, antes de confirmar veo un resumen de lo que se va a crear por hoja y, si algo está
mal, veo cada problema indicado por hoja, fila y motivo, sin que nada quede a medio importar.

**Why this priority**: Con "todo o nada", un error sin ubicación exacta deja al usuario sin forma de
corregir su archivo; es tan necesario como la importación misma.

**Independent Test**: Subir una plantilla con 2 errores en hojas distintas y verificar que se listan
ambos con hoja, fila y motivo, que no se creó nada, y que tras corregirlos la misma plantilla se
importa completa.

**Acceptance Scenarios**:

1. **Given** una plantilla válida, **When** el usuario la sube, **Then** ve cuántos registros se
   crearán por hoja y el efecto total por cuenta, antes de confirmar.
2. **Given** una cuenta con saldo inicial igual a su saldo real de hoy y 50 movimientos históricos en
   la plantilla, **When** el usuario confirma con la opción por defecto "mi saldo actual ya incluye
   estos movimientos", **Then** los 50 movimientos aparecen en la cuenta y su saldo actual no cambia.
3. **Given** una plantilla con una cuenta que no existe en la hoja Movimientos fila 12 y un monto
   inválido en la hoja Deudas fila 3, **When** la sube, **Then** ve ambos errores con hoja, fila y
   motivo, y no puede confirmar.
4. **Given** una plantilla cuya aplicación rompería una regla de negocio (por ejemplo, un gasto que
   deja una cuenta prepago en negativo), **When** se confirma, **Then** no se importa nada y se
   indica la hoja y fila responsables.
5. **Given** una importación confirmada, **When** el usuario reintenta el mismo envío (doble clic o
   corte de red), **Then** no se duplica nada.
6. **Given** cualquier plantilla válida, **When** el usuario está por confirmar, **Then** ve un aviso
   de que subir de nuevo el mismo archivo más adelante volverá a crear todo.

---

### Edge Cases

- Dos cuentas del usuario con el mismo nombre: la referencia por nombre es ambigua → error en cada
  fila que la use, pidiendo renombrar una de las cuentas antes de importar.
- Una cuenta, tarjeta o categoría escrita a mano con otra capitalización o espacios de más: se
  reconoce igual (la comparación ignora mayúsculas y espacios en los extremos).
- Una tarjeta indicada que no pertenece a la cuenta de la misma fila → error de esa fila.
- Una referencia de deuda, plan o meta repetida dentro de su propia hoja → error: las referencias
  deben ser únicas por hoja.
- Más filas de pago que cuotas tiene la deuda o el plan → error en el pago sobrante.
- Una moneda de la fila distinta de la moneda de la cuenta → error (no hay conversión de moneda).
- Un pago o aporte con fecha anterior a la fecha de su deuda, plan o meta → error.
- Una plantilla de una versión anterior (hojas o columnas que ya no coinciden) → se rechaza con un
  mensaje que pide descargar la plantilla actual.
- Un archivo que no es una plantilla de Cuadra (por ejemplo, una cartola bancaria) → se rechaza
  indicando que para ese caso existe el importador de cartolas.
- Una plantilla completamente vacía → se rechaza con "no hay nada que importar".
- Un aporte a una meta desde una cuenta que quedaría fuera de sus reglas (prepago en negativo,
  sobregiro excedido) → error, igual que un gasto.
- Fechas escritas como texto ("28/11/2025") o como fecha de Excel → ambas se aceptan; se leen día
  primero.

## Requirements _(mandatory)_

### Functional Requirements

**Plantilla**

- **FR-001**: La sección Importar MUST ofrecer descargar la plantilla oficial, además del importador
  de cartolas existente, que se mantiene sin cambios.
- **FR-002**: La plantilla MUST tener una hoja por tipo de dato: Movimientos, Traspasos, Deudas,
  Pagos de deudas, Cuotas, Pagos de cuotas, Recurrentes, Metas de ahorro y Aportes, más
  una hoja de instrucciones y una hoja de referencia.
- **FR-003**: La plantilla MUST generarse para el usuario que la descarga: la hoja de referencia y
  las listas desplegables contienen sus cuentas activas, sus tarjetas (identificadas por cuenta y
  últimos 4 dígitos) y las categorías elegibles del catálogo.
- **FR-004**: Las columnas de tipo cerrado (tipo de movimiento, dirección de deuda, frecuencia,
  cuenta, tarjeta, categoría, moneda) MUST ofrecer lista desplegable.
- **FR-005**: La plantilla MUST identificar su propia versión, para poder rechazar una plantilla de
  una versión incompatible.

**Contenido por hoja**

- **FR-006**: Movimientos MUST admitir por fila: fecha, tipo (ingreso/gasto), monto, cuenta,
  tarjeta opcional, categoría opcional, descripción, observación, emisor, receptor, lugar y si es un
  cargo financiero del emisor — los mismos datos que un movimiento cargado a mano.
- **FR-007**: Traspasos MUST admitir por fila: fecha, cuenta de origen, cuenta de destino, monto de
  salida y monto de entrada (iguales si ambas cuentas tienen la misma moneda), y descripción.
- **FR-008**: Deudas MUST admitir por fila: referencia, dirección (me deben / debo), contraparte,
  título, monto total, moneda, fecha de inicio, fecha de vencimiento opcional, número de cuotas,
  frecuencia, cuenta asociada opcional y notas.
- **FR-009**: Pagos de deudas MUST admitir por fila: referencia de la deuda, fecha y cuenta. Cada
  fila representa una cuota pagada; su monto es el de ESA cuota según la deuda (la última puede
  diferir por redondeo: es lo que queda pendiente), y si la fila trae un monto que no coincide, es un
  error.
- **FR-010**: Cuotas MUST admitir por fila: referencia, descripción, fecha de compra,
  monto total, número de cuotas, interés opcional, tarjeta opcional, categoría opcional y cuenta de
  pago opcional.
- **FR-011**: Pagos de cuotas MUST admitir por fila: referencia del plan, número de cuota, fecha y,
  para un plan sin tarjeta de crédito, cuenta y monto pagado.
- **FR-012**: Recurrentes MUST admitir por fila: nombre, monto, moneda, frecuencia, intervalo, fecha
  de referencia, cuenta opcional, tarjeta opcional y categoría opcional.
- **FR-013**: Metas de ahorro MUST admitir por fila: referencia, nombre, monto objetivo, moneda,
  fecha límite y notas. Aportes MUST admitir por fila: referencia de la meta, fecha, monto y cuenta
  de origen.
- **FR-014**: Las referencias MUST ser únicas dentro de su hoja y solo tienen sentido dentro del
  archivo: no se guardan ni se muestran en la app después de importar.

**Efectos**

- **FR-015**: Cada movimiento, pago y aporte importado MUST producir exactamente el mismo efecto que
  si el usuario lo hubiera registrado a mano: saldos, cupo de crédito, facturación abierta y origen
  del movimiento.
- **FR-016**: Un pago de deuda MUST generar un movimiento real: ingreso si la deuda es "me deben",
  gasto si es "debo".
- **FR-016a**: Crear una deuda desde la plantilla MUST NOT generar ningún movimiento: el dinero
  prestado o recibido al abrirla es un movimiento común que el usuario escribe en la hoja
  Movimientos, sin vínculo con la deuda.
- **FR-017**: Un pago de cuota de un plan sin tarjeta de crédito MUST generar un gasto real en la
  cuenta indicada; lo que el pago no cubra se arrastra a la cuota siguiente, igual que al pagar a
  mano.
- **FR-018**: Un pago de cuota de un plan con tarjeta de crédito MUST marcar la cuota como pagada
  sin generar movimiento ni cambiar el saldo de caja de ninguna cuenta: esa cuota se considera
  facturada y liquidada fuera de la app, por lo que MUST NOT entrar a ninguna facturación futura y
  MUST liberar la parte del cupo de crédito que ocupaba.
- **FR-018a**: Las cuotas de un plan con tarjeta de crédito sin fila de pago MUST seguir el flujo
  normal de facturación: se cobran en la facturación que cierre después de su vencimiento, y su cupo
  se libera al pagar esa facturación en la app.
- **FR-019**: Una deuda o un plan cuyos pagos importados cubren todas sus cuotas MUST quedar
  liquidado.
- **FR-020**: Un recurrente importado MUST quedar activo y no mover dinero. Una meta importada MUST
  quedar abierta.
- **FR-021**: Los movimientos que un pago o aporte genera MUST poder identificarse como provenientes
  de su deuda, plan o meta, igual que los registrados a mano.

**Validación y confirmación**

- **FR-022**: Antes de confirmar, el usuario MUST ver cuántos registros se crearán por hoja y cuánto
  cambiaría el saldo (o el cupo usado, en una cuenta de tarjeta de crédito) de cada cuenta afectada.
- **FR-022a**: Por cada cuenta afectada, el usuario MUST elegir entre "mi saldo actual ya incluye
  estos movimientos" (opción por defecto) y "súmalos a mi saldo". Con la primera, la importación
  MUST ajustar el saldo inicial (o el cupo usado inicial) de esa cuenta por el efecto neto importado,
  de modo que su saldo actual (o cupo usado) quede igual que antes de importar; con la segunda, el
  saldo cambia por el efecto neto. Las reglas de FR-024 (prepago no negativo, sobregiro, techo,
  cupo) se evalúan con la opción elegida.
- **FR-023**: Toda fila inválida MUST informarse con hoja, fila (tal como la numera Excel) y motivo
  legible; con al menos un error, la confirmación MUST quedar bloqueada.
- **FR-024**: Las reglas de negocio de la carga manual (saldo prepago no negativo, límite de
  sobregiro, techo de saldo, cupo de crédito y su sublímite por tarjeta, categoría válida para el
  tipo, tarjeta perteneciente a la cuenta, moneda igual a la de la cuenta) MUST aplicarse sobre el
  efecto acumulado de toda la plantilla, en orden de fecha. La compra de un plan con tarjeta de
  crédito NO se valida contra el cupo, igual que al crear el plan a mano (FR-015).
- **FR-025**: La importación MUST ser todo o nada: si cualquier fila de cualquier hoja falla al
  aplicarse, no queda ningún registro creado ni ningún saldo modificado, y se informa la hoja y la
  fila responsables.
- **FR-026**: Reintentar el mismo envío (doble clic, corte de red) MUST NOT duplicar nada.
- **FR-027**: Subir de nuevo una plantilla ya importada MUST importarla otra vez (no hay detección de
  duplicados entre envíos distintos), y la pantalla de confirmación MUST advertirlo.
- **FR-028**: Una plantilla que no es de Cuadra, de versión incompatible o sin ninguna fila MUST
  rechazarse con un mensaje específico para cada caso.
- **FR-029**: Todos los textos de la plantilla y de la pantalla MUST existir en español e inglés;
  la plantilla se genera en el idioma del usuario.

### Key Entities _(include if feature involves data)_

- **Plantilla**: archivo generado por usuario y versionado; su hoja de referencia es una foto de las
  cuentas, tarjetas y categorías al momento de descargarla.
- **Referencia**: identificador libre que el usuario escribe para unir filas de hojas distintas
  (deuda ↔ pagos, plan ↔ pagos, meta ↔ aportes); vive solo dentro del archivo.
- **Importación**: un envío de plantilla; tiene una identidad de envío que evita duplicar por
  reintento, y produce o todos sus registros o ninguno.
- Registros que crea (ya existentes en la app, sin cambiar su significado): movimiento, traspaso,
  deuda y sus pagos, plan de cuotas y sus pagos, recurrente, meta de ahorro y sus aportes.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un usuario migra el Excel de referencia (~300 movimientos, 2 deudas en cuotas, 5
  planes de cuotas, traspasos, recurrentes y metas) en un solo envío, y el saldo de cada cuenta en
  la app coincide al peso con el saldo real de esa cuenta hoy.
- **SC-002**: En la plantilla de referencia, el 100 % de las filas con error se informa con hoja,
  fila y motivo correctos, y tras un rechazo no queda ningún registro creado.
- **SC-003**: Reintentar un envío ya confirmado 5 veces seguidas produce exactamente los mismos
  registros que un solo envío.
- **SC-004**: Un usuario nuevo descarga, llena con 20 filas y sube la plantilla sin ayuda externa en
  menos de 15 minutos.
- **SC-005**: Una plantilla de 2.000 filas en total se valida y muestra su resumen en menos de 10
  segundos.
- **SC-006**: Los importes, avances de deudas y planes y lo ahorrado por meta que muestra la app
  tras importar coinciden con lo que muestran al registrar los mismos datos a mano.

## Assumptions

- La plantilla se descarga y se sube desde la sección Importar ya existente; el importador de
  cartolas bancarias queda exactamente como está.
- Límite por plantilla: 5.000 filas en total entre todas las hojas; más que eso se rechaza pidiendo
  dividir el archivo.
- Las cuentas, tarjetas y categorías deben existir antes de importar: la plantilla no las crea.
- Solo se referencian cuentas activas; una cuenta inactiva no recibe movimientos importados.
- Cada fila de Pagos de deudas corresponde a una cuota completa, como el registro de pago de deudas
  que ya existe en la app; los pagos parciales de deudas quedan fuera de alcance.
- Las metas de ahorro se importan abiertas; cerrar metas desde la plantilla queda fuera de alcance.
- Las facturaciones de tarjeta de crédito no se importan: se siguen generando y pagando como hoy.
- Formatos aceptados: `.xlsx` (el formato en que se descarga la plantilla).
- Los montos se leen con coma o punto decimal y separador de miles chileno; las fechas, día primero.
- Fuera de alcance: detectar deudas o cuotas en Excel de formato libre, conversión de moneda,
  detección de duplicados entre importaciones distintas, crear cuentas o tarjetas desde la
  plantilla.
