# Feature Specification: Perfil de Usuario

**Feature Branch**: `008-user-profile`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Como usuario autenticado de FinanceApp, necesito una página de Perfil donde ver y gestionar mi información de cuenta, porque hoy no existe ningún lugar para hacerlo — el usuario solo aparece como email de texto plano en el sidebar, sin forma de editar nada. Debe permitir: ver mi perfil (avatar iniciales, nombre, email, badge de plan, estadísticas reales); editar nombre y email; cambiar contraseña; configurar y persistir preferencias (moneda principal, idioma, formato de fecha); ver (sin funcionalidad real) un switch de verificación en dos pasos y 3 switches de notificaciones; desactivar mi cuenta (deshabilita el acceso, sin borrado definitivo); cerrar sesión; acceder a Perfil desde el bloque de usuario en el sidebar."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Ver mi perfil (Priority: P1)

Como usuario autenticado, quiero acceder a una vista de Perfil desde el bloque de mi usuario en el sidebar y ver mi información básica (avatar con mis iniciales, nombre, email, badge de plan) junto con estadísticas reales de mi actividad (cuentas activas, movimientos del mes, año de miembro), para tener un lugar central donde reconocer mi cuenta.

**Why this priority**: Es el requisito habilitante — sin un punto de entrada y una vista base, ninguna otra funcionalidad de esta feature es alcanzable. Además entrega valor por sí sola (hoy el usuario no tiene forma de ver esta información en ningún lado).

**Independent Test**: Con un usuario logueado que tiene cuentas y movimientos reales, se puede hacer clic en el bloque de usuario del sidebar, llegar a Perfil, y verificar que el avatar, nombre, email y las 3 estadísticas coinciden con los datos reales de esa cuenta.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado con 3 cuentas bancarias activas y 12 movimientos este mes, **When** hace clic en su bloque de usuario en el sidebar, **Then** llega a la vista de Perfil y ve "3" en Cuentas y "12" en Mov./mes.
2. **Given** un usuario sin cuentas ni movimientos, **When** visita su Perfil, **Then** ve "0" en ambas estadísticas (no un error ni un estado vacío).
3. **Given** un usuario cuyo nombre es "Javier Torres", **When** visita su Perfil, **Then** el avatar muestra las iniciales "JT".

---

### User Story 2 - Editar nombre y email (Priority: P2)

Como usuario autenticado, quiero editar mi nombre y mi email desde el Perfil, para mantener mi información de cuenta actualizada.

**Why this priority**: Es la operación de edición más básica y de mayor uso esperado; depende de que P1 exista pero es independientemente valiosa y probable candidata a implementarse justo después.

**Independent Test**: Editar el nombre y/o email desde el formulario de Perfil, guardar, y verificar que el nuevo valor persiste tras recargar la página y aparece reflejado en el sidebar.

**Acceptance Scenarios**:

1. **Given** un usuario en la vista de edición de perfil, **When** cambia su nombre y guarda, **Then** el nuevo nombre se persiste y se refleja de inmediato en el Perfil y en el sidebar, sin necesidad de recargar la página.
2. **Given** un usuario que intenta cambiar su email a uno ya registrado por otra cuenta, **When** intenta guardar, **Then** el sistema rechaza el cambio con un mensaje de error claro y no modifica el email actual.
3. **Given** un usuario que ingresa un email con formato inválido, **When** intenta guardar, **Then** el sistema rechaza el cambio antes de persistir nada.

---

### User Story 3 - Cambiar contraseña (Priority: P2)

Como usuario autenticado, quiero cambiar mi contraseña ingresando la actual y una nueva, para mantener el control de la seguridad de mi cuenta.

**Why this priority**: Funcionalidad de seguridad crítica esperada en cualquier gestión de cuenta; igual de importante que editar datos básicos.

**Independent Test**: Desde el Perfil, iniciar el cambio de contraseña, ingresar la contraseña actual correcta + una nueva, guardar, cerrar sesión, y volver a iniciar sesión con la nueva contraseña exitosamente.

**Acceptance Scenarios**:

1. **Given** un usuario que ingresa su contraseña actual correcta y una nueva contraseña válida, **When** confirma el cambio, **Then** la contraseña queda actualizada y puede iniciar sesión con la nueva en el siguiente login.
2. **Given** un usuario que ingresa una contraseña actual incorrecta, **When** intenta confirmar el cambio, **Then** el sistema rechaza la operación con un mensaje de error claro y la contraseña original permanece sin cambios.

---

### User Story 4 - Preferencias persistidas (Priority: P3)

Como usuario autenticado, quiero configurar mi moneda principal, idioma y formato de fecha desde el Perfil, y que esas preferencias se guarden asociadas a mi cuenta (no solo en mi navegador), para tener una experiencia consistente sin importar desde qué dispositivo entro.

**Why this priority**: Mejora de experiencia valiosa pero no bloqueante — la app ya funciona con valores por defecto sin esto.

**Independent Test**: Configurar una preferencia (p. ej. idioma a inglés) desde un navegador, cerrar sesión, iniciar sesión desde otro navegador/perfil de navegador, y verificar que la preferencia configurada se aplica automáticamente.

**Acceptance Scenarios**:

1. **Given** un usuario que cambia su idioma preferido a inglés desde el Perfil, **When** la confirmación se guarda, **Then** toda la interfaz cambia a inglés de inmediato, sin recargar.
2. **Given** un usuario que configuró moneda principal, idioma y formato de fecha, **When** cierra sesión y vuelve a iniciar sesión (incluso desde otro navegador), **Then** encuentra las mismas preferencias aplicadas automáticamente.
3. **Given** un usuario en el Perfil, **When** activa/desactiva el switch de "Tema oscuro" en Preferencias, **Then** el tema visual de toda la app cambia de inmediato, igual que con el selector de tema ya existente en el sidebar (misma preferencia, un segundo punto de control).

---

### User Story 5 - Desactivar mi cuenta (Priority: P4)

Como usuario autenticado, quiero poder desactivar mi cuenta desde el Perfil, para dejar de tener acceso y uso de la aplicación cuando ya no la necesite, sin que mis datos se borren de inmediato.

**Why this priority**: Es una acción destructiva/irreversible en su efecto de acceso, de uso poco frecuente — valiosa pero no urgente comparada con las anteriores.

**Independent Test**: Desde el Perfil, iniciar "Eliminar cuenta", confirmar reingresando la contraseña, verificar que la sesión actual termina, y comprobar que un intento posterior de iniciar sesión con esas credenciales es rechazado.

**Acceptance Scenarios**:

1. **Given** un usuario que hace clic en "Eliminar cuenta", **When** el sistema pide confirmación, **Then** debe reingresar su contraseña actual antes de que la desactivación se ejecute.
2. **Given** una cuenta recién desactivada, **When** su dueño (u otra persona) intenta iniciar sesión con esas credenciales, **Then** el intento es rechazado con un mensaje claro de cuenta deshabilitada.
3. **Given** una cuenta desactivada, **When** se consulta directamente en el sistema, **Then** todos sus datos financieros (cuentas, movimientos, etc.) permanecen intactos y sin borrar.

---

### User Story 6 - Elementos visuales de seguridad/notificaciones no funcionales, y cerrar sesión (Priority: P5)

Como usuario autenticado, quiero ver en mi Perfil los controles de "Verificación en dos pasos" y de Notificaciones que el diseño contempla, y poder cerrar sesión desde ahí, para que la vista sea fiel al diseño aprobado aunque esas funciones aún no estén implementadas.

**Why this priority**: Aporte visual/de completitud de diseño; no bloquea ningún flujo funcional y es la de menor riesgo/valor entre todas.

**Independent Test**: Abrir el Perfil y verificar que los 4 switches (2FA + 3 notificaciones) se muestran fieles al diseño pero no cambian de estado de forma persistente al interactuar con ellos, y que el botón de cerrar sesión funciona igual que en el resto de la app.

**Acceptance Scenarios**:

1. **Given** un usuario en su Perfil, **When** intenta activar el switch de "Verificación en dos pasos" o cualquiera de los 3 switches de notificaciones, **Then** el control se muestra visualmente pero no persiste ningún cambio de estado real (no implica funcionalidad activa).
2. **Given** un usuario en su Perfil, **When** hace clic en "Cerrar sesión", **Then** su sesión termina igual que desde cualquier otro punto de la app.

---

### Edge Cases

- ¿Qué pasa si un usuario existente (creado antes de esta feature) no tiene una fecha de creación de cuenta registrada? El sistema debe mostrar un año de "miembro desde" razonable en vez de un error o un campo vacío (ver Assumptions).
- ¿Qué pasa si un usuario desactiva su cuenta mientras tiene sesión abierta en otro dispositivo/navegador? Esa otra sesión debe perder el acceso a más tardar en su siguiente acción que requiera autenticación.
- ¿Qué pasa si se intenta cambiar el email al mismo email ya en uso por la propia cuenta (sin cambio real)? Debe permitirse sin error (no es un conflicto real).
- ¿Qué pasa si el usuario cambia el idioma preferido pero tiene texto sin traducir? No aplica: todo texto nuevo de esta feature debe existir en ambos catálogos (es/en) desde el día uno.
- ¿Qué pasa si dos usuarios intentan registrar/cambiar su email al mismo valor casi simultáneamente? Solo uno debe tener éxito; el otro recibe el error de email en uso.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE ofrecer un punto de acceso a la vista de Perfil desde el bloque de usuario en la navegación principal (sidebar), visible en todo momento para un usuario autenticado.
- **FR-002**: La vista de Perfil DEBE mostrar: avatar con las iniciales del nombre del usuario, nombre, email, un badge de plan de texto fijo ("Plan personal"), y tres estadísticas calculadas en tiempo real: cantidad de cuentas bancarias activas, cantidad de movimientos registrados en el mes en curso, y año de "miembro desde".
- **FR-003**: Los usuarios DEBEN poder editar su nombre y su email; los cambios válidos se persisten y se reflejan de inmediato en toda la interfaz (Perfil, sidebar, y cualquier otro lugar donde se muestren).
- **FR-004**: El sistema DEBE validar que el nuevo email tenga formato válido y no esté en uso por otra cuenta antes de guardar; en caso contrario, rechaza el cambio con un error claro y no persiste nada.
- **FR-005**: Los usuarios DEBEN poder cambiar su contraseña proporcionando la contraseña actual y una nueva; el sistema DEBE rechazar el cambio con un error claro si la contraseña actual no es correcta, sin alterar la contraseña vigente.
- **FR-006**: Los usuarios DEBEN poder configurar y persistir, asociadas a su cuenta (no solo al navegador): moneda principal (CLP, USD o EUR), idioma preferido (español o inglés), y formato de fecha preferido. Estas preferencias DEBEN sobrevivir a cerrar sesión y volver a entrar, incluso desde otro dispositivo o navegador.
- **FR-007**: Cambiar el idioma preferido DEBE aplicar el cambio de idioma a toda la interfaz de inmediato, sin requerir recarga de página.
- **FR-007a**: La sección de Preferencias DEBE incluir también el control de tema oscuro/claro ya existente en la app (mismo mecanismo que el selector del sidebar); no es una funcionalidad nueva, solo un segundo punto de acceso a la preferencia de tema ya soportada.
- **FR-008**: La vista de Perfil DEBE mostrar un control de "Verificación en dos pasos" y tres controles de notificaciones (vencimientos de cuotas, resumen mensual, alertas de gasto) fieles al diseño aprobado, pero estos controles NO DEBEN implicar ni persistir ninguna funcionalidad real en esta iteración (no hay 2FA real ni envío de notificaciones).
- **FR-009**: Los usuarios DEBEN poder iniciar la desactivación de su propia cuenta ("Eliminar cuenta") desde el Perfil, y el sistema DEBE exigir reingresar la contraseña actual como confirmación antes de ejecutar la desactivación.
- **FR-010**: Al confirmarse, la cuenta DEBE pasar a un estado deshabilitado: ningún intento de inicio de sesión posterior con esas credenciales DEBE tener éxito, y cualquier sesión activa de esa cuenta DEBE dejar de tener acceso a más tardar en su siguiente acción que requiera autenticación.
- **FR-011**: La desactivación de una cuenta NO DEBE borrar ni modificar los datos financieros existentes del usuario (cuentas, movimientos, cuotas, deudas, ahorros, inversiones); el borrado definitivo queda fuera de alcance de esta feature (proceso futuro de retención/auditoría).
- **FR-012**: Los usuarios DEBEN poder cerrar sesión desde la vista de Perfil.
- **FR-013**: Todo texto de interfaz introducido por esta feature DEBE existir en los catálogos de español e inglés bajo claves idénticas.

#### Amendment 2026-07-15 — Información personal

- **FR-014**: Los usuarios DEBEN poder editar, junto a nombre/email, su información personal: país de residencia (seleccionado de la lista de países ya usada por las cuentas bancarias), dirección estructurada (calle, ciudad, región, código postal — todos opcionales), fecha de nacimiento, y un identificador nacional compuesto de tipo (RUT/DNI/Pasaporte/Otro) + valor.
- **FR-015**: Cuando el tipo de identificador es RUT, el sistema DEBE validar el dígito verificador (módulo 11) antes de guardar; para los demás tipos no se aplica una validación de formato específica (varía por país).
- **FR-016**: La vista de Perfil NO DEBE mostrar la fecha de nacimiento exacta — en su lugar muestra la edad calculada en años. La fecha exacta solo es visible al editarla (formulario de "Editar perfil").
- **FR-017**: Todos los campos de información personal son opcionales; no completarlos no bloquea ninguna otra funcionalidad de la cuenta.
- **FR-018**: ~~Los botones "Cerrar sesión" y "Eliminar cuenta" se agrupan visualmente junto a la tarjeta de información personal~~ — **superseded por el Amendment 2026-07-16**: `Perfil.dc.html` (la referencia de diseño definitiva) los ubica al final de la columna derecha, después de todas las secciones de configuración. Se implementó así.

#### Amendment 2026-07-16 — Perfil completo (`design_handoff_financeapp/prototypes/Perfil.dc.html`)

Se agregó un archivo de diseño completo y definitivo del Perfil. Nuevo alcance derivado de él:

- **FR-019**: Los usuarios DEBEN poder agregar un número de teléfono a su información personal (opcional, texto libre).
- **FR-020**: La vista de Perfil DEBE mostrar un widget de "Estado de tu cuenta" con un indicador de completitud (correo, identidad, teléfono, foto de perfil) — basado en si el dato está lleno, NO en verificación real (no existe infraestructura de envío de email/SMS ni verificación de identidad; ver `PENDING.md`).
- **FR-021**: Todas las secciones de configuración de Perfil (Información personal, Preferencias, Personalización financiera, Seguridad, Plan/facturación, Notificaciones, Datos/conexiones) DEBEN mostrarse como acordeón colapsable, cerradas por defecto.
- **FR-022**: Los usuarios DEBEN poder configurar, de forma real y persistida: día de inicio de su ciclo mensual, presupuesto mensual objetivo, monedas extra a seguir (selección múltiple, sin conversión de divisas en vivo), y ocultar saldos (con efecto real de enmascarar montos — cobertura parcial, ver `PENDING.md`).
- **FR-023**: "Redondeo para ahorro" se muestra fiel al diseño pero es un control puramente visual sin persistencia ni efecto (mismo criterio que FR-008 para 2FA/notificaciones).
- **FR-024**: Notificaciones DEBE incluir un control deslizante de "umbral de aviso de presupuesto" (%), persistido, sin disparar ninguna alerta real todavía.
- **FR-025**: Las secciones "Seguridad avanzada" (passkey, sesiones y dispositivos), "Plan, uso y facturación", y "Datos, conexiones y privacidad" (bancos vinculados, exportar movimientos, respaldo automático) se muestran fieles al diseño con datos de ejemplo fijos, sin ninguna acción real — son subsistemas fuera de alcance de esta feature, documentados en `PENDING.md` para retomarlos con su propia spec.

### Key Entities _(include if feature involves data)_

- **Perfil de usuario**: la información y preferencias propias de la cuenta de un usuario — nombre, email, moneda principal preferida, idioma preferido, formato de fecha preferido, fecha desde la que es miembro, y estado de la cuenta (activa/deshabilitada). Es una extensión conceptual de la cuenta de usuario ya existente, no una entidad separada de negocio.
- **Estadísticas de perfil**: valores derivados y de solo lectura mostrados en el Perfil (cantidad de cuentas activas, movimientos del mes en curso) — se calculan a partir de datos financieros ya existentes del usuario, no se almacenan de forma independiente.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un usuario autenticado puede llegar a su Perfil desde cualquier pantalla de la app en un máximo de 2 clics.
- **SC-002**: El 100% de las ediciones válidas de nombre, email, contraseña y preferencias se reflejan en la interfaz de inmediato, sin recargar la página.
- **SC-003**: El 100% de los intentos de cambio de contraseña con la contraseña actual incorrecta son rechazados con un mensaje de error comprensible para el usuario.
- **SC-004**: El 100% de los intentos de inicio de sesión contra una cuenta desactivada son rechazados.
- **SC-005**: El 100% de los textos nuevos de esta feature se muestran correctamente tanto en español como en inglés, sin claves crudas ni textos faltantes.
- **SC-006**: Las preferencias de moneda, idioma y formato de fecha configuradas por un usuario se mantienen consistentes al volver a iniciar sesión desde un dispositivo o navegador distinto, en el 100% de los casos.

## Assumptions

- El avatar se genera siempre a partir de las iniciales del nombre del usuario; no existe (ni se planea en esta feature) subida de foto de perfil real.
- "Plan personal" es una etiqueta fija para todos los usuarios; el producto no tiene hoy un modelo de planes/suscripciones/billing.
- Para usuarios existentes creados antes de esta feature (sin fecha de creación de cuenta registrada previamente), el año de "miembro desde" se completa con un valor razonable por defecto (p. ej. la fecha de lanzamiento de esta funcionalidad o el registro más antiguo disponible de esa cuenta) en vez de mostrar un error.
- La verificación en dos pasos y el envío real de notificaciones son capacidades futuras fuera de alcance; los controles existen en esta iteración solo por fidelidad visual al diseño aprobado.
- La desactivación de cuenta ("Eliminar cuenta") es un estado reversible a nivel de datos (no se borra nada), pero esta feature no incluye un flujo de autoservicio para reactivarla — cualquier reactivación, si se requiere, es una acción manual fuera de esta feature.
- Las preferencias de moneda/idioma/formato de fecha son configuración personal de visualización; no alteran la moneda en la que ya están registrados los movimientos existentes de un usuario.
- Un usuario que reingresa su contraseña para confirmar la desactivación de cuenta ya tiene una sesión autenticada vigente (no se le exige ningún otro factor adicional).
