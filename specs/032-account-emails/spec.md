# Feature Specification: Correos de cuenta y de seguridad

**Feature Branch**: `032-account-emails`

**Created**: 2026-10-10

**Status**: Draft

**Input**: User description: "Correos de cuenta y de seguridad. fik hoy no envía ningún correo: un usuario no puede confirmar que su dirección es real ni recuperar su contraseña ("¿Olvidaste tu contraseña?" solo muestra una nota de que no es posible), y no se entera si alguien cambia algo sensible de su cuenta. Esta funcionalidad agrega tres tipos de correo [...]: 1. Verificación del correo al registrarse [...] 2. Recuperación de contraseña [...] 3. Avisos de seguridad [...]. Cada correo tiene su propia plantilla, mantenida junto con la aplicación [...], en español y en inglés, en HTML y en texto plano. Los correos se entregan de verdad solo en producción. Fuera de producción ningún correo sale hacia una dirección real: cada correo queda guardado localmente [...]. Fuera de alcance: avisos de inicio de sesión desde un dispositivo nuevo, notificaciones financieras, preferencias para silenciar correos y correos de marketing."

## Clarifications

### Session 2026-10-10

- Q: ¿Cuándo empieza a valer un correo nuevo al cambiarlo en el Perfil? → A: Cambio pendiente: la
  dirección nueva queda en espera y la cuenta sigue usando la anterior hasta que se confirme la nueva.
  Además, cada cuenta guarda un registro de sus correos: uno es el principal (el que recibe los correos
  y sirve para recuperar la contraseña) y los demás quedan como historial (depuración, registro de
  cambios). El usuario puede borrar del historial cualquier correo que no sea el principal.
- Q: ¿A qué direcciones llegan los avisos de seguridad si el correo principal no está confirmado? →
  A: Solo a direcciones confirmadas; sin confirmar no se envía ningún aviso (FR-023).
- Q: ¿Cuánto duran los enlaces? → A: Verificación 48 horas; recuperación 30 minutos.
- Q: ¿Dónde se abren los enlaces de los correos? → A: Ambos en el sitio público (mifik.cl), que
  muestra el resultado de la verificación o el formulario de contraseña nueva y luego ofrece entrar o
  ir a la app.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Confirmar que mi correo es real (Priority: P1)

Al crear su cuenta, la persona recibe un correo con un enlace para confirmar su dirección. Puede usar
fik de inmediato; mientras no confirme, la app le recuerda hacerlo y le permite reenviar el correo.
Confirmar el correo es lo que después le permite recuperar su cuenta si olvida la contraseña.

**Why this priority**: es la base de los otros dos tipos de correo: sin una dirección confirmada,
recuperar la contraseña por correo no es seguro (podría llegar a una dirección mal escrita o ajena)
y los avisos de seguridad podrían llegarle a otra persona.

**Independent Test**: crear una cuenta, abrir el correo de verificación, seguir su enlace y ver que
la cuenta queda con el correo confirmado y que el aviso de "confirma tu correo" desaparece.

**Acceptance Scenarios**:

1. **Given** una persona que acaba de crear su cuenta, **When** termina el registro, **Then** recibe
   en la dirección que escribió un correo, en su idioma, con un enlace para confirmarla, y entra a la
   app normalmente.
2. **Given** una cuenta con el correo sin confirmar, **When** la persona usa la app, **Then** ve un
   aviso que le pide confirmar su correo, con la opción de reenviar el correo de verificación.
3. **Given** un correo de verificación vigente, **When** la persona sigue su enlace (con o sin
   sesión iniciada), **Then** su correo queda confirmado y se le muestra una confirmación.
4. **Given** un enlace de verificación vencido o ya usado, **When** la persona lo sigue, **Then** se
   le explica que el enlace ya no sirve y puede pedir uno nuevo desde la app.
5. **Given** una cuenta con el correo confirmado, **When** la persona escribe un correo nuevo en su
   Perfil, **Then** el correo nuevo queda pendiente y se le envía un enlace de verificación; la cuenta
   sigue usando la dirección anterior (avisos y recuperación incluidos) mientras tanto.
6. **Given** un correo nuevo pendiente, **When** la persona sigue el enlace enviado a él, **Then** pasa
   a ser el correo principal, el anterior queda en el historial de la cuenta y, si estaba
   confirmado, recibe un aviso del cambio (FR-023).
7. **Given** el historial de correos de la cuenta, **When** la persona borra un correo que no es el
   principal, **Then** desaparece del registro; el correo principal no se puede borrar.

---

### User Story 2 - Recuperar el acceso si olvido mi contraseña (Priority: P2)

Desde el acceso, la persona elige "¿Olvidaste tu contraseña?", escribe su RUT y recibe en su correo
confirmado un enlace para elegir una contraseña nueva. Al cambiarla, se cierran todas sus sesiones
abiertas y, si tenía la verificación en dos pasos, se le sigue pidiendo al entrar.

**Why this priority**: hoy una persona que olvida su contraseña y no tiene una llave de acceso pierde
su cuenta. Depende de que el correo esté confirmado (historia 1).

**Independent Test**: con una cuenta de correo confirmado, pedir la recuperación con el RUT, abrir el
correo, elegir una contraseña nueva y entrar con ella; comprobar que las otras sesiones quedaron
cerradas.

**Acceptance Scenarios**:

1. **Given** una cuenta con el correo confirmado, **When** la persona pide recuperar la contraseña
   con su RUT, **Then** recibe en ese correo un enlace para elegir una contraseña nueva.
2. **Given** cualquier RUT escrito en el formulario (exista o no, tenga o no el correo confirmado),
   **When** se pide la recuperación, **Then** la pantalla muestra exactamente la misma respuesta, sin
   revelar si la cuenta existe.
3. **Given** un enlace de recuperación vigente, **When** la persona elige una contraseña nueva que
   cumple las reglas de contraseña, **Then** la contraseña cambia, todas las sesiones abiertas de esa
   cuenta se cierran y la persona puede entrar con la contraseña nueva.
4. **Given** una cuenta con la verificación en dos pasos activa, **When** la persona entra después de
   recuperar la contraseña, **Then** se le sigue pidiendo el segundo factor.
5. **Given** un enlace de recuperación vencido, ya usado o reemplazado por uno más nuevo, **When** la
   persona lo sigue, **Then** se le explica que no sirve y puede pedir otro.
6. **Given** una cuenta con el correo sin confirmar, **When** se pide la recuperación con su RUT,
   **Then** no se envía ningún correo (y la pantalla responde lo mismo que en cualquier otro caso).

---

### User Story 3 - Enterarme si cambia algo sensible de mi cuenta (Priority: P3)

Cuando cambia algo sensible de la cuenta, la persona recibe un correo informativo que dice qué pasó,
cuándo y qué hacer si no fue ella. Así puede reaccionar si alguien entró a su cuenta.

**Why this priority**: es protección adicional; la cuenta ya funciona sin ella, pero sin estos avisos
un acceso indebido puede pasar inadvertido.

**Independent Test**: con una cuenta de correo confirmado, cambiar la contraseña desde el Perfil y
comprobar que llega el aviso correspondiente; repetir con cada evento de la lista.

**Acceptance Scenarios**:

1. **Given** una cuenta con el correo confirmado, **When** ocurre cualquiera de estos eventos:
   cambio de contraseña (desde el Perfil o por recuperación), activación o desactivación de la
   verificación en dos pasos, alta o baja de una llave de acceso, cambio del correo de la cuenta o
   eliminación de la cuenta, **Then** llega un aviso que nombra el evento, la fecha y hora, y qué
   hacer si no fue la persona.
2. **Given** un cambio del correo de la cuenta, **When** se guarda, **Then** el aviso llega a la
   dirección anterior.
3. **Given** la eliminación de la cuenta, **When** se completa, **Then** el aviso llega a la dirección
   que la cuenta tenía antes de eliminarse.
4. **Given** que el aviso no se puede entregar, **When** ocurre el evento, **Then** la acción de la
   persona (cambiar la contraseña, eliminar la cuenta, etc.) se completa igual.

---

### User Story 4 - Probar todos los correos en local antes de publicar (Priority: P1)

Quien desarrolla fik puede recorrer todo el flujo en su computador (registrarse, confirmar el correo,
recuperar la contraseña, provocar cada aviso) sin que salga ningún correo real: cada correo queda
guardado localmente, en su versión HTML y de texto, para revisarlo y abrir sus enlaces.

**Why this priority**: es la condición que el equipo puso para desplegar: el flujo completo tiene
que probarse antes de llegar a producción, y ningún correo de prueba puede llegarle a una persona
real.

**Independent Test**: en el entorno local, registrar una cuenta y comprobar que el correo de
verificación aparece guardado localmente (con su enlace funcional) y que no se entregó a nadie.

**Acceptance Scenarios**:

1. **Given** el entorno de desarrollo local, **When** la app genera cualquier correo, **Then** no se
   entrega a ninguna dirección real y queda guardado localmente en HTML y texto, con su destinatario,
   asunto e idioma visibles.
2. **Given** un correo guardado localmente, **When** quien desarrolla abre su enlace, **Then** el
   enlace funciona contra la app local igual que en producción.
3. **Given** producción con el envío configurado, **When** la app genera un correo, **Then** se
   entrega a la dirección real.
4. **Given** producción sin el envío configurado, **When** la app debería enviar un correo, **Then**
   no lo envía, el resto de la app funciona igual y las pantallas que dependen del correo lo explican
   en vez de fallar.

---

### Edge Cases

- **Reenvío repetido**: pedir el correo de verificación o la recuperación muchas veces seguidas no
  debe permitir inundar una bandeja de entrada; hay un límite de envíos por cuenta y período, y al
  superarlo se informa que hay que esperar (sin revelar si la cuenta existe en el caso de la
  recuperación).
- **Otro correo pedido antes de confirmar**: si la persona pide un segundo correo nuevo mientras el
  primero sigue pendiente, el primero deja de estar pendiente (pasa al historial sin confirmar) y su
  enlace deja de servir; solo puede haber un correo pendiente a la vez.
- **Correo pendiente borrado**: borrarlo del registro deja sin efecto su enlace de verificación.
- **Correo ya principal en otra cuenta**: no se puede pedir ni confirmar como principal un correo que
  ya es el principal de otra cuenta; se le explica a la persona sin revelar de qué cuenta se trata.
- **Varios enlaces de recuperación**: pedir uno nuevo deja sin efecto los anteriores.
- **Cuenta bloqueada por intentos fallidos**: recuperar la contraseña con éxito levanta el bloqueo de
  inicio de sesión por contraseña.
- **Enlace abierto en otro dispositivo o con otra sesión iniciada**: confirmar el correo o recuperar
  la contraseña depende solo del enlace, no de la sesión del navegador donde se abre.
- **Cuenta sin contraseña útil** (entra solo con llave de acceso): puede igual elegir una contraseña
  mediante la recuperación si su correo está confirmado.
- **Usuarios existentes**: las cuentas creadas antes de esta funcionalidad parten con el correo sin
  confirmar y ven el aviso para confirmarlo.
- **Cuenta eliminada con un enlace pendiente**: cualquier enlace de verificación o recuperación de
  una cuenta eliminada deja de servir.
- **El proveedor de envío falla**: el registro, el cambio de contraseña y los demás eventos no fallan
  por eso; el correo afectado simplemente no llega (y en el caso de la verificación, la persona puede
  reenviarlo después).

## Requirements _(mandatory)_

### Functional Requirements

**Envío y plantillas**

- **FR-001**: El sistema MUST enviar los correos desde una dirección del dominio de fik que no recibe
  respuestas, con las respuestas dirigidas a la dirección de contacto de fik.
- **FR-002**: Cada tipo de correo MUST tener su propia plantilla, mantenida junto con la aplicación,
  con versión en español y en inglés y con cuerpo en HTML y en texto plano.
- **FR-003**: Cada correo MUST enviarse en el idioma configurado de la cuenta al momento del envío.
- **FR-004**: Los correos MUST entregarse a direcciones reales solo en producción. Fuera de
  producción MUST quedar guardados localmente (HTML y texto, con destinatario, asunto e idioma) y
  nunca entregarse.
- **FR-005**: Sin el envío configurado en producción, la app MUST seguir funcionando: no se envía el
  correo y las pantallas que dependen de él lo informan.
- **FR-006**: Un fallo al enviar un correo NUNCA MUST impedir que se complete la acción que lo originó
  (registro, cambio de contraseña, eliminación de cuenta, etc.).

**Verificación del correo**

- **FR-007**: Al crear una cuenta, el sistema MUST enviar a la dirección registrada un correo con un
  enlace de verificación.
- **FR-008**: Una cuenta MUST poder usarse sin haber confirmado su correo.
- **FR-009**: Mientras el correo no esté confirmado, la app MUST mostrar un aviso con la opción de
  reenviar el correo de verificación.
- **FR-010**: Seguir un enlace de verificación vigente MUST dejar el correo confirmado, aunque se abra
  sin sesión iniciada o con la sesión de otra cuenta.
- **FR-010a**: Los enlaces de verificación y de recuperación MUST abrirse en el sitio público de fik,
  que muestra el resultado (o el formulario de contraseña nueva) y luego ofrece iniciar sesión o ir a
  la app.
- **FR-011**: Un enlace de verificación MUST servir una sola vez, vencer a las 48 horas y dejar de
  servir si su correo deja de estar pendiente o se borra del registro.
- **FR-012**: Cambiar el correo de la cuenta MUST registrar la dirección nueva como pendiente y
  enviarle un correo de verificación; hasta que se confirme, la dirección anterior sigue siendo el
  correo principal (recibe los avisos y sirve para recuperar la contraseña).
- **FR-012a**: Confirmar un correo pendiente MUST convertirlo en el correo principal y pasar el
  anterior al historial. Cada cuenta tiene exactamente un correo principal.
- **FR-012b**: Cada cuenta MUST conservar un registro de sus correos (principal, pendientes e
  historial), con su estado de confirmación y fechas, que la persona puede ver en su Perfil.
- **FR-012c**: La persona MUST poder borrar del registro cualquier correo que no sea el principal; el
  principal no se puede borrar. Un correo pendiente borrado deja sin efecto su enlace de verificación.
- **FR-012d**: Solo el correo principal de una cuenta (confirmado o no, como hoy) es único entre
  cuentas; un correo que está en el historial o pendiente en una cuenta no impide que otra lo
  registre. Confirmar un pendiente que ya es el principal de otra cuenta se rechaza.
- **FR-012e**: Al eliminar la cuenta, su registro de correos MUST eliminarse por completo (también
  cuando la cuenta se anonimiza en vez de borrarse).
- **FR-013**: Las cuentas existentes al momento de lanzar esta funcionalidad MUST quedar con su correo
  actual como principal sin confirmar.

**Recuperación de contraseña**

- **FR-014**: El acceso MUST ofrecer la recuperación de contraseña pidiendo el RUT de la cuenta.
- **FR-015**: Si el RUT corresponde a una cuenta con el correo confirmado, el sistema MUST enviar a
  ese correo un enlace para elegir una contraseña nueva; en cualquier otro caso no se envía nada.
- **FR-016**: La respuesta a una solicitud de recuperación MUST ser idéntica en todos los casos
  (cuenta inexistente, correo sin confirmar, límite superado o correo enviado), sin revelar si la
  cuenta existe.
- **FR-017**: Un enlace de recuperación MUST servir una sola vez, vencer a los 30 minutos y quedar
  sin efecto cuando se pide uno nuevo.
- **FR-018**: La contraseña nueva MUST cumplir las mismas reglas que al registrarse.
- **FR-019**: Al cambiar la contraseña por recuperación, el sistema MUST cerrar todas las sesiones
  abiertas de la cuenta y levantar el bloqueo por intentos fallidos de inicio de sesión.
- **FR-020**: Recuperar la contraseña NO MUST desactivar ni saltar la verificación en dos pasos: si
  está activa, se sigue pidiendo al iniciar sesión.

**Avisos de seguridad**

- **FR-021**: El sistema MUST enviar un aviso al correo confirmado de la cuenta cuando: cambia la
  contraseña (desde el Perfil o por recuperación); se activa o desactiva la verificación en dos
  pasos; se agrega o elimina una llave de acceso; cambia el correo de la cuenta (aviso a la dirección
  anterior); se elimina la cuenta (aviso a la dirección que tenía).
- **FR-022**: Cada aviso MUST indicar qué ocurrió, la fecha y hora, y qué hacer si la persona no lo
  hizo.
- **FR-023**: Los avisos de seguridad MUST enviarse solo a direcciones confirmadas, salvo el aviso de
  cambio de correo a la dirección anterior, que se envía si la anterior estaba confirmada.

**Abuso y privacidad**

- **FR-024**: El sistema MUST limitar cuántos correos de verificación y de recuperación se pueden
  pedir por cuenta en un período, e informar que hay que esperar cuando se supera (sin revelar la
  existencia de la cuenta en la recuperación).
- **FR-025**: Los enlaces MUST ser imposibles de adivinar y no deben contener datos personales
  legibles (ni RUT, ni correo).
- **FR-026**: Los correos NO MUST incluir información financiera de la persona (saldos, movimientos,
  deudas).

### Key Entities _(include if feature involves data)_

- **Correo de la cuenta** (registro de correos): cada dirección que una cuenta ha tenido o pidió
  tener, asociada a esa cuenta, con su estado (principal, pendiente o historial), si está confirmada
  y desde cuándo, y cuándo se agregó y cuándo dejó de ser principal. Una cuenta tiene exactamente un
  principal; el principal recibe los correos y sirve para recuperar la contraseña. La persona puede
  borrar los que no son principales.
- **Enlace de un solo uso**: credencial temporal asociada a una cuenta y a un propósito
  (verificar una dirección concreta o recuperar la contraseña), con vencimiento, estado de uso y,
  para la verificación, la dirección que confirma.
- **Correo saliente**: un mensaje generado por la app (tipo, destinatario, idioma, asunto, cuerpo HTML
  y texto) que en producción se entrega y fuera de ella se guarda localmente.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Una persona que olvidó su contraseña y tiene el correo confirmado recupera el acceso en
  menos de 5 minutos, sin ayuda de soporte.
- **SC-002**: El 95% de los correos llega a la bandeja de entrada (no a spam) en menos de 1 minuto en
  los principales proveedores de correo.
- **SC-003**: La pantalla de recuperación responde de forma idéntica para cualquier RUT: no hay forma
  de distinguir, mirando la respuesta, una cuenta existente de una inexistente.
- **SC-004**: El 100% de los eventos de seguridad listados genera su aviso.
- **SC-005**: El 100% de los enlaces vencidos, ya usados o reemplazados es rechazado.
- **SC-006**: El flujo completo (registro, verificación, recuperación y cada aviso) se puede recorrer
  en el entorno local sin que salga ningún correo hacia una dirección real.
- **SC-007**: Ninguna acción de la persona falla porque el envío de un correo falle.

## Assumptions

- El dominio de envío, su autenticación (SPF, DKIM, DMARC) y la cuenta del proveedor de envío ya
  están configurados; la credencial del proveedor solo existe en producción.
- El correo de la cuenta es obligatorio desde el registro (ya lo es hoy), y el RUT identifica a una
  sola cuenta.
- Límite por defecto (ajustable en el plan): hasta 5 correos de verificación y 5 de recuperación por
  cuenta por hora.
- Cerrar todas las sesiones al recuperar la contraseña sigue la misma regla ya vigente al cambiar la
  contraseña desde el Perfil.
- Los avisos de seguridad son solo informativos: no contienen enlaces que ejecuten acciones sobre la
  cuenta; el "qué hacer si no fuiste tú" guía a recuperar la contraseña y escribir al contacto de fik.
- El proveedor de envío trata direcciones de correo de los usuarios; queda declarado como encargado
  de tratamiento en la documentación de cumplimiento (Ley 21.719) antes de producción.
