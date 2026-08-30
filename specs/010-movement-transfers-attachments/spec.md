# Feature Specification: Movimientos — traspasos, comprobantes y paneles rediseñados

**Feature Branch**: `010-movement-transfers-attachments`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Rediseñar el panel de detalle de movimiento y el de crear/editar al formato del handoff (panel derecho, monto grande, filas etiqueta/valor, acciones al pie). Backend nuevo: traspaso entre cuentas propias y comprobantes adjuntos. Frontend: navegación ‹ › entre movimientos, Duplicar, Saldo tras el movimiento / proyectado, y Guardar y crear otro. Fuera de alcance: crear recurrente desde el formulario y presupuestos por categoría."

## Clarifications

### Session 2026-08-11

- Q: ¿Un traspaso puede tener como destino una cuenta de crédito (pagar la tarjeta)? → A: No — se
  prohíbe; pagar una tarjeta se sigue haciendo desde Facturación, para no tener dos caminos que
  ajusten el cupo de forma distinta.
- Q: ¿El lado de salida de un traspaso puede ir contra una tarjeta de crédito? → A: No — un traspaso
  sale siempre del saldo de la cuenta y nunca lleva tarjeta.
- Q: ¿Cómo se edita un traspaso cuando cambia una de sus cuentas? → A: Se edita el par completo —
  el formulario muestra origen y destino y guarda ambos lados a la vez.
- Q: Al eliminar un movimiento con adjuntos, ¿qué pasa con los archivos? → A: Borrado real
  inmediato en el almacenamiento; si el borrado remoto falla, el movimiento igual se elimina y el
  fallo queda registrado.
- Q: ¿Hasta dónde llega la navegación ‹ › con un listado paginado? → A: Continúa más allá de lo
  cargado pidiendo la página siguiente, y el contador usa el total del conjunto filtrado.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Leer un movimiento sin salir del listado (Priority: P1)

Quien revisa sus movimientos hace clic en una fila y ve, en un panel lateral, todo lo que ese
movimiento sabe de sí mismo: monto en grande, fecha, categoría, cuenta y cómo quedó el saldo
después de él. Desde ahí puede recorrer los movimientos vecinos con ‹ ›, sin cerrar y volver a
abrir el panel una vez por fila; y puede editar, duplicar o eliminar el que está mirando.

**Why this priority**: Es la vista más usada del producto y no depende de ninguna capacidad nueva
del sistema — se puede entregar sola y ya mejora el uso diario.

**Independent Test**: Abrir un movimiento desde el listado y desde el detalle de una cuenta,
recorrer varios con ‹ ›, y duplicar uno comprobando que el formulario de creación —el que exista en
ese momento, rediseñado o no— llega con los datos copiados. Esta historia no depende del rediseño
del formulario (US2).

**Acceptance Scenarios**:

1. **Given** un listado con al menos 3 movimientos, **When** se abre el segundo, **Then** el panel
   indica que es el 2 de N y ofrece ir al anterior y al siguiente.
2. **Given** el panel abierto en el último movimiento cargado y un conjunto con más resultados,
   **When** se pide el siguiente, **Then** se carga la continuación y el panel avanza; solo al
   llegar al último del conjunto la acción queda deshabilitada.
3. **Given** un movimiento con emisor, receptor, lugar y observación vacíos, **When** se abre su
   panel, **Then** el bloque de detalles lo dice en una frase y ofrece agregarlos, en vez de
   mostrar cuatro filas con guiones.
4. **Given** un movimiento cualquiera, **When** se pulsa Duplicar, **Then** se abre el formulario
   de creación con los mismos datos y la fecha de hoy, y guardar crea un movimiento nuevo sin
   alterar el original.
5. **Given** un movimiento con cuenta asociada, **When** se abre su panel, **Then** se muestra el
   saldo de esa cuenta resultante de ese movimiento.

---

### User Story 2 - Registrar un movimiento en el formato nuevo (Priority: P1)

Quien registra un gasto o un ingreso escribe el monto como protagonista de la pantalla, la
descripción como título, y completa el resto en filas compactas. Antes de guardar ve cómo quedaría
el saldo de la cuenta elegida. Si va a cargar varios seguidos, guarda y sigue en el mismo panel.

**Why this priority**: Es la otra mitad del rediseño y la acción que más se repite; tampoco
depende de capacidades nuevas.

**Independent Test**: Crear un gasto y un ingreso desde el listado general y desde una cuenta,
usando "Guardar y crear otro" al menos una vez; editar un movimiento existente.

**Acceptance Scenarios**:

1. **Given** el formulario abierto sin cuenta elegida, **When** se elige una, **Then** la moneda
   pasa a ser la de esa cuenta y aparece el saldo proyectado.
2. **Given** un monto y una cuenta válidos, **When** se pulsa "Guardar y crear otro", **Then** el
   movimiento queda creado, el panel sigue abierto y vacío, y conserva la cuenta y la fecha
   elegidas.
3. **Given** un movimiento existente, **When** se abre para editar, **Then** el panel llega con sus
   datos y avisa si hay cambios sin guardar.
4. **Given** un gasto sobre una cuenta que exige tarjeta, **When** no se elige ninguna, **Then** no
   se puede guardar y se explica por qué.

---

### User Story 3 - Traspasar dinero entre cuentas propias (Priority: P2)

Quien mueve dinero de una cuenta a otra lo registra como un traspaso: elige cuenta de origen y de
destino e indica cuánto sale y cuánto entra. El sistema deja constancia en ambas cuentas y ajusta
los dos saldos. En los listados, un traspaso se reconoce a simple vista y no se confunde con un
gasto ni con un ingreso.

**Why this priority**: Capacidad nueva de negocio; hoy el usuario tiene que falsear un traspaso
como un gasto y un ingreso sueltos, lo que distorsiona sus totales por categoría.

**Independent Test**: Crear un traspaso entre dos cuentas, verificar ambos saldos y ambos
listados, editarlo desde cualquiera de los dos lados y eliminarlo.

**Acceptance Scenarios**:

1. **Given** dos cuentas activas, **When** se registra un traspaso de una a otra, **Then** la
   cuenta de origen baja por el monto que sale y la de destino sube por el monto que entra.
2. **Given** un traspaso registrado, **When** se mira el listado de cualquiera de las dos cuentas,
   **Then** aparece su lado del traspaso, señalado como traspaso e indicando la otra cuenta.
3. **Given** un traspaso registrado, **When** se abre para editar desde cualquiera de sus dos lados,
   **Then** el formulario muestra origen, destino y ambos montos, y guardar deja coherentes todos
   los saldos implicados, incluida una tercera cuenta si se cambió el origen o el destino.
4. **Given** un traspaso registrado, **When** se elimina cualquiera de sus dos lados, **Then**
   desaparece el par completo y ambos saldos vuelven a su estado previo.
5. **Given** un traspaso entre cuentas de distinta moneda, **When** se registra, **Then** el
   sistema acepta el monto de salida y el de entrada tal como los escribió la persona, sin
   convertir ni cuestionar la relación entre ambos.
6. **Given** un traspaso, **When** se calculan los totales por categoría y los indicadores de
   ingresos/gastos, **Then** el traspaso no se cuenta como ingreso ni como gasto.
7. **Given** una sola cuenta elegida como origen, **When** se busca el destino, **Then** esa misma
   cuenta no se ofrece.
8. **Given** el selector de cuenta destino, **When** se despliega, **Then** no ofrece cuentas de
   línea de crédito, porque pagar una tarjeta se hace desde Facturación.
9. **Given** un traspaso, **When** se guarda, **Then** ningún cupo de crédito ni período de
   facturación cambia, y ninguno de sus dos lados lleva tarjeta asociada.

---

### User Story 4 - Guardar el comprobante de un movimiento (Priority: P3)

Quien quiere respaldar un movimiento adjunta su comprobante (una foto o un PDF), lo ve listado en
el panel del movimiento, lo abre cuando lo necesita y lo borra si se equivocó.

**Why this priority**: Valor claro pero independiente del resto; además depende de un
almacenamiento externo que todavía no existe, así que no puede bloquear a las demás historias.

**Independent Test**: Con el almacenamiento configurado, subir dos comprobantes a un movimiento,
abrirlos, borrar uno; sin configurar, comprobar que el intento falla con un mensaje entendible.

**Acceptance Scenarios**:

1. **Given** un movimiento abierto, **When** se sube una imagen o un PDF de hasta 5 MB, **Then**
   queda listado como adjunto de ese movimiento.
2. **Given** un adjunto listado, **When** se pide abrirlo, **Then** se muestra el archivo original.
3. **Given** un adjunto listado, **When** se borra, **Then** desaparece de la lista y deja de ser
   accesible.
4. **Given** un archivo de tipo no admitido o mayor a 5 MB, **When** se intenta subir, **Then** se
   rechaza indicando el motivo y no queda nada a medias.
   4b. **Given** un movimiento que se está creando y un comprobante ya elegido, **When** se guarda,
   **Then** el movimiento se crea y a continuación se sube el comprobante; si esa subida falla, el
   movimiento queda creado y el comprobante se muestra en estado de error con opción de reintentar.
5. **Given** el almacenamiento sin configurar, **When** se intenta subir, **Then** falla con un
   mensaje claro y el resto del panel sigue funcionando.
6. **Given** un movimiento con adjuntos, **When** se elimina el movimiento, **Then** sus adjuntos
   dejan de ser accesibles.
7. **Given** un adjunto de otra persona, **When** se intenta abrirlo o borrarlo, **Then** el
   sistema lo niega.

### Edge Cases

- Traspaso DESDE una cuenta de línea de crédito (permitido: sale de su saldo, sin tarjeta); hacia
  una línea de crédito está prohibido (FR-019a).
- Traspaso cuyo origen o destino queda inactivo, o se elimina, después de registrado.
- Traspaso creado desde el panel de una cuenta concreta: esa cuenta es el origen por defecto.
- Cambiar un movimiento existente de gasto/ingreso a traspaso, o de traspaso a gasto/ingreso.
- Navegación ‹ › cuando el listado tiene filtros aplicados o cuando el movimiento actual se elimina
  o se edita hasta dejar de cumplir el filtro.
- Saldo proyectado cuando la cuenta elegida no tiene saldo (línea de crédito) o cuando se edita un
  movimiento ya contabilizado.
- Duplicar un traspaso.
- Subir dos archivos con el mismo nombre al mismo movimiento.
- Cerrar el panel mientras una subida está en curso.

## Requirements _(mandatory)_

### Functional Requirements

**Panel de detalle**

- **FR-001**: El detalle de un movimiento MUST presentarse como panel lateral con el monto y su
  moneda como elemento principal, el signo según el tipo, y la fecha, categoría y cuenta como
  subtítulo.
- **FR-002**: El detalle MUST mostrar filas de categoría, cuenta y, cuando la cuenta lleva saldo,
  el saldo resultante de ese movimiento; y la tarjeta usada cuando exista.
- **FR-003**: El detalle MUST mostrar los detalles opcionales (emisor, receptor, lugar,
  observación) y, cuando los cuatro están vacíos, sustituirlos por una sola frase con acceso a
  completarlos.
- **FR-004**: El detalle MUST permitir moverse al movimiento anterior y al siguiente dentro del
  mismo conjunto (mismos filtros y orden) desde el que se abrió, indicando la posición y el total
  del conjunto filtrado completo, y deshabilitando la dirección que no tiene destino.
- **FR-004a**: Cuando avanzar sale de lo ya cargado y el conjunto tiene más resultados, el sistema
  MUST cargar la continuación y seguir la navegación; solo al agotarse el conjunto la dirección
  queda deshabilitada.
- **FR-005**: El detalle MUST ofrecer eliminar, duplicar y editar. Duplicar abre la creación con
  los datos del movimiento y la fecha actual, sin modificar el original.
- **FR-006**: Eliminar desde el detalle MUST pedir confirmación antes de borrar.

**Formulario**

- **FR-007**: El formulario de crear/editar MUST usar el mismo panel lateral, con la descripción
  como título editable, el monto en grande con su moneda y un selector de tipo Gasto / Ingreso /
  Traspaso.
- **FR-008**: El formulario MUST presentar fecha, categoría, cuenta y tarjeta como filas
  etiqueta/valor, y los detalles opcionales agrupados aparte.
- **FR-009**: El formulario MUST mostrar el saldo que tendría la cuenta si se guarda lo que hay en
  pantalla, actualizándose al cambiar monto, tipo o cuenta, y omitiéndolo cuando la cuenta no lleva
  saldo.
- **FR-010**: El formulario MUST ofrecer "Guardar y crear otro": guarda y deja el panel abierto y
  limpio, conservando cuenta y fecha; disponible solo al crear, no al editar.
- **FR-011**: El formulario MUST seguir respetando las reglas vigentes de tarjeta (obligatoria en
  gasto de línea de crédito, prohibida en ingreso y en efectivo) y de cupo.
- **FR-012**: Al editar, el formulario MUST advertir que hay cambios sin guardar.

**Traspasos**

- **FR-013**: El sistema MUST permitir registrar un traspaso entre dos cuentas distintas del mismo
  usuario, con un monto de salida y un monto de entrada indicados por la persona.
- **FR-014**: Un traspaso MUST quedar registrado como dos movimientos ligados entre sí — uno de
  salida en la cuenta de origen y uno de entrada en la de destino — de modo que cada cuenta lo vea
  en su propio listado y ambos saldos se mantengan al día.
- **FR-015**: Abrir cualquiera de los dos lados de un traspaso para editar MUST presentar el
  traspaso completo (origen, destino y ambos montos) y guardar MUST aplicar el cambio a los dos
  lados a la vez, dejando coherentes todos los saldos implicados — incluida una tercera cuenta si
  el origen o el destino cambió. Eliminar cualquiera de los dos lados MUST eliminar el par completo.
- **FR-016**: Un traspaso MUST distinguirse visualmente de un gasto y de un ingreso, e indicar la
  cuenta del otro lado.
- **FR-017**: Un traspaso MUST NOT contarse como ingreso ni como gasto en los totales, indicadores
  y agrupaciones por categoría.
- **FR-018**: El sistema MUST rechazar un traspaso cuyo origen y destino sean la misma cuenta, o
  cuya contraparte no pertenezca al usuario.
- **FR-019**: Un traspaso MUST NOT consumir ni liberar cupo de crédito, ni afectar ningún período de
  facturación: sus dos lados salen y entran al saldo de las cuentas y nunca llevan tarjeta asociada.
- **FR-019a**: El sistema MUST rechazar un traspaso cuyo destino sea una cuenta de línea de crédito,
  y el selector de destino MUST NOT ofrecer ese tipo de cuenta. Pagar una tarjeta sigue siendo
  competencia exclusiva de Facturación.
- **FR-020**: Los lados de un traspaso MUST poder tener monedas distintas sin que el sistema
  convierta entre ellas ni valide la proporción.

**Adjuntos**

- **FR-021**: El sistema MUST permitir asociar varios comprobantes a un movimiento, listarlos,
  abrirlos y eliminarlos individualmente.
- **FR-021a**: Un comprobante elegido MIENTRAS se crea un movimiento MUST subirse automáticamente en
  cuanto el movimiento existe. Si esa subida falla, el movimiento MUST quedar creado igualmente y el
  comprobante MUST quedar visible en estado de error con la opción de reintentar.
- **FR-022**: El sistema MUST aceptar únicamente imágenes (JPEG, PNG, WebP) y PDF, de hasta 5 MB
  cada uno, rechazando lo demás con un motivo entendible y sin dejar registros a medias.
- **FR-023**: Los archivos MUST guardarse en un almacenamiento de objetos externo, y cada archivo
  MUST ser accesible solo por la persona dueña del movimiento.
- **FR-024**: Mientras el almacenamiento no esté configurado, la sección de adjuntos MUST seguir
  visible y cualquier intento de subir MUST fallar con un mensaje claro, sin afectar al resto del
  panel.
- **FR-025**: Al eliminar un movimiento o un adjunto, el archivo MUST eliminarse también del
  almacenamiento en la misma operación. Si esa eliminación remota falla, el movimiento igual se
  elimina y el fallo queda registrado para revisión, en vez de bloquear el borrado.

**Transversal**

- **FR-026**: Todo texto nuevo MUST existir en español e inglés.
- **FR-027**: Ambos paneles MUST ser usables en teléfono, tablet y escritorio, siguiendo el
  comportamiento de superficies ya establecido en el producto.

### Key Entities

- **Movimiento**: lo ya existente (tipo, monto, moneda, fecha, cuenta, tarjeta, categoría,
  descripción, detalles opcionales), más su pertenencia a un traspaso cuando corresponde.
- **Traspaso**: el vínculo entre los dos movimientos que forman una misma transferencia; permite
  tratarlos como una unidad al editar, eliminar y presentar.
- **Adjunto**: un archivo asociado a un movimiento — nombre original, tipo, tamaño, momento de
  subida y su ubicación en el almacenamiento.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Registrar un gasto corriente toma como máximo 4 interacciones (monto, categoría,
  cuenta, guardar) y menos de 30 segundos.
- **SC-002**: Revisar 5 movimientos seguidos ya no exige abrir y cerrar el panel 5 veces: 1 apertura
  y 4 avances.
- **SC-003**: Un traspaso queda reflejado en las dos cuentas y en sus dos saldos inmediatamente
  después de guardarlo, sin ninguna acción adicional.
- **SC-004**: Los totales de ingresos y gastos de un período no cambian al registrar un traspaso.
- **SC-005**: Un comprobante subido queda listado y se puede abrir dentro de los 5 segundos
  siguientes.
- **SC-006**: Cargar 5 gastos seguidos con "Guardar y crear otro" no requiere reabrir el panel ni
  volver a elegir la cuenta.
- **SC-007**: Cada texto nuevo existe en ambos idiomas, sin claves faltantes en ninguno.

## Assumptions

- El conjunto que recorre ‹ › es el del listado con sus filtros y orden actuales; el total mostrado
  es el del conjunto filtrado completo, no el de lo ya cargado (FR-004a).
- "Saldo tras el movimiento" y "saldo proyectado" se calculan a partir del saldo actual de la
  cuenta y de los movimientos conocidos; son informativos y solo aplican a cuentas que llevan
  saldo (no a una línea de crédito, que lleva cupo).
- Duplicar copia todos los campos del movimiento salvo la fecha, que pasa a ser hoy.
- Un traspaso se registra entre cuentas del propio usuario; no existe traspaso hacia terceros.
- Un traspaso es un movimiento de saldo puro: nunca lleva tarjeta, nunca toca cupo ni facturación,
  y su destino no puede ser una línea de crédito. Pagar una tarjeta sigue siendo Facturación.
- Un traspaso se edita y se elimina como unidad; no existe editar "solo mi lado".
- La categoría es opcional en un traspaso y no participa de las agrupaciones por categoría.
- El almacenamiento de objetos aún no existe: sus credenciales se declararán como configuración y
  la funcionalidad quedará inerte hasta que se provean.
- Se mantiene la regla vigente de un movimiento por cuenta: el traspaso no introduce un movimiento
  "sin cuenta".
- Quedan explícitamente fuera: crear un gasto recurrente desde este formulario, presupuestos por
  categoría (barra de progreso y comparación con el mes anterior del diseño), conversión de moneda,
  y compartir o descargar masivamente adjuntos.
