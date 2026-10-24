# Feature Specification: Guías de finanzas personales para Chile en mifik.cl

**Feature Branch**: `035-chile-guides`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Guías de finanzas personales para Chile en mifik.cl. Una sección pública, sin cuenta, que responde preguntas concretas que la gente busca sobre tarjetas, cuentas y facturación en Chile, para que el sitio aparezca en esas búsquedas más allá de la marca y muestre con credibilidad cómo fik resuelve cada tema. Esta entrega: la base de la sección y la primera guía, 'Fecha de cierre y fecha de pago de la tarjeta de crédito', en español y en inglés. Cada guía: respuesta en el primer párrafo, ejemplo con montos y fechas chilenas, fuentes oficiales (CMF, Banco Central, SERNAC o SII) con enlace, fechas de publicación y revisión, autor 'Equipo fik', índice de secciones, cómo se hace en fik con invitación a crear cuenta (o 'Ir a la app' con sesión), aviso de información general. La sección: índice por idioma enlazado desde el pie y desde Preguntas; direcciones en el idioma de cada página (/es/guias/fecha-de-cierre-tarjeta/) enlazadas con su par; metadatos y datos estructurados propios; mapa del sitio; publicar una guía nueva = agregar su texto, sin código; Lighthouse móvil 100, sin JavaScript para leer. Contenido redactado por Claude desde docs/BANKING_LOGIC.md y fuentes oficiales, revisado por el dueño del producto antes de publicar. Fuera de alcance: otras guías, comentarios, buscador, newsletter, autor con nombre, guía de cuotas sin interés. ClickUp 17tgmdxpmdz y 17tgmdxpme0."

## Clarifications

### Session 2026-10-23

- Q: ¿Qué incluye la primera entrega? → A: La base de la sección y una guía (fecha de cierre y fecha de pago), para validar el formato con una guía real antes de escribir las demás.
- Q: ¿Idiomas? → A: Español e inglés, como el resto del sitio.
- Q: ¿Direcciones? → A: En el idioma de cada página, con las palabras que se buscan (misma excepción que las páginas de UF y dólar).
- Q: ¿Autor? → A: "Equipo fik" por ahora; el autor con nombre personal es otra tarea.
- Q: ¿El ejemplo de la primera guía nombra emisores reales? → A: No: un emisor genérico ("tu banco") con fechas y montos chilenos realistas, y una nota de que cada emisor define su ciclo y que se consulta en el estado de cuenta.
- Q: ¿Para quién es la versión en inglés? → A: Para extranjeros en Chile: misma estructura y ejemplo que la española, con los términos locales en español entre paréntesis y una línea que los explica; mismas fuentes.
- Q: ¿Cómo se muestra "cómo se hace en fik"? → A: Texto con pasos concretos por la app y, como mucho, una ilustración simple del sitio; nunca capturas reales (se desactualizan y pesan).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Leer una guía que responde mi pregunta (Priority: P1)

Una persona busca "qué es la fecha de cierre de la tarjeta" o "cuándo tengo que pagar la tarjeta",
entra a la guía de fik y, sin crear cuenta ni esperar, encuentra la respuesta en el primer párrafo,
un ejemplo con fechas y montos chilenos que lo aterriza, y de dónde sale la información.

**Why this priority**: es la razón de la visita y lo que el buscador evalúa para mostrar la página;
sin una guía útil la sección no tiene valor.

**Independent Test**: abrir la guía en español y en inglés sin sesión, con JavaScript desactivado, y
verificar que se lee completa: respuesta inicial, ejemplo, secciones, fuentes con enlace, fechas,
autor y aviso de información general.

**Acceptance Scenarios**:

1. **Given** la guía publicada, **When** un visitante sin sesión la abre, **Then** el primer párrafo
   responde la pregunta del título sin tener que seguir leyendo.
2. **Given** la guía, **When** el visitante la recorre, **Then** encuentra un ejemplo con fechas y
   montos chilenos, un índice de secciones que lleva a cada una, las fuentes oficiales con enlace, la
   fecha de publicación, la de última revisión y el autor "Equipo fik".
3. **Given** la guía, **When** el visitante llega al final, **Then** ve cómo se hace eso en fik y una
   invitación a crear cuenta; con sesión iniciada, la invitación es "Ir a la app".
4. **Given** cualquier guía, **When** se lee, **Then** muestra un aviso de que es información general
   y no asesoría financiera.
5. **Given** el navegador sin JavaScript, **When** se abre la guía, **Then** todo el contenido se lee
   igual.

---

### User Story 2 - Encontrar las guías y moverme entre ellas (Priority: P2)

Una persona que ya está en el sitio (pie de página, Preguntas) o que llega a una guía quiere ver qué
otras guías hay. Hay una página índice de guías en cada idioma, y cada guía enlaza al índice y a su
versión en el otro idioma.

**Why this priority**: convierte una visita en varias y da al buscador un camino a todas las guías;
con una sola guía aún es secundario, pero es la base para las siguientes.

**Independent Test**: desde el pie de cualquier página y desde Preguntas llegar al índice; desde el
índice abrir la guía; cambiar de idioma y llegar a la misma guía en el otro idioma.

**Acceptance Scenarios**:

1. **Given** cualquier página del sitio, **When** el visitante mira el pie, **Then** encuentra un
   enlace a las guías en su idioma.
2. **Given** la página de Preguntas, **When** el visitante la recorre, **Then** encuentra un enlace a
   las guías.
3. **Given** el índice de guías, **When** se abre, **Then** lista cada guía publicada en ese idioma con
   su título, una línea de resumen y su fecha de última revisión, ordenadas de la más reciente a la
   más antigua.
4. **Given** una guía en un idioma, **When** el visitante cambia de idioma, **Then** llega a la misma
   guía en el otro idioma.

---

### User Story 3 - Aparecer en los buscadores con cada guía (Priority: P2)

El buscador entiende cada guía como un artículo propio: título y descripción específicos, autor,
fechas, en qué idioma está y cuál es su par en el otro idioma, y la encuentra en el mapa del sitio.

**Why this priority**: es el objetivo de negocio (tráfico fuera de la marca); depende de que la guía
exista (US1).

**Independent Test**: leer el documento de cada guía sin ejecutar nada y encontrar título,
descripción, dirección canónica, par de idioma y datos estructurados de artículo; verificar que el
índice y la guía están en el mapa del sitio con su par de idioma.

**Acceptance Scenarios**:

1. **Given** una guía, **When** un buscador lee su documento, **Then** encuentra un título y una
   descripción propios, únicos en el sitio, y datos estructurados de artículo con autor, fecha de
   publicación y de revisión.
2. **Given** el mapa del sitio, **When** se lee, **Then** contiene el índice y cada guía en ambos
   idiomas, enlazadas como pares.
3. **Given** una guía, **When** se mide en un teléfono, **Then** mantiene los puntajes del sitio.

---

### User Story 4 - Publicar una guía nueva sin tocar el sitio (Priority: P3)

Quien mantiene el sitio agrega una guía nueva escribiendo su texto y sus datos (título, resumen,
fechas, fuentes, dirección en cada idioma), y al publicar el sitio aparece en el índice, el mapa del
sitio, con sus metadatos y su par de idioma, sin cambiar nada más.

**Why this priority**: es lo que hace sostenible el plan de guías (cinco más en cola), pero solo se
nota a partir de la segunda guía.

**Independent Test**: agregar una guía de prueba solo con su texto y datos, construir el sitio y
verificar que aparece en el índice, el mapa del sitio y con sus metadatos; quitarla y verificar que
desaparece de todo.

**Acceptance Scenarios**:

1. **Given** una guía nueva escrita con todos sus datos, **When** se publica el sitio, **Then** aparece
   en el índice, el mapa del sitio y con su par de idioma, sin cambios en otras partes.
2. **Given** una guía a la que le falta un dato obligatorio (título, resumen, fecha, fuente o
   dirección), **When** se intenta publicar, **Then** la publicación se detiene indicando qué falta,
   en vez de publicar una guía incompleta.

### Edge Cases

- Una guía escrita en un solo idioma: se publica en ese idioma, sin enlace a un par inexistente, y el
  índice del otro idioma no la lista.
- Dos guías que reclaman la misma dirección: la publicación se detiene.
- Fecha de revisión anterior a la de publicación: la publicación se detiene.
- Índice sin guías en un idioma: muestra un texto que lo dice, sin lista vacía.
- Una fuente oficial cuyo enlace cambia en el futuro: la fecha de revisión visible dice cuándo se
  verificó por última vez.
- Visitante con sesión: la invitación final es "Ir a la app", como en el resto del sitio.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sitio MUST tener una sección pública de guías, sin cuenta ni sesión, con una página
  índice en español y otra en inglés.
- **FR-002**: Cada guía MUST tener una dirección en el idioma de su página, con las palabras que se
  buscan, y MUST enlazar a su versión en el otro idioma cuando existe.
- **FR-003**: Cada guía MUST responder la pregunta de su título en el primer párrafo.
- **FR-004**: Cada guía MUST incluir al menos un ejemplo con fechas y montos chilenos. Los ejemplos
  usan un emisor genérico ("tu banco"), nunca atribuyen un ciclo, tasa o condición a una institución
  real, y dicen dónde consultar el dato real (por ejemplo, el estado de cuenta).
- **FR-004a**: La versión en inglés de una guía MUST tener la misma estructura, ejemplo y fuentes que
  la española, adaptada a extranjeros en Chile: cada término local (estado de cuenta, CuentaRUT, CMF,
  SERNAC…) aparece con su nombre en español entre paréntesis la primera vez y una línea que lo explica.
- **FR-005**: Cada guía MUST mostrar un índice de sus secciones que lleve a cada una.
- **FR-006**: Cada guía MUST citar al menos una fuente oficial (CMF, Banco Central, SERNAC o SII según
  el tema) con enlace.
- **FR-007**: Cada guía MUST mostrar la fecha de publicación, la de última revisión y el autor
  ("Equipo fik").
- **FR-008**: Cada guía MUST terminar explicando cómo se hace eso en fik con pasos concretos en texto
  (por ejemplo "Cuentas → tu tarjeta → Facturación"), sin capturas de pantalla de la app (a lo más una
  ilustración simple del sitio), y con una invitación a crear cuenta que abre el registro del sitio;
  con sesión iniciada, la invitación MUST ser "Ir a la app".
- **FR-009**: Cada guía MUST mostrar un aviso de que es información general y no asesoría financiera.
- **FR-010**: Guías e índice MUST leerse completos sin JavaScript.
- **FR-011**: Cada guía e índice MUST tener título, descripción y dirección canónica propios, con su
  par de idioma, y datos estructurados de artículo (guías) y de colección (índice); todos MUST estar
  en el mapa del sitio.
- **FR-012**: El índice MUST listar las guías de su idioma con título, resumen y fecha de última
  revisión, de la más reciente a la más antigua.
- **FR-013**: El pie de todas las páginas y la página de Preguntas MUST enlazar al índice de guías en
  el idioma de la página.
- **FR-014**: Agregar una guía MUST consistir solo en escribir su texto y sus datos; el índice, el mapa
  del sitio, los metadatos y el par de idioma MUST derivarse de ellos.
- **FR-015**: Una guía con un dato obligatorio faltante, una dirección repetida o una fecha de revisión
  anterior a la de publicación MUST detener la publicación con un mensaje que diga cuál es el problema.
- **FR-016**: La primera guía publicada MUST ser "Fecha de cierre y fecha de pago de la tarjeta de
  crédito", en español y en inglés, consistente con las reglas de facturación que fik aplica.
- **FR-017**: Ninguna guía MUST publicarse sin la revisión del dueño del producto.

### Key Entities

- **Guía**: pregunta que responde (título), resumen, idioma, dirección, fecha de publicación, fecha de
  revisión, autor, fuentes (nombre y enlace), cuerpo con secciones, y su par en el otro idioma.
- **Fuente**: institución oficial, título del documento y enlace.
- **Índice de guías**: la lista por idioma, derivada de las guías publicadas.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Una persona encuentra la respuesta a la pregunta del título en el primer párrafo, sin
  hacer scroll en un teléfono.
- **SC-002**: Guía e índice obtienen en una medición móvil 100 en accesibilidad, buenas prácticas y
  SEO, rendimiento ≥ 95, y muestran su contenido principal en ≤ 2 s.
- **SC-003**: Publicar una segunda guía no requiere cambiar ningún archivo fuera de su propio texto y
  datos.
- **SC-004**: El 100% de las guías publicadas tiene fuentes con enlace, fechas y autor visibles.
- **SC-005**: A 6 semanas de publicada, la guía registra impresiones en el buscador para consultas que
  no contienen la marca.

## Assumptions

- El sitio público ya tiene el mecanismo de registro, de "Ir a la app" con sesión, de páginas
  bilingües con par de idioma y de mapa del sitio; las guías los reutilizan.
- La dirección del índice es `/es/guias/` y `/en/guides/`; las guías van debajo con un nombre en el
  idioma de la página.
- El contenido lo redacta Claude a partir de `docs/BANKING_LOGIC.md` y fuentes oficiales; el dueño
  del producto lo revisa antes de publicarlo. La revisión es un paso del proceso, no del sistema.
- "Equipo fik" es el autor de todas las guías hasta que exista la tarea de autor con nombre.
- Las fechas se muestran en el formato del idioma de la página.
