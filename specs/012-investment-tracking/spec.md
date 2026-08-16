# Feature Specification: Registro y seguimiento de inversiones

**Feature Branch**: `012-investment-tracking`

**Created**: 2026-08-15

**Status**: Deferred — borrador aprobado en lo esencial, congelado el 2026-08-15 antes de
`/speckit-clarify`. Se retoma cuando se trabaje la vista de inversiones. Dos decisiones abiertas
(ver `checklists/requirements.md`): la relación instrumento ↔ cuenta de inversión y quién crea esa
cuenta al registrar el instrumento.

**Input**: User description: "Registro y seguimiento de inversiones. La app modela cuentas,
movimientos, deudas y cuotas, pero el ahorro invertido es invisible: la vista Inversiones es una
lista de solo lectura sin montos ni acciones, y el patrimonio neto solo cuenta saldos de cuenta.
Alcance: depósito a plazo con ciclo de vida real (abrir mueve plata desde una cuenta, liquidar
devuelve capital + interés declarado por el usuario, renovar en un solo paso), cuenta remunerada
como cuenta bancaria con tasa, cuenta de ahorro para la vivienda y los instrumentos de valor
variable (fondo mutuo, APV, acciones, ETF) con aportes por traspaso y valor declarado. El
patrimonio separa lo verificado por movimientos de lo declarado a mano y agrupa por moneda. Fuera
de alcance: renovación automática sin confirmar, cotizaciones en vivo, UF, conversión de monedas,
impuestos y rentabilidad histórica."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Abrir un depósito a plazo (Priority: P1)

Una persona toma un depósito a plazo en su banco: elige cuánto, desde qué cuenta sale la plata y
hasta cuándo queda tomado. Quiere que la app refleje exactamente eso — que su cuenta corriente baje
por ese monto y que la plata siga siendo suya, ahora inmovilizada hasta una fecha conocida.

**Why this priority**: Es el instrumento que hoy la app no puede representar de ninguna forma sin
mentir: registrarlo como gasto borra la plata del patrimonio, y no registrarlo deja el saldo de la
corriente equivocado. Sin esta historia, ninguna otra existe.

**Independent Test**: Abrir un depósito desde una cuenta con saldo y verificar que la cuenta baja
por el capital, que el depósito aparece como vigente con su fecha de vencimiento, y que el
patrimonio neto queda igual que antes de abrirlo.

**Acceptance Scenarios**:

1. **Given** una cuenta corriente con $3.000.000, **When** el usuario abre un depósito a plazo de
   $1.000.000 desde esa cuenta con vencimiento a 90 días, **Then** la cuenta queda con $2.000.000,
   el depósito figura como vigente y el patrimonio neto no cambia.
2. **Given** un depósito a plazo vigente, **When** el usuario mira la vista de inversiones,
   **Then** ve su capital, su institución, su tasa declarada y los días que faltan para el
   vencimiento.
3. **Given** una cuenta con $500.000, **When** el usuario intenta abrir un depósito de $800.000
   desde ella, **Then** la app lo rechaza explicando que la cuenta no tiene ese saldo.
4. **Given** el formulario de apertura, **When** el usuario indica una fecha de vencimiento
   anterior o igual a la de apertura, **Then** la app lo rechaza.

---

### User Story 2 - Liquidar o renovar un depósito vencido (Priority: P2)

Llegado el vencimiento, la persona ve en su cartola cuánto recibió realmente. Quiere anotar ese
monto y decidir: que la plata vuelva a una de sus cuentas, o que el depósito siga tomado por un
período más con el capital ya crecido.

**Why this priority**: Un depósito que solo se puede abrir deja el patrimonio congelado en una
cifra vieja para siempre. Cerrar el ciclo es lo que hace útil la historia 1.

**Independent Test**: Sobre un depósito con vencimiento pasado, ejecutar liquidar declarando el
monto recibido y verificar que la cuenta destino sube por ese monto, que el instrumento deja de
figurar como vigente y que el patrimonio sube exactamente por la diferencia con el capital.

**Acceptance Scenarios**:

1. **Given** un depósito de $1.000.000 con vencimiento pasado, **When** el usuario lo liquida
   declarando $1.012.000 recibidos en su cuenta corriente, **Then** esa cuenta sube $1.012.000, el
   depósito queda liquidado y el patrimonio neto sube $12.000.
2. **Given** un depósito con vencimiento pasado, **When** el usuario abre la vista de inversiones,
   **Then** el depósito se muestra como vencido y ofrece liquidarlo o renovarlo.
3. **Given** un depósito vencido de $1.000.000, **When** el usuario lo renueva declarando $12.000
   de interés y una nueva fecha de vencimiento, **Then** queda un depósito vigente de $1.012.000,
   el anterior queda liquidado, y ninguna cuenta registra movimiento alguno.
4. **Given** un depósito vigente cuyo vencimiento aún no llega, **When** el usuario lo liquida
   anticipadamente declarando $998.000, **Then** la operación se acepta y el patrimonio baja
   $2.000 — la app no supone que un depósito siempre gana.
5. **Given** un depósito ya liquidado, **When** el usuario intenta liquidarlo o renovarlo otra vez,
   **Then** la app lo impide.

---

### User Story 3 - Aportar a un instrumento de valor variable y declarar cuánto vale (Priority: P3)

La persona invierte en un fondo mutuo, un APV, acciones o un ETF. Compra transfiriendo plata desde
su cuenta, y de vez en cuando mira la cartola de su administradora y anota cuánto vale hoy.

**Why this priority**: Cubre la mayor parte de lo que la gente llama "mis inversiones", pero
depende de que exista la separación entre lo aportado y lo declarado, que es lo que evita contar
la plata dos veces.

**Independent Test**: Registrar un fondo mutuo, aportarle plata desde una cuenta, declarar un valor
actual mayor al aportado, y verificar que el patrimonio sube solo por la diferencia y que esa
diferencia aparece rotulada como valor declarado.

**Acceptance Scenarios**:

1. **Given** una cuenta corriente con $2.000.000, **When** el usuario aporta $500.000 a su fondo
   mutuo, **Then** la corriente queda con $1.500.000, el instrumento registra $500.000 de capital
   aportado y el patrimonio neto no cambia.
2. **Given** ese fondo con $500.000 aportados, **When** el usuario declara que hoy vale $530.000,
   **Then** el patrimonio neto sube $30.000 y esos $30.000 se muestran como valor declarado, no
   como saldo de cuentas.
3. **Given** ese mismo fondo, **When** el usuario declara que hoy vale $470.000, **Then** el
   patrimonio neto baja $30.000 respecto del capital aportado.
4. **Given** un instrumento al que nunca se le declaró un valor, **When** se calcula el patrimonio,
   **Then** ese instrumento aporta cero a la línea declarada: vale lo que costó.
5. **Given** un instrumento con valor declarado el 1 de julio, **When** el usuario lo mira el 15 de
   agosto, **Then** ve el monto junto a la fecha en que fue declarado, sin ningún ajuste ni
   proyección.
6. **Given** un fondo con $500.000 aportados, **When** el usuario rescata $200.000 hacia su cuenta
   corriente, **Then** la corriente sube $200.000 y el capital aportado del instrumento queda en
   $300.000.

---

### User Story 4 - Ver el patrimonio separado por origen y por moneda (Priority: P4)

La persona quiere saber cuánto tiene, sin que la app le mezcle lo que puede probar con lo que ella
misma tecleó, ni monedas distintas en un mismo número.

**Why this priority**: Es lo que hace confiable todo lo anterior. Sin la separación, un valor mal
tipeado contamina la cifra que el usuario usa para decidir.

**Independent Test**: Con cuentas en dos monedas y al menos un instrumento con valor declarado,
abrir el panel y verificar que hay subtotales por moneda, una línea de saldos de cuentas y otra de
valor declarado, y ningún total que sume monedas distintas.

**Acceptance Scenarios**:

1. **Given** cuentas en CLP y acciones valorizadas en USD, **When** el usuario abre el panel,
   **Then** ve un subtotal por cada moneda y ningún total combinado.
2. **Given** instrumentos con valor declarado, **When** el usuario abre el panel, **Then** ve por
   separado cuánto está en cuentas (verificado por movimientos) y cuánto proviene de valores que él
   declaró.
3. **Given** una cuenta de inversión con un instrumento colgando, **When** se calcula el
   patrimonio, **Then** el saldo de esa cuenta se cuenta una sola vez.

---

### User Story 5 - Marcar una cuenta como remunerada (Priority: P5)

La persona tiene una cuenta que le paga interés (una cuenta remunerada o de ahorro con tasa) y
quiere que aparezca entre sus inversiones sin dejar de ser la cuenta donde recibe transferencias y
registra movimientos.

**Why this priority**: Aporta visibilidad, pero no desbloquea nada que hoy sea imposible: la cuenta
ya existe y su saldo ya se cuenta bien.

**Independent Test**: Declarar una tasa anual en una cuenta existente y verificar que aparece en la
vista de inversiones y en el listado de cuentas, con un único saldo.

**Acceptance Scenarios**:

1. **Given** una cuenta de ahorro existente, **When** el usuario le declara una tasa anual,
   **Then** la cuenta aparece en la vista de inversiones indicando su tasa.
2. **Given** esa cuenta remunerada, **When** el usuario mira el patrimonio, **Then** su saldo se
   cuenta una sola vez, como el de cualquier otra cuenta.
3. **Given** esa cuenta remunerada, **When** el usuario registra un movimiento en ella, **Then** se
   comporta como cualquier cuenta: el movimiento afecta su saldo con las mismas reglas.

---

### User Story 6 - Registrar una cuenta de ahorro para la vivienda (Priority: P6)

La persona tiene una cuenta de ahorro para la vivienda y quiere que su monto forme parte del
patrimonio, aunque no lleve el detalle de sus depósitos en la app.

**Why this priority**: Es el caso más simple (solo un valor declarado) y el de menor frecuencia de
uso; entra último sin bloquear nada.

**Independent Test**: Registrar la cuenta vivienda con un monto declarado y verificar que suma
íntegramente a la línea de valor declarado del patrimonio.

**Acceptance Scenarios**:

1. **Given** una cuenta de ahorro para la vivienda registrada con $4.000.000 declarados, **When**
   el usuario mira el patrimonio, **Then** esos $4.000.000 suman completos en la línea de valor
   declarado.
2. **Given** esa cuenta, **When** el usuario actualiza el monto declarado, **Then** la fecha de
   declaración se actualiza y el patrimonio refleja el nuevo monto.

---

### Edge Cases

- **La cuenta origen de un depósito vigente se elimina**: el depósito conserva su capital y su
  historia; el movimiento de apertura queda desvinculado como cualquier otro movimiento de una
  cuenta eliminada, y la liquidación se hace hacia cualquier otra cuenta del usuario.
- **Liquidar hacia una cuenta distinta de la de origen**: permitido — el banco puede abonar en otra
  cuenta.
- **Liquidar hacia una cuenta de tarjeta de crédito**: rechazado, igual que un traspaso: una cuenta
  de crédito no recibe plata, se le paga su facturación.
- **Eliminar un instrumento con aportes registrados**: los movimientos de aporte y rescate ya
  ocurrieron y no se borran; el instrumento desaparece de la vista de inversiones y su valor
  declarado deja de sumar al patrimonio.
- **Declarar un valor con fecha anterior al último aporte**: se acepta y se muestra tal cual — la
  app no reordena ni corrige lo que el usuario afirma, pero la fecha visible deja claro que el
  valor es más viejo que el último movimiento.
- **Valor declarado en una moneda distinta a la de la cuenta que lo financia**: se registra en la
  moneda del instrumento y nunca se convierte; el patrimonio lo suma en su propia moneda.
- **Depósito con capital cero o negativo, o valor declarado negativo**: rechazados.
- **Renovar declarando un interés que deja el nuevo capital en cero o menos**: rechazado.

## Requirements _(mandatory)_

### Functional Requirements

#### Registro de instrumentos

- **FR-001**: El sistema MUST permitir registrar, editar y eliminar instrumentos de inversión de
  estos tipos: depósito a plazo, fondo mutuo, APV, acciones, ETF y cuenta de ahorro para la
  vivienda; cada uno con etiqueta, institución, moneda y fecha de apertura.
- **FR-002**: El sistema MUST mantener cada instrumento aislado por usuario: nadie ve ni modifica
  los instrumentos de otra persona.
- **FR-003**: El sistema MUST derivar el estado de cada instrumento (vigente, vencido, liquidado) y
  NEVER pedirle al usuario que lo mantenga a mano.

#### Depósito a plazo

- **FR-004**: Abrir un depósito a plazo MUST exigir capital, cuenta de origen, fecha de apertura y
  fecha de vencimiento posterior a la de apertura, y MUST descontar el capital del saldo de esa
  cuenta registrándolo como un movimiento verificable.
- **FR-005**: Abrir un depósito a plazo MUST dejar el patrimonio neto inalterado: la plata cambió
  de lugar, no desapareció.
- **FR-006**: El sistema MUST rechazar la apertura si la cuenta de origen no tiene saldo suficiente
  según las reglas que ya gobiernan sus movimientos.
- **FR-007**: El sistema MUST registrar la tasa anual del depósito como dato informativo y NEVER
  usarla para calcular intereses, montos finales ni proyecciones.
- **FR-008**: Liquidar un depósito MUST exigir el monto efectivamente recibido —declarado por el
  usuario— y la cuenta de destino, MUST subir el saldo de esa cuenta por ese monto mediante un
  movimiento verificable, y MUST dejar el instrumento como liquidado.
- **FR-009**: El sistema MUST aceptar liquidaciones por un monto menor al capital (rescate
  anticipado con castigo, o pérdida) y MUST reflejar la baja en el patrimonio.
- **FR-010**: Renovar un depósito vencido MUST ser una sola acción que lo deja liquidado y abre uno
  nuevo por capital más el interés declarado, con nueva fecha de vencimiento, y MUST NOT generar
  movimiento alguno en ninguna cuenta.
- **FR-011**: El sistema MUST impedir liquidar o renovar un depósito ya liquidado.

#### Instrumentos de valor variable

- **FR-012**: Aportar capital a un instrumento de valor variable MUST mover la plata desde una
  cuenta del usuario hacia la cuenta de inversión donde vive ese instrumento, y rescatar MUST
  hacer el camino inverso; ambos MUST quedar como movimientos verificables.
- **FR-013**: El sistema MUST calcular el capital aportado de un instrumento a partir de esos
  movimientos y NEVER pedirlo tecleado.
- **FR-014**: El sistema MUST permitir declarar cuánto vale hoy un instrumento de valor variable o
  una cuenta de ahorro para la vivienda, MUST registrar la fecha de esa declaración, y MUST
  mostrar siempre ambos juntos.
- **FR-015**: El sistema MUST NOT cotizar precios de mercado, convertir monedas, indexar a UF ni
  proyectar el valor declarado con el paso del tiempo.

#### Cuenta remunerada

- **FR-016**: El sistema MUST permitir declarar una tasa anual en una cuenta bancaria existente y
  MUST mostrarla entre las inversiones sin alterar su comportamiento como cuenta.
- **FR-017**: El saldo de una cuenta remunerada MUST contarse una sola vez en el patrimonio.

#### Patrimonio

- **FR-018**: El patrimonio neto MUST presentar por separado lo verificado por movimientos (saldos
  de cuentas) y lo declarado por el usuario, rotulando explícitamente el segundo.
- **FR-019**: La línea declarada MUST ser la suma, por instrumento, de valor declarado menos
  capital aportado, de modo que ningún monto se cuente dos veces; un instrumento sin valor
  declarado MUST aportar cero a esa línea.
- **FR-020**: Una cuenta de ahorro para la vivienda MUST aportar su monto declarado completo a esa
  línea, por no tener capital aportado registrado.
- **FR-021**: El patrimonio MUST agrupar por moneda y MUST NOT presentar ningún total que sume
  monedas distintas.
- **FR-022**: El patrimonio MUST seguir descontando la deuda como lo hace hoy; esta feature no
  cambia ese cálculo.

#### Vista

- **FR-023**: La vista de inversiones MUST permitir crear, editar y eliminar instrumentos, y MUST
  mostrar para cada uno su tipo, estado, monto relevante y —cuando corresponda— la fecha de su
  valor declarado o la de su vencimiento.
- **FR-024**: La vista MUST mostrar el total invertido agrupado por moneda, con la misma regla de
  no sumar monedas distintas.
- **FR-025**: Los formularios de valor declarado MUST rotular la moneda del instrumento y la fecha
  del valor, para que el usuario sepa en qué unidad está declarando.
- **FR-026**: Toda la interfaz de esta feature MUST existir en español e inglés.

### Key Entities

- **Instrumento de inversión**: lo que la persona tiene invertido. Atributos: tipo (depósito a
  plazo, fondo mutuo, APV, acciones, ETF, cuenta de ahorro vivienda), etiqueta, institución,
  moneda, fecha de apertura, estado derivado. Según el tipo, además: capital, tasa anual y fecha de
  vencimiento (depósito a plazo), o valor declarado con su fecha (los demás).
- **Cuenta de inversión**: la cuenta donde vive la plata de un instrumento. Es una cuenta como
  cualquier otra —tiene saldo y movimientos verificables— y su saldo es el capital aportado.
- **Aporte / rescate**: el movimiento que lleva plata desde una cuenta del usuario hacia la cuenta
  de inversión o de vuelta. No es un ingreso ni un gasto: es plata que cambia de lugar.
- **Liquidación**: el cierre de un depósito a plazo, con el monto realmente recibido declarado por
  el usuario y la cuenta que lo recibe.
- **Valor declarado**: cuánto afirma el usuario que vale hoy un instrumento, con la fecha en que lo
  afirmó. Nunca lo calcula ni lo actualiza el sistema.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un usuario registra un depósito a plazo y ve el saldo de su cuenta de origen
  actualizado en la misma pantalla, en menos de un minuto y sin salir del flujo.
- **SC-002**: En el 100% de los casos, abrir un depósito o aportar a un instrumento deja el
  patrimonio neto sin cambios: la operación mueve plata, no la crea ni la destruye.
- **SC-003**: El patrimonio neto es reproducible a mano: sumar los saldos de las cuentas y las
  diferencias declaradas da exactamente la cifra mostrada, sin residuos de redondeo.
- **SC-004**: El 100% de los montos declarados por el usuario se muestran acompañados de la fecha
  en que fueron declarados.
- **SC-005**: Renovar un depósito vencido toma una sola acción y produce cero movimientos en
  cuentas transaccionales.
- **SC-006**: Con instrumentos y cuentas en más de una moneda, la app no muestra ningún total que
  mezcle monedas.
- **SC-007**: Un usuario con un depósito a plazo y un fondo mutuo ve, en la vista de inversiones,
  el estado de ambos sin abrir ninguna otra pantalla.

## Assumptions

- La vista de inversiones existente (hoy una lista de solo lectura sin montos) se reemplaza por la
  de esta feature; no se mantiene una versión antigua en paralelo.
- Los instrumentos que hoy existen en la app como "cuenta remunerada" se reinterpretan según la
  historia 5 (una cuenta bancaria con tasa declarada); no se conserva el registro anterior como
  entidad separada. Al no haber datos productivos, no se requiere migración.
- El movimiento de aporte, rescate, apertura y liquidación reutiliza el mecanismo de traspaso entre
  cuentas propias que la app ya tiene, incluidas sus reglas (dos cuentas distintas, destino nunca
  una cuenta de crédito, sin tarjeta) y su exclusión de los agregados de ingreso/gasto.
- Un depósito a plazo no admite aportes ni rescates parciales: se abre por un capital y se cierra
  completo, que es como funciona el producto.
- La tasa anual se registra como dato informativo en todos los instrumentos que la tengan; su único
  uso es mostrarse.
- El seguimiento de precios de ETF por cotización en vivo, ya diferido en el proyecto, sigue
  diferido: un ETF se valoriza por valor declarado como cualquier otro instrumento variable.
- El usuario declara valores leyéndolos de la cartola de su institución; la app no tiene forma de
  verificarlos y no lo pretende.
