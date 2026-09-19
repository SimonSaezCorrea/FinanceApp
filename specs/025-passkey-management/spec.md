# Feature Specification: Renombrar passkeys y autocompletado condicional

**Feature Branch**: `025-passkey-management`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "Perfil > Seguridad > Llaves de acceso: dos mejoras chicas sobre passkeys ya implementadas (specs/022). (1) Renombrar una llave existente: hoy el nombre se elige una sola vez al crearla y nunca más se puede cambiar sin eliminar la llave y volver a registrarla. Se agrega PATCH /auth/me/passkeys/:id con {name}, mismo patrón de verificación de dueño que ya usa \"Eliminar llave\" (404 si la llave no existe o no es tuya), misma validación de nombre que al crear (1-60 caracteres, trim). (2) Autocompletado condicional: hoy iniciar sesión con passkey exige apretar el botón explícito \"Iniciar sesión con llave de acceso\". Se agrega la sugerencia nativa del navegador (navigator.credentials.get({mediation:\"conditional\"})) sobre el propio campo de email de login — el navegador la ofrece como opción de autocompletar mientras el usuario mira el campo, sin apretar nada. Reutiliza el mismo backend ya implementado del login \"discoverable\" (que ya resuelve la cuenta desde la credencial, sin necesitar el email) — cero cambios de contrato o endpoint, solo cambia CUÁNDO el frontend dispara la ceremonia. Alcance: el botón explícito sigue existiendo (el autocompletado es un camino adicional, no un reemplazo); solo el dueño puede renombrar su propia llave. Explícitamente fuera de alcance (ya documentado, decisión de producto tomada antes): verificación de attestation contra el catálogo de fabricantes FIDO MDS. Criterios de aceptación: 1. Un usuario puede renombrar una llave sin perder su historial de uso (lastUsedAt intacto). 2. En un navegador con soporte de conditional UI y una passkey ya registrada, al enfocar el campo de email en login (sin escribir ni apretar botones) el navegador la ofrece como sugerencia; elegirla completa el login."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Renombrar una llave de acceso ya registrada (Priority: P1)

Como usuario que registró una passkey con un nombre que ya no le hace sentido (o que quiere distinguir mejor entre varios dispositivos), quiero poder cambiarle el nombre sin tener que eliminarla y volver a pasar por toda la ceremonia de registro.

**Why this priority**: Es el gap más simple y de mayor frustración inmediata — hoy corregir un nombre implica perder la llave y rehacer el registro completo, un costo desproporcionado para arreglar un texto.

**Independent Test**: Con una llave ya registrada, renombrarla desde Perfil → Seguridad; verificar que la lista la muestra con el nuevo nombre y que su fecha de "último uso" no cambió.

**Acceptance Scenarios**:

1. **Given** un usuario con una llave llamada "MacBook viejo", **When** la renombra a "MacBook de Ana", **Then** la lista de llaves muestra el nuevo nombre inmediatamente y `lastUsedAt`/`createdAt` de esa llave no cambian.
2. **Given** un usuario intenta renombrar una llave que no es suya (o que ya no existe), **When** envía el cambio, **Then** el sistema lo rechaza sin revelar si la llave existe para otro usuario.
3. **Given** un usuario intenta renombrar una llave con un nombre vacío o de más de 60 caracteres, **When** envía el cambio, **Then** el sistema lo rechaza y la llave conserva su nombre anterior.

---

### User Story 2 - Iniciar sesión con passkey sin apretar ningún botón (Priority: P2)

Como usuario que ya tiene una passkey registrada para este sitio, quiero que el navegador me la sugiera automáticamente al llegar a la pantalla de login — igual que ya me sugiere contraseñas guardadas — para no tener que buscar ni apretar un botón aparte.

**Why this priority**: Es una mejora de conveniencia sobre un flujo que YA funciona (el botón explícito sigue ahí) — no desbloquea nada nuevo, solo hace el camino más corto para quien ya tiene una llave.

**Independent Test**: En un navegador con soporte de autocompletado condicional (Chrome/Safari recientes) y una passkey ya registrada, entrar a la pantalla de login, enfocar el campo de email sin escribir ni apretar nada, y verificar que el navegador ofrece la passkey como sugerencia; elegirla completa el login igual que el botón explícito.

**Acceptance Scenarios**:

1. **Given** un usuario con una passkey registrada, en un navegador compatible, **When** enfoca el campo de email en la pantalla de login sin escribir nada, **Then** el navegador muestra esa passkey como sugerencia de autocompletado.
2. **Given** esa sugerencia visible, **When** el usuario la selecciona, **Then** el login se completa exactamente igual que si hubiera usado el botón explícito "Iniciar sesión con llave de acceso" (misma sesión creada, mismo resultado).
3. **Given** un navegador sin soporte de autocompletado condicional, **When** el usuario llega a la pantalla de login, **Then** no ve ninguna sugerencia automática pero el botón explícito sigue funcionando exactamente igual que hoy.

---

### Edge Cases

- Un usuario con MÚLTIPLES llaves registradas: renombrar una no afecta el nombre de las demás.
- Renombrar una llave al mismo nombre que ya tenía: se acepta como un no-op válido (no es un error).
- El navegador ofrece la sugerencia condicional mientras el usuario YA escribió parte de un email distinto en el campo: el comportamiento sigue el estándar nativo del navegador (la sugerencia de passkey y el autocompletado de texto normal conviven en el mismo campo, esta feature no le agrega lógica propia encima).
- El explícito botón de login con passkey sigue funcionando exactamente igual para un usuario que prefiere no usar la sugerencia condicional (ej. la rechazó, o su navegador no la soporta).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE permitir a un usuario cambiar el nombre de una passkey que ya registró, sin afectar ningún otro dato de esa llave (`credentialId`, `publicKey`, `counter`, `createdAt`, `lastUsedAt`).
- **FR-002**: El sistema DEBE rechazar el intento de renombrar una passkey que no pertenece al usuario autenticado, con la misma respuesta que si la llave no existiera (sin distinguir "no es tuya" de "no existe").
- **FR-003**: El nuevo nombre DEBE cumplir la misma validación que el nombre elegido al registrar la llave por primera vez (no vacío tras recortar espacios, máximo 60 caracteres).
- **FR-004**: La pantalla de inicio de sesión DEBE ofrecer, en navegadores que lo soporten, la sugerencia nativa de autocompletado de passkeys sobre el campo de email, sin requerir ninguna acción del usuario más allá de enfocar ese campo.
- **FR-005**: Elegir la passkey sugerida por el autocompletado condicional DEBE completar el inicio de sesión exactamente con el mismo resultado (misma sesión, mismo comportamiento) que usar el botón explícito existente.
- **FR-006**: El botón explícito "Iniciar sesión con llave de acceso" DEBE seguir funcionando exactamente igual que hoy — el autocompletado condicional es un camino adicional, nunca un reemplazo.
- **FR-007**: En un navegador sin soporte de autocompletado condicional, el sistema NO DEBE mostrar ningún error ni comportamiento distinto — simplemente no aparece la sugerencia automática.

### Key Entities

- **Llave de acceso (Passkey)**: entidad ya existente (specs/022). Esta feature no le agrega atributos nuevos — solo habilita cambiar su campo `name` después de creada, que hoy solo se escribe una vez al registrar.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: El 100% de los intentos de renombrar una llave propia con un nombre válido tienen éxito y el cambio es visible de inmediato en la lista de llaves.
- **SC-002**: El 100% de los intentos de renombrar una llave ajena o inexistente se rechazan sin revelar información sobre su existencia.
- **SC-003**: En un navegador con soporte de autocompletado condicional, el 100% de las veces que el usuario enfoca el campo de email con una passkey ya registrada, el navegador la ofrece como sugerencia.
- **SC-004**: El 100% de los logins completados vía la sugerencia condicional producen el mismo resultado (misma sesión válida) que un login por el botón explícito.

## Assumptions

- Se reutiliza íntegramente el mecanismo de login "discoverable" ya implementado (specs/022, extensión del mismo día): el backend ya resuelve la cuenta desde la credencial elegida sin necesitar el email, así que el autocompletado condicional no requiere ningún cambio de contrato ni de endpoint — solo cambia el disparador en el frontend (de "click" a "el navegador lo decide").
- Renombrar una llave es una operación de un solo campo (`name`) — no incluye cambiar ningún otro atributo de la llave (transports, etc.), que ya no son editables por el usuario hoy tampoco.
- La verificación de "attestation" contra el catálogo de fabricantes FIDO MDS queda explícitamente fuera de alcance de esta iteración — decisión de producto ya tomada (no un hueco técnico encontrado después), documentada en `docs/PENDING.md`.
- El soporte de navegador para autocompletado condicional varía (no todos los navegadores lo soportan); esta feature no intenta detectar ni informar al usuario sobre esa compatibilidad — simplemente no ofrece la sugerencia donde el navegador no la soporta, sin degradar el flujo existente.
