# Feature Specification: Rediseño Cuentas y Movimientos con tarjetas secundarias

**Feature Branch**: `007-accounts-movements-redesign`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: rediseño de la lógica de Cuentas y Movimientos para dar congruencia visual entre ambas vistas, soportar tarjetas secundarias con cupo compartido (crédito) o adicionales sobre la misma cuenta (débito), añadir número de cuenta bancaria, y CRUD completo de movimientos con filtrado banco→tarjeta.

## Clarifications

### Session 2026-07-02

- Q: El "número de cuenta" a añadir, ¿qué es y cómo se guarda/muestra? → A: Número de cuenta bancaria, texto libre, guardado y mostrado completo (no es PAN; no aplica solo-últimos-4).
- Q: Tarjeta secundaria de crédito, ¿lógica de cupo? → A: Pool de la principal + sub-tope propio; el gasto en la secundaria suma al usado de la principal, no al revés.
- Q: Tarjeta secundaria de débito, ¿cómo funciona? → A: Otra tarjeta sobre la misma cuenta, sin tope; ambas consumen el saldo de la cuenta.
- Q: En un gasto, ¿elegir tarjeta es obligatorio? → A: Obligatorio salvo que sea efectivo (cuenta CASH, sin tarjetas).
- Q: El "usado" del cupo, ¿cómo se calcula ahora que los gastos lo alimentan? → A: Semilla inicial (usado inicial ingresado al crear la tarjeta) + gastos de crédito derivados; usado = usadoInicial + Σ gastos de crédito (propios; para la principal, también los de sus secundarias). Reconciliable.
- Q: ¿El banco es obligatorio en todo movimiento nuevo? → A: Sí, siempre obligatorio para movimientos nuevos; los movimientos históricos sin banco se conservan.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Tarjeta secundaria de crédito con cupo compartido (Priority: P1)

Como usuario con una tarjeta de crédito principal, quiero registrar una tarjeta de crédito
adicional (secundaria) que comparte el cupo de la principal pero tiene su propio sub-tope,
para reflejar la realidad de las tarjetas adicionales que emite mi banco.

**Why this priority**: Es la capacidad de modelado nueva y más valiosa; sin ella no se puede
representar correctamente el consumo de cupo y las demás mejoras pierden sentido de negocio.

**Independent Test**: Crear una cuenta de crédito con tarjeta principal (tope 1.000.000),
añadirle una tarjeta secundaria (sub-tope 300.000), registrar un gasto de 100.000 en la
secundaria y verificar que el "usado" de la principal sube a 100.000 y el de la secundaria a
100.000; registrar un gasto de 100.000 en la principal y verificar que el usado de la
secundaria NO cambia (sigue en 100.000) mientras el de la principal sube a 200.000.

**Acceptance Scenarios**:

1. **Given** una tarjeta de crédito principal con tope 1.000.000 y una secundaria con sub-tope 300.000, **When** registro un gasto de 100.000 en la secundaria, **Then** el usado de la principal es 100.000 y el usado de la secundaria es 100.000.
2. **Given** el estado anterior, **When** registro un gasto de 100.000 en la principal, **Then** el usado de la principal es 200.000 y el usado de la secundaria permanece en 100.000.
3. **Given** una secundaria con sub-tope 300.000 y usado 100.000, **When** intento un gasto de 250.000 en la secundaria, **Then** el sistema rechaza el gasto por exceder el sub-tope de la secundaria (100.000 + 250.000 > 300.000).
4. **Given** una principal con tope 1.000.000 y usado total 950.000, **When** intento un gasto de 100.000 en cualquiera de sus tarjetas (principal o secundaria), **Then** el sistema rechaza el gasto por exceder el cupo compartido de la principal.
5. **Given** una tarjeta secundaria de crédito, **When** la elimino, **Then** deja de existir y su consumo histórico ya no afecta el cupo, pero la principal y las demás secundarias siguen intactas.

---

### User Story 2 - Registrar movimientos por banco y tarjeta (Priority: P1)

Como usuario, quiero registrar un gasto eligiendo primero el banco (cuenta) y luego la
tarjeta específica con la que pagué (crédito o débito), y registrar un ingreso indicando
solo el banco, para que cada movimiento quede correctamente atribuido.

**Why this priority**: Es el flujo central de captura de datos; el consumo de cupo de la
Story 1 depende de que el gasto quede ligado a la tarjeta correcta.

**Independent Test**: Crear un gasto en una cuenta no-efectivo verificando que exige elegir
tarjeta; crear un gasto en una cuenta de efectivo verificando que NO pide tarjeta; crear un
ingreso verificando que no ofrece elegir tarjeta.

**Acceptance Scenarios**:

1. **Given** una cuenta no-efectivo con al menos una tarjeta, **When** registro un GASTO en ella, **Then** el sistema exige seleccionar una de sus tarjetas antes de guardar.
2. **Given** una cuenta de tipo efectivo (CASH), **When** registro un GASTO en ella, **Then** el sistema NO solicita tarjeta y guarda el gasto solo con el banco.
3. **Given** cualquier cuenta, **When** registro un INGRESO, **Then** el sistema solo permite elegir el banco y nunca ofrece ni asocia una tarjeta.
4. **Given** una cuenta no-efectivo sin tarjetas, **When** intento registrar un GASTO, **Then** el sistema me indica que debo crear una tarjeta primero (o registrar el gasto solo si la cuenta admite pago sin tarjeta).
5. **Given** un GASTO con tarjeta de crédito, **When** se guarda, **Then** el usado del cupo se actualiza según las reglas de la Story 1.

---

### User Story 3 - CRUD de movimientos desde ambas vistas (Priority: P1)

Como usuario, quiero crear, editar y eliminar movimientos tanto desde la vista global de
Movimientos como desde la vista de una Cuenta, con el mismo formato visual, para gestionar
mis registros sin cambiar de contexto.

**Why this priority**: Sin edición/eliminación el registro es incompleto; la congruencia
visual entre ambas vistas es un requisito explícito.

**Independent Test**: Editar un movimiento desde la vista de Cuenta y verlo actualizado en la
vista de Movimientos con idéntico formato; eliminar un movimiento desde Movimientos y
verificar que desaparece de la vista de Cuenta y que saldos/cupos se recalculan.

**Acceptance Scenarios**:

1. **Given** un movimiento existente, **When** lo edito desde la vista de una Cuenta (cambiando monto, tarjeta o categoría), **Then** los cambios se reflejan en la vista global de Movimientos y en los saldos/cupos afectados.
2. **Given** un movimiento existente, **When** lo elimino desde la vista de Movimientos, **Then** desaparece de ambas vistas y el saldo de la cuenta y el usado del cupo se recalculan.
3. **Given** las dos vistas, **When** listo movimientos en cada una, **Then** ambas usan la misma presentación (mismos campos, formato de monto, fecha, categoría y tarjeta).
4. **Given** la edición de un gasto que cambia de una tarjeta de crédito a otra, **When** guardo, **Then** el usado se descuenta de la tarjeta anterior y se suma a la nueva (con propagación al pool si aplica).

---

### User Story 4 - Filtro banco→tarjeta e inactivas con tag (Priority: P2)

Como usuario, quiero filtrar los movimientos primero por banco y luego, dentro del banco, por
una tarjeta específica, y poder incluir cuentas inactivas (marcadas con un tag) en el filtro,
para encontrar rápido lo que busco.

**Why this priority**: Mejora de usabilidad importante pero construida sobre el modelo de las
stories P1; el sistema funciona sin ella.

**Independent Test**: Seleccionar un banco en el filtro y comprobar que aparece un segundo
control para elegir tarjeta de ese banco; activar "incluir inactivas" y verificar que las
cuentas inactivas aparecen en el selector con un tag "Inactiva".

**Acceptance Scenarios**:

1. **Given** el filtro de movimientos, **When** selecciono un banco, **Then** se habilita un filtro secundario que lista solo las tarjetas de ese banco.
2. **Given** ninguna tarjeta seleccionada, **When** filtro solo por banco, **Then** se muestran todos los movimientos de ese banco (con y sin tarjeta).
3. **Given** el filtro con "incluir inactivas" desactivado, **When** abro el selector de banco, **Then** solo aparecen cuentas activas.
4. **Given** "incluir inactivas" activado, **When** abro el selector de banco, **Then** también aparecen las cuentas inactivas, cada una con un tag/etiqueta "Inactiva".

---

### User Story 5 - Vista de Cuenta rediseñada y congruente (Priority: P2)

Como usuario, quiero que la vista de detalle de una Cuenta muestre el número de cuenta en la
preview, un único formato uniforme para todas sus tarjetas (sin duplicados), sin secciones
redundantes, y con la información movida al lateral, para una experiencia limpia y coherente.

**Why this priority**: Es el rediseño visual que resuelve las inconsistencias reportadas;
depende de que el modelo (número de cuenta, tarjetas) esté disponible.

**Independent Test**: Abrir una cuenta con 3 tarjetas y verificar que se muestran las 3 con el
mismo formato (sin duplicado arriba/abajo), que el número de cuenta aparece en la preview, que
no existe sección "Tarjetas" ni "Información" en el cuerpo principal, y que "Añadir tarjeta"
abre un modal.

**Acceptance Scenarios**:

1. **Given** una cuenta con N tarjetas, **When** abro su detalle, **Then** las N tarjetas se muestran con formato uniforme y ninguna aparece duplicada.
2. **Given** el panel lateral, **When** pulso "Añadir tarjeta", **Then** se abre un modal para crear la tarjeta sin salir de la vista.
3. **Given** la vista principal, **When** la reviso, **Then** ya no contiene la sección "Tarjetas" ni la sección "Información".
4. **Given** una cuenta con número de cuenta guardado, **When** veo la preview (lateral y principal), **Then** el número de cuenta se muestra completo.
5. **Given** la información antes en la sección "Información", **When** reviso el lateral, **Then** esos datos están disponibles allí sin pérdida.
6. **Given** los movimientos listados dentro de la vista de Cuenta, **When** los comparo con la vista global, **Then** usan el mismo formato de presentación.

---

### Edge Cases

- Gasto que excede el cupo compartido de la principal (por consumo propio + de secundarias): debe rechazarse.
- Gasto en secundaria que cabe en el pool de la principal pero excede su propio sub-tope: debe rechazarse.
- Eliminar la tarjeta principal cuando tiene secundarias: definir el efecto (ver Assumptions — las secundarias se eliminan en cascada junto con la principal).
- Cambiar el tipo de una cuenta de/ a efectivo cuando ya tiene movimientos con tarjeta.
- Editar un gasto para moverlo entre bancos/tarjetas: recalcular usado en origen y destino.
- Registrar gasto en cuenta no-efectivo sin ninguna tarjeta creada.
- Intentar asociar una tarjeta a un ingreso (debe ser imposible en la UI y rechazado por reglas).
- Cuenta inactiva con movimientos: sigue apareciendo en filtros solo si "incluir inactivas" está activo.
- Reembolso/nota de crédito (gasto negativo o reverso): fuera de alcance salvo lo cubierto por editar/eliminar.
- Multi-moneda: el cupo compartido y el sub-tope se controlan por moneda (una tarjeta puede tener límites por moneda).

## Requirements _(mandatory)_

### Functional Requirements

**Cuentas y número de cuenta**

- **FR-001**: El sistema DEBE permitir guardar un "número de cuenta" bancaria (texto libre) en cada cuenta, almacenado y mostrado completo (no es PAN de tarjeta; no aplica la política de solo-últimos-4).
- **FR-002**: El sistema DEBE mostrar el número de cuenta en la preview de la cuenta (panel lateral y vista principal).
- **FR-003**: El número de cuenta DEBE ser opcional (una cuenta puede no tenerlo, p. ej. efectivo).

**Rediseño de la vista de Cuenta**

- **FR-004**: La vista de detalle de Cuenta NO DEBE mostrar la sección "Tarjetas" en el cuerpo principal.
- **FR-005**: La vista de detalle de Cuenta NO DEBE mostrar la sección "Información" en el cuerpo principal; esos datos DEBEN estar disponibles en el panel lateral.
- **FR-006**: El sistema DEBE mostrar todas las tarjetas de la cuenta con un único formato uniforme, sin duplicar ninguna tarjeta.
- **FR-007**: El sistema DEBE permitir crear una tarjeta mediante un modal accesible desde "Añadir tarjeta" en el panel lateral, sin abandonar la vista.
- **FR-008**: Los movimientos listados dentro de la vista de Cuenta DEBEN presentarse con el mismo formato que la vista global de Movimientos.

**Tarjetas secundarias**

- **FR-009**: El sistema DEBE permitir marcar una tarjeta como secundaria (adicional) de una tarjeta principal existente en la misma cuenta.
- **FR-010**: Una tarjeta secundaria DEBE tener sus propios últimos-4 (número distinto de la principal).
- **FR-011 (crédito)**: Una tarjeta de crédito secundaria DEBE consumir el mismo pool de cupo de su principal: un gasto en la secundaria incrementa el usado de la principal en el mismo monto.
- **FR-012 (crédito)**: Una tarjeta de crédito secundaria DEBE tener su propio sub-tope; su usado propio no puede exceder ese sub-tope.
- **FR-013 (crédito)**: Un gasto en la tarjeta principal NO DEBE incrementar el usado de sus secundarias.
- **FR-014 (crédito)**: El usado de la principal DEBE reflejar el consumo total (propio + de todas sus secundarias); el usado de una secundaria DEBE reflejar solo su propio consumo.
- **FR-014a (crédito)**: El sistema DEBE permitir ingresar un "usado inicial" (semilla) por moneda al crear/editar una tarjeta de crédito, análogo al saldo inicial de la cuenta, para representar deuda ya existente al dar de alta la tarjeta.
- **FR-014b (crédito)**: El usado mostrado de una tarjeta DEBE calcularse como usadoInicial + Σ gastos de crédito derivados de los movimientos (los propios de la tarjeta; para la principal, además los de todas sus secundarias). Este usado DEBE ser reconciliable a partir de los movimientos.
- **FR-015 (crédito)**: El sistema DEBE rechazar un gasto que haga que el usado de la secundaria supere su sub-tope, o que el usado total de la principal supere el cupo de la principal.
- **FR-016 (débito)**: Una tarjeta de débito secundaria DEBE ser simplemente otra tarjeta sobre la misma cuenta bancaria, sin tope de crédito; ambas consumen el saldo de la cuenta.

**Movimientos: captura**

- **FR-017**: Al registrar un movimiento nuevo (ingreso o gasto), el sistema DEBE requerir seleccionar el banco (cuenta). Los movimientos históricos sin banco se conservan tal cual.
- **FR-018**: Para un GASTO en una cuenta no-efectivo, el sistema DEBE exigir seleccionar una tarjeta específica (crédito o débito) de ese banco.
- **FR-019**: Para un GASTO en una cuenta de tipo efectivo (CASH), el sistema NO DEBE exigir ni permitir tarjeta.
- **FR-020**: Para un INGRESO, el sistema NO DEBE permitir asociar una tarjeta; el ingreso se atribuye solo a la cuenta.
- **FR-021**: Un GASTO con tarjeta de crédito DEBE actualizar el usado del cupo según FR-011..FR-015.
- **FR-022**: El saldo reconciliado de la cuenta DEBE seguir siendo coherente (currentBalance = initialBalance + ingresos − gastos) tras crear/editar/eliminar movimientos.

**Movimientos: CRUD**

- **FR-023**: El sistema DEBE permitir crear, editar y eliminar movimientos desde la vista global de Movimientos.
- **FR-024**: El sistema DEBE permitir crear, editar y eliminar movimientos desde la vista de una Cuenta.
- **FR-025**: Editar o eliminar un movimiento DEBE recalcular el saldo de la cuenta y el usado del/los cupo(s) afectado(s), incluyendo el traspaso de usado cuando cambia la tarjeta.

**Movimientos: filtro**

- **FR-026**: El filtro de movimientos DEBE permitir filtrar primero por banco (cuenta).
- **FR-027**: Al seleccionar un banco, el filtro DEBE ofrecer un filtro secundario por tarjeta específica de ese banco.
- **FR-028**: Filtrar solo por banco (sin tarjeta) DEBE devolver todos los movimientos de ese banco.
- **FR-029**: El filtro DEBE ofrecer una opción "incluir inactivas" que, al activarse, muestra también las cuentas inactivas en los selectores.
- **FR-030**: Cada cuenta inactiva mostrada en el filtro DEBE llevar un tag/etiqueta que la identifique como inactiva.

**i18n / consistencia**

- **FR-031**: Todas las cadenas de interfaz nuevas DEBEN existir en español e inglés con claves idénticas.

### Key Entities _(include if feature involves data)_

- **Cuenta bancaria (BankAccount)**: representa un banco/cuenta del usuario. Nuevo atributo: número de cuenta (texto libre, completo, opcional). Mantiene tipo (incluye efectivo/CASH), estado (activa/inactiva), saldo inicial y saldo reconciliado.
- **Tarjeta (Card)**: pertenece a una cuenta. Nuevo atributo: relación opcional "tarjeta principal" (una tarjeta puede ser secundaria de otra de la misma cuenta). Conserva tipo (crédito/débito) y últimos-4.
- **Límite/cupo de tarjeta (CardLimit)**: para crédito, define el tope, un "usado inicial" (semilla) y el usado reconciliado por moneda. Usado reconciliado = usadoInicial + Σ gastos de crédito derivados (propios; para la principal, también los de sus secundarias). Para una secundaria, el tope es su sub-tope; su usado propio se acota a él y además incrementa el usado de la principal (pool compartido).
- **Movimiento (Transaction)**: ingreso o gasto. Todo movimiento nuevo está ligado a una cuenta (banco); para gastos no-efectivo, además a una tarjeta. Un ingreso nunca lleva tarjeta. Los movimientos históricos sin banco se conservan.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un usuario puede crear una tarjeta secundaria de crédito y, tras un gasto en ella, verificar en menos de 1 minuto que el usado de la principal refleja ese gasto y el de la secundaria también, mientras un gasto en la principal no altera el usado de la secundaria.
- **SC-002**: El 100% de los gastos registrados en cuentas no-efectivo quedan asociados a una tarjeta; el 100% de los ingresos quedan sin tarjeta.
- **SC-003**: La vista de Cuenta muestra cada tarjeta exactamente una vez (0 duplicados) y no contiene las secciones "Tarjetas" ni "Información" en el cuerpo principal.
- **SC-004**: Los movimientos se presentan con formato idéntico en la vista global y en la vista de Cuenta (mismos campos visibles).
- **SC-005**: Un usuario puede filtrar por banco y luego por tarjeta y obtener el subconjunto correcto de movimientos; al incluir inactivas, estas aparecen con tag.
- **SC-006**: Un usuario puede crear, editar y eliminar un movimiento desde cualquiera de las dos vistas, y los saldos y cupos afectados quedan recalculados correctamente.
- **SC-007**: Ningún gasto puede exceder el sub-tope de una secundaria ni el cupo compartido de la principal (0 sobregiros de cupo permitidos).

## Assumptions

- El "número de cuenta" es un número de cuenta bancaria (no un PAN de tarjeta), por lo que se guarda y muestra completo sin enmascarar; no se captura ni almacena PAN completo ni CVV de tarjetas (se mantienen solo los últimos-4 para tarjetas).
- La relación de tarjeta secundaria es un solo nivel (una secundaria apunta a una principal; no hay secundarias de secundarias).
- Eliminar la tarjeta principal elimina en cascada sus secundarias (consistente con el borrado en cascada de tarjetas al eliminar su cuenta); se confirmará en el plan.
- El control de cupo compartido y sub-tope se realiza por moneda, coherente con el modelo de límites por moneda existente.
- Para cuentas no-efectivo sin tarjetas, registrar un gasto requiere primero crear una tarjeta; no se habilita un "gasto sin tarjeta" en cuentas no-efectivo.
- El rediseño no cambia otros dominios (deudas, cuotas, ahorros, inversiones, importación) salvo lo mínimo para la congruencia de movimientos.
- Se reutiliza la infraestructura existente de reconciliación de saldos, i18n es/en, y el sistema de diseño (modales, tabla de movimientos, tags/badges).
