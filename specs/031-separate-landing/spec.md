# Feature Specification: Separar el sitio público de la aplicación

**Feature Branch**: `031-separate-landing`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "Separar el sitio público de la aplicación. Hoy el sitio público de Cuadra (inicio, Nosotros, Privacidad, Precios, Preguntas) y la aplicación con sesión se entregan juntos, desde la misma dirección y como una sola aplicación: los buscadores reciben páginas sin contenido, todas las páginas públicas comparten el mismo título, descripción y vista previa al compartirse, y quien visita el sitio público carga código de la aplicación que no usa. Objetivo: que el sitio público se encuentre y se comparta bien y cargue lo más rápido posible, sin perder la experiencia actual de acceso. […] Fuera de alcance: la configuración de DNS y hosting de producción (sí un entorno local que reproduce los tres orígenes: sitio, app y servicio), cambios al contenido de las páginas públicas, y la carga diferida de la app (ya hecha)."

## Clarifications

### Session 2026-10-09

- Q: ¿Cómo se refleja el idioma en las direcciones del sitio público? → A: Ambos idiomas con prefijo y sin idioma por defecto en la dirección (`/es/…`, `/en/…`), con slugs en inglés para los dos (`/es/pricing`, `/en/pricing`). La raíz `/` redirige al idioma preferido del navegador (español si no se puede determinar) y se declara como versión por defecto; las direcciones antiguas en español (`/precios`, `/nosotros`, `/privacidad`, `/preguntas`) redirigen de forma permanente a su equivalente en `/es/`.
- Q: ¿Qué idioma toma una cuenta creada desde el sitio público? → A: El de la página donde se registró (`/en/` → inglés, `/es/` → español); iniciar sesión no cambia el idioma guardado de una cuenta existente.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - El sitio público se encuentra y se comparte bien (Priority: P1)

Una persona busca "app para ordenar mis finanzas en Chile" o recibe por WhatsApp un enlace a la página de Precios. El buscador y la vista previa del mensaje muestran el título, la descripción y la imagen propios de ESA página, y al abrirla el contenido aparece de inmediato, sin esperar a que se descargue la aplicación.

**Why this priority**: es la razón de la separación. Hoy cada página pública llega vacía y con los mismos metadatos, lo que perjudica la indexación y cada enlace compartido.

**Independent Test**: pedir cada una de las cinco páginas públicas sin ejecutar código en el navegador y comprobar que la respuesta ya trae el contenido visible y metadatos distintos por página; medir lo que descarga una visita a la portada antes de abrir el panel de acceso.

**Acceptance Scenarios**:

1. **Given** una visita a cualquiera de las cinco páginas públicas, **When** se lee la respuesta sin ejecutar código, **Then** contiene el texto principal de la página, su propio título, descripción, dirección canónica y datos de vista previa para redes.
2. **Given** dos páginas públicas distintas, **When** se comparan sus metadatos, **Then** título y descripción son distintos.
3. **Given** una visita a la portada, **When** la página termina de cargar y la persona no ha abierto el panel de acceso, **Then** no se descargó código de la aplicación con sesión.
4. **Given** el idioma inglés, **When** se visita una página pública en inglés (`/en/…`), **Then** su contenido y sus metadatos están en inglés y la página indica su versión en el otro idioma.
5. **Given** un enlace antiguo (`/precios`), **When** se abre, **Then** llega de forma permanente a `/es/pricing`; **Given** la raíz `/`, **When** se abre con el navegador en inglés, **Then** llega a `/en/`, y en cualquier otro caso a `/es/`.

---

### User Story 2 - Iniciar sesión desde el sitio público y llegar a la app (Priority: P1)

Una persona en el sitio público abre el panel de acceso, entra con su RUT y contraseña (y su código del autenticador si tiene segundo factor, o con su llave de acceso) y termina dentro de la aplicación ya autenticada, sin volver a identificarse.

**Why this priority**: separar los sitios no puede romper el acceso; es la experiencia que la persona usa cada día.

**Independent Test**: desde la portada, completar cada forma de acceso y comprobar que se llega al Panel de la app con sesión y que la dirección web nunca contiene datos de sesión.

**Acceptance Scenarios**:

1. **Given** una cuenta sin segundo factor, **When** inicia sesión con RUT y contraseña en el panel del sitio público, **Then** llega al Panel de la aplicación con su sesión activa.
2. **Given** una cuenta con segundo factor, **When** ingresa RUT y contraseña, **Then** el mismo panel le pide el código (del autenticador o de recuperación) y, al validarlo, llega a la aplicación.
3. **Given** una persona con llave de acceso registrada, **When** elige entrar con llave de acceso (con o sin escribir su RUT), **Then** llega a la aplicación sin contraseña ni segundo factor, como hoy.
4. **Given** cualquier forma de acceso exitosa, **When** se revisan las direcciones web visitadas, **Then** ninguna contiene credenciales, códigos ni identificadores de sesión.
5. **Given** credenciales incorrectas, una cuenta bloqueada por intentos o un fallo de conexión, **When** intenta entrar, **Then** ve el mismo mensaje que hoy en el panel y permanece en el sitio público.

---

### User Story 3 - Crear cuenta desde el sitio público (Priority: P1)

Una persona nueva abre "Crear cuenta" en el sitio público, completa sus datos y consentimiento (y la autorización de su tutor si es menor de edad) y entra a la aplicación con su cuenta recién creada.

**Why this priority**: es la entrada de usuarios nuevos; sin ella el sitio público no cumple su función.

**Independent Test**: registrar una cuenta adulta y una de menor con tutor desde el sitio público y comprobar que ambas terminan dentro de la app con sesión y con sus consentimientos registrados.

**Acceptance Scenarios**:

1. **Given** una persona adulta, **When** completa el registro con consentimiento, **Then** llega a la aplicación con sesión y el consentimiento queda registrado como hoy.
2. **Given** una persona menor de 18 años, **When** completa el registro con la autorización de su tutor, **Then** llega a la aplicación y ambos consentimientos quedan registrados.
3. **Given** un RUT o correo ya usado, **When** intenta registrarse, **Then** ve el error junto al campo correspondiente, con la opción de iniciar sesión conservando el RUT, como hoy.
4. **Given** una persona que se registra desde la versión en inglés (`/en/…`), **When** llega a la app, **Then** la app está en inglés y su cuenta tiene inglés como idioma guardado; desde `/es/…`, en español.

---

### User Story 4 - Volver a donde iba (Priority: P2)

Alguien abre un enlace guardado a una sección de la app (por ejemplo, una cuenta específica) sin tener sesión. Lo llevan al panel de acceso del sitio público y, al entrar, aterriza en esa misma sección, no en el Panel.

**Why this priority**: es lo que hace que los enlaces profundos y las sesiones vencidas no sean frustrantes; hoy ya funciona y no debe perderse.

**Independent Test**: sin sesión, abrir una dirección protegida de la app, iniciar sesión en el sitio público y comprobar que se llega a esa dirección exacta.

**Acceptance Scenarios**:

1. **Given** sin sesión, **When** abre una dirección protegida de la app, **Then** llega al panel de acceso del sitio público y, al iniciar sesión, vuelve a esa misma dirección (con sus parámetros).
2. **Given** las direcciones antiguas de acceso de la app (`/login`, `/register`), **When** alguien las abre, **Then** llega al panel de acceso del sitio público en la pestaña correspondiente.
3. **Given** una dirección de retorno que apunta fuera de la app de Cuadra, **When** se completa el acceso, **Then** la persona llega al Panel de la app y nunca a la dirección externa.
4. **Given** una sesión que vence mientras se usa la app, **When** la app ya no puede renovarla, **Then** la persona llega al panel de acceso del sitio público con retorno a la sección donde estaba.

---

### User Story 5 - Con sesión iniciada, el sitio público ofrece "Ir a la app" (Priority: P3)

Alguien que ya tiene sesión entra a cuadra.cl (por ejemplo, desde un buscador). Ve el sitio público igual que cualquiera, pero en lugar de "Iniciar sesión" la acción principal dice "Ir a la app" y lo lleva directo, sin volver a identificarse.

**Why this priority**: evita pedir credenciales a quien ya está dentro; es una mejora de comodidad, no un requisito para que el acceso funcione.

**Independent Test**: con sesión activa, abrir la portada y comprobar que la acción de acceso dice "Ir a la app" y lleva al Panel; sin sesión, que dice "Iniciar sesión".

**Acceptance Scenarios**:

1. **Given** una sesión activa, **When** abre cualquier página pública, **Then** la acción de acceso dice "Ir a la app" y lleva a la aplicación sin pedir credenciales.
2. **Given** sin sesión, **When** abre una página pública, **Then** ve "Iniciar sesión" y "Crear cuenta" como hoy.
3. **Given** que no se puede comprobar la sesión (servicio caído o lento), **When** se abre una página pública, **Then** la página se muestra completa igual, con "Iniciar sesión".

---

### User Story 6 - Las llaves de acceso sirven en ambos lados (Priority: P2)

Una persona registra una llave de acceso desde su perfil dentro de la app y después la usa para entrar desde el sitio público, o al revés.

**Why this priority**: una llave registrada que deja de funcionar al separar los sitios rompe el acceso más seguro que ofrece la app.

**Independent Test**: registrar una llave en la app, cerrar sesión e iniciar sesión con ella desde el sitio público; también usarla en el paso de verificación previo a cerrar otra sesión dentro de la app.

**Acceptance Scenarios**:

1. **Given** una llave registrada desde la app, **When** se usa para entrar desde el sitio público, **Then** el acceso funciona.
2. **Given** una llave registrada, **When** se usa dentro de la app para confirmar identidad antes de cerrar otra sesión, **Then** la confirmación funciona.

---

### Edge Cases

- **Cerrar sesión** en la app: la persona termina en el sitio público, sin sesión, con "Iniciar sesión" visible.
- **Tema e idioma**: el sitio público y la app son direcciones distintas; el tema (claro/oscuro/sistema) y el idioma con que la persona llega a la app se respetan hasta que la app carga las preferencias guardadas de su cuenta, que mandan una vez con sesión (salvo una cuenta recién creada, que guarda el idioma del sitio público, FR-010a).
- **Página pública inexistente** (por ejemplo `cuadra.cl/algo`): el sitio público muestra su propia página de "no encontrada" con su chrome; una dirección inexistente dentro de la app sigue mostrando la de la app.
- **Navegador sin código habilitado** en el sitio público: las páginas se leen completas; el panel de acceso, que requiere código, indica que hace falta habilitarlo.
- **Llaves de acceso de desarrollo** registradas antes del cambio para otro dominio pueden dejar de funcionar; en producción no existen todavía.
- **Doble envío** del formulario de acceso o registro: se comporta como hoy (un solo intento en curso).
- **Enlace a la portada con el panel abierto** (`?acceso=login|registro` con `volver=`): sigue funcionando en el sitio público.

## Requirements _(mandatory)_

### Functional Requirements

**Sitio público**

- **FR-001**: El sitio público (portada, Nosotros, Privacidad, Precios, Preguntas) MUST servirse desde el dominio principal, separado de la aplicación, y la aplicación desde su propio subdominio.
- **FR-002**: Cada página pública MUST entregar su contenido visible completo en la respuesta inicial, sin necesidad de ejecutar código en el navegador.
- **FR-003**: Cada página pública MUST declarar su propio título, descripción, dirección canónica y metadatos de vista previa para redes (título, descripción, imagen, idioma), distintos entre páginas.
- **FR-004**: El sitio público MUST ofrecer cada página en español e inglés, cada versión en su propia dirección con prefijo de idioma y el mismo slug en inglés para ambos (`/es/`, `/es/about`, `/es/privacy`, `/es/pricing`, `/es/faq` y sus pares `/en/…`), con metadatos en el idioma correspondiente y referencias cruzadas entre ambas versiones.
- **FR-004a**: La raíz `/` MUST redirigir a la portada del idioma preferido del navegador (español si no puede determinarse) y declararse como la versión por defecto ante buscadores.
- **FR-004b**: Las direcciones antiguas del sitio público (`/precios`, `/nosotros`, `/privacidad`, `/preguntas`) MUST redirigir de forma permanente a su equivalente en `/es/`, conservando el ancla (por ejemplo `/preguntas#faq-minors` → `/es/faq#faq-minors`).
- **FR-005**: El sitio público MUST publicar un mapa del sitio con sus páginas y una política para buscadores que permita indexarlas.
- **FR-006**: Una visita al sitio público MUST NOT descargar código de la aplicación con sesión, y el código interactivo del panel de acceso MUST descargarse solo cuando la persona lo abre.
- **FR-007**: El sitio público MUST conservar el diseño, los temas claro/oscuro/sistema, la navegación responsiva (menú en teléfono, enlace de salto al contenido) y el contenido actuales de cada página.
- **FR-008**: Los colores, tipografía, marca y textos compartidos entre el sitio público y la app MUST tener una sola fuente, usada por ambos, sin copias que puedan divergir.
- **FR-009**: El sitio público MUST tener su propia página de "no encontrada".

**Acceso**

- **FR-010**: El panel de acceso del sitio público MUST ofrecer las mismas capacidades que hoy: iniciar sesión con RUT y contraseña, segundo factor (código del autenticador o de recuperación), llave de acceso (con o sin RUT escrito, incluida la sugerencia automática del navegador), crear cuenta con consentimiento y autorización de tutor para menores, con las mismas validaciones y mensajes.
- **FR-010a**: Una cuenta creada desde el sitio público MUST guardar como idioma el de la página donde se registró; iniciar sesión MUST NOT modificar el idioma guardado de una cuenta existente.
- **FR-011**: Al completar el acceso o el registro, la persona MUST llegar a la aplicación con su sesión activa, sin volver a identificarse.
- **FR-012**: Ninguna dirección web del flujo de acceso MUST contener credenciales, códigos, ni identificadores o tokens de sesión.
- **FR-013**: El panel de acceso MUST abrirse por dirección (`?acceso=login|registro`, en cualquier página de cualquiera de los dos idiomas) y aceptar una dirección de retorno; al completar el acceso, la persona MUST llegar a esa dirección de la app, y una dirección de retorno fuera de la app MUST ignorarse en favor del Panel.
- **FR-014**: Las direcciones `/login` y `/register` de la app y cualquier dirección protegida visitada sin sesión MUST llevar al panel de acceso del sitio público, conservando la dirección de retorno.
- **FR-015**: Cerrar sesión en la app MUST llevar al sitio público sin sesión.
- **FR-016**: Las llaves de acceso MUST funcionar indistintamente desde el sitio público y desde la app (registro, inicio de sesión y verificación de identidad).
- **FR-017**: Con sesión activa, el sitio público MUST mostrar "Ir a la app" en lugar de "Iniciar sesión"; si la sesión no puede comprobarse, MUST mostrar "Iniciar sesión" sin bloquear la página.
- **FR-018**: El servicio MUST aceptar peticiones con credenciales solo desde el sitio público y la aplicación de Cuadra, y rechazar cualquier otro origen.

**Aplicación**

- **FR-019**: La aplicación MUST declarar que no se indexa en buscadores, en todas sus direcciones.
- **FR-020**: La aplicación MUST dejar de incluir las páginas públicas; su dirección raíz MUST mostrar el Panel a quien tiene sesión y llevar al panel de acceso del sitio público a quien no.

**Desarrollo**

- **FR-021**: El entorno local MUST reproducir los tres orígenes (sitio público, aplicación y servicio) de forma que el acceso, el retorno, las llaves de acceso y "Ir a la app" se puedan probar de punta a punta sin infraestructura de producción.

### Key Entities

- **Dirección de retorno**: la ruta de la app a la que la persona quería ir; viaja como parámetro del panel de acceso y solo se acepta si pertenece a la app de Cuadra.
- **Sesión**: la misma de hoy (una por inicio de sesión, cerrable desde Perfil); no cambia su modelo, solo desde dónde se origina.
- **Página pública**: contenido, idioma y metadatos propios (título, descripción, canónica, vista previa).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Las 5 páginas públicas, en ambos idiomas (10 en total), entregan su contenido principal y metadatos propios en la respuesta inicial; 0 páginas con título o descripción repetidos.
- **SC-002**: Lo que descarga una visita a la portada antes de abrir el panel de acceso es al menos un 80 % menor que lo que descarga la misma visita en la versión actual (con la carga diferida por sección ya aplicada).
- **SC-003**: En una conexión móvil típica, el contenido principal de cada página pública es visible en menos de 2 segundos.
- **SC-004**: El 100 % de los flujos de acceso (contraseña, contraseña + segundo factor, llave de acceso con y sin RUT, registro adulto, registro con tutor) termina con la persona dentro de la app sin pedirle credenciales de nuevo.
- **SC-005**: El 100 % de las direcciones protegidas visitadas sin sesión devuelven a la persona a esa misma dirección tras iniciar sesión.
- **SC-006**: 0 direcciones del flujo de acceso contienen credenciales o datos de sesión.
- **SC-007**: El 100 % de las direcciones de la app declaran no ser indexables.

## Assumptions

- La sesión sigue siendo la actual (cookies emitidas por el servicio); el sitio público, la app y el servicio comparten el mismo dominio registrable (cuadra.cl), condición que hace posible llegar a la app ya autenticado sin pasar datos por la dirección web. Si el servicio se publicara en otro dominio, este diseño no funcionaría.
- La configuración de DNS, certificados y hosting de producción queda fuera; el diseño debe ser publicable como sitio estático para la parte pública.
- El contenido de las páginas públicas no cambia; solo cómo y desde dónde se entregan.
- La carga diferida de las secciones de la app ya está implementada (paso previo) y no es parte de esta especificación.
- No hay llaves de acceso de producción registradas todavía; las de desarrollo pueden requerir registrarse de nuevo.
- La imagen de vista previa para redes se crea como parte de esta feature (hoy no existe).
