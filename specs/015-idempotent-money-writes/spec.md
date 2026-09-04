# Feature Specification: Reintentos y doble envío no pueden duplicar dinero

**Feature Branch**: `015-idempotent-money-writes`

**Created**: 2026-09-02

**Status**: Draft

**Input**: User description: "Reintentos y doble envío no pueden duplicar dinero. Hoy varias operaciones de escritura aplican su efecto una vez por cada llamada que llega, sin ninguna noción de que dos llamadas puedan ser el mismo intento del usuario. Un timeout de red que el cliente reintenta, un doble clic, o un archivo importado dos veces producen efectos duplicados sobre el dinero: un movimiento contado dos veces, un saldo y un cupo descontados dos veces, un plan de cuotas con su calendario duplicado y el cupo de la tarjeta comprometido al doble, un archivo importado entero por segunda vez, una cuota de deuda contada dos veces por un solo pago. El usuario debe poder reintentar cualquier operación sin riesgo. Si repite un intento que ya se aplicó, el resultado debe ser el mismo que obtuvo la primera vez, sin efecto adicional sobre su dinero. Si en cambio quiere registrar dos operaciones realmente distintas que se parecen (dos cafés iguales el mismo día en el mismo comercio), el sistema debe permitirlo sin fricción. Además hay operaciones que hoy no se pueden corregir. Un aporte a una meta de ahorro registrado por error queda para siempre: no hay forma de borrarlo ni de compensarlo. Toda operación que mueve dinero debe tener un camino de corrección. Fuera de alcance: cambiar el formato de los identificadores, y el rediseño de autenticación."

## El problema en una frase

La aplicación no tiene forma de distinguir **"el usuario quiere hacer esto de nuevo"** de **"el
usuario ya hizo esto y la respuesta se perdió en el camino"**. Hoy responde a las dos igual: aplica
el efecto otra vez.

Esto es la contracara exacta de un requisito que también debe cumplirse: **dos operaciones
genuinamente distintas que se parecen mucho tienen que poder registrarse sin fricción**. Cualquier
solución que resuelva la duplicación bloqueando "lo que se parece a algo que ya existe" rompe el
segundo requisito y es, por definición, incorrecta.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Reintentar el registro de un movimiento sin duplicarlo (Priority: P1)

El usuario registra un gasto. La conexión se corta y no llega respuesta: la pantalla queda cargando y
después falla. El usuario no sabe si se guardó. Vuelve a apretar "Guardar".

Hoy: quedan **dos** gastos idénticos, el saldo de la cuenta baja **dos veces**, y si fue con tarjeta
de crédito el cupo se consume **dos veces**. El usuario tiene que darse cuenta, encontrar el
duplicado y borrarlo — asumiendo que note la diferencia entre el saldo que la app muestra y el que
muestra el banco.

Con esta feature: el segundo intento no crea nada nuevo. El usuario ve el movimiento que ya se había
guardado, con su saldo correcto, y sigue trabajando.

El mismo escenario aplica a un **traspaso** entre dos cuentas propias, donde el efecto duplicado es
doble: dos cuentas con el saldo mal.

**Why this priority**: es la operación más frecuente de la aplicación y la que más veces por día
mueve dinero. Un saldo que el usuario no puede cuadrar contra su cartola es el defecto más caro que
puede tener una app de finanzas personales — le quita a la app su única razón de existir.

**Independent Test**: registrar un movimiento, forzar la pérdida de la respuesta, reintentar el mismo
intento, y verificar que existe exactamente un movimiento y que el saldo se movió una sola vez. Se
puede probar y entregar sin tocar ninguna otra operación.

**Acceptance Scenarios**:

1. **Given** un gasto de 12.000 en una cuenta con saldo 100.000, **When** el intento se envía dos
   veces por un reintento del cliente, **Then** existe un solo movimiento de 12.000 y el saldo queda
   en 88.000.
2. **Given** un gasto con tarjeta de crédito de 50.000 sobre un cupo de 500.000, **When** el intento
   se reintenta, **Then** el cupo consumido sube 50.000 una sola vez.
3. **Given** un reintento de un intento ya aplicado, **When** el usuario lo repite, **Then** recibe
   **el mismo resultado que la primera vez** (el mismo movimiento, no un error), sin efecto
   adicional.
4. **Given** un traspaso de 30.000 de la cuenta A a la B, **When** el intento se reintenta, **Then**
   existe un solo par de movimientos y cada saldo se movió una sola vez.
5. **Given** que el usuario compró **dos cafés iguales** el mismo día, en el mismo comercio, por el
   mismo monto, **When** los registra como dos operaciones separadas, **Then** ambos se guardan y el
   saldo baja dos veces — **sin advertencia, sin confirmación extra y sin ningún paso adicional**.
6. **Given** un primer intento que fue rechazado por una regla de negocio (cupo excedido, saldo
   prepago insuficiente), **When** el usuario corrige el dato y reintenta, **Then** el intento se
   evalúa de nuevo y puede tener éxito — un intento fallido no bloquea al usuario.

---

### User Story 2 - Un doble clic no cobra dos veces (Priority: P1)

El usuario aprieta un botón que mueve dinero y, porque la app tarda en responder, lo aprieta de
nuevo.

Hoy hay tres casos con daño real y distinto:

- **Registrar el pago de una cuota de deuda**: el contador de cuotas pagadas sube **dos veces**. Una
  sola transferencia queda contada como dos cuotas, y la deuda muestra menos de lo que se debe.
- **Crear un plan de cuotas con tarjeta de crédito**: se crean **dos planes**, cada uno con su
  calendario completo, y el cupo de la tarjeta queda comprometido **al doble** — el efecto más grande
  que un solo clic de más puede producir en esta app.
- **Marcar una deuda como liquidada**: cada clic vuelve a estampar la fecha de liquidación, así que
  la fecha que queda registrada es la del último clic, no la del día en que realmente se liquidó.

Con esta feature: el segundo clic no tiene efecto adicional en ninguno de los tres.

**Why this priority**: no requiere una falla de red ni nada excepcional — basta con que la app tarde
medio segundo y el usuario tenga prisa. Es el escenario más probable de todos, y el del plan de
cuotas es el de mayor monto.

**Independent Test**: enviar dos veces cada una de las tres operaciones y verificar que el contador
de cuotas subió uno, que existe un solo plan con un solo calendario y el cupo consumido una sola vez,
y que la fecha de liquidación no se movió.

**Acceptance Scenarios**:

1. **Given** una deuda de 12 cuotas con 3 pagadas, **When** el usuario registra un pago haciendo
   doble clic, **Then** quedan 4 cuotas pagadas, no 5.
2. **Given** un plan de 500.000 en 10 cuotas con tarjeta de crédito, **When** el formulario se envía
   dos veces, **Then** existe un solo plan, un solo calendario de 10 cuotas y el cupo comprometido es
   500.000, no 1.000.000.
3. **Given** una deuda liquidada el 3 de septiembre, **When** el botón de liquidar se aprieta de
   nuevo el 10 de septiembre, **Then** la fecha de liquidación sigue siendo el 3 de septiembre.
4. **Given** cualquiera de las tres operaciones ya aplicada, **When** se repite el intento, **Then**
   el usuario recibe el mismo resultado que la primera vez, no un error de "ya existe".

---

### User Story 3 - Corregir un aporte a una meta de ahorro registrado por error (Priority: P2)

El usuario registra un aporte de 200.000 a su meta "Viaje" y se da cuenta de que fue a la meta
equivocada, o que se equivocó en el monto.

Hoy: **no hay ninguna salida**. El aporte no se puede editar, no se puede eliminar y no se puede
compensar. Queda en la lista de aportes para siempre. Es la única operación de la app que registra
dinero y no tiene camino de vuelta: todas las demás se pueden editar o borrar.

Con esta feature: el usuario puede editarlo o eliminarlo, igual que cualquier movimiento.

**Why this priority**: el daño es permanente y no tiene ningún workaround, lo que la hace peor que
una duplicación (que al menos se puede borrar). Va en P2 y no en P1 porque afecta a una vista
secundaria y no descuadra el saldo de ninguna cuenta.

**Independent Test**: registrar un aporte, editarlo, eliminarlo, y verificar que la lista de aportes
refleja cada cambio. No depende de ninguna de las otras historias.

**Acceptance Scenarios**:

1. **Given** un aporte de 200.000 registrado por error, **When** el usuario lo elimina, **Then**
   desaparece de la lista de aportes y de cualquier cifra derivada de ella.
2. **Given** un aporte con el monto equivocado, **When** el usuario lo edita, **Then** la lista
   refleja el monto corregido.
3. **Given** un aporte asociado a la meta equivocada, **When** el usuario lo edita, **Then** queda
   asociado a la meta correcta.
4. **Given** cualquier operación de la aplicación que registre dinero, **When** el usuario la revisa,
   **Then** existe un camino para corregirla o revertirla.

---

### Edge Cases

- **Dos envíos simultáneos del mismo intento** (el usuario hace doble clic tan rápido que el segundo
  llega antes de que el primero termine): sólo uno puede aplicar el efecto. El otro espera y devuelve
  el mismo resultado, o falla de una forma que el usuario pueda reintentar sin riesgo — nunca aplica
  un segundo efecto.
- **Un reintento con la misma identidad pero datos distintos** (el usuario edita el monto y vuelve a
  enviar sin que la app genere un intento nuevo): es una contradicción y el sistema la rechaza con un
  error claro, en vez de aplicar silenciosamente uno de los dos montos.
- **Un reintento después de la ventana de retención**: el sistema ya no recuerda el intento original y
  lo trata como nuevo. Esto puede duplicar, y por eso la ventana debe ser mucho más larga que
  cualquier reintento plausible de un cliente.
- **El primer intento falló por una regla de negocio** (cupo excedido): no se recuerda como aplicado,
  así que el usuario puede corregir y reintentar. Un intento rechazado no puede dejar al usuario
  trabado.
- **Reintento de una operación que el usuario ya eliminó** desde otra pestaña mientras tanto: la
  eliminación posterior gana; el reintento no resucita la operación borrada.
- **El reintento silencioso que la app ya hace hoy**: ante un `401` el cliente renueva la sesión y
  **vuelve a enviar la petición original**, incluida una que crea un movimiento. Es un camino de
  duplicación que existe hoy, dentro de la propia aplicación y sin que el usuario haga nada, y queda
  cubierto por esta feature como cualquier otro reintento.
- **El usuario recarga la página en medio de un envío**: pierde toda noción de qué mandó. Si vuelve a
  cargar el formulario y lo envía, es un intento NUEVO, no un reintento — y va a duplicar. Está
  fuera de lo que esta feature puede evitar sin persistir borradores, y se documenta como límite.

## Requirements _(mandatory)_

### Functional Requirements

**Distinguir un reintento de una operación nueva**

- **FR-001**: El sistema MUST poder identificar que dos envíos corresponden al **mismo intento** del
  usuario, sin depender de que los datos de la operación sean distintos.
- **FR-002**: El sistema MUST NOT tratar dos operaciones como la misma sólo porque sus datos
  coincidan. Dos operaciones genuinamente distintas con idéntico monto, fecha, cuenta, categoría y
  descripción MUST poder registrarse ambas, sin advertencia, sin confirmación adicional y sin ningún
  paso extra para el usuario.
- **FR-003**: Cuando un intento ya aplicado se repite, el sistema MUST devolver **el mismo resultado
  que devolvió la primera vez** y MUST NOT producir ningún efecto adicional sobre saldos, cupos,
  calendarios de cuotas, contadores de cuotas pagadas ni fechas de liquidación.
- **FR-004**: Un intento que fue **rechazado** MUST NOT quedar registrado como aplicado: el usuario
  MUST poder corregir los datos y volver a intentar.
- **FR-005**: Cuando llega un reintento cuya identidad coincide con un intento previo pero cuyos datos
  difieren, el sistema MUST rechazarlo con un error explícito y MUST NOT aplicar ninguno de los dos
  conjuntos de datos como si fuera el otro.
- **FR-006**: Dos envíos simultáneos del mismo intento MUST producir el efecto exactamente una vez,
  aun cuando el segundo llegue antes de que el primero haya terminado.
- **FR-007**: La protección MUST ser transparente para el usuario: MUST NOT requerir que entienda,
  configure ni vea el mecanismo. Un reintento exitoso se ve **exactamente** como una operación
  exitosa — misma pantalla, mismo mensaje, sin marca de "esto ya lo habías hecho".

**Alcance de las operaciones protegidas**

- **FR-008**: MUST estar protegidas: registrar un movimiento, registrar un traspaso, crear un plan de
  cuotas, pagar una cuota de un plan, registrar el pago de una cuota de deuda, deshacer ese pago,
  marcar una deuda como liquidada y revertirla, registrar un aporte a una meta de ahorro, y **pagar
  una facturación de crédito** — ésta última pese a rechazar ya el reintento por su máquina de
  estados, porque esa guarda lee el estado ANTES de abrir la transacción y por lo tanto no protege
  contra dos envíos simultáneos (FR-006).
- **FR-009**: Las operaciones que ya son seguras ante reintento por su naturaleza (editar, eliminar,
  reordenar) MUST seguir siéndolo y MUST NOT requerir el mecanismo nuevo.
- **FR-010**: Las operaciones de creación que **no** mueven dinero (crear una cuenta, una tarjeta,
  una meta de ahorro, un gasto recurrente) quedan **fuera del alcance**: un duplicado ahí es visible
  en la lista y se elimina en un clic, sin descuadrar ningún saldo. Quedan registradas como
  excepción declarada, no como olvido.

**Camino de corrección**

- **FR-011**: Toda operación que registra dinero MUST tener un camino de corrección.
- **FR-012**: Un aporte a una meta de ahorro MUST poder **editarse y eliminarse**, igual que un
  movimiento cualquiera. La corrección MUST hacer desaparecer o cambiar el aporte — **no** registra
  un aporte compensatorio: acá no hay ninguna contraparte externa contra la cual cuadrar el
  historial, así que dejar el error visible sería ruido, no trazabilidad.
- **FR-013**: Toda cifra derivada de la lista de aportes MUST reflejar la corrección de inmediato.
  Nota de alcance: hoy **ninguna** lo es — la meta no expone progreso acumulado ni ninguna otra cifra
  derivada de sus aportes (ver Assumptions). El requisito queda escrito para que cualquier cifra que
  se derive en el futuro nazca cumpliéndolo, no como trabajo de esta feature.
- **FR-014**: Una corrección MUST NOT poder dejar una cifra en un estado imposible (un contador de
  cuotas pagadas por debajo de cero o por encima del total del plan).

**Integridad del efecto**

- **FR-015**: Cada operación protegida MUST aplicar su efecto completo o ninguna parte de él. Una
  operación interrumpida a la mitad MUST NOT dejar un movimiento sin su ajuste de saldo, ni un plan
  sin su calendario, ni un intento marcado como aplicado sin su efecto.
- **FR-016**: El sistema MUST recordar un intento durante una ventana suficientemente larga como para
  cubrir cualquier reintento plausible de un cliente, y MUST poder olvidar los intentos vencidos sin
  degradarse con el tiempo.

### Key Entities

- **Intento de operación**: la noción, hoy inexistente, de que una acción del usuario es _una sola_
  aunque llegue varias veces. Lo identifica el cliente que la origina, no el contenido de la
  operación — que es lo que permite distinguir un reintento de dos cafés iguales. Guarda con qué
  resultado terminó, para poder devolverlo idéntico, y deja de recordarse pasada su ventana de
  retención.
- **Resultado registrado de un intento**: lo que la operación devolvió la primera vez. Es lo que hace
  que un reintento sea indistinguible del original desde el punto de vista del usuario, en vez de un
  error de "ya existe" que lo obligaría a averiguar qué pasó.
- **Aporte a una meta de ahorro**: hoy **sólo se puede crear** — no existe forma de leerlo
  individualmente, editarlo ni eliminarlo. Necesita las tres.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Reintentar cualquier operación que mueve dinero, cualquier cantidad de veces, produce
  el efecto **exactamente una vez** — verificable en el saldo de la cuenta, el cupo consumido, el
  contador de cuotas pagadas y el calendario del plan.
- **SC-002**: El 100% de las operaciones que mueven dinero quedan protegidas ante reintento; ninguna
  queda como excepción no declarada.
- **SC-003**: Registrar dos operaciones genuinamente distintas pero idénticas en sus datos no requiere
  **ningún paso adicional** respecto de hoy: la misma cantidad de clics, sin diálogos de confirmación
  ni advertencias nuevas.
- **SC-004**: El reintento silencioso que la propia aplicación hace tras renovar una sesión vencida
  deja de poder duplicar un movimiento.
- **SC-005**: Un usuario puede corregir cualquier operación que registró dinero sin ayuda externa y
  sin editar datos a mano por fuera de la aplicación.
- **SC-006**: El saldo que muestra la aplicación coincide con el que resulta de sumar sus movimientos,
  después de cualquier secuencia de reintentos y dobles clics.
- **SC-007**: Dos envíos simultáneos del mismo intento aplican el efecto una vez, verificado bajo
  ejecución concurrente y no sólo secuencial.

## Assumptions

- **Un solo usuario por dato.** La aplicación es de finanzas personales: no hay operaciones
  compartidas entre usuarios ni un segundo actor que pueda enviar el mismo intento. Todo lo de arriba
  se evalúa dentro de los datos de un mismo usuario.
- **La identidad del intento la genera el cliente.** Es la única forma de satisfacer FR-001 y FR-002 a
  la vez: cualquier identidad derivada del contenido de la operación tratará dos cafés iguales como
  un duplicado. Es también lo que el principio VII de la constitución llama la forma (c).
- **Ventana de retención de 24 horas** para recordar un intento, siguiendo la práctica habitual de la
  industria para este tipo de protección. Cubre con holgura cualquier reintento razonable de un
  cliente. Ajustable si el diseño encuentra un motivo.
- **El comportamiento hoy correcto no se toca.** Las operaciones que ya son seguras ante reintento
  —editar, eliminar, reordenar— siguen como están. El pago de una facturación de crédito es el caso
  intermedio: su máquina de estados rechaza el reintento _posterior_, pero lee el estado antes de
  abrir la transacción, así que dos envíos simultáneos pasan ambos. Se protege igual.
- **Sin cambios en la experiencia visible**, salvo el camino de corrección de aportes.
- **El progreso de una meta de ahorro no existe hoy y esta feature no lo construye.** Verificado en
  código: `SavingsGoal` no tiene columna de monto acumulado, el agregado nunca lee sus aportes, el
  repositorio no hace `include` ni `sum`, el contrato no expone progreso, y la vista de Ahorros es una
  lista de solo lectura de títulos y montos objetivo. Por eso FR-013 está escrito como regla para
  cifras futuras y no como trabajo entregable acá: construir el progreso y su UI es una spec propia.
- **La aplicación ya reintenta escrituras hoy, silenciosamente.** Ante un `401` el cliente renueva la
  sesión y **vuelve a enviar la petición original**, incluida una que crea un movimiento. Nadie lo
  había identificado como camino de duplicación; queda cubierto por esta feature.
- **Esta feature implementa el principio VII** (Idempotencia de escrituras) de la constitución
  v2.0.0, que exige que toda escritura sea segura ante reintento por una de tres formas declaradas, y
  que las que mueven dinero usen llave natural con restricción de unicidad o identidad de request del
  cliente. Cierra las entradas 4 y —parcialmente— 3 de la sección "Deuda de conformidad" de
  `docs/PENDING.md`.

## Out of Scope

- **Cambiar el formato de los identificadores** de fila (entradas 1 y 2 de la deuda de conformidad).
  Esta feature funciona con el formato que hay.
- **Proteger las creaciones que no mueven dinero** (cuenta, tarjeta, meta de ahorro, gasto
  recurrente). Un duplicado ahí se ve en la lista y se borra en un clic. Es una excepción declarada
  al principio VII, que habla de toda escritura HTTP: si más adelante se decide cerrarla, es una
  extensión del mismo mecanismo, no un rediseño.
- **La importación de movimientos, entera.** Se sacó del alcance después de verificar que
  `POST /import/transactions` **no tiene ningún cliente**: la ruta web es un placeholder ("carga de
  archivo próximamente"), no existe componente ni hook, y no hay una sola llamada en `apps/web`.
  Tampoco aplica deltas de saldo ni de cupo, así que una importación duplicada no descuadra ninguna
  cifra — sólo repite filas de un endpoint que nadie invoca. Además, deduplicar por fila exige una
  columna de procedencia que `Transaction` no tiene y un diseño de identidad por fila que soporte
  "dos filas iguales entran ambas": es una feature propia, y debería diseñarse junto con la subida de
  archivo real cuando ésta exista.
- **El progreso de las metas de ahorro y la UI de Ahorros.** No existe nada de eso hoy; construirlo es
  una spec aparte. Acá sólo se agrega el camino de corrección de un aporte.
- **Persistir el formulario en curso.** Si el usuario recarga la página en medio de un envío, pierde
  la identidad del intento y un reenvío será un intento nuevo. Evitarlo exige persistir borradores,
  que es un problema de experiencia distinto.
- **Rediseño de autenticación.** La identidad del usuario y el manejo de sesión quedan como están.
- **Verificación de propiedad de las referencias que llegan en el cuerpo de un request** (entrada 3
  de la deuda de conformidad, principio II). Es un problema de aislamiento, no de duplicación, y
  merece su propia spec — aunque toca varias de las mismas operaciones.
- **Firma del cursor de paginación** y **claves opacas de almacenamiento de archivos** (entradas 5 y
  6 de la deuda de conformidad). Sin relación con reintentos.
- **Reintento automático desde el cliente.** Esta feature hace que reintentar sea _seguro_; que la
  aplicación reintente sola es una decisión de experiencia aparte.
- **Detección de duplicados que el usuario creó a propósito y después lamenta.** Esto no es
  deduplicación de intención: dos movimientos iguales creados en dos intentos distintos son dos
  movimientos, y borrarlos es lo que ya existe.
