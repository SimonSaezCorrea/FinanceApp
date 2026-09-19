# Feature Specification: Revocar sesiones al cambiar credenciales

**Feature Branch**: `024-revoke-sessions-on-change`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "Al cambiar la contraseña del usuario (PATCH /auth/me/password) o al desactivar la verificación en dos pasos (MFA/TOTP), el sistema debe revocar automáticamente todas las demás sesiones activas del usuario, dejando activa únicamente la sesión desde la que se realizó la acción. Usa el mecanismo de sesiones reales ya existente (dominio `session`, specs/023): cerrar una sesión estampa `closedAt` (se retiene 3 días, la purga un cron), y ya existe la operación equivalente manual `POST /auth/sessions/revoke-others` que hace exactamente esto por pedido explícito del usuario — esta feature dispara esa misma revocación automáticamente en dos momentos: justo después de un cambio de contraseña exitoso, y justo después de una desactivación de MFA exitosa. Por qué: cambiar la contraseña o quitar el segundo factor son señales de que el usuario quiere invalidar accesos anteriores. Alcance: disparadores = cambio de contraseña exitoso, desactivación de MFA exitosa; se revocan todas las sesiones del usuario EXCEPTO la que originó el request; un intento fallido no cierra ninguna sesión. Explícitamente fuera de alcance: correo/notificación avisando el cierre, notificación de nuevo dispositivo, límite de sesiones simultáneas, revocación automática por comportamiento sospechoso. Criterio de aceptación: con 3 sesiones activas (A, B, C), si desde A el usuario cambia su contraseña con éxito (o desactiva MFA con éxito), B y C quedan cerradas y A sigue activa."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Cambiar la contraseña cierra las demás sesiones (Priority: P1)

Como usuario que sospecha que alguien más pudo acceder a su cuenta, cuando cambio mi contraseña
desde mi dispositivo actual, quiero que cualquier otra sesión abierta en otros dispositivos deje de
funcionar de inmediato, sin tener que ir a Seguridad y cerrarlas una por una.

**Why this priority**: Es el disparador de seguridad más común y más urgente — un cambio de
contraseña casi siempre ocurre porque el usuario quiere invalidar accesos que ya no confía. Sin
esto, cambiar la contraseña da una falsa sensación de seguridad.

**Independent Test**: Con 2 sesiones activas (A y B), cambiar la contraseña desde A con éxito;
verificar que B ya no puede usarse (ni para peticiones autenticadas ni para refrescar su token) y
que A sigue funcionando con normalidad.

**Acceptance Scenarios**:

1. **Given** un usuario con 3 sesiones activas (A, B, C), **When** cambia su contraseña con éxito
   desde la sesión A, **Then** las sesiones B y C quedan cerradas y A permanece activa.
2. **Given** un usuario con 2 sesiones activas (A y B), **When** intenta cambiar su contraseña desde
   A pero la contraseña actual que ingresó es incorrecta, **Then** el cambio se rechaza y ninguna
   sesión se cierra (ni A ni B).
3. **Given** un usuario con una sola sesión activa (A, la propia), **When** cambia su contraseña con
   éxito, **Then** no hay ninguna otra sesión que cerrar y A sigue activa sin cambios.

---

### User Story 2 - Desactivar la verificación en dos pasos cierra las demás sesiones (Priority: P1)

Como usuario que decide apagar su segundo factor (MFA/TOTP), quiero que esa acción también invalide
cualquier otra sesión abierta en otros dispositivos, porque a partir de ese momento esas sesiones
quedan protegidas por un mecanismo más débil (solo lo que ya tenían, sin el segundo factor).

**Why this priority**: Mismo nivel de urgencia que el cambio de contraseña — desactivar MFA reduce
la protección de la cuenta, y dejar sesiones antiguas vivas bajo ese nuevo nivel de protección más
débil es la misma clase de riesgo.

**Independent Test**: Con 2 sesiones activas (A y B) en una cuenta con MFA activo, desactivar MFA
con éxito desde A (reingresando la contraseña, como ya exige el flujo existente); verificar que B
queda cerrada y A sigue activa.

**Acceptance Scenarios**:

1. **Given** un usuario con MFA activo y 3 sesiones activas (A, B, C), **When** desactiva MFA con
   éxito desde la sesión A, **Then** las sesiones B y C quedan cerradas y A permanece activa.
2. **Given** un usuario con MFA activo y 2 sesiones activas (A y B), **When** intenta desactivar MFA
   desde A pero la contraseña que reingresa es incorrecta, **Then** la desactivación se rechaza y
   ninguna sesión se cierra.

---

### Edge Cases

- Un usuario con una única sesión activa (la propia) que cambia su contraseña o desactiva MFA: no
  hay ninguna otra sesión que cerrar; la propia sesión nunca se ve afectada por su propia acción.
- Dos cambios de contraseña disparados casi simultáneamente desde dos sesiones distintas (A y B):
  cada uno conserva viva SOLO la sesión que lo originó — el segundo cambio en completarse deja como
  única sesión viva la suya propia, cerrando incluso la que quedó de la primera revocación.
- La revocación ocurre únicamente si la acción de negocio (cambio de contraseña / desactivación de
  MFA) se completó con éxito — cualquier fallo de validación deja todas las sesiones existentes
  intactas.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE cerrar todas las sesiones activas del usuario, excepto la sesión que
  originó la petición, inmediatamente después de un cambio de contraseña exitoso
  (`PATCH /auth/me/password`).
- **FR-002**: El sistema DEBE cerrar todas las sesiones activas del usuario, excepto la sesión que
  originó la petición, inmediatamente después de una desactivación exitosa de la verificación en dos
  pasos (MFA/TOTP).
- **FR-003**: Si el cambio de contraseña o la desactivación de MFA fallan (por ejemplo, contraseña
  actual incorrecta), el sistema NO DEBE cerrar ninguna sesión.
- **FR-004**: Cerrar una sesión por este mecanismo DEBE tener el mismo efecto que cerrarla
  manualmente hoy (specs/023): deja de servir para autenticar solicitudes nuevas y para refrescar su
  token, de inmediato.
- **FR-005**: La sesión desde la que se realizó el cambio de contraseña o la desactivación de MFA
  NUNCA debe cerrarse a sí misma como efecto de esta revocación.
- **FR-006**: El sistema NO DEBE enviar ningún correo o notificación al usuario avisando que sus
  otras sesiones fueron cerradas — queda fuera de alcance de esta iteración (no existe proveedor de
  envío de correo transaccional en el proyecto).

### Key Entities

- **Sesión (Session)**: entidad ya existente (specs/023) que representa un login activo de un
  dispositivo/navegador. Esta feature no le agrega atributos nuevos — reutiliza su ciclo de vida de
  cierre ya existente (cerrar = queda inactiva de inmediato para autenticación).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: En el 100% de los cambios de contraseña exitosos, cualquier otra sesión que existiera
  antes del cambio deja de poder usarse para autenticar una solicitud nueva o refrescar su token, de
  forma inmediata (sin esperar a que ese token expire por sí solo).
- **SC-002**: En el 100% de las desactivaciones de MFA exitosas, cualquier otra sesión que existiera
  antes de la desactivación deja de poder usarse de la misma forma inmediata.
- **SC-003**: En el 100% de los intentos fallidos de cambiar la contraseña o desactivar MFA, ninguna
  sesión existente se ve afectada.
- **SC-004**: La sesión que realizó el cambio de contraseña o la desactivación de MFA sigue
  funcionando con total normalidad inmediatamente después de la acción, en el 100% de los casos.

## Assumptions

- Se reutiliza íntegramente el mecanismo de cierre de sesión de specs/023 (estampado de `closedAt`,
  retención de 3 días, purga por cron) — esta feature no introduce un nuevo estado ni una nueva
  columna en `Session`.
- "La sesión que originó la petición" se identifica por el mismo mecanismo que ya usa
  `POST /auth/sessions/revoke-others` (specs/023): el claim `sid` del token de acceso de esa
  solicitud.
- Enviar una notificación (correo, push, etc.) informando al usuario que sus otras sesiones fueron
  cerradas queda explícitamente fuera de alcance — no existe ningún proveedor de envío de correo
  transaccional en el proyecto hoy (ver `docs/PENDING.md`, sección "Envío de correos
  transaccionales").
- Un límite al número de sesiones simultáneas y una revocación automática por comportamiento
  sospechoso quedan también explícitamente fuera de alcance — son decisiones de producto propias que
  no se asumen aquí (ya documentadas como pendientes desde specs/023).
- El flujo de desactivar MFA ya exige reingresar la contraseña actual (specs/021) — esta feature no
  cambia ese requisito, solo agrega el efecto de cierre de sesiones tras el éxito de esa acción.
