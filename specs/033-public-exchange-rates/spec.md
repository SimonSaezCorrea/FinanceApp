# Feature Specification: Valor UF y dólar observado, públicos en mifik.cl

**Feature Branch**: `033-public-exchange-rates`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Valor UF y dólar observado, públicos en mifik.cl. mifik.cl solo aparece cuando alguien busca la marca; el valor diario de la UF y del dólar observado es de las búsquedas financieras más frecuentes en Chile ('valor uf hoy', 'dólar observado hoy', 'uf a pesos', 'valor uf 15 de marzo'). fik ya registra esos valores cada día, pero solo se ven con sesión. Publicarlos en el sitio público, una página por indicador en español e inglés: valor de hoy con fecha y variación, aviso de dato arrastrado, historial (gráfico y tabla, 30 días y 1 año), elegir una fecha, conversor pesos↔UF / pesos↔dólares, invitación a crear cuenta, valor legible por buscadores en la propia página, título/descripción/datos estructurados propios, sitemap, enlace desde el sitio y fuente citada. Fuera de alcance: otros indicadores, UF↔dólar directo, alertas, páginas por mes o día y cambios en la pantalla 'Tipos de cambio' de la app. Primera pieza del plan SEO (card ClickUp 17tgmdxpadg)."

## Clarifications

### Session 2026-10-21

- Q: ¿Qué tan fresco ve el valor la persona que entra? → A: El documento trae el valor del día (para buscadores) y, al abrirse, la página lo reemplaza si hay uno más nuevo registrado, sin esperar a cargar para mostrarse.
- Q: ¿Cómo se llaman las URLs? → A: Un nombre por idioma con las palabras que se buscan: `/es/valor-uf/`, `/es/dolar-observado/`, `/en/uf-value/`, `/en/dollar-rate/` (excepción deliberada a la convención de nombres en inglés del sitio).
- Q: ¿Dónde se enlazan las páginas dentro del sitio? → A: En el pie de página de todo el sitio y en un bloque del home que muestra el valor del día de cada indicador y lleva a su página; el encabezado no cambia.
- Q: ¿La fecha elegida queda en la URL? → A: Sí, como parámetro (`?fecha=AAAA-MM-DD` en español, `?date=YYYY-MM-DD` en inglés): se puede compartir y recargar; para buscadores es la misma página (la URL canónica no lleva la fecha).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Ver el valor de hoy desde un buscador (Priority: P1)

Una persona busca "valor uf hoy" o "dólar observado hoy", entra a la página de fik del indicador y,
sin crear cuenta ni esperar, ve el valor en pesos del día con su fecha, cuánto cambió respecto del
día anterior y de dónde sale el dato. Si el valor de hoy todavía no se publicó, la página lo dice y
muestra el último conocido con su fecha.

**Why this priority**: es la razón de la búsqueda y lo único que el buscador lee para decidir mostrar
la página; sin esto no hay tráfico que convertir.

**Independent Test**: abrir la página de la UF y la del dólar, en español y en inglés, sin sesión, y
comparar el valor y la fecha con los que muestra la pantalla "Tipos de cambio" de la app; leer el
documento de la página sin ejecutar nada y encontrar el mismo valor.

**Acceptance Scenarios**:

1. **Given** el valor de la UF de hoy está registrado, **When** un visitante sin sesión abre la página
   de la UF, **Then** ve "1 UF = $X" con la fecha de hoy, la variación respecto del día anterior
   (monto y porcentaje) y la fuente.
2. **Given** el dólar observado de hoy aún no se publicó y el último valor es de ayer, **When** abre la
   página del dólar, **Then** ve el valor de ayer rotulado como el último publicado, con su fecha, y
   nunca como "el de hoy".
3. **Given** cualquier página del indicador, **When** un buscador lee el documento sin ejecutar nada,
   **Then** encuentra el valor del día, la fecha, un título y una descripción propios de esa búsqueda
   y los datos estructurados del indicador.
4. **Given** la versión en inglés de una página, **When** se abre, **Then** muestra el mismo valor con
   textos y formato de fecha y números en inglés, y ambas versiones se declaran como alternativas
   de idioma una de la otra.

---

### User Story 2 - Convertir un monto (Priority: P2)

La persona quiere saber cuántos pesos son 3,5 UF o cuántos dólares son $500.000. En la misma página
escribe el monto en cualquiera de los dos lados y ve el otro, calculado con el valor de hoy o con el
de la fecha que eligió.

**Why this priority**: "uf a pesos" es la segunda búsqueda más común y la que más tiempo retiene en la
página; vale poco sin el valor del día (US1).

**Independent Test**: en la página de la UF, escribir 3,5 en UF y comprobar el resultado en pesos
contra el valor del día; escribir pesos y comprobar las UF; repetir con una fecha elegida y
compararlo con la conversión de la app para esa misma fecha.

**Acceptance Scenarios**:

1. **Given** la página de la UF con el valor de hoy, **When** escribe 3,5 en el campo UF, **Then** el
   campo pesos muestra 3,5 × valor, redondeado a pesos enteros.
2. **Given** la página del dólar, **When** escribe 500.000 en pesos, **Then** ve el equivalente en
   dólares con dos decimales.
3. **Given** eligió una fecha pasada (US3), **When** convierte, **Then** usa el valor de esa fecha y lo
   dice junto al resultado.
4. **Given** un monto vacío, cero, negativo o no numérico, **When** lo escribe, **Then** no aparece un
   resultado inventado ni un error técnico: el otro campo queda vacío o muestra un aviso breve.

---

### User Story 3 - Historial y valor de una fecha (Priority: P3)

La persona necesita el valor de un día puntual (por ejemplo, para un arriendo reajustado en UF el 15
de marzo) o ver cómo evolucionó. Ve un gráfico y una tabla de los últimos 30 días y del último año, y
puede elegir cualquier fecha registrada para ver su valor.

**Why this priority**: amplía las búsquedas que la página responde ("valor uf 15 de marzo") y el
tiempo de permanencia, pero la página ya es útil sin esto.

**Independent Test**: cambiar entre 30 días y 1 año y comprobar que gráfico y tabla cubren ese
período; elegir una fecha y ver su valor, distinguiendo si fue arrastrado.

**Acceptance Scenarios**:

1. **Given** la página de un indicador, **When** elige "30 días" o "1 año", **Then** el gráfico y la
   tabla muestran los valores de ese período, con los arrastrados distinguibles de los publicados.
2. **Given** elige una fecha registrada, **When** la confirma, **Then** ve el valor de esa fecha con
   su indicación de publicado o arrastrado, y el conversor pasa a usarla.
3. **Given** elige una fecha anterior al primer valor registrado, **When** la confirma, **Then** ve
   "sin dato para esa fecha", nunca un valor inventado.
4. **Given** el selector de fecha, **When** intenta elegir una fecha posterior a hoy, **Then** no puede.

---

### User Story 4 - Pasar de la página a fik (Priority: P3)

Después de ver el valor, la persona entiende que fik usa estos valores para mostrar sus saldos en
dólares y en UF estimados en pesos, y puede crear una cuenta desde la misma página.

**Why this priority**: es el retorno de negocio de la feature; depende de que la página atraiga
visitas (US1).

**Independent Test**: desde cada página, seguir la invitación y llegar al registro de fik en el idioma
de la página.

**Acceptance Scenarios**:

1. **Given** cualquier página de indicador, **When** la recorre, **Then** encuentra una invitación que
   explica en una o dos frases para qué usa fik estos valores, con una acción "Crear cuenta".
2. **Given** pulsa "Crear cuenta", **When** se abre el registro, **Then** está en el idioma de la página.

---

### Edge Cases

- El servicio que entrega los valores no responde: la página igual se ve, con el último valor
  conocido y su fecha, o con un aviso si no tiene ninguno; nunca una página rota ni en blanco.
- El valor de hoy aún no se publicó (fines de semana, feriados, o el dólar antes de su hora): se
  muestra el último publicado con su fecha y rotulado como tal.
- La variación cuando el día anterior también fue arrastrado: se compara con el valor del día
  anterior registrado; si son iguales, la variación es 0 y se muestra como "sin cambio".
- No hay valor del día anterior (primer día registrado): no se muestra variación.
- El visitante tiene sesión iniciada: la página se comporta igual (es pública).
- El visitante usa el navegador en inglés pero llega a la página en español (o al revés): ve la versión
  de la URL a la que llegó, con un enlace a la otra.
- Montos muy grandes o con muchos decimales en el conversor: se aceptan hasta la precisión de cada
  moneda (pesos sin decimales, dólar 2, UF 4) y el resultado se redondea a la precisión del destino.
- Un enlace con una fecha mal escrita, futura o anterior al primer registro: la página muestra el valor
  de hoy con un aviso breve (fecha inválida o futura) o "sin dato para esa fecha", nunca un error.
- Una página abierta desde ayer: al volver a ella no queda mostrando el valor de ayer como "hoy".

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sitio público MUST tener una página para la UF y una para el dólar observado, cada una
  en español y en inglés, accesibles sin cuenta, en `/es/valor-uf/`, `/es/dolar-observado/`,
  `/en/uf-value/` y `/en/dollar-rate/` (cada par declarado como alternativa de idioma del otro).
- **FR-002**: Cada página MUST mostrar el valor vigente (1 unidad del indicador en pesos chilenos), su
  fecha, la variación respecto del valor del día anterior (monto y porcentaje) y la fuente del dato.
- **FR-003**: Cuando el valor vigente fue arrastrado (no publicado ese día), la página MUST indicarlo y
  mostrar la fecha de publicación real; MUST NOT presentarlo como el valor de hoy.
- **FR-004**: Los valores mostrados MUST ser los mismos que registra fik para sus usuarios (misma fecha,
  mismo valor, misma condición de arrastrado); la página MUST NOT obtener ni calcular valores por
  otra vía.
- **FR-005**: El valor del día, su fecha, el título y la descripción de la página MUST estar presentes
  en el documento que recibe un buscador, sin depender de que se ejecute código en el navegador.
- **FR-006**: El valor que lee un buscador MUST tener como máximo un día de antigüedad respecto del
  último valor registrado. Al abrirse en el navegador, la página MUST consultar el último valor
  registrado y, si es más nuevo que el del documento, reemplazarlo (valor, fecha, variación y
  conversor) sin que la página espere esa consulta para mostrarse; si la consulta falla, queda el
  valor del documento con su fecha.
- **FR-007**: Cada página MUST declarar título, descripción, URL canónica, alternativa de idioma y datos
  estructurados propios del indicador, y MUST figurar en el sitemap.
- **FR-008**: Cada página MUST ofrecer un historial con gráfico y tabla de los últimos 30 días y del
  último año, distinguiendo los valores arrastrados.
- **FR-009**: El visitante MUST poder elegir una fecha entre la del primer valor registrado y hoy y ver
  su valor; una fecha sin registro MUST mostrar "sin dato para esa fecha". La fecha elegida MUST
  quedar en la URL (`?fecha=AAAA-MM-DD` en español, `?date=YYYY-MM-DD` en inglés), de modo que abrir
  o recargar ese enlace muestre esa fecha y el conversor la use; la URL canónica de la página MUST NOT
  llevar el parámetro.
- **FR-010**: Cada página MUST ofrecer un conversor en ambos sentidos (pesos ↔ UF o pesos ↔ dólares) con
  el valor vigente o el de la fecha elegida, indicando qué fecha usa. De unidad a pesos, el resultado
  MUST coincidir con la conversión que hace la app para el mismo monto y la misma fecha; de pesos a
  unidad (que la app no ofrece) MUST usar la misma regla con el valor inverso. Precisión y redondeo
  de destino: pesos 0 decimales, dólar 2, UF 4. Los montos se escriben con el formato numérico del
  idioma de la página.
- **FR-011**: El conversor MUST NOT mostrar resultado para entradas vacías, no numéricas, negativas o
  cero.
- **FR-012**: Cada página MUST incluir una invitación a crear cuenta en fik que explique el uso de
  estos valores en la app y lleve al registro en el idioma de la página.
- **FR-013**: Las páginas de indicadores MUST estar enlazadas desde el pie de página de todo el sitio
  público y entre sí. El home (en cada idioma) MUST incluir un bloque con el valor del día de la UF y
  del dólar observado, con la misma regla de frescura y de dato arrastrado que las páginas (FR-003,
  FR-006), que lleve a cada página. El encabezado del sitio no cambia.
- **FR-014**: Si el servicio de valores no está disponible, la página MUST seguir mostrándose con el
  último valor conocido y su fecha, o con un aviso cuando no hay ninguno.
- **FR-015**: Las páginas MUST cumplir las mismas exigencias de accesibilidad, temas claro/oscuro,
  responsividad e idioma que el resto del sitio público.
- **FR-016**: Exponer estos valores sin sesión MUST NOT exponer ningún dato de usuarios ni permitir
  consultar más que los valores públicos del dólar y de la UF.

### Key Entities

- **Valor diario de un indicador**: el valor en pesos de 1 UF o de 1 dólar observado en una fecha de
  Chile, con la fecha en que la fuente lo publicó (si es anterior, el valor es arrastrado). Es el
  mismo registro que fik ya guarda; esta feature solo lo muestra.
- **Página de indicador**: una por indicador y por idioma, con su URL, título, descripción y su
  alternativa en el otro idioma.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: En las 4 páginas (2 indicadores × 2 idiomas), el valor y la fecha mostrados sin sesión
  coinciden con los de la pantalla "Tipos de cambio" de la app en el 100 % de las comprobaciones.
- **SC-002**: El documento de cada página, leído sin ejecutar código, contiene el valor del día y su
  fecha.
- **SC-003**: Para 10 montos y fechas de prueba, el conversor de unidad a pesos da exactamente el mismo
  resultado que la app, y el de pesos a unidad redondea a la precisión de la moneda de destino.
- **SC-004**: En la medición móvil estándar, las 4 páginas obtienen 100 en Accesibilidad,
  Recomendaciones y SEO, y al menos 95 en Rendimiento.
- **SC-005**: Las 4 páginas figuran en el sitemap y quedan indexadas dentro de las 4 semanas siguientes
  a su publicación.
- **SC-006**: A las 8 semanas de publicadas, las páginas reciben impresiones en búsquedas que contienen
  "uf" o "dólar"/"dolar" (medido en el informe de rendimiento del buscador).
- **SC-007**: Con el servicio de valores caído, las 4 páginas siguen cargando y muestran un valor con
  su fecha o un aviso.

## Assumptions

- Los valores provienen exclusivamente del registro diario que fik ya mantiene (specs/030), con su
  misma fuente, horario y regla de arrastre; esta feature no cambia cómo se registran.
- "Hoy" y las fechas son días de Chile (America/Santiago), igual que en la app.
- La fecha más antigua elegible es la del primer valor registrado (hoy, un año hacia atrás); no se
  rellena historial anterior.
- La precisión de cada moneda es la que ya usa la app (CLP 0, USD 2, CLF 4 decimales).
- La fuente citada es la misma que usa el registro de fik (mindicador.cl, que publica datos del Banco
  Central de Chile).
- Las URLs llevan el prefijo de idioma del sitio, pero su nombre está en el idioma de la página (ver
  FR-001): es una excepción deliberada a la convención de nombres en inglés, solo para estas páginas.
- La invitación a crear cuenta reutiliza el acceso del sitio público que ya existe.
- El bloque del home es un resumen (valor y fecha de cada indicador); historial y conversor viven solo
  en las páginas de indicador.
- Que la pantalla "Tipos de cambio" de la app y estas páginas sean distintas es intencional: la de la
  app no cambia.
