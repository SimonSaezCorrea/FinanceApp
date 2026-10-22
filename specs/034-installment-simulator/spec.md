# Feature Specification: Simulador público de compra en cuotas en mifik.cl

**Feature Branch**: `034-installment-simulator`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Simulador público de compra en cuotas en mifik.cl. Es una herramienta gratis, sin cuenta, que responde '¿cuánto pago si compro esto en N cuotas?' para personas en Chile. Sirve para posicionar el sitio en búsquedas como 'simulador de cuotas' o 'cuotas sin interés', y termina con una invitación a crear una cuenta en fik para llevar el control de sus cuotas reales. Datos de entrada: precio, número de cuotas y tasa de interés mensual (0 = sin interés). Opcionales: impuesto de timbres y estampillas (prellenado con la tasa legal vigente según el plazo, editable o quitable, avisando cuando difiere del legal) y una comisión o seguro de monto fijo. Moneda: CLP, UF o USD. Sistema de cálculo a elección: cuota fija (francés, por defecto) o capital constante (el de la app), mostrando la diferencia con la cuota fija. Resultados: valor cuota (primera y última si varían), total pagado, intereses y costos, CAE, contado vs cuotas, tabla mes a mes. Montos redondeados a la unidad de la moneda (CLP 0, USD 2, UF 4), la última cuota absorbe el redondeo. Páginas es/en enlazadas, acceso desde el home y el pie, cálculo mientras se escribe y sin conexión a la API, metadatos propios, Lighthouse móvil 100. Fuera de alcance: guardar simulaciones, comparar ofertas, tasas reales de bancos, calculadora de pago mínimo, conversión UF/USD a pesos. Card ClickUp 17tgmdxpm22 (subtarea del plan SEO 17tgmdxpadg)."

## Clarifications

### Session 2026-10-22

- Q: ¿El impuesto de timbres lo escribe la persona o lo calcula la página? → A: Ambos: viene prellenado con la tasa legal según el plazo y la persona puede editarlo o quitarlo (FR-005).
- Q: ¿Cómo se cobran el impuesto y la comisión? → A: Financiados: se suman al precio, forman el monto financiado y se reparten en las cuotas (FR-007).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Saber cuánto pago por una compra en cuotas (Priority: P1)

Una persona busca "simulador de cuotas", entra a la página de fik y, sin crear cuenta, escribe el
precio de lo que quiere comprar, en cuántas cuotas y la tasa mensual que le ofrecen. Al instante ve
el valor de cada cuota, cuánto paga en total y cuánto de eso son intereses y costos.

**Why this priority**: es la pregunta que trae a la persona y lo mínimo que la herramienta debe
responder; todo lo demás la complementa.

**Independent Test**: abrir la página sin sesión, escribir precio $300.000, 6 cuotas, tasa 2% mensual,
sin costos, y comparar el valor cuota con el de una tabla de amortización francesa calculada a mano.

**Acceptance Scenarios**:

1. **Given** la página abierta sin sesión, **When** la persona escribe precio, número de cuotas y tasa
   mensual, **Then** ve el valor de la cuota fija, el total pagado y el total de intereses, y los
   valores cambian mientras escribe, sin botón de calcular.
2. **Given** tasa 0 y sin costos, **When** la persona simula, **Then** cada cuota es el precio dividido
   en partes iguales (la última absorbe el redondeo) y la página dice claramente que no paga más que
   el precio contado.
3. **Given** un dato inválido o incompleto (precio vacío, 0 cuotas, tasa negativa), **When** la persona
   lo escribe, **Then** la página indica qué dato falta o no es válido y no muestra resultados
   inventados.
4. **Given** la página abierta, **When** se pierde la conexión, **Then** la simulación sigue
   funcionando igual.

---

### User Story 2 - Ver el costo real con impuesto, comisión y CAE (Priority: P2)

La persona quiere comparar la oferta con la del banco. Ve el impuesto de timbres y estampillas ya
puesto con la tasa legal que corresponde al plazo; puede cambiarlo, quitarlo o agregar una comisión
o seguro. La página le muestra la CAE (carga anual equivalente) de la simulación, la misma cifra que
los bancos deben informar.

**Why this priority**: la cuota sola engaña; la CAE y los costos son lo que permite comparar ofertas
de verdad, y es el contenido que diferencia la herramienta de una calculadora genérica.

**Independent Test**: simular un caso con impuesto legal y comisión, y comparar la CAE con la
calculada a mano según la definición regulatoria; quitar el impuesto y ver que la CAE baja.

**Acceptance Scenarios**:

1. **Given** cualquier número de cuotas, **When** la persona abre la simulación, **Then** el impuesto de
   timbres aparece prellenado con la tasa legal para ese plazo, y se actualiza si cambia el número de
   cuotas mientras la persona no lo haya editado.
2. **Given** el impuesto prellenado, **When** la persona escribe otra tasa o lo quita, **Then** la
   simulación usa ese valor y la página avisa que difiere del legal, con una forma de volver a él.
3. **Given** una comisión o seguro de monto fijo, **When** la persona lo escribe, **Then** se suma a los
   costos, cambia el total pagado y la CAE.
4. **Given** cualquier simulación válida, **When** se calcula, **Then** la página muestra la CAE con una
   explicación breve de qué es y por qué sirve para comparar.

---

### User Story 3 - Comparar sistemas y ver el detalle mes a mes (Priority: P2)

La persona quiere entender cómo se reparte la deuda. Puede cambiar de cuota fija a capital constante
(cuotas que bajan cada mes) y ver cuánto cambia el total; y abrir una tabla con cada cuota: capital,
interés, costos y monto.

**Why this priority**: responde la duda siguiente de quien ya vio la cuota, y la tabla es el
contenido que los buscadores y la persona leen para confiar en el número.

**Independent Test**: con la misma simulación, cambiar el sistema y verificar que la tabla, la primera
y la última cuota, el total y la diferencia mostrada coinciden con el cálculo a mano.

**Acceptance Scenarios**:

1. **Given** una simulación en cuota fija, **When** la persona elige capital constante, **Then** ve la
   primera y la última cuota, el nuevo total y cuánto más o menos paga que con cuota fija.
2. **Given** cualquier sistema, **When** la persona ve la tabla mes a mes, **Then** cada fila muestra
   número de cuota, capital, interés, costos y monto, y las sumas de la tabla cuadran exacto con los
   totales mostrados.
3. **Given** cualquier simulación, **When** se muestran montos, **Then** están redondeados a la unidad
   de la moneda (CLP sin decimales, USD con 2, UF con 4) y la última cuota absorbe la diferencia.

---

### User Story 4 - Comparar contado vs cuotas (Priority: P3)

La persona quiere saber si le conviene pagar al contado. La página le dice cuánto más paga en cuotas
que al contado (en monto y en porcentaje), o que no paga más si de verdad es sin interés y sin
costos; si el comercio ofrece un descuento por pagar al contado, puede escribir ese precio contado
para compararlo.

**Why this priority**: es la pregunta detrás de "cuotas sin interés", una búsqueda concreta, pero
depende de que la simulación base ya exista.

**Independent Test**: simular "3 cuotas sin interés" con impuesto legal y ver que la página informa el
costo del impuesto como lo único que se paga de más; escribir un precio contado menor y ver la
diferencia.

**Acceptance Scenarios**:

1. **Given** tasa 0 y sin ningún costo, **When** se simula, **Then** la página dice que en cuotas paga lo
   mismo que al contado.
2. **Given** tasa 0 pero con impuesto o comisión, **When** se simula, **Then** la página dice que no es
   del todo "sin interés": paga el costo indicado de más.
3. **Given** un precio contado menor al precio en cuotas, **When** la persona lo escribe, **Then** la
   comparación se hace contra ese precio contado.

---

### User Story 5 - Encontrar la herramienta y pasar a la app (Priority: P3)

La herramienta se encuentra en buscadores (en español e inglés), desde el home y desde el pie de
página de todo el sitio, y termina con una invitación a crear una cuenta en fik para llevar el
control de las cuotas reales.

**Why this priority**: es el objetivo de negocio (tráfico y registros), pero solo sirve si la
herramienta ya responde bien.

**Independent Test**: leer el documento de la página sin ejecutar nada y encontrar título,
descripción y una explicación del cálculo; seguir el enlace desde el home y el pie; abrir la
invitación y llegar al registro.

**Acceptance Scenarios**:

1. **Given** el sitio en español o inglés, **When** la persona navega el home o cualquier pie de
   página, **Then** encuentra un enlace al simulador en su idioma.
2. **Given** la página en un idioma, **When** la persona cambia de idioma, **Then** llega a la misma
   herramienta en el otro idioma.
3. **Given** cualquier simulación, **When** la persona llega al final, **Then** ve una invitación a
   crear cuenta que abre el registro del sitio.

### Edge Cases

- Precio con separadores de miles o decimales según el idioma ("300.000" en español, "300,000" en
  inglés), o pegado con símbolo de moneda.
- 1 cuota: es un pago único; se muestra igual de forma coherente (sin tabla vacía ni CAE absurda).
- Número de cuotas muy alto o tasa muy alta: se acepta hasta un límite razonable y se avisa fuera de
  él, sin números ilegibles.
- Tasa con decimales ("1,89%").
- Montos pequeños en UF o USD donde el redondeo pesa más que el interés.
- Costos mayores que el precio: se calcula, pero la CAE resultante puede ser altísima; se muestra sin
  romper el diseño.
- Cambiar de moneda con montos ya escritos: los números se reinterpretan en la nueva moneda (no se
  convierten).
- Cambiar el número de cuotas después de haber editado el impuesto: se conserva el valor escrito.
- Visitante con sesión iniciada: la invitación final cambia por "Ir a la app", como en el resto del
  sitio.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El simulador MUST estar disponible sin cuenta ni sesión, en una página en español y otra
  en inglés, con nombres de dirección que contengan las palabras que se buscan en cada idioma
  (excepción a la convención de nombres en inglés, como las páginas de UF y dólar).
- **FR-002**: La persona MUST poder ingresar precio, número de cuotas (entero, mínimo 1) y tasa de
  interés mensual (≥ 0, con decimales), y elegir moneda: CLP (por defecto), UF o USD.
- **FR-003**: Los resultados MUST recalcularse mientras la persona escribe, sin botón de calcular y sin
  depender de una conexión al servidor de fik después de cargar la página.
- **FR-004**: La persona MUST poder elegir el sistema de cálculo: cuota fija (sistema francés, por
  defecto) o capital constante (cuotas decrecientes, el mismo reparto que usa la app fik).
- **FR-005**: El impuesto de timbres y estampillas MUST venir prellenado con la tasa legal vigente que
  corresponde al plazo elegido, recalculada al cambiar el plazo mientras la persona no lo haya
  editado; la persona MUST poder editarlo o quitarlo, y la página MUST avisar cuando el valor usado
  difiere del legal y ofrecer volver a él.
- **FR-006**: La persona MUST poder agregar opcionalmente una comisión o seguro de monto fijo.
- **FR-007**: Los costos (impuesto y comisión) MUST financiarse dentro de las cuotas: se suman al
  precio para formar el monto financiado (que también genera interés), y la tabla mes a mes MUST
  mostrar qué parte de cada cuota corresponde a costos.
- **FR-008**: La página MUST mostrar: valor de la cuota (o primera y última si varían), total pagado,
  total de intereses, total de costos y la CAE de la simulación, con una explicación breve de la CAE.
- **FR-009**: La CAE MUST calcularse según la definición regulatoria chilena (la tasa que iguala lo
  recibido con todos los pagos, expresada en forma anual), incluyendo intereses, impuesto y comisión.
- **FR-010**: Con capital constante, la página MUST mostrar la diferencia de total pagado respecto de
  cuota fija para la misma simulación.
- **FR-011**: La página MUST mostrar una comparación contado vs cuotas: cuánto más se paga en monto y
  porcentaje, o que no se paga más cuando es sin interés y sin costos; con tasa 0 y costos, MUST
  decir que el costo extra existe. La persona MUST poder escribir opcionalmente un precio contado
  distinto del precio en cuotas.
- **FR-012**: La página MUST mostrar una tabla mes a mes con número de cuota, capital, interés, costos
  y monto; sus sumas MUST coincidir exactamente con los totales mostrados.
- **FR-013**: Todo monto MUST redondearse a la unidad de su moneda (CLP sin decimales, USD con 2,
  UF con 4); la última cuota MUST absorber la diferencia de redondeo para que la suma cuadre exacto.
- **FR-014**: Datos inválidos o incompletos MUST mostrar qué dato corregir y MUST NOT mostrar resultados
  calculados con ellos; límites de cuotas y tasa fuera de rango MUST avisarse.
- **FR-015**: Los números MUST leerse y mostrarse con el formato del idioma de la página.
- **FR-016**: Cada página MUST tener título, descripción, dirección canónica, enlace a su versión en el
  otro idioma y estar en el mapa del sitio; el documento MUST contener, legible sin ejecutar nada,
  una explicación del cálculo y un ejemplo resuelto.
- **FR-017**: El simulador MUST enlazarse desde el home y desde el pie de página de todo el sitio, en
  ambos idiomas.
- **FR-018**: La página MUST terminar con una invitación a crear cuenta en fik que abre el registro del
  sitio; con sesión iniciada, se reemplaza por "Ir a la app", como en el resto del sitio.
- **FR-019**: La página MUST indicar que es una simulación referencial, que las condiciones reales las
  informa la institución, y citar la fuente de la tasa del impuesto y de la definición de CAE.
- **FR-020**: Ningún dato de la simulación MUST guardarse ni enviarse a fik.

### Key Entities

- **Simulación**: precio, precio contado opcional, moneda, número de cuotas, tasa mensual, sistema de
  cálculo, impuesto de timbres (legal o escrito), comisión fija. Vive solo en la página, nunca se
  guarda.
- **Cuota**: número, capital, interés, costos y monto; el conjunto suma exacto a los totales.
- **Resultado**: valor cuota (o primera y última), total pagado, intereses, costos, CAE, diferencia
  entre sistemas y comparación con el contado.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Para un conjunto de al menos 10 casos de referencia (incluyendo sin interés, con interés,
  con costos, 1 cuota, CLP/UF/USD y ambos sistemas), valor cuota, totales y CAE coinciden con el
  cálculo a mano a la unidad de la moneda (CAE con 2 decimales).
- **SC-002**: Una persona sin cuenta obtiene el valor de su cuota en menos de 30 segundos desde que
  abre la página.
- **SC-003**: Las páginas mantienen el puntaje del sitio en una medición móvil: rendimiento ≥ 95 y
  accesibilidad, buenas prácticas y SEO en 100, con el contenido principal visible en ≤ 2 s.
- **SC-004**: El resultado se actualiza en menos de 100 ms después de cada pulsación de tecla en un
  teléfono de gama media.
- **SC-005**: A 6 semanas de publicada, cada página del simulador registra impresiones en el buscador
  para consultas que no contienen la marca.

## Assumptions

- La tasa legal del impuesto de timbres y estampillas es la vigente para operaciones de crédito en
  Chile (una tasa por mes o fracción con un tope anual); su valor exacto y fuente se confirman en la
  planificación.
- La CAE se calcula como la define la regulación chilena de créditos de consumo; la fórmula exacta se
  confirma en la planificación.
- La tasa ingresada es la tasa de interés mensual que informa la oferta; no se acepta tasa anual ni
  se convierte.
- Límites razonables: hasta 60 cuotas y tasa mensual hasta un máximo razonable (cerca de la tasa
  máxima convencional); se ajustan en la planificación.
- Todas las cuotas son mensuales y empiezan un mes después de la compra; no hay meses de gracia ni
  cuotas diferidas.
- UF y USD se simulan en su propia moneda; no se convierten a pesos.
- El registro y "Ir a la app" reutilizan el acceso del sitio público ya existente.
