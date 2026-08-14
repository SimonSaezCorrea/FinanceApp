# Feature Specification: Cuenta prepago como producto independiente

**Feature Branch**: `011-prepaid-account-product`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Cuenta prepago como producto independiente. Hoy una tarjeta de prepago solo puede existir colgando de una cuenta corriente o vista, y guarda su propio saldo dentro de la tarjeta. Eso mezcla dos productos financieros distintos: la cuenta corriente/vista es un producto bancario cuyos fondos se gastan con una tarjeta de débito, mientras que el prepago es un producto de provisión de fondos (típicamente de un emisor no bancario) que no requiere cuenta bancaria para operar. Se necesita que el prepago sea un producto propio dentro de la app: una cuenta prepago con su propio número de cuenta y su institución emisora, con saldo propio, capaz de recibir dinero y de gastarse mediante una o más tarjetas prepago que viven dentro de ella y comparten ese saldo."

## Clarifications

### Session 2026-08-14

- Q: ¿Se puede cambiar el tipo de una cuenta ya existente a prepago, o de prepago a otro tipo? → A:
  Prohibido en ambos sentidos; son productos distintos y no se convierten uno en otro.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Registrar una cuenta prepago con su tarjeta (Priority: P1)

Una persona tiene una cuenta prepago de un emisor no bancario (tipo Tenpo, MACH) y quiere reflejarla
en la app tal como es: una cuenta con su número, su emisor, su moneda y su saldo actual, con la
tarjeta prepago que usa para gastar ese saldo.

**Why this priority**: Sin poder registrar el producto, nada más de la feature existe. Es el mínimo
que ya entrega valor: la cuenta aparece en el listado, en el patrimonio y en la cartera.

**Independent Test**: Crear una cuenta de tipo prepago con saldo inicial y una tarjeta prepago, y
verificar que aparece en el listado de cuentas, en su detalle, en el patrimonio y que la tarjeta se
muestra en la cartera con el saldo de la cuenta.

**Acceptance Scenarios**:

1. **Given** el formulario de crear cuenta, **When** el usuario elige el tipo prepago e indica
   emisor, moneda, número de cuenta y saldo inicial, **Then** la cuenta se crea con ese saldo y
   queda activa.
2. **Given** una cuenta prepago existente, **When** el usuario agrega una tarjeta prepago con sus
   últimos 4 dígitos y vencimiento, **Then** la tarjeta queda asociada a esa cuenta y se muestra
   como una tarjeta prepago.
3. **Given** una cuenta prepago con dos tarjetas prepago, **When** el usuario mira el saldo de cada
   una, **Then** ambas muestran el mismo saldo, que es el de la cuenta.
4. **Given** una cuenta prepago, **When** el usuario intenta agregarle una tarjeta de crédito o de
   débito, **Then** la operación se rechaza indicando que ese tipo de cuenta solo admite tarjetas
   prepago.
5. **Given** una cuenta corriente o vista, **When** el usuario intenta agregarle una tarjeta
   prepago, **Then** la operación se rechaza indicando que el prepago es un producto aparte.

---

### User Story 2 - Gastar con la tarjeta prepago sin poder pasarse del saldo (Priority: P1)

La persona registra sus gastos hechos con la tarjeta prepago. El prepago no presta dinero: solo se
puede gastar lo que está cargado, así que un gasto mayor al saldo disponible no debe poder
registrarse.

**Why this priority**: Es la regla que distingue al prepago de una cuenta corriente y de una tarjeta
de crédito; sin ella el producto no es un prepago. Va junto a P1 porque un registro de gastos que
permita saldo negativo describe mal la realidad del usuario.

**Independent Test**: Con una cuenta prepago con saldo conocido, registrar un gasto menor (pasa y
baja el saldo) y uno mayor al saldo (se rechaza con un mensaje claro y el saldo no cambia).

**Acceptance Scenarios**:

1. **Given** una cuenta prepago con saldo 50.000, **When** el usuario registra un gasto de 20.000
   con su tarjeta prepago, **Then** el gasto queda registrado y el saldo pasa a 30.000.
2. **Given** una cuenta prepago con saldo 50.000, **When** el usuario registra un gasto de 60.000,
   **Then** el gasto se rechaza con un error de saldo insuficiente y el saldo sigue en 50.000.
3. **Given** un gasto ya registrado en una cuenta prepago, **When** el usuario lo edita a un monto
   que excede el saldo disponible considerando su propio monto anterior, **Then** la edición se
   rechaza y ni el gasto ni el saldo cambian.
4. **Given** un gasto registrado en una cuenta prepago, **When** el usuario lo elimina, **Then** el
   saldo vuelve a su valor previo.
5. **Given** una cuenta prepago, **When** el usuario registra un gasto sin indicar tarjeta,
   **Then** el gasto se acepta y descuenta el saldo igual (la cuenta puede gastarse por otros
   canales, p. ej. una transferencia de salida).

---

### User Story 3 - Cargar la cuenta prepago (Priority: P2)

La persona carga dinero a su prepago, ya sea moviéndolo desde otra de sus cuentas o porque le
llegó dinero de fuera de la app (efectivo depositado, transferencia de un tercero, sueldo).

**Why this priority**: Sin carga la cuenta solo puede vaciarse, pero el mecanismo ya existe en la
app (traspasos e ingresos), así que es integración más que construcción.

**Independent Test**: Hacer un traspaso desde una cuenta corriente a la cuenta prepago y verificar
que baja el saldo de una y sube el de la otra; registrar un ingreso directo en la prepago y
verificar que sube su saldo.

**Acceptance Scenarios**:

1. **Given** una cuenta corriente con saldo y una cuenta prepago, **When** el usuario hace un
   traspaso de la primera a la segunda, **Then** el saldo de la corriente baja y el de la prepago
   sube por el mismo monto, y cada cuenta ve su propio movimiento.
2. **Given** una cuenta prepago, **When** el usuario registra un ingreso en ella, **Then** su saldo
   sube por ese monto.
3. **Given** una cuenta prepago, **When** el usuario busca la antigua acción de "recargar" sobre la
   tarjeta, **Then** ya no existe: la carga es un traspaso o un ingreso.

---

### User Story 4 - La prepago se comporta como cualquier otra cuenta con saldo (Priority: P3)

La persona espera ver su prepago en los mismos lugares que sus demás cuentas: listado, detalle con
sus movimientos, cartera del panel y patrimonio total.

**Why this priority**: Es consistencia de producto; el valor está, pero llega después de que el
producto exista y se pueda gastar y cargar.

**Independent Test**: Con una cuenta prepago con movimientos, verificar que aparece en listado,
detalle, cartera y que su saldo suma al patrimonio.

**Acceptance Scenarios**:

1. **Given** una cuenta prepago con movimientos, **When** el usuario abre su detalle, **Then** ve
   su saldo, sus movimientos y sus tarjetas, sin secciones de cupo ni de facturación.
2. **Given** una cuenta prepago, **When** el usuario mira el patrimonio del panel, **Then** su
   saldo está incluido igual que el de las demás cuentas con saldo.
3. **Given** una cuenta prepago o una de sus tarjetas, **When** el usuario la fija en la cartera,
   **Then** se muestra con el saldo de la cuenta.

---

### Edge Cases

- **Gasto exactamente igual al saldo**: se acepta y el saldo queda en cero (nunca negativo).
- **Saldo inicial negativo**: se rechaza al crear la cuenta; un prepago no puede nacer debiendo.
- **Editar un gasto de una prepago moviéndolo a otra cuenta (o al revés)**: la validación de saldo
  se evalúa contra la cuenta que queda como destino final del movimiento.
- **Traspaso que deja la cuenta prepago origen sin saldo suficiente**: se rechaza, igual que un
  gasto; la regla de "nunca negativo" no depende del canal.
- **Cambiar el tipo de una cuenta existente a prepago (o desde prepago)**: se rechaza siempre, con o
  sin tarjetas; para corregir un error hay que borrar la cuenta y crearla con el tipo correcto.
- **Cuenta prepago sin ninguna tarjeta**: es válida (el dinero existe aunque la tarjeta aún no se
  registre); sus movimientos simplemente no llevan tarjeta.
- **Desactivar una cuenta prepago**: se comporta como cualquier otra cuenta inactiva.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE ofrecer un tipo de cuenta "prepago" al crear una cuenta, con emisor
  (institución), moneda, número de cuenta y saldo inicial.
- **FR-002**: El sistema DEBE permitir que una cuenta prepago tenga cero, una o varias tarjetas
  prepago, todas compartiendo el saldo de la cuenta.
- **FR-003**: El sistema DEBE rechazar cualquier tarjeta de crédito o de débito en una cuenta
  prepago, con un error identificable.
- **FR-004**: El sistema DEBE rechazar cualquier tarjeta prepago en una cuenta que no sea prepago,
  con un error identificable.
- **FR-005**: El sistema NO DEBE permitir configurar cupo de crédito, facturación, día de corte,
  método de pago ni pago mínimo en una cuenta prepago.
- **FR-006**: El sistema DEBE rechazar todo movimiento de salida (gasto o traspaso de salida) que
  deje el saldo de una cuenta prepago bajo cero, con un error identificable de saldo insuficiente.
- **FR-007**: El sistema DEBE aplicar esa validación también al editar un movimiento existente,
  evaluando el saldo sin considerar el propio monto anterior del movimiento editado.
- **FR-008**: El saldo de una cuenta prepago DEBE moverse únicamente por sus movimientos (ingresos,
  gastos y traspasos), igual que el de cualquier otra cuenta con saldo.
- **FR-009**: Las tarjetas prepago NO DEBEN tener saldo propio: el saldo mostrado en cualquier
  tarjeta prepago es el de su cuenta.
- **FR-010**: El sistema DEBE eliminar la acción de recargar una tarjeta prepago; cargar dinero se
  hace mediante un traspaso desde otra cuenta propia o registrando un ingreso.
- **FR-011**: Una cuenta prepago DEBE aparecer en el listado de cuentas, tener vista de detalle con
  sus movimientos y tarjetas, poder fijarse en la cartera del panel y sumar al patrimonio, como
  cualquier otra cuenta con saldo.
- **FR-012**: La vista de detalle de una cuenta prepago NO DEBE mostrar secciones de cupo,
  facturación ni pago de facturación.
- **FR-013**: El sistema DEBE rechazar un saldo inicial negativo al crear una cuenta prepago.
- **FR-016**: El sistema DEBE rechazar todo intento de cambiar el tipo de una cuenta existente a
  prepago, o de prepago a cualquier otro tipo, con un error identificable.
- **FR-014**: Los errores nuevos DEBEN ser códigos independientes del idioma, con su texto en
  español e inglés en la interfaz.
- **FR-015**: Los datos de ejemplo (seed) DEBEN incluir una cuenta prepago con su tarjeta, sus
  movimientos y al menos una carga desde otra cuenta, y NO DEBEN incluir tarjetas prepago colgando
  de cuentas corriente o vista.

### Key Entities

- **Cuenta prepago**: cuenta del usuario cuyo dinero está previamente provisionado. Tiene emisor,
  moneda, número de cuenta, saldo inicial y saldo actual. No tiene línea de crédito ni facturación.
  Su saldo nunca es negativo.
- **Tarjeta prepago**: instrumento de pago que vive dentro de una cuenta prepago y gasta su saldo.
  Tiene últimos 4 dígitos, vencimiento y estado activo/inactivo. No tiene saldo propio ni cupo.
- **Movimiento**: ingreso o gasto asociado a una cuenta y, opcionalmente, a una tarjeta de esa
  cuenta. Sobre una cuenta prepago, un gasto está acotado por el saldo disponible.
- **Traspaso**: par de movimientos entre dos cuentas propias del usuario; es el mecanismo de carga
  de una cuenta prepago desde otra cuenta.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un usuario puede registrar su cuenta prepago con su tarjeta en un solo formulario, sin
  necesitar crear antes ninguna cuenta bancaria.
- **SC-002**: El 100% de los intentos de gastar más que el saldo disponible de una cuenta prepago
  se rechazan, y el saldo mostrado nunca es negativo.
- **SC-003**: El saldo mostrado en la cuenta prepago y en cada una de sus tarjetas coincide siempre
  con la suma de saldo inicial más sus ingresos menos sus gastos.
- **SC-004**: Ninguna cuenta corriente o vista puede quedar con una tarjeta prepago, ni una cuenta
  prepago con una tarjeta de crédito o débito, en ningún flujo de la aplicación.
- **SC-005**: Cargar una cuenta prepago desde otra cuenta propia queda registrado como movimiento
  visible en ambas cuentas, sin alterar el total del patrimonio.

## Assumptions

- La única cuenta prepago existente hoy es la de los datos de ejemplo, así que no hay migración de
  datos productivos: el seed se rehace con el modelo nuevo.
- El emisor de una cuenta prepago se elige del catálogo de instituciones ya existente, que incluye
  emisores no bancarios; no se agrega un catálogo nuevo.
- Una cuenta prepago maneja una sola moneda, como el resto de las cuentas; no hay conversión de
  moneda en la aplicación.
- El número de cuenta de una prepago es texto libre, igual que en las demás cuentas, y es
  obligatorio (la cuenta prepago recibe transferencias por ese número).
- Las reglas de aislamiento por usuario, autenticación y paridad de idiomas ya vigentes se aplican
  sin cambios.
- Quedan fuera de alcance: conversión de moneda, integración con emisores reales, límites de recarga
  o de gasto por período, y tarjetas virtuales desechables.
