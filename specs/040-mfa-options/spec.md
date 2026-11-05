# Feature Specification: Verificación en dos pasos más completa (códigos nuevos, dispositivos recordados y código por correo)

**Feature Branch**: `040-mfa-options`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Verificación en dos pasos más completa: códigos de recuperación nuevos, dispositivos recordados y código por correo. Hoy la verificación en dos pasos solo funciona con una app autenticadora (TOTP) y tiene tres carencias: (1) regenerar los códigos de recuperación sin desactivar la verificación, con verificación reciente de identidad, invalidando los anteriores, mostrando los nuevos una sola vez y avisando por correo; (2) recordar este dispositivo por 30 días al ingresar el segundo factor, con lista revocable en Seguridad y olvido de todos al cambiar o recuperar la contraseña, desactivar la verificación o regenerar los códigos; (3) segundo factor por correo como alternativa a la app autenticadora: código de 6 dígitos al correo confirmado, 10 minutos, un solo uso, reenvío con límite, misma protección de 5 intentos / 15 minutos, códigos de recuperación igual, solo con correo confirmado, cambiable entre métodos, explicando que la app o la llave de acceso son más seguras, y preparado para sumar otro canal (WhatsApp) después. Fuera de alcance: SMS, WhatsApp (solo el diseño), cambios al inicio de sesión con llave de acceso, verificación de dispositivos para otras acciones."

## Contexto

La verificación en dos pasos de _fik_ (specs/021) funciona hoy solo con una app autenticadora: al activarla
se escanea un QR, se reciben 10 códigos de recuperación de un solo uso, y desde entonces cada inicio de
sesión con RUT y contraseña pide además un código de 6 dígitos de la app. Cinco códigos incorrectos
seguidos bloquean el segundo paso por 15 minutos. Iniciar sesión con una llave de acceso (specs/022) no
pide segundo factor, porque la llave ya es una verificación fuerte.

Tres cosas faltan, y cada una empuja a la gente a no activar la verificación o a desactivarla:

- **Los códigos de recuperación se agotan y no se renuevan.** Quien gastó o perdió sus códigos solo puede
  obtener otros desactivando la verificación y activándola de nuevo, lo que obliga a volver a escanear el
  QR en la app autenticadora.
- **El código se pide en cada inicio de sesión**, incluso en el computador de siempre.
- **Sin app autenticadora no hay verificación.** Quien no quiere instalar una app no tiene alternativa.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Generar códigos de recuperación nuevos (Priority: P1)

Una persona con la verificación en dos pasos activa gastó varios de sus códigos de recuperación, o los
perdió. Desde Perfil → Seguridad elige "Generar códigos nuevos". La aplicación le pide confirmar que es
ella (si no lo hizo hace poco) y le muestra 10 códigos nuevos, una sola vez, con la opción de copiarlos o
descargarlos. Los códigos anteriores dejan de servir en ese momento. Su app autenticadora sigue
funcionando sin tocar nada. Recibe un correo avisando que se generaron códigos nuevos.

**Why this priority**: es el cambio más chico y cierra un hueco real de seguridad: hoy, renovar los
códigos exige desactivar la verificación, dejando la cuenta sin segundo factor mientras tanto.

**Independent Test**: con la verificación activa y algunos códigos usados, generar códigos nuevos;
comprobar que un código viejo no sirve para iniciar sesión, que uno nuevo sí, y que la app autenticadora
sigue aceptando sus códigos.

**Acceptance Scenarios**:

1. **Given** una persona con la verificación activa que verificó su identidad hace menos de 5 minutos,
   **When** elige "Generar códigos nuevos", **Then** ve 10 códigos nuevos una sola vez y la sección muestra
   10 códigos disponibles.
2. **Given** que la persona no verificó su identidad recientemente, **When** elige "Generar códigos nuevos",
   **Then** la aplicación le pide primero el paso de verificación y, al completarlo, genera los códigos.
3. **Given** códigos recién regenerados, **When** alguien intenta iniciar sesión con un código de la tanda
   anterior, **Then** el código se rechaza como cualquier código incorrecto.
4. **Given** códigos recién regenerados, **When** la persona inicia sesión con un código de su app
   autenticadora o con su método por correo, **Then** el código se acepta como antes.
5. **Given** una persona con correo confirmado, **When** regenera sus códigos, **Then** recibe un aviso de
   seguridad por correo, en su idioma, sin los códigos.
6. **Given** una persona sin la verificación activa, **When** abre Seguridad, **Then** no ve la opción de
   generar códigos nuevos.

---

### User Story 2 - Recordar este dispositivo (Priority: P2)

Al ingresar el segundo factor para iniciar sesión, la persona marca "Recordar este dispositivo por 30
días". Durante esos 30 días, cuando inicia sesión en ese mismo navegador con su RUT y contraseña, entra
directo sin que se le pida el segundo factor. En Perfil → Seguridad ve la lista de sus dispositivos
recordados (navegador, sistema, cuándo lo recordó, último uso) y puede quitar cualquiera. Si cambia o
recupera la contraseña, desactiva la verificación, cambia de método o regenera sus códigos, todos los
dispositivos recordados se olvidan.

**Why this priority**: es la queja más común de la verificación en dos pasos (pedir el código cada vez en
el equipo de siempre) y la razón por la que mucha gente la desactiva.

**Independent Test**: iniciar sesión marcando "Recordar", cerrar sesión, volver a iniciar sesión en el
mismo navegador y comprobar que no se pide el segundo factor; en otro navegador sí se pide; quitar el
dispositivo desde Seguridad y comprobar que vuelve a pedirse.

**Acceptance Scenarios**:

1. **Given** una persona con verificación activa que ingresa su segundo factor marcando "Recordar este
   dispositivo", **When** cierra sesión y vuelve a iniciarla en el mismo navegador dentro de 30 días con
   su RUT y la contraseña correcta, **Then** entra sin que se le pida el segundo factor.
2. **Given** un dispositivo recordado, **When** alguien escribe una contraseña incorrecta en él, **Then**
   el inicio de sesión se rechaza igual que siempre (recordar el dispositivo nunca salta la contraseña ni
   el bloqueo por intentos de contraseña).
3. **Given** un dispositivo recordado hace más de 30 días, **When** la persona inicia sesión en él,
   **Then** se le pide el segundo factor de nuevo.
4. **Given** un navegador recordado para la cuenta A, **When** alguien inicia sesión en ese navegador con
   la cuenta B, **Then** a la cuenta B se le pide su segundo factor.
5. **Given** dispositivos recordados, **When** la persona quita uno desde Seguridad, **Then** el siguiente
   inicio de sesión en ese navegador vuelve a pedir el segundo factor, y los demás siguen recordados.
6. **Given** dispositivos recordados, **When** la persona cambia o recupera su contraseña, desactiva la
   verificación, cambia de método o regenera sus códigos, **Then** todos sus dispositivos recordados se
   olvidan.
7. **Given** una persona con correo confirmado, **When** recuerda un dispositivo nuevo, **Then** recibe un
   aviso de seguridad por correo con el navegador y el sistema, para reconocer si no fue ella.
8. **Given** que la persona no marca la casilla, **When** ingresa su segundo factor, **Then** ese
   navegador no queda recordado (la casilla viene desmarcada).

---

### User Story 3 - Código por correo como segundo factor (Priority: P3)

Una persona que no quiere instalar una app autenticadora activa la verificación en dos pasos eligiendo
"Código por correo". Para confirmarlo, recibe un código en su correo confirmado y lo escribe. Desde
entonces, al iniciar sesión con RUT y contraseña, le llega un código de 6 dígitos a su correo, válido por
10 minutos, y lo escribe para entrar. Si no le llegó, puede pedir otro. Sus códigos de recuperación
funcionan igual. La pantalla de activación le explica que la app autenticadora o una llave de acceso son
más seguras que el correo.

**Why this priority**: amplía quién puede usar la verificación en dos pasos, pero es la más grande de las
tres y depende del envío de correos.

**Independent Test**: activar la verificación eligiendo correo, cerrar sesión, iniciar sesión, recibir el
código por correo y entrar con él; comprobar que un código vencido, ya usado o incorrecto se rechaza.

**Acceptance Scenarios**:

1. **Given** una persona con correo confirmado y sin verificación activa, **When** elige "Código por
   correo" e ingresa el código que recibió, **Then** la verificación queda activa con ese método y recibe
   10 códigos de recuperación.
2. **Given** una persona cuyo correo no está confirmado, **When** abre la activación, **Then** la opción
   "Código por correo" aparece deshabilitada con la razón y un acceso para confirmar el correo.
3. **Given** el método por correo activo, **When** la persona inicia sesión con RUT y contraseña correctos,
   **Then** recibe en su correo confirmado un código de 6 dígitos y la aplicación le pide escribirlo.
4. **Given** un código por correo recibido, **When** lo escribe dentro de 10 minutos, **Then** entra; si lo
   escribe otra vez, o después de 10 minutos, **Then** se rechaza.
5. **Given** que pidió reenviar el código, **When** escribe el código anterior, **Then** se rechaza: solo
   el último enviado sirve.
6. **Given** varios reenvíos seguidos, **When** supera el límite de reenvíos, **Then** la aplicación le dice
   cuándo podrá pedir otro, y puede seguir entrando con un código de recuperación.
7. **Given** el método por correo activo, **When** escribe 5 códigos incorrectos seguidos (de correo o de
   recuperación), **Then** el segundo paso se bloquea 15 minutos, igual que con la app autenticadora.
8. **Given** el método por correo activo, **When** la persona quiere cambiar a app autenticadora (o al
   revés), **Then** configura el método nuevo, lo confirma con un código de ese método y el método
   anterior deja de servir.
9. **Given** el método por correo activo, **When** se le pide verificar su identidad para una acción
   sensible (cerrar otra sesión, generar códigos nuevos), **Then** puede hacerlo con un código por correo.
10. **Given** el correo del código, **When** llega, **Then** está en el idioma de la cuenta, dice para qué
    es el código y que nadie de _fik_ lo va a pedir, y no contiene datos financieros.

---

### Edge Cases

- **Correo que no llega o servicio de correo caído:** la persona puede entrar con un código de
  recuperación; la pantalla lo ofrece. El inicio de sesión no queda roto: la contraseña ya validada no se
  pierde mientras dura el paso del segundo factor.
- **Correo cambiado:** el código siempre va al correo **confirmado** de la cuenta. Un cambio de correo
  pendiente de confirmar no recibe códigos.
- **El correo cambia:** el código va siempre al correo principal confirmado; un cambio de correo no
  reemplaza al principal hasta confirmarse, así que nunca se envía a una dirección sin confirmar.
- **Dispositivo recordado y llave de acceso:** iniciar sesión con llave de acceso no cambia (no pide
  segundo factor) y no crea ni consume dispositivos recordados.
- **Dispositivo recordado en un navegador que borró sus datos:** se pierde el recuerdo; el dispositivo
  sigue en la lista hasta que vence o se quita.
- **Muchos dispositivos recordados:** la lista tiene un máximo; al recordar uno más, se olvida el más
  antiguo.
- **Cuenta eliminada:** sus dispositivos recordados y códigos pendientes desaparecen con ella.
- **Regenerar con un código de recuperación como verificación:** no está permitido, porque gastaría un
  código justo antes de reemplazarlos; la verificación reciente se hace con el método configurado, una
  llave de acceso o (si no hay otra) la contraseña, como hoy.
- **Verificación desactivada con dispositivos recordados:** se olvidan; si la persona la vuelve a activar,
  parte sin dispositivos recordados.
- **Dos pestañas pidiendo el código por correo a la vez:** solo el último código enviado sirve.

## Requirements _(mandatory)_

### Functional Requirements

**Códigos de recuperación**

- **FR-001**: La aplicación MUST permitir a una persona con la verificación activa generar 10 códigos de
  recuperación nuevos sin desactivar la verificación.
- **FR-002**: Generar códigos nuevos MUST exigir una verificación de identidad reciente (la misma ventana
  de 5 minutos que ya se usa para cerrar otras sesiones), hecha con el método configurado, una llave de
  acceso o, solo si no hay ninguno de esos dos, la contraseña. Un código de recuperación MUST NOT servir
  para esa verificación.
- **FR-003**: Al generar códigos nuevos, todos los anteriores (usados o no) MUST dejar de servir en el
  mismo momento, de forma atómica: nunca puede haber un instante con ambas tandas válidas ni con ninguna.
- **FR-004**: Los códigos nuevos MUST mostrarse una sola vez, con opción de copiarlos y descargarlos; la
  aplicación MUST NOT poder volver a mostrarlos después.
- **FR-005**: Generar códigos nuevos MUST NOT cambiar el método de verificación configurado.
- **FR-006**: Generar códigos nuevos MUST enviar un aviso de seguridad al correo confirmado, si lo hay, sin
  incluir los códigos.
- **FR-007**: Seguridad MUST mostrar cuántos códigos de recuperación quedan sin usar.
- **FR-007a**: Una verificación reciente MUST servir para una sola generación de códigos: un reintento o
  una segunda petición simultánea MUST rechazarse sin crear otra tanda.

**Dispositivos recordados**

- **FR-008**: Al ingresar el segundo factor para iniciar sesión, la aplicación MUST ofrecer "Recordar este
  dispositivo por 30 días", desmarcado por defecto.
- **FR-009**: Un dispositivo recordado MUST permitir saltar solo el segundo factor, solo para la cuenta que
  lo recordó, durante 30 días desde que se recordó (el plazo no se extiende con el uso). La contraseña y su
  protección contra intentos MUST seguir aplicándose siempre.
- **FR-010**: La aplicación MUST guardar de cada dispositivo recordado solo lo necesario para reconocerlo
  sin poder reconstruir la credencial que lo identifica: una credencial robada de la base de datos no debe
  servir para saltar el segundo factor.
- **FR-011**: Seguridad MUST listar los dispositivos recordados de la cuenta (navegador y sistema, fecha en
  que se recordó, último uso) y MUST permitir quitar cada uno.
- **FR-012**: Todos los dispositivos recordados de una cuenta MUST olvidarse al cambiar la contraseña, al
  recuperarla, al desactivar la verificación, al cambiar de método y al generar códigos nuevos.
- **FR-013**: Recordar un dispositivo MUST enviar un aviso de seguridad al correo confirmado, si lo hay,
  indicando navegador y sistema.
- **FR-014**: Una cuenta MUST tener como máximo 10 dispositivos recordados; recordar uno más olvida el más
  antiguo.
- **FR-015**: Iniciar sesión con llave de acceso MUST NOT cambiar su comportamiento actual.

**Código por correo**

- **FR-016**: Al activar la verificación, la persona MUST poder elegir entre app autenticadora y código
  por correo. El código por correo MUST estar disponible solo si la cuenta tiene un correo confirmado.
- **FR-017**: Activar el método por correo MUST requerir ingresar un código enviado a ese correo, para
  probar que llega.
- **FR-018**: Con el método por correo activo, cada inicio de sesión con RUT y contraseña correctos (en un
  dispositivo no recordado) MUST enviar un código de 6 dígitos al correo confirmado.
- **FR-019**: Un código por correo MUST vencer a los 10 minutos, servir una sola vez, y quedar inválido
  cuando se envía uno nuevo para la misma cuenta.
- **FR-020**: La persona MUST poder pedir que se reenvíe el código, con límite: no más de un envío por
  minuto y no más de 5 por hora por cuenta. Al alcanzar el límite, la aplicación MUST decir cuándo podrá
  pedir otro.
- **FR-021**: Los intentos fallidos con código por correo MUST contar en el mismo contador que hoy: 5
  incorrectos seguidos bloquean el segundo paso 15 minutos; un acierto lo reinicia.
- **FR-022**: Los códigos de recuperación MUST servir igual con el método por correo.
- **FR-023**: La persona MUST poder cambiar de un método al otro; el cambio MUST confirmarse con un código
  del método nuevo y, al confirmarse, el anterior MUST dejar de servir.
- **FR-024**: La verificación de identidad reciente para acciones sensibles MUST aceptar un código por
  correo cuando ese es el método configurado.
- **FR-025**: La pantalla de activación MUST explicar que la app autenticadora o una llave de acceso son
  más seguras que el código por correo.
- **FR-026**: El correo con el código MUST estar en el idioma de la cuenta, indicar para qué es y que nadie
  de _fik_ lo pedirá, y MUST NOT incluir datos financieros.
- **FR-027**: El envío de códigos MUST estar organizado por canal, de modo que agregar otro canal (por
  ejemplo, WhatsApp) no cambie el flujo de inicio de sesión ni las reglas de vencimiento, uso único,
  límites e intentos.

**Transversal**

- **FR-028**: Ninguna protección actual del inicio de sesión MUST debilitarse: bloqueo por intentos de
  contraseña, bloqueo del segundo paso, cierre de otras sesiones al cambiar la contraseña o desactivar la
  verificación, y anti-enumeración de cuentas.
- **FR-029**: Todos los textos nuevos MUST existir en español e inglés.
- **FR-030**: Los dispositivos recordados MUST incluirse en "Descargar mis datos" (portabilidad), y la
  política de privacidad MUST describirlos si hoy no cubre ese dato.

### Key Entities

- **Método de verificación**: cómo se pide el segundo factor de una cuenta: app autenticadora o código por
  correo. Una cuenta tiene a lo sumo un método activo.
- **Código de recuperación**: código de un solo uso para entrar sin el método configurado. Se emiten en
  tandas de 10; una tanda nueva reemplaza por completo a la anterior.
- **Dispositivo recordado**: un navegador en el que la persona pidió no volver a ingresar el segundo
  factor. Pertenece a una cuenta, tiene una descripción legible (navegador y sistema), fecha en que se
  recordó, último uso y vencimiento a los 30 días.
- **Código de un solo uso enviado**: un código enviado por un canal (hoy, correo) para el segundo paso, la
  activación o el cambio de método. Pertenece a una cuenta, tiene propósito, canal, vencimiento a los 10
  minutos y se puede usar una sola vez.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Una persona obtiene códigos de recuperación nuevos en menos de 1 minuto y sin volver a
  configurar su app autenticadora.
- **SC-002**: En un dispositivo recordado, iniciar sesión requiere solo RUT y contraseña durante los 30
  días: cero pedidos de segundo factor en ese navegador.
- **SC-003**: El 100% de los dispositivos recordados de una cuenta deja de saltar el segundo factor
  después de cambiar o recuperar la contraseña, desactivar la verificación, cambiar de método o generar
  códigos nuevos.
- **SC-004**: Con el método por correo, el código llega y permite entrar en menos de 1 minuto en
  condiciones normales.
- **SC-005**: Un código por correo vencido, ya usado o reemplazado por uno más nuevo se rechaza en el 100%
  de los intentos.
- **SC-006**: Ninguna prueba existente de inicio de sesión, verificación en dos pasos, llave de acceso o
  sesiones deja de pasar.

## Assumptions

- La verificación de identidad reciente reutiliza el mecanismo existente para cerrar otras sesiones
  (ventana de 5 minutos por sesión); este cambio solo agrega el código por correo como forma de
  completarla.
- El aviso de seguridad por correo reutiliza los avisos existentes (specs/032): solo a un correo
  confirmado, en el idioma de la cuenta, en segundo plano y sin bloquear la acción si falla.
- Fuera de producción no se envían correos (como hoy): ahí el método por correo no puede completarse sin
  la configuración de envío, y las pruebas usan el buzón de prueba existente.
- Cambiar de método también olvida los dispositivos recordados (decisión conservadora: el segundo factor
  cambió).
- El máximo de 10 dispositivos recordados y el límite de reenvíos (1 por minuto, 5 por hora) son valores
  razonables por defecto, alineados con el límite actual de enlaces por correo.
- El código por correo no es "recordable" por separado: recordar el dispositivo funciona igual con ambos
  métodos.
- Fuera de alcance: SMS; WhatsApp (solo queda preparada la organización por canal); verificación de
  dispositivos para acciones distintas del inicio de sesión; cambios al inicio de sesión con llave de
  acceso.
