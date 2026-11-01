# Feature Specification: Plantillas de movimientos

**Feature Branch**: `037-movement-templates`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Plantillas de movimientos. Una plantilla reutilizable para registrar rápido los movimientos frecuentes ('Bencina', 'Arriendo mensual'). Guarda todo lo que lleva un movimiento hecho a mano salvo la fecha: nombre (único por persona), tipo gasto/ingreso, cuenta, tarjeta, categoría, gasto fijo, descripción, observación/emisor/receptor/lugar, cargo del emisor y los valores de las columnas propias; el monto es opcional (fijo o vacío). Pantalla propia en el grupo Configuración ('Plantillas', /templates): listar, crear, editar, eliminar. En el formulario de nuevo movimiento: 'Usar plantilla' rellena el formulario (todo editable) y 'Guardar como plantilla' desde los valores actuales. Usar una plantilla solo rellena; guardar pasa por la creación normal de movimientos. Referencias borradas o inválidas se degradan sin romper nada. Se verifica la propiedad de cada referencia. Máximo 50 por persona." (ClickUp 86aj98yxd; docs/PENDING.md → Movimientos §1)

## Clarifications

### Session 2026-10-25

Answered by the product owner's brief (autonomous session); recorded here as the decision record.

- Q: ¿Las plantillas cubren traspasos? → A: No. Solo gasto e ingreso; traspaso y prepago quedan fuera de alcance (FR-013).
- Q: ¿Dónde se gestionan? → A: En una pantalla propia "Plantillas" (en "Templates") en el grupo "Configuración" de la barra lateral, junto a "Columnas propias"; además "Usar plantilla" y "Guardar como plantilla" dentro del formulario de nuevo movimiento.
- Q: ¿Qué pasa con una referencia borrada? → A: La plantilla se conserva con ese dato vacío (el borrado de la cuenta/tarjeta/categoría/gasto fijo nunca se bloquea); al usarla el campo queda vacío y la persona lo elige (FR-010/011).
- Q: ¿Límite por persona? → A: 50 plantillas, gratis, sin plan de pago (FR-003).
- Q: ¿"Usar plantilla" puede crear el movimiento directamente? → A: No: solo rellena el formulario; se guarda por la creación normal con todas sus reglas (FR-006/007).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Registrar un movimiento frecuente desde una plantilla (Priority: P1)

Una persona carga bencina todas las semanas con la misma tarjeta, categoría "Transporte" y
descripción "Bencina"; solo cambia el monto. Abre "Nuevo movimiento", elige "Usar plantilla →
Bencina", el formulario queda relleno con todo salvo el monto (vacío) y la fecha (hoy); escribe el
monto y guarda. Para el arriendo, la plantilla "Arriendo mensual" trae además el monto fijo
$450.000: solo confirma.

**Why this priority**: es el valor de la funcionalidad — menos pasos para lo que se repite.

**Independent Test**: con una plantilla existente, abrir el formulario de nuevo movimiento, usarla y
guardar; el movimiento creado es idéntico al que se habría hecho a mano con esos datos.

**Acceptance Scenarios**:

1. **Given** la plantilla "Bencina" (gasto, cuenta corriente, tarjeta débito, categoría Transporte, sin monto), **When** la persona la usa en "Nuevo movimiento", **Then** el formulario muestra gasto, esa cuenta, esa tarjeta, esa categoría, la descripción "Bencina", el monto vacío y la fecha de hoy.
2. **Given** la plantilla "Arriendo mensual" con monto $450.000, **When** la usa, **Then** el monto aparece en $450.000 y puede guardarlo sin escribir nada más.
3. **Given** un formulario rellenado desde una plantilla, **When** la persona cambia el monto, la fecha o cualquier otro dato antes de guardar, **Then** se guarda lo que quedó en el formulario y la plantilla no cambia.
4. **Given** una plantilla con valores de columnas propias ("Transferido: No"), **When** la usa, **Then** el formulario muestra esos valores en las columnas que aplican al movimiento.
5. **Given** un movimiento creado desde una plantilla, **When** se guarda, **Then** pasa por las mismas reglas que cualquier movimiento (cupo, saldo de prepago, sobregiro, tarjeta obligatoria en crédito) y un rechazo se muestra igual que siempre.

---

### User Story 2 - Gestionar mis plantillas (Priority: P1)

En la barra lateral, grupo "Configuración", junto a "Columnas propias", la persona abre
"Plantillas": ve la lista de sus plantillas (nombre, tipo, cuenta, categoría, monto o "monto
libre"), crea una nueva con el mismo formulario de un movimiento (sin fecha), edita una existente o
la elimina con confirmación.

**Why this priority**: sin crear plantillas no hay qué usar; es la otra mitad del MVP.

**Independent Test**: crear, editar y eliminar plantillas desde su pantalla y ver que la lista y el
selector del formulario de movimientos reflejan los cambios.

**Acceptance Scenarios**:

1. **Given** una persona sin plantillas, **When** abre "Plantillas", **Then** ve un estado vacío que explica para qué sirven y un botón para crear la primera.
2. **Given** el formulario de nueva plantilla, **When** guarda "Arriendo mensual" con gasto, cuenta, categoría y monto, **Then** aparece en la lista con su monto.
3. **Given** una plantilla, **When** la edita y cambia la categoría, **Then** la lista y el uso posterior muestran la nueva categoría; los movimientos ya creados desde ella no cambian.
4. **Given** una plantilla, **When** la elimina y confirma, **Then** desaparece de la lista y del selector; ningún movimiento cambia.
5. **Given** una plantilla llamada "Bencina", **When** intenta crear otra llamada "bencina " (mayúsculas, acentos o espacios distintos), **Then** la app la rechaza diciendo que ya existe una con ese nombre.
6. **Given** 50 plantillas, **When** intenta crear la número 51, **Then** la app lo rechaza y explica el límite.
7. **Given** dos personas distintas, **When** una crea una plantilla, **Then** la otra no la ve ni puede leerla, editarla, borrarla ni usarla.

---

### User Story 3 - Guardar como plantilla desde el formulario (Priority: P2)

Mientras registra un movimiento, la persona se da cuenta de que lo repetirá: toca "Guardar como
plantilla", escribe un nombre y elige si guardar el monto escrito o dejarlo libre. La plantilla
queda creada con los datos actuales del formulario (sin la fecha), y el formulario sigue abierto para
que termine de registrar el movimiento.

**Why this priority**: atajo cómodo, pero la pantalla de Plantillas ya permite crearlas.

**Independent Test**: en el formulario de nuevo movimiento, completar datos, guardar como plantilla
y comprobar que la plantilla existe con esos datos y que el movimiento no se creó todavía.

**Acceptance Scenarios**:

1. **Given** un formulario con gasto, cuenta, tarjeta, categoría, descripción y monto, **When** guarda como plantilla "Supermercado" eligiendo "monto libre", **Then** la plantilla queda con todo salvo monto y fecha, y el formulario conserva lo escrito.
2. **Given** el mismo formulario, **When** elige "guardar el monto", **Then** la plantilla queda con ese monto.
3. **Given** un nombre ya usado, **When** intenta guardar, **Then** ve el error junto al nombre y puede elegir otro sin perder el formulario.
4. **Given** el formulario en modo Traspaso o Prepagar, **When** lo mira, **Then** "Guardar como plantilla" no se ofrece (fuera de alcance).

---

### Edge Cases

- La cuenta, tarjeta, categoría o gasto fijo de una plantilla se borró: la plantilla sigue existiendo con ese dato vacío; al usarla, el campo queda vacío y la persona lo elige. Nada falla.
- La cuenta de la plantilla quedó inactiva: al usarla no se preselecciona (el formulario de nuevo movimiento solo ofrece cuentas activas); el resto se rellena.
- La tarjeta de la plantilla ya no pertenece a la cuenta elegida, o la cuenta ya no admite tarjeta: la tarjeta queda vacía.
- Una columna propia de la plantilla se eliminó, cambió de tipo o ya no aplica al movimiento: ese valor se ignora; los demás se usan.
- Un valor de lista cuya opción ya no existe: se ignora.
- Una plantilla de ingreso usada sobre una cuenta de tarjeta de crédito: el formulario aplica sus propias reglas (en crédito solo se ofrece gasto) como si la persona hubiera cambiado de cuenta a mano.
- La categoría de la plantilla ya no es seleccionable para su tipo: queda vacía.
- Monto con decimales en una moneda sin centavos: se guarda tal cual en la plantilla y el formulario aplica su redondeo de escritura al usarla.
- Doble clic en "Guardar" de una plantilla: la segunda petición choca con el nombre único y no crea un duplicado.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Una persona MUST poder crear plantillas de movimiento con: nombre (obligatorio, 1–60 caracteres), tipo (gasto o ingreso), monto opcional, moneda del monto, cuenta, tarjeta, categoría, gasto fijo, descripción, observación, emisor, receptor, lugar, marca de cargo del emisor y valores de sus columnas propias. Todo salvo nombre y tipo es opcional.
- **FR-002**: El nombre MUST ser único por persona sin distinguir mayúsculas, acentos ni espacios repetidos.
- **FR-003**: Una persona MUST poder tener como máximo 50 plantillas; la 51 se rechaza con un error propio.
- **FR-004**: La persona MUST poder listar, editar y eliminar sus plantillas en una pantalla propia, "Plantillas", en el grupo "Configuración" de la barra lateral (y en el menú "Más" en el teléfono).
- **FR-005**: Editar o eliminar una plantilla MUST NOT cambiar ningún movimiento existente.
- **FR-006**: El formulario de nuevo movimiento MUST ofrecer "Usar plantilla", que rellena el formulario con los datos de la plantilla elegida (fecha = hoy) dejando todo editable; usarla MUST NOT crear nada por sí sola.
- **FR-007**: El movimiento creado tras usar una plantilla MUST guardarse por el camino normal de creación de movimientos, con todas sus reglas e idempotencia.
- **FR-008**: El formulario de nuevo movimiento MUST ofrecer "Guardar como plantilla" en modo gasto o ingreso: pide un nombre y si guardar el monto, crea la plantilla con los valores actuales (sin fecha) y deja el formulario abierto e intacto.
- **FR-009**: Cada referencia de una plantilla (cuenta, tarjeta, categoría, gasto fijo, columnas propias) MUST verificarse antes de guardarse: que sea de la persona (o del catálogo global, en categorías), que la tarjeta pertenezca a la cuenta indicada, que la categoría sea seleccionable para el tipo, y que cada valor de columna propia sea válido para su columna. Una referencia ajena responde "no encontrado", nunca revela que existe.
- **FR-010**: Borrar una cuenta, tarjeta, gasto fijo o columna propia MUST dejar las plantillas que la usaban sin esa referencia, sin borrarlas ni impedir el borrado.
- **FR-011**: Al usar una plantilla, toda referencia que ya no sea válida para el formulario (borrada, inactiva, de otra cuenta, no aplicable) MUST quedar vacía en vez de producir un error.
- **FR-012**: Una plantilla de cargo del emisor MUST ser de gasto y no llevar tarjeta (mismas reglas del movimiento).
- **FR-013**: Los traspasos y prepagos MUST quedar fuera de las plantillas.
- **FR-014**: Cada persona MUST ver y usar solo sus propias plantillas.
- **FR-015**: Eliminar la cuenta de la persona MUST eliminar sus plantillas; "Descargar mis datos" en JSON SHOULD incluirlas.

### Key Entities

- **Plantilla de movimiento**: pertenece a una persona; nombre visible y su forma normalizada (unicidad); tipo; monto y moneda opcionales; referencias opcionales a cuenta, tarjeta, categoría y gasto fijo; textos opcionales; marca de cargo del emisor; valores de columnas propias por columna.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Registrar un movimiento frecuente con plantilla de monto fijo toma 3 interacciones o menos desde "Nuevo movimiento" (abrir selector, elegir plantilla, guardar).
- **SC-002**: El 100 % de los datos guardados en una plantilla aparece en el formulario al usarla, salvo los que dejaron de ser válidos (que quedan vacíos sin error).
- **SC-003**: Ninguna operación sobre una plantilla ajena (leer, editar, borrar, usar sus referencias) tiene éxito.
- **SC-004**: Borrar cualquier cuenta, tarjeta, gasto fijo, categoría o columna propia nunca falla por estar usado en una plantilla.

## Assumptions

- La plantilla no guarda fecha: siempre se usa hoy.
- El monto guardado se interpreta en la moneda de la plantilla; al usarla con una cuenta, la moneda del formulario la decide la cuenta, como al elegirla a mano.
- Sin orden manual: la lista se ordena por nombre.
- Gratis y sin plan de pago; el límite de 50 es técnico, no comercial.
- Fuera de alcance: plantillas de traspaso o prepago, adjuntos en plantillas, crear el movimiento con un toque sin abrir el formulario, plantillas en la importación por planilla, sugerencias automáticas.
