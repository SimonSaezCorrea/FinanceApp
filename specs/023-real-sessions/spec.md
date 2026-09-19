# Feature Specification: Sesiones y dispositivos reales

**Feature Branch**: `023-real-sessions`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "Sesiones y dispositivos reales — reemplazar el placeholder de ejemplo en Seguridad con tracking real de sesiones (una por login exitoso, ligada a su refresh token), mostrando dispositivo/navegador y país aproximado, con la capacidad de cerrar una sesión individual o todas las demás salvo la actual."

## Clarifications

### Session 2026-09-19

- Q: Una sesión cerrada o vencida deja de listarse. ¿Qué pasa con su registro después? → A: Se borra al cerrarla/expirar — sin retención de historial.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Ver mis sesiones activas (Priority: P1)

Como usuario, quiero ver la lista real de dispositivos donde tengo una sesión iniciada
(qué navegador/dispositivo, desde qué país aproximado, cuándo empezó y cuándo se usó
por última vez), para saber si hay accesos que no reconozco.

**Why this priority**: Sin esto, el resto de la feature (cerrar sesiones) no tiene nada
sobre qué actuar. Es también el valor central pedido: reemplazar datos de ejemplo por
información real.

**Independent Test**: Loguearse desde dos navegadores/perfiles distintos con la misma
cuenta y verificar que la sección de Seguridad muestra dos sesiones reales, cada una con
su propio dispositivo/navegador, y que la que se está usando para ver la lista aparece
marcada como "este dispositivo · activo ahora".

**Acceptance Scenarios**:

1. **Given** un usuario con una única sesión activa (la que está usando ahora), **When**
   abre la sección Seguridad de su perfil, **Then** ve exactamente una sesión, marcada
   como el dispositivo actual, con su navegador/sistema y país aproximado.
2. **Given** un usuario que inició sesión en dos dispositivos distintos, **When** abre
   Seguridad desde cualquiera de los dos, **Then** ve ambas sesiones listadas, cada una
   con su propio dispositivo y con la fecha de creación y de último uso correctas.
3. **Given** una sesión cuyo periodo de validez ya venció, **When** el usuario recarga la
   lista, **Then** esa sesión ya no aparece como activa.

---

### User Story 2 - Cerrar una sesión individual (Priority: P2)

Como usuario, quiero poder cerrar una sesión específica de la lista (por ejemplo, la de
un dispositivo que ya no uso o no reconozco), para que ese dispositivo pierda el acceso
a mi cuenta sin afectar mis otras sesiones.

**Why this priority**: Es la acción de seguridad concreta que da sentido a ver la lista;
depende de la Historia 1 pero es un paso independiente y demostrable por sí solo.

**Independent Test**: Con dos sesiones activas, cerrar una desde la lista y confirmar que
esa sesión desaparece de la lista y que un intento de esa sesión de seguir usando la app
(refrescar su acceso) falla, mientras la otra sesión sigue funcionando sin cambios.

**Acceptance Scenarios**:

1. **Given** un usuario con dos o más sesiones activas, **When** cierra una que no es la
   actual, **Then** esa sesión deja de aparecer en la lista y ese dispositivo pierde el
   acceso (debe volver a loguearse la próxima vez que lo intente).
2. **Given** un usuario con dos o más sesiones activas, **When** cierra una que no es la
   actual, **Then** la sesión desde la que ejecutó la acción sigue activa sin pedir volver
   a loguearse.

---

### User Story 3 - Cerrar todas las demás sesiones (Priority: P3)

Como usuario, quiero un botón para cerrar todas mis sesiones excepto la que estoy usando
ahora mismo, para reaccionar rápido si sospecho que perdí el control de varios
dispositivos a la vez, sin arriesgarme a quedar yo mismo fuera.

**Why this priority**: Es una conveniencia sobre la Historia 2 (cerrar una por una) —
valiosa pero no bloqueante para que la feature sea útil.

**Independent Test**: Con tres sesiones activas (incluida la actual), usar "cerrar
todas" y confirmar que solo la sesión actual sigue activa; las otras dos ya no pueden
seguir usando la app.

**Acceptance Scenarios**:

1. **Given** un usuario con tres sesiones activas, **When** usa "cerrar todas las
   demás" desde la sesión A, **Then** las sesiones B y C quedan cerradas y la sesión A
   sigue activa sin interrupción.
2. **Given** un usuario con una única sesión activa (la actual), **When** ve la opción de
   "cerrar todas las demás", **Then** no hay ninguna otra sesión que cerrar (la opción no
   tiene efecto o no se ofrece).

---

### Edge Cases

- Una sesión cuyo refresh token ya expiró naturalmente no debe seguir listada como
  activa, aunque nadie la haya cerrado explícitamente.
- Si el usuario cierra la sesión desde la que está mirando la lista (no la actual, sino
  eligiendo explícitamente cerrar la propia), debe perder el acceso de inmediato, igual
  que con cualquier otra sesión — "cerrar una sesión individual" no protege a la actual
  si el usuario la elige a propósito.
- Una IP que no resuelve a ningún país conocido (rangos privados/reservados, fallo de
  lookup) debe mostrar el dispositivo/navegador igual, sin país, en vez de fallar toda
  la lista.
- Cambiar la contraseña o desactivar la cuenta no debe dejar sesiones "fantasma"
  utilizables — ver Assumptions sobre el alcance de esta interacción.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE crear un registro de sesión persistente en cada login
  exitoso (con contraseña, con contraseña + segundo factor, o con llave de acceso) y en
  cada registro de cuenta nuevo (que deja al usuario logueado de inmediato — su primera
  sesión), asociado al refresh token emitido en ese momento.
- **FR-002**: El sistema DEBE permitir a un usuario autenticado consultar la lista de
  sus propias sesiones activas (no expiradas ni cerradas), y solo las suyas.
- **FR-003**: Cada sesión listada DEBE mostrar: una descripción de dispositivo/navegador
  derivada de la información técnica de la petición, un país aproximado (cuando se pueda
  determinar), la fecha en que se creó, y la fecha de su actividad más reciente.
- **FR-004**: El sistema DEBE identificar, dentro de la lista, cuál sesión es la que está
  siendo usada para hacer la propia consulta ("este dispositivo").
- **FR-005**: El sistema DEBE permitir a un usuario cerrar una sesión propia específica,
  dejando inutilizable de inmediato el refresh token asociado.
- **FR-006**: El sistema DEBE permitir a un usuario cerrar todas sus sesiones activas
  excepto la que está usando para ejecutar la acción.
- **FR-007**: Una sesión cuyo refresh token ya expiró por tiempo NO DEBE aparecer en la
  lista de sesiones activas.
- **FR-008**: Cerrar una sesión (individual o en bloque) NUNCA DEBE afectar una sesión
  distinta de las explícitamente objetivo de la acción.
- **FR-009**: El sistema DEBE actualizar la fecha de "última actividad" de una sesión
  cuando esa sesión se usa para renovar su acceso (refresh).
- **FR-010**: El sistema DEBE eliminar el registro de una sesión (no solo dejar de
  mostrarla) en cuanto se cierra explícitamente o su refresh token expira por tiempo —
  no se conserva historial de sesiones pasadas.

### Key Entities _(include if feature involves data)_

- **Sesión**: representa un login vigente de un usuario — solo existe mientras está
  activa (cerrarla o que expire elimina su registro, sin historial). Atributos: a qué
  usuario pertenece, con qué refresh token está asociada, descripción de
  dispositivo/navegador, país aproximado de origen (opcional — puede no resolverse),
  cuándo se creó, y cuándo fue su actividad más reciente.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un usuario que inicia sesión en un segundo dispositivo ve esa sesión
  reflejada en su lista de Seguridad la próxima vez que la abre, sin pasos manuales
  adicionales.
- **SC-002**: Cerrar una sesión desde la lista revoca el acceso de ese dispositivo de
  forma verificable: un intento posterior de ese dispositivo de renovar su acceso es
  rechazado.
- **SC-003**: Ninguna acción de cierre de sesión (individual o "cerrar todas las demás")
  interrumpe jamás la sesión desde la que se ejecutó la acción, salvo que esa sesión haya
  sido el objetivo explícito.
- **SC-004**: Una sesión ya vencida por tiempo desaparece de la lista sin que el usuario
  tenga que cerrarla manualmente.

## Assumptions

- El modelo de "sesión" de esta feature se apoya en el mecanismo de refresh token que
  ya existe (JWT access + refresh) — una sesión nueva se crea en cada login exitoso y
  vive mientras ese refresh token sea válido y no haya sido revocado; renovar el access
  token dentro de esa sesión no crea una sesión nueva.
- El país aproximado se resuelve a partir de la IP de origen de la petición mediante un
  mecanismo de geolocalización; cuando no se pueda resolver (IP privada/reservada, o
  fallo del mecanismo), la sesión se muestra igual, sin ese dato.
- No hay geolocalización por IP en el proyecto hoy — esta feature es lo que la
  introduce, como una capacidad de solo lectura (no se usa para bloquear ni para tomar
  ninguna decisión de seguridad automática).
- Cambiar la contraseña, desactivar la cuenta, o desactivar el segundo factor no forman
  parte del alcance de esta iteración en cuanto a revocar sesiones existentes — quedan
  documentados como pendiente si no ya se cubren por mecanismos existentes.
- Fuera de alcance para esta iteración (pendiente futuro): nombrar/renombrar una sesión
  manualmente, notificar al usuario cuando se inicia sesión desde un dispositivo nuevo,
  límite máximo de sesiones simultáneas, y revocación automática por comportamiento
  sospechoso.
