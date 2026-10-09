# Feature Specification: Perfil como ajustes por secciones con resumen de protección

**Feature Branch**: `029-profile-settings-redesign`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "Rediseño de la vista Perfil: ajustes por secciones con un resumen de protección. Hoy Perfil son siete secciones colapsadas en una columna; hay controles inertes mezclados con los reales; la completitud nunca llega a 100% y promete SMS inexistentes; el tema no permite 'Sistema'; Seguridad va cuarta y 'Eliminar cuenta' está junto a la identidad. Organizar Perfil como ajustes en dos paneles con secciones agrupadas y su estado (en el teléfono, lista → pantalla por sección, cada una con su propia dirección), con una sección inicial 'Resumen' (protección en tres etapas, datos completos sin contar la foto, sesiones abiertas, ajustes rápidos de tema y ocultar saldos). Reubicar todo lo que hoy funciona; tema Claro/Oscuro/Sistema; lo no disponible agrupado como 'Próximamente' sin controles; 'Eliminar cuenta' dentro de Datos y privacidad; textos es/en. Referencia visual: canvas 'Cuadra · Perfil A+B'."

## Clarifications

### Session 2026-10-06

- Q: ¿Qué sugiere el "siguiente paso" si el dispositivo actual no soporta llaves de acceso? → A: Salta a la primera etapa pendiente realizable (dos pasos); la etapa de llave sigue pendiente en la lista, con la nota "no disponible en este dispositivo".
- Q: ¿Qué pasa si el usuario sale de una sección con una edición sin guardar? → A: Navegación dentro de la app (otra sección, volver, "atrás") pide confirmar "¿Descartar cambios?" si hay cambios; sin cambios navega directo. Recargar o cerrar la pestaña descarta la edición sin guardar nada ni preguntar.
- Q: ¿Qué direcciones tiene cada sección? → A: En inglés bajo la ruta actual: `/profile` (Resumen; en teléfono, la vista inicial), `/profile/personal`, `/profile/security`, `/profile/preferences`, `/profile/privacy`.
- Q: ¿Cuántas sesiones muestra el Resumen? → A: Hasta 3 abiertas (la actual primero, luego por actividad más reciente); si hay más, "y N más" con la acción de revisarlas en Seguridad.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Ver de un vistazo qué tan protegida está mi cuenta (Priority: P1)

Un titular entra a Perfil y, sin abrir nada, ve el estado de protección de su cuenta como tres etapas en orden (contraseña, llave de acceso, verificación en dos pasos), cuáles completó, y cuál es el siguiente paso con un botón que lo lleva a resolverlo. En la misma vista ve cuántos de sus datos de contacto e identidad están completos y cuántas sesiones tiene abiertas.

**Why this priority**: Es el problema central: hoy el estado de seguridad está escondido detrás de secciones colapsadas, así que el usuario no sabe si le falta algo importante. Por sí sola, esta vista ya entrega el valor principal del rediseño.

**Independent Test**: Con una cuenta que tiene contraseña y una llave de acceso pero no la verificación en dos pasos, abrir Perfil y comprobar que se lee "2 de 3", que la tercera etapa aparece pendiente con su acción, y que esa acción abre la sección Seguridad.

**Acceptance Scenarios**:

1. **Given** una cuenta con contraseña, sin llaves de acceso y sin dos pasos, en un dispositivo que soporta llaves, **When** abre Perfil, **Then** ve 1 de 3 etapas completas y el siguiente paso es agregar una llave de acceso.
   1a. **Given** la misma cuenta en un dispositivo que no soporta llaves, **When** abre Perfil, **Then** la etapa de llave aparece pendiente con "no disponible en este dispositivo" y el siguiente paso es activar los dos pasos.
2. **Given** una cuenta con contraseña y llave de acceso pero sin dos pasos, **When** abre Perfil, **Then** ve 2 de 3 y el siguiente paso es activar la verificación en dos pasos.
3. **Given** una cuenta con las tres etapas completas, **When** abre Perfil, **Then** ve la protección completa y no se le sugiere ningún siguiente paso.
4. **Given** el resumen visible, **When** usa la acción del siguiente paso, **Then** llega a la sección Seguridad, en el punto que resuelve esa etapa.
5. **Given** una cuenta con correo e identidad pero sin teléfono, **When** abre Perfil, **Then** ve 2 de 3 datos completos, y la acción para agregar el teléfono abre Información personal con ese dato listo para editar.
6. **Given** una cuenta con correo, identidad y teléfono, **When** abre Perfil, **Then** ve sus datos completos (3 de 3, 100%), sin contar foto de perfil.
7. **Given** dos sesiones abiertas, **When** abre Perfil, **Then** ve ambas en el resumen, distinguiendo la del dispositivo actual, y una acción para revisarlas que lleva a Seguridad.
8. **Given** cinco sesiones abiertas, **When** abre Perfil, **Then** ve la actual y las 2 más recientes, más "y 2 más".

---

### User Story 2 - Ir directo a la sección que necesito, en cualquier dispositivo (Priority: P1)

El titular encuentra cada ajuste en una sección con nombre, agrupada ("Tu cuenta", "App", "Privacidad"). En pantallas amplias, la lista de secciones queda a un lado con una línea de estado por sección y el contenido de la elegida al otro. En el teléfono, Perfil es una lista y cada sección abre su propia pantalla, con forma de volver. Cada sección tiene su propia dirección: se puede enlazar, recargar o volver atrás con el navegador sin perder el lugar.

**Why this priority**: Es la estructura que permite agregar configuraciones futuras sin rediseñar y la que arregla la navegación en el teléfono. Sin ella, el resumen no tiene adónde llevar al usuario.

**Independent Test**: Abrir directamente la dirección de la sección Seguridad en un teléfono y en un escritorio; comprobar que se ve esa sección, que en el teléfono hay forma de volver a la lista, y que "atrás" del navegador regresa a la vista anterior.

**Acceptance Scenarios**:

1. **Given** una pantalla amplia, **When** abre Perfil, **Then** ve la lista de secciones agrupadas a un lado con Resumen seleccionada, y el contenido de Resumen al otro.
2. **Given** una pantalla amplia, **When** elige otra sección de la lista, **Then** cambia el contenido y la dirección del navegador refleja esa sección.
3. **Given** un teléfono, **When** abre Perfil, **Then** ve la vista inicial: su identidad, el Resumen (protección, tus datos y sesiones; sin ajustes rápidos) y la lista de secciones con su estado.
4. **Given** un teléfono, **When** toca una sección, **Then** se abre su pantalla con un control para volver, y "atrás" del navegador también vuelve a la lista.
5. **Given** la dirección de una sección, **When** la abre directamente (en cualquier dispositivo), **Then** ve esa sección.
6. **Given** una dirección de sección que no existe, **When** la abre, **Then** llega a la vista inicial de Perfil, no a una página rota.
7. **Given** una sección que requiere acción (p. ej. falta el teléfono), **When** mira la lista, **Then** esa sección muestra una línea de estado que lo dice y un indicador de pendiente.

---

### User Story 3 - Todo lo que hoy funciona sigue funcionando, en su lugar (Priority: P2)

El titular sigue pudiendo editar cada dato personal por separado, cambiar su contraseña, activar o desactivar los dos pasos, agregar/renombrar/eliminar llaves de acceso, cerrar sesiones (con la verificación que hoy se pide), elegir moneda principal, monedas extra e idioma, ocultar saldos, revisar su historial de consentimientos y eliminar su cuenta. Cada cosa vive en la sección que le corresponde.

**Why this priority**: El rediseño no puede costar funcionalidad. Es imprescindible, pero viene después de definir la estructura (US2) y el resumen (US1).

**Independent Test**: Recorrer cada acción existente desde su nueva sección y comprobar que produce el mismo resultado que antes.

**Acceptance Scenarios**:

1. **Given** la sección Información personal, **When** edita y guarda un dato, **Then** se guarda solo ese dato, igual que hoy.
2. **Given** la sección Seguridad, **When** cambia la contraseña, gestiona los dos pasos, gestiona llaves de acceso o cierra sesiones, **Then** cada acción se comporta igual que hoy, incluidas sus confirmaciones y verificaciones.
3. **Given** la sección Preferencias, **When** cambia moneda principal, monedas extra, idioma u ocultar saldos, **Then** cada cambio se guarda igual que hoy, incluidas las restricciones existentes (p. ej. no quitar una moneda en uso).
4. **Given** la sección Datos y privacidad, **When** revisa consentimientos o elimina su cuenta, **Then** ve el mismo historial y el mismo flujo de eliminación que hoy.

---

### User Story 4 - Un perfil honesto: sin controles falsos ni promesas (Priority: P2)

El titular no encuentra controles que aparenten funcionar sin hacerlo. Lo que todavía no existe (notificaciones, exportar movimientos, respaldo automático, foto de perfil) aparece mencionado junto, como "Próximamente", sin interruptores ni botones. El indicador de datos completos solo cuenta lo que el usuario puede completar y no promete funciones inexistentes. El tema ofrece Claro, Oscuro y Sistema. "Eliminar cuenta" está dentro de Datos y privacidad, no junto a la identidad.

**Why this priority**: Corrige problemas de confianza visibles hoy; no bloquea el uso pero afecta la credibilidad del producto.

**Independent Test**: Revisar todas las secciones y comprobar que ningún control queda inerte, que el tema permite elegir Sistema, que la completitud puede llegar a 100% y que "Eliminar cuenta" solo aparece en Datos y privacidad.

**Acceptance Scenarios**:

1. **Given** cualquier sección de Perfil, **When** se revisan sus controles, **Then** todos producen un efecto real; las funciones no disponibles aparecen solo como texto "Próximamente".
2. **Given** el ajuste de tema (en Preferencias y en los ajustes rápidos del resumen), **When** elige Sistema, **Then** la app sigue la preferencia del dispositivo, igual que el selector de tema existente.
3. **Given** el indicador de datos completos, **When** se muestra, **Then** no menciona alertas por SMS ni recuperación de cuenta, ni cuenta la foto.
4. **Given** cualquier vista de Perfil, **When** se busca "Eliminar cuenta", **Then** solo aparece dentro de Datos y privacidad.

---

### Edge Cases

- **Datos de seguridad cargando o con error**: si las llaves de acceso o las sesiones aún no cargan, o fallan, el resumen lo indica en su lugar (cargando / no disponible con opción de reintentar) en vez de mostrar una etapa como completa o pendiente por error.
- **Una sola sesión abierta (la actual)**: el resumen muestra solo esa, marcada como este dispositivo, sin ofrecer "cerrar las demás".
- **Muchas sesiones abiertas**: el resumen lista 3 (la actual y las 2 más recientes) y "y N más"; la lista completa está en Seguridad.
- **Protección completa**: no se muestra "siguiente paso"; el estado lo dice explícitamente.
- **Dirección de sección inexistente o antigua**: lleva a la vista inicial de Perfil.
- **Edición sin guardar al navegar**: elegir otra sección, volver o "atrás" con un dato a medio editar pide "¿Descartar cambios?"; cancelar deja al usuario en la edición intacta. Recargar o cerrar la pestaña descarta sin preguntar y sin guardar.
- **Cambio de ancho de pantalla con una sección abierta** (girar la tablet, contraer la barra lateral): la sección abierta se mantiene; solo cambia la forma (dos paneles ↔ lista y pantalla).
- **Usuario sin nombre registrado**: la identidad muestra el correo como nombre, como hoy.
- **Dispositivo sin soporte de llaves de acceso**: la etapa sigue pendiente con la nota "no disponible en este dispositivo" y no se ofrece como siguiente paso; el siguiente paso pasa a dos pasos si está pendiente. Si solo falta la llave, no hay siguiente paso en ese dispositivo.
- **Ocultar saldos activado**: los montos del resumen y las secciones respetan el enmascarado existente (el resumen no muestra saldos).

## Requirements _(mandatory)_

### Functional Requirements

**Estructura y navegación**

- **FR-001**: Perfil MUST organizarse en secciones con nombre, agrupadas en "Tu cuenta" (Resumen, Información personal, Seguridad), "App" (Preferencias) y "Privacidad" (Datos y privacidad).
- **FR-002**: Cada sección MUST mostrar en la lista una línea de estado breve derivada de los datos del usuario (p. ej. "Falta tu teléfono", "Dos pasos desactivada", la moneda/idioma/tema activos, consentimientos vigentes) y un indicador cuando requiere una acción del usuario. Requieren acción: Resumen, si hay etapas de protección pendientes realizables o datos faltantes (el indicador muestra la suma de ambos); Información personal, si faltan datos (el número de faltantes); Seguridad, si hay una etapa de protección pendiente realizable. Preferencias y Datos y privacidad nunca muestran indicador.
- **FR-003**: En pantallas amplias, Perfil MUST mostrar la lista de secciones y el contenido de la sección elegida a la vez; la sección inicial MUST ser Resumen.
- **FR-004**: En pantallas angostas, Perfil MUST mostrar una vista inicial con la identidad, el Resumen (protección, tus datos y sesiones, con sus acciones; sin ajustes rápidos) y la lista de secciones; cada sección MUST abrirse como su propia pantalla con un control visible para volver.
- **FR-005**: Cada sección MUST tener su propia dirección, de modo que pueda abrirse directamente, recargarse sin perder el lugar y navegarse con "atrás"/"adelante" del navegador. Las direcciones son: `/profile` (Resumen en pantallas amplias; vista inicial en el teléfono), `/profile/personal`, `/profile/security`, `/profile/preferences` y `/profile/privacy`. `/profile` conserva su significado actual, por lo que los enlaces existentes siguen funcionando.
- **FR-006**: Una dirección de sección desconocida MUST llevar a la vista inicial de Perfil.
- **FR-007**: La estructura MUST permitir agregar una sección o un grupo nuevo sin cambiar el diseño de las existentes.
- **FR-007a**: Si el usuario intenta salir de una sección con una edición sin guardar mediante la navegación de la app (elegir otra sección, el control de volver o "atrás" del navegador), Perfil MUST pedir confirmación para descartar los cambios; sin cambios pendientes MUST navegar directo. Al recargar o cerrar la pestaña, la edición MUST descartarse sin guardar nada y sin pedir confirmación (no hay autoguardado ni borradores).

**Resumen**

- **FR-008**: Resumen MUST mostrar la protección de la cuenta como tres etapas en orden fijo: contraseña, llave de acceso, verificación en dos pasos, indicando cuántas están completas ("N de 3") y cuáles.
- **FR-009**: Una etapa MUST considerarse completa cuando: (contraseña) la cuenta tiene contraseña; (llave de acceso) tiene al menos una llave registrada; (dos pasos) la verificación está activa.
- **FR-010**: Resumen MUST mostrar como "siguiente paso" la primera etapa pendiente en ese orden que se pueda realizar en el dispositivo actual, con una acción que lleve a la sección Seguridad; con las tres completas MUST indicar protección completa sin siguiente paso.
- **FR-010a**: Si el dispositivo actual no soporta llaves de acceso y esa etapa está pendiente, la etapa MUST seguir apareciendo pendiente con la nota "no disponible en este dispositivo", y el siguiente paso MUST pasar a la siguiente etapa pendiente realizable (dos pasos); si no queda ninguna realizable, MUST no mostrarse siguiente paso.
- **FR-011**: Resumen MUST mostrar cuántos datos de contacto e identidad están completos sobre tres (correo, identidad, teléfono), sin contar foto de perfil, y para cada faltante una acción que abra Información personal con ese dato listo para editar.
- **FR-012**: Resumen MUST mostrar hasta 3 sesiones abiertas: la del dispositivo actual primero (identificada como tal) y luego las de actividad más reciente; si hay más de 3, MUST indicar "y N más". Siempre MUST ofrecer una acción que lleve a Seguridad para revisarlas.
- **FR-013**: Resumen MUST ofrecer ajustes rápidos de tema y ocultar saldos que cambien la misma preferencia que sus controles en Preferencias.
- **FR-014**: Mientras un dato del resumen está cargando o falló, Resumen MUST mostrar ese estado en su lugar y no inferir completitud.

**Funcionalidad existente**

- **FR-015**: Información personal MUST conservar la edición por dato (nombre, correo, teléfono, identificador, fecha de nacimiento, dirección, país) con sus validaciones actuales.
- **FR-016**: Seguridad MUST conservar cambio de contraseña, activación y desactivación de dos pasos, gestión de llaves de acceso (agregar, renombrar, eliminar) y gestión de sesiones (cerrar una, cerrar las demás, ver cerradas) con sus confirmaciones y verificaciones actuales.
- **FR-017**: Preferencias MUST conservar moneda principal, monedas extra (con sus restricciones actuales), idioma, tema y ocultar saldos.
- **FR-018**: Datos y privacidad MUST conservar el historial de consentimientos y el flujo de eliminación de cuenta actual.
- **FR-019**: La identidad del usuario (iniciales, nombre o correo, cuentas, movimientos del mes, año de ingreso) MUST seguir visible en Perfil.

**Correcciones**

- **FR-020**: El tema MUST ofrecer Claro, Oscuro y Sistema, y elegir uno MUST tener el mismo efecto que el selector de tema existente de la app.
- **FR-021**: Perfil MUST NOT mostrar controles sin efecto. Notificaciones, exportar movimientos, respaldo automático y foto de perfil MUST mencionarse juntos como "Próximamente", solo como texto.
- **FR-022**: Ningún texto de Perfil MUST prometer funciones inexistentes (alertas por SMS, recuperación de cuenta por SMS).
- **FR-023**: "Eliminar cuenta" MUST aparecer únicamente dentro de Datos y privacidad.
- **FR-024**: Todos los textos nuevos o modificados MUST existir en español e inglés.
- **FR-025**: Los controles táctiles de Perfil MUST tener un área de toque cómoda en teléfono (al menos 44 px) y ser operables con teclado.

### Key Entities _(include if feature involves data)_

- **Sección de Perfil**: unidad navegable con nombre, grupo, dirección propia, línea de estado e indicador de pendiente. No es un dato guardado; se deriva de lo que ya existe.
- **Etapa de protección**: una de tres (contraseña, llave de acceso, dos pasos), completa o pendiente según datos de seguridad ya existentes.
- **Completitud de datos**: correo, identidad y teléfono presentes o no, sobre tres.
- **Sesión abierta**: la información de sesiones ya existente (dispositivo, ubicación aproximada, actividad, si es la actual).

Ninguna entidad nueva se guarda: todo se deriva de información que el sistema ya tiene.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Desde que abre Perfil, el usuario puede saber si su verificación en dos pasos está activa sin abrir ni expandir nada (0 interacciones).
- **SC-002**: Cada sección de Perfil se alcanza en a lo más 1 interacción desde la vista inicial, en escritorio y en teléfono, y por su dirección directa en 0.
- **SC-003**: El 100% de los controles visibles en Perfil produce un efecto real (0 controles inertes).
- **SC-004**: Un usuario con correo, identidad y teléfono ve su completitud en 100%.
- **SC-005**: Todas las acciones que funcionan hoy en Perfil siguen disponibles y producen el mismo resultado (0 regresiones en las pruebas existentes de Perfil, adaptadas a la nueva ubicación).
- **SC-006**: "Atrás" del navegador desde cualquier sección vuelve a la vista anterior de Perfil en el 100% de los casos.
- **SC-007**: Todo texto de Perfil existe en español e inglés (paridad verificada automáticamente).

## Assumptions

- Toda cuenta tiene contraseña (el registro la exige), por lo que la etapa de contraseña aparece completa; su acción sigue ofreciendo cambiarla.
- El orden de las etapas es fijo (contraseña → llave de acceso → dos pasos) aunque el usuario complete la tercera antes que la segunda; el siguiente paso es la primera pendiente que se pueda realizar en el dispositivo actual.
- "Identidad" completa significa tener un identificador (RUT u otro) registrado, como hoy.
- En el teléfono, la vista inicial es el Resumen (protección, tus datos y sesiones, con las mismas acciones que en pantallas amplias) seguido de la lista de secciones con su estado; los ajustes rápidos se omiten ahí porque la sección Preferencias queda a un toque.
- El umbral entre "pantalla amplia" y "angosta" sigue las convenciones de diseño responsivo ya establecidas en la app.
- La sección elegida en pantallas amplias se refleja en la dirección (ver FR-005); abrir `/profile` muestra Resumen.
- Notificaciones, exportar, respaldo y foto siguen fuera de alcance; solo se mencionan.
- No se agregan ni cambian datos guardados ni reglas de seguridad; es un cambio de presentación y navegación sobre capacidades existentes.
- La referencia visual aprobada es el canvas "Cuadra · Perfil A+B".
