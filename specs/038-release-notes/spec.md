# Feature Specification: Novedades — registro de cambios de cada despliegue

**Feature Branch**: `038-release-notes`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Novedades: registro de cambios de cada despliegue a producción (nuevo, mejora, corrección, cambio, seguridad), escrito para personas en es+en, un archivo Markdown por despliegue en el repo; visible en el sitio público (/es/novedades/, /en/whats-new/, footer columna fik, sitemap, llms.txt, sin React) y en la app (acceso "Novedades" con punto cuando hay despliegues no vistos, "visto" guardado en la cuenta, entre dispositivos); publicar a main falla si trae commits feat/fix no cubiertos por una entrada (hook pre-push al empujar a main y CI en main), con mensaje que nombra los commits faltantes; primera entrada para el despliegue 8af6853d..acae5486 del 2026-10-26; historia anterior no se reconstruye. ClickUp 17tgmdxpv9z."

## Clarifications

### Session 2026-10-26

- Q: ¿Dónde se ve el registro? → A: En los dos lados: el sitio público (`/es/novedades/`,
  `/en/whats-new/`) y la app, con un punto mientras haya despliegues no vistos (decisión del dueño).
- Q: ¿Dónde se guarda "visto"? → A: En la cuenta, como el cierre de la guía de primeros pasos: vale en
  todos los dispositivos (decisión del dueño).
- Q: ¿Cómo se escribe un registro? → A: Un archivo por despliegue y por idioma, en el repositorio,
  escrito para personas, con los cambios agrupados en Nuevo/Mejora/Corrección/Cambio/Seguridad
  (decisión del dueño).
- Q: ¿Cómo se garantiza que todo quede registrado? → A: El registro lista los commits que cubre; una
  verificación en el pre-push a `main` y en la integración continua sobre `main` falla si llegan
  `feat`/`fix` no cubiertos y los nombra; los tipos internos no requieren registro (decisión del dueño).
- Q: ¿Qué historia se carga? → A: Solo el despliegue `8af6853d..acae5486` del 2026-10-26; lo anterior
  no se reconstruye (decisión del dueño).
- Q: ¿Qué cuenta como "visto"? → A: Abrir la vista Novedades en la app marca el registro más reciente;
  "visto" es el identificador de ese registro y solo avanza.
- Q: ¿Una cuenta nueva ve el punto? → A: Sí, una vez: nunca vio nada (lo más simple y explicable).
- Q: ¿De dónde lee la app los registros? → A: De la misma fuente que el sitio, empaquetada en la app;
  no consulta el sitio público en tiempo de ejecución.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Saber qué cambió en fik (Priority: P1)

Una persona (con o sin cuenta) quiere saber qué hay de nuevo en fik: abre "Novedades" en el sitio
público y ve cada despliegue, el más reciente primero, con su fecha y lo que cambió agrupado en
Nuevo, Mejora, Corrección, Cambio y Seguridad, escrito en lenguaje de persona, no de programador.

**Why this priority**: es el registro mismo; sin él no hay nada que mostrar en la app ni que exigir al
publicar.

**Independent Test**: abrir `/es/novedades/` y `/en/whats-new/` sin sesión y con JavaScript
desactivado; aparece la entrada del 2026-10-26 con sus cambios agrupados, enlazada con su par en el
otro idioma, presente en el mapa del sitio, en `/llms.txt` y en el pie de página (columna _fik_).

**Acceptance Scenarios**:

1. **Given** el sitio construido, **When** un visitante abre `/es/novedades/`, **Then** ve los
   despliegues del más nuevo al más antiguo, cada uno con fecha, título y sus cambios agrupados por
   tipo, en español.
2. **Given** la misma página en inglés (`/en/whats-new/`), **When** se abre, **Then** muestra lo mismo
   en inglés y cada página declara a la otra como su versión en el otro idioma.
3. **Given** cualquier página del sitio, **When** se mira el pie, **Then** la columna _fik_ enlaza a
   Novedades.
4. **Given** un despliegue registrado, **When** se mira el título de su entrada, **Then** tiene una
   dirección propia (ancla) que se puede compartir.

---

### User Story 2 - Enterarme en la app de que hay novedades (Priority: P2)

Una persona usando la app ve un punto en el acceso "Novedades" cuando hay despliegues que todavía no
vio. Al abrir Novedades, lee los cambios y el punto desaparece, también en sus otros dispositivos.

**Why this priority**: lleva el registro a quien usa el producto, que es quien más se beneficia de
saber qué cambió.

**Independent Test**: con una cuenta que nunca abrió Novedades, el acceso muestra el punto; abrir
Novedades lo apaga; iniciar sesión en otro navegador ya no lo muestra; agregar un despliegue nuevo lo
vuelve a mostrar.

**Acceptance Scenarios**:

1. **Given** una cuenta que no ha visto el despliegue más reciente, **When** abre la app, **Then** el
   acceso a Novedades muestra un punto de aviso (en la barra lateral, el riel contraído y la hoja
   "Más" del teléfono).
2. **Given** el punto visible, **When** la persona abre Novedades, **Then** ve la lista de despliegues
   en su idioma y el punto desaparece.
3. **Given** que lo vio en un dispositivo, **When** inicia sesión en otro, **Then** el punto no
   aparece.
4. **Given** que se publica un despliegue nuevo, **When** vuelve a la app, **Then** el punto reaparece.
5. **Given** que marcar como visto se repite (doble clic, reintento), **When** ocurre, **Then** no
   cambia nada más ni falla.

---

### User Story 3 - Publicar sin olvidar registrar (Priority: P1)

Quien publica a producción no puede llevar a `main` cambios visibles (commits `feat`/`fix`) sin que
algún registro de Novedades los cubra. Si falta, la publicación se detiene y el mensaje dice
exactamente qué commits faltan y cómo cubrirlos.

**Why this priority**: es la garantía pedida ("todo debe quedar registrado"); sin ella el registro se
desactualiza en el primer despliegue apurado.

**Independent Test**: correr la verificación sobre un rango con un `feat` no cubierto (falla y lo
nombra), con todo cubierto (pasa) y con solo `chore`/`docs` (pasa).

**Acceptance Scenarios**:

1. **Given** commits `feat`/`fix` hacia `main` no listados en ningún registro, **When** se empuja a
   `main`, **Then** el empuje se rechaza listando cada commit faltante (hash corto y asunto).
2. **Given** los mismos commits listados en un registro, **When** se empuja, **Then** pasa.
3. **Given** solo commits internos (`test`, `ci`, `chore`, `docs`, `build`, `refactor`, `style`,
   `perf`, `revert`, merges), **When** se empuja, **Then** pasa sin exigir registro.
4. **Given** un empuje a `main` que se saltó el hook, **When** corre la integración continua sobre
   `main`, **Then** la misma verificación falla y el despliegue no ocurre.
5. **Given** el estado actual de `main` (despliegue `8af6853d..acae5486`), **When** se verifica,
   **Then** pasa gracias a la primera entrada.

### Edge Cases

- Un registro existe en un idioma y no en el otro: la construcción se detiene nombrando el archivo
  (las dos versiones son obligatorias).
- Un registro con un tipo de cambio desconocido, sin cambios, con fecha inválida o con un hash mal
  formado: la construcción se detiene nombrando el archivo.
- Un commit `feat` con `!` (cambio incompatible) o con alcance (`feat(api):`) cuenta igual.
- Un registro que lista un hash abreviado: cubre al commit cuyo hash completo empieza con él.
- Primer push a `main` o rango sin base (historia reescrita, `before` en ceros): la verificación en CI
  se omite con un aviso, no falla.
- Una cuenta nueva: no ha visto nada, así que ve el punto una vez.
- La app no puede guardar "visto" (sin conexión): el punto sigue y se reintenta la próxima vez que se
  abra Novedades; nunca bloquea la lectura.
- Historia anterior al 2026-10-26: no se reconstruye; la página dice desde cuándo hay registro.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Cada despliegue a producción tiene UN registro en el repositorio, con una versión en
  español y otra en inglés, fecha, título breve, y sus cambios agrupados por tipo: Nuevo, Mejora,
  Corrección, Cambio, Seguridad.
- **FR-002**: Cada registro declara los commits que cubre; la lista es parte del registro y se valida.
- **FR-003**: El contenido de los registros se valida al construir el sitio; un registro inválido o
  sin su par de idioma detiene la construcción nombrando el archivo.
- **FR-004**: El sitio público muestra Novedades en `/es/novedades/` y `/en/whats-new/`: todos los
  registros del idioma, el más nuevo primero, cada uno con ancla propia; legible sin JavaScript y sin
  cargar código de interfaz al llegar.
- **FR-005**: Las páginas de Novedades tienen título, descripción, canónica y enlaces de idioma
  propios, están en el mapa del sitio con su par real, en `/llms.txt` y enlazadas desde la columna
  _fik_ del pie en todas las páginas.
- **FR-006**: La app tiene un acceso "Novedades" en la barra lateral (abierta y riel) y en la hoja
  "Más" del teléfono, que abre una vista con los mismos registros que el sitio público, en el idioma de
  la persona.
- **FR-007**: El acceso muestra un punto mientras exista un registro más reciente que el último que la
  cuenta vio.
- **FR-008**: "Visto" se guarda en la cuenta (no en el navegador) y vale en todos los dispositivos;
  marcarlo es idempotente y nunca retrocede (marcar uno más antiguo no cambia nada).
- **FR-009**: Abrir Novedades en la app marca como visto el registro más reciente.
- **FR-010**: Una verificación compara los commits `feat`/`fix` (sin merges) del rango que se publica
  contra los commits cubiertos por los registros y falla nombrando los que faltan; los demás tipos no
  requieren registro.
- **FR-011**: La verificación corre en el hook de pre-push al empujar a `main` y en la integración
  continua sobre `main`, antes del despliegue.
- **FR-012**: La verificación ofrece una forma de listar los commits pendientes de registrar para
  escribir el siguiente registro.
- **FR-013**: El primer registro cubre el despliegue `8af6853d..acae5486` (2026-10-26); no se
  reconstruye historia anterior.
- **FR-014**: Todo texto de interfaz nuevo existe en español e inglés; ningún texto `landing.*` lleva
  rayas largas; "fik" va en cursiva donde el formato lo permite.

### Key Entities

- **Registro de despliegue (release)**: identificador (fecha + nombre corto), fecha, título, resumen
  opcional, cambios por tipo (por idioma), commits cubiertos.
- **Última novedad vista (cuenta)**: identificador del registro más reciente que la persona vio.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: El 100% de los commits `feat`/`fix` que llegan a `main` después de esta entrega quedan
  cubiertos por algún registro (la publicación no ocurre en caso contrario).
- **SC-002**: Una persona encuentra qué cambió en el último despliegue en menos de 2 clics desde
  cualquier página del sitio o de la app.
- **SC-003**: El punto de la app desaparece en todos los dispositivos de la cuenta tras abrir
  Novedades una vez.
- **SC-004**: El mensaje de error de la verificación permite escribir el registro faltante sin
  consultar git: nombra hash y asunto de cada commit.
- **SC-005**: Las páginas públicas de Novedades se leen completas sin JavaScript.

## Assumptions

- Los commits siguen Conventional Commits (ya lo exige el hook `commit-msg`).
- Se publica con avance rápido de `dev` a `main` y los merges a `dev` conservan los hashes de los
  commits, así que un hash listado en un registro sigue siendo válido al llegar a `main`.
- Una cuenta que nunca abrió Novedades ve el punto (incluida una cuenta recién creada).
- La versión en español del registro es la que lleva la lista de commits; la inglesa es traducción.
- La app trae los registros dentro de su propio paquete (mismo origen que el sitio), no los pide al
  sitio público.
