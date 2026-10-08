# Feature Specification: Tipos de cambio y conversión estimada USD↔CLP, UF

**Feature Branch**: `030-exchange-rates`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "Tipos de cambio y conversión estimada USD↔CLP, UF. La app no convierte monedas, así que pagar una facturación en USD, ver cuánto vale una cuenta en USD en pesos o traspasar de USD a CLP obliga a calcular a mano; además la pestaña USD de Facturación no permite prepagar. Se guarda cada día a las 8:00 (hora de Chile) el valor del dólar observado y el de la UF (fuente: mindicador.cl), arrastrando el último valor en días sin publicación, con histórico consultable por fecha. Al pagar o prepagar una facturación en USD desde una cuenta en CLP la app propone el monto en CLP con el valor vigente, editable. Toda cuenta en USD muestra un equivalente aproximado en CLP. El traspaso USD→CLP sugiere el monto CLP con el valor vigente, editable. Fuera de alcance: otras monedas, compra/venta con spread, conversión de saldos ya registrados, alertas por variación. Las estimaciones nunca se aplican solas: siempre las confirma la persona."

## Clarifications

### Session 2026-10-08

- Q: ¿Dónde consulta la persona el histórico del dólar y la UF? → A: En una pantalla propia "Tipos de cambio": valor de hoy más tabla/gráfico por fecha, para dólar y UF.
- Q: Si la fuente falla a las 8:00, ¿qué hace el sistema? → A: Reintenta cada hora hasta las 20:00; si sigue caída, arrastra el último valor marcado como "dato arrastrado" (igual que fines de semana y feriados). Si después la fuente publica el valor real de ese día, lo reemplaza y deja de estar marcado.
- Q: Al pagar una facturación USD, ¿qué cifra es la base? → A: Los USD (por defecto el total adeudado, editable); los CLP se sugieren como USD × valor vigente y son editables, y editar los CLP nunca cambia los USD.
- Q: En el traspaso USD → CLP, ¿qué cifra es la base? → A: Los USD de origen; los CLP de destino se sugieren (USD × valor vigente), son editables y editarlos nunca cambia los USD.
- Q: ¿Dónde más se usa el equivalente en pesos de las cuentas USD? → A: Además de cada cuenta USD, el patrimonio neto muestra un total adicional "≈ todo en CLP (estimado)" junto a las cifras por moneda, que se mantienen sin convertir.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Historial diario del dólar y la UF (Priority: P1)

Cada mañana la app deja registrado cuánto valía un dólar (dólar observado) y una UF en pesos. Puedo
consultar el valor de cualquier día pasado y el vigente hoy. Todo lo demás de esta función se apoya
en estos valores.

**Why this priority**: sin un valor confiable y fechado no se puede sugerir ninguna conversión; es
la base de las otras historias y, por sí sola, ya entrega el histórico que la persona pidió.

**Independent Test**: dejar correr el registro de un día y consultar el valor de ese día y de uno
anterior; comprobar que cada día (incluidos fines de semana) tiene un valor.

**Acceptance Scenarios**:

1. **Given** un día hábil con valores publicados, **When** llegan las 8:00 (hora de Chile), **Then**
   queda registrado el valor del dólar y de la UF de ese día, con su fecha.
2. **Given** un sábado, domingo o feriado sin publicación nueva, **When** llegan las 8:00,
   **Then** se registra el último valor conocido y queda marcado como "arrastrado".
3. **Given** valores de varios días registrados, **When** abro la pantalla "Tipos de cambio" y elijo
   una fecha pasada, **Then** veo el valor del dólar y de la UF de esa fecha (y si fue arrastrado),
   junto al valor de hoy y su evolución en el tiempo.
4. **Given** que la fuente externa no responde a las 8:00, **When** falla el registro, **Then** no se
   inventa ningún valor y el sistema reintenta cada hora hasta las 20:00; mientras tanto la app
   muestra el último valor conocido con su fecha.
5. **Given** que la fuente sigue caída a las 20:00, **When** termina el día, **Then** ese día queda
   con el último valor conocido marcado como "dato arrastrado", igual que un fin de semana.
6. **Given** un día marcado como arrastrado por una caída, **When** la fuente publica después el valor
   real de ese día, **Then** el valor real reemplaza al arrastrado y la marca desaparece.

---

### User Story 2 - Pagar o prepagar una facturación en USD con monto estimado (Priority: P1)

Tengo una facturación en dólares y la pago (o prepago) desde una cuenta en pesos. En vez de calcular
cuántos pesos corresponden, la app me propone el monto en pesos según el valor vigente del dólar. Puedo
cambiarlo por lo que realmente cobró el banco, y lo que queda registrado es lo que yo confirmo. La
pestaña USD de Facturación ofrece "Prepagar" igual que la de pesos.

**Why this priority**: es el dolor principal (calcular a mano al pagar) y hoy en la pestaña USD ni
siquiera se puede prepagar.

**Independent Test**: abrir el pago de una facturación USD desde una cuenta CLP, ver el monto CLP
sugerido, editarlo y confirmar; comprobar que se registró el monto editado.

**Acceptance Scenarios**:

1. **Given** una facturación USD de US$50,41 y el dólar a $950, **When** abro "Pagar" eligiendo una
   cuenta en pesos, **Then** veo los dólares a liquidar y un monto en pesos sugerido de $47.890
   rotulado como estimado, con la fecha del valor usado.
2. **Given** el monto sugerido, **When** lo cambio a $48.200 y confirmo, **Then** se registra
   $48.200 como lo debitado y la facturación se liquida por los dólares indicados.
3. **Given** el período USD abierto, **When** miro la pestaña USD de Facturación, **Then** ofrece
   "Prepagar" con el mismo comportamiento y la misma sugerencia en pesos que la pestaña de pesos.
4. **Given** que no existe ningún valor registrado del dólar, **When** abro el pago, **Then** el monto
   en pesos queda vacío para escribirlo a mano, como hoy, sin bloquear el pago.

---

### User Story 3 - Equivalente aproximado en pesos de las cuentas en USD (Priority: P2)

En mis cuentas en dólares veo, junto al saldo, cuánto equivale aproximadamente en pesos, claramente
marcado como estimado y con la fecha del valor usado.

**Why this priority**: da contexto inmediato sin acción de la persona, pero no desbloquea pagos.

**Independent Test**: tener una cuenta en USD con saldo conocido y verificar que se ve el equivalente
en pesos con su rótulo de estimado y su fecha.

**Acceptance Scenarios**:

1. **Given** una cuenta con US$1.000 y el dólar a $950, **When** miro la cuenta, **Then** veo
   "≈ $950.000 (estimado, valor del 8 oct)".
2. **Given** una cuenta en pesos, **When** la miro, **Then** no aparece ningún equivalente.
3. **Given** que "ocultar saldos" está activo, **When** miro la cuenta USD, **Then** el equivalente
   también queda oculto igual que el saldo.
4. **Given** patrimonio neto en pesos y en dólares, **When** miro el patrimonio neto, **Then** veo las
   cifras por moneda sin convertir y, aparte, un total "≈ todo en CLP (estimado)" con la fecha del
   valor usado.

---

### User Story 4 - Traspaso USD → CLP con monto sugerido (Priority: P2)

Al traspasar plata de una cuenta en dólares a una en pesos, la app me sugiere cuántos pesos
corresponden con el valor vigente. Lo ajusto al monto real que recibí y confirmo.

**Why this priority**: mismo dolor que el pago, en un flujo ya existente (traspasos); depende solo del
historial de valores.

**Independent Test**: crear un traspaso de una cuenta USD a una CLP, ver la sugerencia, editarla y
comprobar que ambas piernas quedan con los montos confirmados.

**Acceptance Scenarios**:

1. **Given** una cuenta USD y una CLP, **When** ingreso US$100 de origen, **Then** el monto de
   destino se sugiere en pesos con el valor vigente y puedo editarlo; editarlo no cambia los US$100.
2. **Given** el monto de destino editado, **When** confirmo, **Then** se registran exactamente los
   montos que confirmé, sin recalcular.
3. **Given** un traspaso entre cuentas de la misma moneda, **When** lo creo, **Then** no aparece
   ninguna sugerencia de conversión.

---

### Edge Cases

- ¿Qué pasa si no hay ningún valor registrado todavía (instalación nueva)? Los campos de monto en
  pesos quedan vacíos para escribir a mano y los equivalentes no se muestran.
- ¿Qué pasa si el último valor tiene varios días? Se usa igual, pero con su fecha visible, y la
  sugerencia se rotula con esa fecha para que la persona juzgue si sirve.
- ¿Qué pasa con una facturación o traspaso fechado en el pasado? La sugerencia usa el valor de la
  fecha elegida del pago (o el más cercano anterior), no el de hoy.
- ¿Qué pasa si la persona edita el monto sugerido a algo muy distinto? Se acepta; la app no valida
  contra la tasa (la persona manda), pero sí mantiene la regla de monto positivo.
- ¿Qué pasa si se consulta una fecha anterior al primer valor registrado? La pantalla indica "sin dato para esa fecha"; no se muestra un valor inventado ni uno vacío.
- ¿Qué pasa si el mismo día se intenta registrar dos veces el valor (reintento)? Queda un solo valor
  por moneda y día.
- ¿Qué pasa con movimientos y pagos ya hechos antes de esta función? No cambian ni se reconvierten.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema MUST registrar cada día a las 8:00 (hora de Chile) el valor del dólar
  observado (1 USD en CLP) y el de la UF (1 UF en CLP), con su fecha.
- **FR-002**: Cuando un día no tenga publicación nueva (fin de semana, feriado), el sistema MUST
  registrar el último valor conocido marcado como arrastrado, de modo que todo día tenga valor.
- **FR-003**: El sistema MUST conservar un único valor por moneda y por día, y MUST permitir
  reintentar el registro de un día sin duplicarlo.
- **FR-004**: Si la fuente no está disponible, el sistema MUST NOT inventar ni estimar un valor, MUST
  seguir usando el último valor conocido mostrando su fecha, y MUST reintentar cada hora hasta las
  20:00 (hora de Chile). Si sigue caída, el día queda con el último valor conocido marcado como
  "dato arrastrado" (FR-002); si luego se publica el valor real, MUST reemplazar al arrastrado.
- **FR-005**: La app MUST ofrecer una pantalla "Tipos de cambio" donde la persona ve el valor
  vigente del dólar y de la UF y consulta el de cualquier fecha registrada (tabla y gráfico por
  fecha), indicando cuáles fueron arrastrados.
- **FR-006**: Al pagar una facturación en USD desde una cuenta en pesos, el sistema MUST proponer el
  monto en pesos con el valor vigente, rotulado como estimado y con la fecha del valor usado.
- **FR-007**: El monto sugerido MUST ser editable, y el sistema MUST registrar exactamente el monto
  que la persona confirma, sin recalcularlo ni ajustarlo. En un pago o prepago USD, los dólares
  son la cifra base (por defecto el total adeudado, editable) y los pesos se sugieren como
  dólares × valor vigente; editar los pesos MUST NOT modificar los dólares.
- **FR-008**: La pestaña de facturación en USD MUST ofrecer prepago de su período abierto con el
  mismo comportamiento (y la misma sugerencia en pesos) que el prepago de la pestaña en pesos.
- **FR-009**: Toda cuenta en USD MUST mostrar un equivalente aproximado en pesos, rotulado como
  estimado y con la fecha del valor usado; las cuentas en otras monedas no muestran equivalente.
- **FR-010**: El equivalente en pesos MUST respetar la preferencia de ocultar saldos.
- **FR-016**: El patrimonio neto MUST mantener sus cifras por moneda sin convertir y MUST agregar un
  total adicional "≈ todo en CLP (estimado)" que incluya las cuentas y deudas en USD (y en UF, con su valor registrado) al valor vigente,
  rotulado como estimado y con su fecha; sin valor registrado, ese total no se muestra.
- **FR-011**: Al crear un traspaso entre una cuenta USD y una CLP, el sistema MUST tomar los dólares
  de origen como cifra base, sugerir los pesos de destino (dólares × valor vigente), editables sin
  alterar los dólares, y registrar los montos confirmados.
- **FR-012**: Cuando no hay ningún valor registrado, todos los flujos MUST seguir funcionando con
  entrada manual, sin sugerencia.
- **FR-013**: Las estimaciones MUST NOT aplicarse nunca solas: ninguna escritura de dinero usa una
  conversión que la persona no haya visto y confirmado.
- **FR-014**: Las sugerencias para operaciones con fecha pasada MUST usar el valor de esa fecha (o el
  más cercano anterior), no el de hoy.
- **FR-015**: Los registros ya existentes (movimientos, pagos, traspasos, saldos) MUST NOT modificarse
  ni reconvertirse al incorporar esta función.

### Key Entities _(include if feature involves data)_

- **Valor de cambio diario**: el valor en pesos de una unidad de dólar observado o de UF en una fecha;
  indica si fue publicado ese día o arrastrado del último conocido. Un registro por moneda y fecha;
  compartido por todas las personas (no pertenece a un usuario).
- **Estimación de conversión**: cifra transitoria que se muestra en pantalla (monto sugerido,
  equivalente en pesos) con el valor y la fecha usados; no se guarda, solo lo confirmado por la persona
  se registra como monto de pago o de traspaso.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Una persona paga una facturación en USD desde una cuenta en pesos sin usar calculadora:
  el monto en pesos aparece sugerido y el pago se completa sin más pasos que uno en pesos, salvo la
  edición opcional del monto.
- **SC-002**: Una persona completa un traspaso USD→CLP sin calcular nada a mano, con el monto de
  destino ya sugerido.
- **SC-003**: El 100 % de los días del calendario, incluidos fines de semana y feriados, tiene un valor
  del dólar y de la UF consultable.
- **SC-004**: Para cualquier fecha ya registrada, la persona ve el valor del dólar y de la UF de esa
  fecha en una sola consulta.
- **SC-005**: En todo punto donde se muestra una conversión, se ve que es estimada y de qué fecha es
  el valor (verificable en el 100 % de las pantallas que la muestran).
- **SC-006**: En 100 % de los pagos y traspasos con monto editado, lo registrado coincide exactamente
  con lo que la persona confirmó.

## Assumptions

- El dólar observado y la UF se obtienen de mindicador.cl, que publica ambos valores diarios; una única
  tasa por día (no hay compra/venta).
- Hora de Chile (America/Santiago) para el registro de las 8:00; el valor "vigente" es el de la fecha
  de hoy en Chile (o el último registrado si hoy aún no hay).
- La UF se registra y consulta como parte del historial pedido; en esta entrega no se usa para
  sugerir montos en pagos ni traspasos: solo entra en el total estimado del patrimonio (FR-016).
- Esta función reemplaza la regla vigente "sin conversión de moneda" (spec 028) únicamente en la
  forma de sugerencias editables; ninguna conversión se escribe sin confirmación.
- Fuera de alcance: otras monedas distintas de USD y UF, compra/venta con spread de un banco,
  conversión de saldos ya registrados, alertas por variación del valor, y conversión entre dos
  monedas distintas de CLP.
- Los valores de cambio son datos globales de referencia, iguales para todas las personas.
