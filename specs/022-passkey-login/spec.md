# Feature Specification: Llave de acceso (Passkey / WebAuthn)

**Feature Branch**: `022-passkey-login`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "Llave de acceso (Passkey / WebAuthn) para el login. Reemplaza el botón 'Configurar' deshabilitado de Seguridad por una implementación real: registrar una o varias llaves nombradas, iniciar sesión con una llave sin pasar por contraseña ni por el TOTP existente (specs/021), y gestionar (ver/eliminar) las llaves registradas. El login con contraseña (y su TOTP si está activo) sigue funcionando siempre — las llaves son un método adicional, nunca el único. Fuera de alcance: renombrar una llave existente, sugerencia automática de autocompletado (conditional UI), y verificación de attestation del fabricante."

## Clarifications

### Session 2026-09-18

- Q: ¿El login con llave pide el email primero (y luego busca las llaves de ese usuario), o es completamente sin datos —el navegador muestra un selector de cuentas/llaves sin que el usuario escriba nada—? → A: Escribe el email primero, luego confirma con la llave. El sistema no debe revelar si ese email tiene o no llaves registradas (mismo cuidado "sin enumeración" que ya tiene el login con contraseña, `INVALID_CREDENTIALS` genérico).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Registrar una llave de acceso (Priority: P1)

Un usuario que quiere entrar más rápido y de forma más segura registra una llave de acceso desde su perfil. El navegador le pide confirmar con el método de su dispositivo (huella, Face ID, PIN, o una llave física), y luego el usuario le pone un nombre para reconocerla en su lista más adelante.

**Why this priority**: Es la base de todo lo demás — sin una forma de registrar una llave, ninguna otra historia tiene sentido.

**Independent Test**: Iniciar el registro desde Seguridad, completar la ceremonia del navegador (con un autenticador de prueba/plataforma), ponerle un nombre, y confirmar que aparece en la lista de llaves del usuario.

**Acceptance Scenarios**:

1. **Given** un usuario en su perfil, **When** inicia el registro de una llave de acceso, **Then** el navegador le pide confirmar con el método de su dispositivo.
2. **Given** un usuario que confirmó con su dispositivo, **When** le pone un nombre a la llave, **Then** la llave queda registrada y aparece en su lista, con la fecha en que se agregó.
3. **Given** un usuario que cancela o falla la confirmación del dispositivo, **When** vuelve a su perfil, **Then** no se registró ninguna llave nueva.
4. **Given** un usuario con una llave ya registrada, **When** registra una segunda desde otro dispositivo, **Then** ambas quedan activas y aparecen por separado en su lista.

---

### User Story 2 - Iniciar sesión con una llave de acceso (Priority: P2)

Un usuario con al menos una llave de acceso registrada elige, en el login, entrar con su llave en vez de con contraseña. Escribe su email, confirma con su dispositivo, y entra directo a su cuenta.

**Why this priority**: Es el propósito central de la feature — sin esto, registrar una llave no sirve de nada.

**Independent Test**: Con un usuario que ya registró una llave, elegir "Iniciar sesión con llave de acceso", completar la confirmación del dispositivo, y comprobar que la sesión se abre sin haber pedido contraseña ni código de verificación en dos pasos.

**Acceptance Scenarios**:

1. **Given** un usuario con una llave de acceso registrada, **When** escribe su email, elige entrar con llave de acceso y confirma con su dispositivo, **Then** el inicio de sesión se completa sin pedir contraseña.
2. **Given** un usuario con una llave de acceso Y verificación en dos pasos (TOTP) activa, **When** inicia sesión con su llave, **Then** NO se le pide el código TOTP — la llave es su propio método completo.
3. **Given** un usuario cuya confirmación del dispositivo falla o es cancelada, **When** lo intenta, **Then** el inicio de sesión se rechaza y no se entrega ninguna sesión.
4. **Given** un usuario cuyo email no tiene ninguna llave de acceso registrada, **When** intenta iniciar sesión con llave de acceso igual, **Then** el intento se rechaza con el mismo mensaje genérico que cualquier otro fallo — el sistema nunca revela si ese email tiene o no llaves registradas.
5. **Given** un usuario con llave de acceso, **When** en cambio elige entrar con email y contraseña, **Then** el login con contraseña (y su TOTP si lo tiene activo) sigue funcionando exactamente igual que siempre.

---

### User Story 3 - Gestionar las llaves registradas (Priority: P3)

Un usuario revisa, desde su perfil, la lista de llaves de acceso que tiene registradas — con su nombre, cuándo se agregó y cuándo se usó por última vez — y elimina la que ya no usa (por ejemplo, un teléfono que vendió).

**Why this priority**: Necesario para que la feature sea mantenible a largo plazo, pero depende de que registrar/usar una llave ya funcione.

**Independent Test**: Con un usuario con dos o más llaves registradas, eliminar una desde la lista y confirmar que ya no aparece ni sirve para iniciar sesión, mientras la otra sigue intacta.

**Acceptance Scenarios**:

1. **Given** un usuario con llaves registradas, **When** revisa su perfil, **Then** ve cada una con su nombre, fecha de registro y fecha del último uso (o "nunca usada" si corresponde).
2. **Given** un usuario que elimina una llave, **When** intenta iniciar sesión con esa llave eliminada, **Then** el intento se rechaza.
3. **Given** un usuario que elimina su ÚNICA llave de acceso, **When** revisa cómo puede entrar a su cuenta, **Then** el login con email y contraseña (y su TOTP si lo tiene activo) sigue disponible sin ningún cambio — nunca queda sin forma de entrar.

---

### Edge Cases

- ¿Qué pasa si alguien intenta usar una llave de acceso que nunca existió o ya fue eliminada? → El intento de login se rechaza igual que cualquier credencial inválida, sin dar pistas sobre qué llaves existen.
- ¿Qué pasa si alguien escribe un email que no tiene ninguna llave registrada (o que ni siquiera existe) e intenta iniciar sesión con llave de acceso? → Se rechaza con el mismo mensaje genérico que cualquier otro fallo, sin revelar si el email existe o si tiene llaves — mismo cuidado que ya tiene el login con contraseña (`INVALID_CREDENTIALS`).
- ¿Qué pasa si el registro de una llave se interrumpe a la mitad (el usuario cierra la pestaña durante la confirmación del dispositivo)? → No queda ninguna llave a medio registrar; el usuario simplemente no tiene una llave nueva y puede intentar de nuevo desde cero.
- ¿Qué pasa con las sesiones ya abiertas en otros dispositivos cuando se registra o elimina una llave? → No se cierran de forma forzada (mismo comportamiento ya documentado para MFA en specs/021 — esta app no invalida sesiones ya emitidas).
- ¿Puede un usuario tener contraseña, TOTP Y varias llaves de acceso al mismo tiempo? → Sí, todos son métodos independientes y no se excluyen entre sí (ver Assumptions).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE permitir iniciar el registro de una llave de acceso desde un control real en el perfil del usuario (reemplazando el botón "Configurar" actual, que no tiene ningún efecto).
- **FR-002**: El sistema DEBE completar el registro únicamente si el usuario confirma exitosamente con el método de su dispositivo — un registro cancelado o fallido no deja ninguna llave registrada.
- **FR-003**: El sistema DEBE exigir que el usuario nombre la llave al momento de registrarla, para poder reconocerla después en su lista.
- **FR-004**: El sistema DEBE permitir que un usuario registre más de una llave de acceso, cada una identificada y gestionada por separado.
- **FR-005**: El sistema DEBE permitir iniciar sesión usando una llave de acceso registrada, como alternativa explícita al login con contraseña — el usuario escribe su email primero y luego confirma con su dispositivo (no es un selector de cuentas sin datos).
- **FR-005a**: El sistema NO DEBE revelar, a partir de un email escrito para login con llave de acceso, si ese email existe o si tiene llaves registradas — un email sin llaves, o inexistente, se rechaza con el mismo mensaje genérico que cualquier otro intento fallido.
- **FR-006**: El sistema NO DEBE pedir contraseña durante un login con llave de acceso.
- **FR-007**: El sistema NO DEBE pedir el código de verificación en dos pasos (TOTP) durante un login con llave de acceso, aun cuando el usuario tenga esa verificación activa para su login con contraseña.
- **FR-008**: El sistema DEBE rechazar un intento de login con llave de acceso que falle la confirmación del dispositivo, sin entregar ninguna sesión.
- **FR-009**: El sistema DEBE permitir que el usuario vea, desde su perfil, la lista de sus llaves registradas con nombre, fecha de registro y fecha del último uso.
- **FR-010**: El sistema DEBE permitir eliminar individualmente cualquier llave de acceso registrada.
- **FR-011**: El sistema DEBE rechazar cualquier intento de login con una llave que ya fue eliminada.
- **FR-012**: El sistema DEBE garantizar que el login con email y contraseña (y su verificación en dos pasos, si está activa) sigue funcionando sin cambios, sin importar cuántas llaves de acceso tenga o deje de tener el usuario — las llaves nunca son el único método de entrada posible.
- **FR-013**: El sistema DEBE aceptar cualquier autenticador compatible con el estándar, sin restringir por fabricante o marca del dispositivo.

### Key Entities _(include if feature involves data)_

- **Llave de acceso**: una credencial registrada por el usuario en un dispositivo específico — pertenece a un usuario, tiene un nombre elegido por él, una fecha de registro y una fecha de último uso (o ninguna, si nunca se usó para entrar).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un usuario puede completar el registro de una llave de acceso (confirmar con su dispositivo + ponerle nombre) sin ayuda externa, usando cualquier navegador/dispositivo moderno compatible.
- **SC-002**: El 100% de los inicios de sesión exitosos con llave de acceso se completan sin pedir contraseña ni código TOTP, sin excepción.
- **SC-003**: El 100% de los inicios de sesión con email y contraseña de un usuario con llaves de acceso registradas se completan exactamente igual que si no tuviera ninguna — cero cambio de comportamiento.
- **SC-004**: Un usuario que elimina todas sus llaves de acceso conserva acceso total a su cuenta vía su login existente, sin necesitar intervención de soporte.
- **SC-005**: Un usuario puede identificar cuál de sus llaves eliminar con solo mirar la lista (nombre + fechas), sin tener que adivinar cuál es cuál.

## Assumptions

- Las llaves de acceso son un método de login **totalmente independiente** de la contraseña y de la verificación en dos pasos (specs/021) — un usuario puede tener cualquier combinación de los tres sin que se excluyan entre sí, y activar/desactivar/eliminar uno no afecta a los otros.
- Esta aplicación no tiene un mecanismo de invalidación de sesiones ya emitidas (igual que specs/021) — registrar o eliminar una llave no cierra sesiones abiertas en otros dispositivos.
- Se acepta cualquier autenticador compatible con el estándar de la industria (biométrico de plataforma, PIN del sistema operativo, o llave física USB/NFC/Bluetooth) sin lista blanca de fabricantes ni verificación de procedencia del dispositivo.
- Quedan explícitamente fuera de alcance de esta iteración (documentados como pendientes futuros): renombrar una llave ya registrada, sugerencia automática de autocompletado del navegador (conditional UI / discoverable credentials), y verificación de "attestation" del fabricante del autenticador.
- No existe límite máximo de llaves por usuario definido por esta spec — se deja como detalle técnico para la fase de plan.
