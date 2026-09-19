# Feature Specification: Autenticación en dos pasos (MFA con TOTP)

**Feature Branch**: `021-mfa-totp`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "Autenticación en dos pasos (MFA) real para el login. Reemplaza el switch decorativo 'Verificación en dos pasos' del perfil por una implementación real con TOTP (app autenticadora): activar (QR + confirmación + códigos de recuperación mostrados una vez), exigir el segundo paso en cada login de un usuario con MFA activo, desactivar (reingresando la contraseña), e iniciar sesión con un código de recuperación cuando se perdió el dispositivo. Un código por email queda fuera de alcance (documentado como pendiente); igual que 'recordar este dispositivo' y regenerar códigos de recuperación sin reactivar todo el MFA."

## Clarifications

### Session 2026-09-18

- Q: ¿Cómo distingue el sistema un código TOTP de un código de recuperación en el segundo paso del login? → A: Un solo campo; el sistema detecta el tipo de código automáticamente por su formato (6 dígitos numéricos = TOTP, formato más largo/alfanumérico = recuperación) — no hay que elegir un camino separado.
- Q: ¿Se puede reactivar/cambiar de dispositivo sin desactivar primero? → A: No — no existe un camino separado para "reemplazar dispositivo"; cambiar de app autenticadora siempre pasa por desactivar (reingresando la contraseña) y volver a activar desde cero, igual que cualquier otra reactivación.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Activar la verificación en dos pasos (Priority: P1)

Un usuario que quiere proteger mejor su cuenta activa la verificación en dos pasos desde su perfil. El sistema le muestra un código QR (y una alternativa en texto, por si no puede escanear) para agregar la cuenta a su app autenticadora, y le pide un código generado por esa app para confirmar que quedó bien configurada antes de activar nada. Al confirmar, recibe un set de códigos de recuperación de un solo uso, que debe guardar en ese momento porque no se le van a volver a mostrar.

**Why this priority**: Es la base de todo lo demás — sin una forma real de activar MFA, ninguna otra historia tiene sentido.

**Independent Test**: Iniciar la activación, escanear el QR con una app autenticadora real (o generar el código a mano con el secreto en texto), ingresar un código válido y confirmar que el switch queda activo y se muestran los códigos de recuperación una sola vez.

**Acceptance Scenarios**:

1. **Given** un usuario sin MFA activo, **When** inicia la activación desde su perfil, **Then** el sistema le muestra un código QR y un código en texto plano equivalente, para agregar a su app autenticadora.
2. **Given** un usuario que acaba de escanear el QR, **When** ingresa un código válido generado por su app, **Then** la verificación en dos pasos queda activa y se le muestran sus códigos de recuperación de un solo uso.
3. **Given** un usuario en medio de la activación, **When** ingresa un código incorrecto, **Then** la activación no se confirma y la verificación en dos pasos sigue inactiva.
4. **Given** un usuario que abandona la pantalla de activación sin confirmar ningún código, **When** vuelve a su perfil, **Then** la verificación en dos pasos sigue apareciendo como inactiva (nada quedó activado a medias).
5. **Given** un usuario que acaba de confirmar la activación y ve sus códigos de recuperación, **When** navega fuera de esa pantalla, **Then** esos códigos no se vuelven a mostrar en ninguna otra pantalla ni respuesta del sistema.

---

### User Story 2 - Iniciar sesión con la verificación en dos pasos activa (Priority: P2)

Un usuario con MFA activo intenta iniciar sesión con su email y contraseña. Después de que esos datos son correctos, el sistema le pide un segundo paso: un código de 6 dígitos de su app autenticadora. Solo con ese código correcto se completa el inicio de sesión.

**Why this priority**: Es el propósito central de la feature — sin esto, activar MFA no protege nada de verdad.

**Independent Test**: Con un usuario que ya activó MFA, iniciar sesión con su email+contraseña y confirmar que el sistema pide un segundo paso antes de dar la sesión; probar que un código incorrecto rechaza el intento y uno correcto lo completa.

**Acceptance Scenarios**:

1. **Given** un usuario con MFA activo, **When** ingresa su email y contraseña correctos, **Then** el sistema le pide un código de su app autenticadora antes de completar el inicio de sesión.
2. **Given** un usuario en el segundo paso del login, **When** ingresa el código correcto de su app autenticadora, **Then** el inicio de sesión se completa normalmente.
3. **Given** un usuario en el segundo paso del login, **When** ingresa un código incorrecto, **Then** el intento se rechaza y no se entrega ninguna sesión.
4. **Given** un usuario SIN MFA activo, **When** ingresa su email y contraseña correctos, **Then** el inicio de sesión se completa exactamente igual que hoy, sin ningún paso adicional.
5. **Given** un usuario que ingresa códigos incorrectos varias veces seguidas, **When** sigue intentando, **Then** el sistema frena los intentos (no permite probar códigos indefinidamente sin límite).

---

### User Story 3 - Desactivar la verificación en dos pasos (Priority: P3)

Un usuario con MFA activo decide desactivarla — por ejemplo, porque va a cambiar de teléfono. Para hacerlo, tiene que volver a ingresar su contraseña actual, el mismo resguardo que ya existe para eliminar la cuenta.

**Why this priority**: Necesario para que la feature sea usable a largo plazo (nadie debería quedar atado a MFA para siempre), pero depende de que activar/exigir el segundo paso ya funcione.

**Independent Test**: Con un usuario con MFA activo, desactivarla reingresando la contraseña, y confirmar que el switch queda inactivo y que un login posterior ya no pide segundo paso.

**Acceptance Scenarios**:

1. **Given** un usuario con MFA activo, **When** intenta desactivarla, **Then** el sistema le pide reingresar su contraseña actual antes de desactivar nada.
2. **Given** un usuario que reingresó su contraseña correctamente, **When** confirma la desactivación, **Then** la verificación en dos pasos queda inactiva.
3. **Given** un usuario que reingresó una contraseña incorrecta, **When** intenta desactivar, **Then** la desactivación se rechaza y MFA sigue activo.
4. **Given** un usuario que desactivó MFA y luego la vuelve a activar, **When** completa la nueva activación, **Then** ni el secreto ni los códigos de recuperación de la activación anterior sirven para nada — todo es nuevo.

---

### User Story 4 - Iniciar sesión con un código de recuperación (Priority: P4)

Un usuario con MFA activo perdió el teléfono donde tenía su app autenticadora. En el segundo paso del login, en vez de un código de la app, usa uno de los códigos de recuperación que guardó cuando activó MFA.

**Why this priority**: Es la red de seguridad para el caso de perder el dispositivo — importante para que la feature no deje a nadie bloqueado permanentemente, pero es un camino secundario frente al login normal con la app autenticadora.

**Independent Test**: Con un usuario con MFA activo y sus códigos de recuperación guardados, usar uno de esos códigos en el segundo paso del login y confirmar que funciona una vez y que ese mismo código ya no sirve en un intento posterior.

**Acceptance Scenarios**:

1. **Given** un usuario en el segundo paso del login, **When** ingresa uno de sus códigos de recuperación sin usar, **Then** el inicio de sesión se completa.
2. **Given** un código de recuperación que ya fue usado una vez, **When** se intenta usar de nuevo en un login posterior, **Then** el sistema lo rechaza igual que un código inválido.
3. **Given** un usuario con MFA activo, **When** revisa su perfil, **Then** puede ver cuántos códigos de recuperación le quedan sin usar (sin ver los códigos mismos).

---

### Edge Cases

- ¿Qué pasa si un usuario inicia la activación de MFA dos veces seguidas sin confirmar la primera? → Solo el intento de activación más reciente puede confirmarse; uno anterior sin confirmar queda descartado.
- ¿Qué pasa si un usuario CON MFA ya activo quiere cambiar de app autenticadora (ej. teléfono nuevo)? → No hay un camino separado para "reemplazar dispositivo": debe desactivar MFA (reingresando su contraseña, User Story 3) y activarla de nuevo desde cero (User Story 1), igual que cualquier otra reactivación.
- ¿Qué pasa si un usuario agota todos sus códigos de recuperación (los usó todos)? → Ya no tiene camino de recuperación por código hasta que desactive y reactive MFA (lo que genera un set nuevo) — su login sigue funcionando normalmente con la app autenticadora mientras tanto.
- ¿Qué pasa con las sesiones ya abiertas en otros dispositivos cuando se activa o desactiva MFA? → No se cierran de forma forzada por esta feature (ver Assumptions: esta app no tiene un mecanismo de invalidación de sesiones ya emitidas).
- ¿Qué pasa si alguien intenta iniciar sesión probando códigos al azar? → Se lo frena mediante el límite de intentos (FR-010) antes de que sea viable adivinar uno por fuerza bruta.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE permitir iniciar la activación de la verificación en dos pasos desde un control real en el perfil del usuario (reemplazando el switch decorativo actual, que no tiene ningún efecto).
- **FR-002**: Al iniciar la activación, el sistema DEBE generar un secreto nuevo y presentarlo como código QR más una alternativa en texto plano, para agregarlo a una app autenticadora.
- **FR-003**: El sistema DEBE exigir que el usuario ingrese un código válido generado desde esa app antes de dar la activación por confirmada.
- **FR-004**: El sistema NO DEBE marcar la verificación en dos pasos como activa hasta que el código de confirmación sea validado — un intento de activación abandonado o fallido no deja la cuenta protegida a medias.
- **FR-005**: Al confirmarse la activación, el sistema DEBE generar un conjunto de códigos de recuperación de un solo uso y mostrarlos al usuario una única vez.
- **FR-006**: El sistema NO DEBE volver a mostrar esos códigos de recuperación en texto plano en ninguna otra pantalla ni respuesta, después de la confirmación de la activación.
- **FR-007**: El sistema DEBE exigir un segundo paso después de un login con email y contraseña correctos, para todo usuario con la verificación en dos pasos activa — un único campo que acepta indistintamente un código de la app autenticadora o un código de recuperación, detectando cuál de los dos es por su formato (sin que el usuario tenga que elegir un camino separado).
- **FR-008**: El sistema DEBE completar el login de un usuario SIN la verificación en dos pasos activa exactamente igual que hoy, sin ningún paso adicional.
- **FR-009**: El sistema DEBE rechazar un intento de login cuyo segundo paso sea un código inválido, sin entregar ninguna sesión.
- **FR-010**: El sistema DEBE frenar los intentos repetidos de códigos de segundo paso inválidos, para que no sea viable adivinar uno por fuerza bruta.
- **FR-011**: El sistema DEBE exigir que el usuario reingrese su contraseña actual antes de poder desactivar la verificación en dos pasos.
- **FR-012**: Al desactivarse la verificación en dos pasos, el sistema DEBE invalidar el secreto y los códigos de recuperación vigentes — ninguno de los dos vuelve a ser utilizable si se activa de nuevo más adelante (una reactivación genera un secreto y códigos completamente nuevos).
- **FR-013**: El sistema DEBE permitir completar el segundo paso del login usando un código de recuperación sin usar, en vez de un código de la app autenticadora.
- **FR-014**: Cada código de recuperación DEBE poder usarse como máximo una vez — una vez usado para iniciar sesión, deja de ser válido para intentos futuros.
- **FR-015**: El sistema DEBE permitir que el usuario vea, desde su perfil, cuántos códigos de recuperación sin usar le quedan (sin mostrar los códigos mismos).
- **FR-016**: El sistema NO DEBE exponer el secreto de la verificación en dos pasos en texto plano por ninguna vía, en ningún momento posterior a la pantalla inicial de activación.

### Key Entities _(include if feature involves data)_

- **Preferencia de verificación en dos pasos del usuario**: si está activa o no, y el secreto vigente asociado — vive junto al resto del perfil del usuario.
- **Código de recuperación**: uno de los códigos de un solo uso generados al activar la verificación en dos pasos; cada uno pertenece a un usuario, tiene un estado usado/sin usar, y deja de servir apenas se usa una vez.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un usuario puede completar la activación completa (escanear/confirmar + guardar códigos de recuperación) sin ayuda externa, usando cualquier app autenticadora estándar del mercado.
- **SC-002**: El 100% de los intentos de login de un usuario con MFA activo quedan bloqueados si no se completa el segundo paso correctamente — no existe ningún camino que otorgue sesión solo con email y contraseña.
- **SC-003**: El 100% de los intentos de login de un usuario SIN MFA activo se completan sin ningún paso adicional, sin cambio de comportamiento respecto a hoy.
- **SC-004**: Un usuario que pierde el acceso a su app autenticadora puede recuperar el acceso a su cuenta usando un código de recuperación, sin necesitar intervención manual de soporte.
- **SC-005**: Después de un número limitado de intentos de código incorrectos consecutivos, nuevos intentos quedan bloqueados temporalmente, haciendo inviable adivinar un código por fuerza bruta en un tiempo razonable.

## Assumptions

- Los parámetros técnicos exactos del código (6 dígitos, rotación cada 30 segundos, tolerancia de desfase de reloj) siguen el estándar de la industria compatible con cualquier app autenticadora común (Google Authenticator, Authy, 1Password, etc.) — no se pidió un comportamiento distinto.
- La cantidad exacta de códigos de recuperación generados y el umbral exacto del límite de intentos (FR-010) se definen en la fase de plan, no en esta spec — lo que la spec fija es que ambos existen y con qué propósito.
- Esta aplicación no tiene un mecanismo de invalidación de sesiones ya emitidas (JWT sin estado del lado del servidor) — activar o desactivar MFA no cierra sesiones abiertas en otros dispositivos; cada una sigue su propio ciclo de vida normal.
- Quedan explícitamente fuera de alcance de esta iteración (documentados como pendientes futuros): un segundo factor por email o SMS, "recordar este dispositivo" para saltarse el segundo paso en logins futuros del mismo navegador, y regenerar el set de códigos de recuperación sin pasar por una desactivación + reactivación completa de MFA.
- Un usuario que pierde tanto su app autenticadora como todos sus códigos de recuperación queda sin forma de recuperar el acceso por sí mismo — mismo nivel de soporte manual que ya existiría hoy para cualquier otro problema de acceso a la cuenta; esta feature no agrega un flujo de recuperación asistida nuevo.
