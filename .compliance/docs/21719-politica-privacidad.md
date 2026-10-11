# Política de Privacidad — fik

**Última actualización:** 2026-10-11

> ✅ **Publicada el 2026-10-11** en `mifik.cl/es/privacy-policy/` (y su traducción en `/en/privacy-policy/`), enlazada desde el pie de página, la página de Privacidad y el consentimiento del registro. **El texto público vive en `apps/landing/src/legal/privacy-policy.es.md`** (y `.en.md`): cualquier cambio se hace ahí. Este archivo conserva el borrador con notas internas; mantener ambos en línea.

## 1. Responsable del tratamiento

fik (antes "FinanceApp"; proyecto en etapa temprana, sin constitución societaria formal, operado por Simón Sáez como persona natural), domicilio en La Florida, Santiago, Chile. Contacto para datos personales: contacto@mifik.cl.

RUT: 20.640.480-9 (persona natural). Si más adelante se constituye una sociedad, este documento se actualizará con su razón social y RUT.

## 2. Qué datos tratamos

- **Datos de identidad y contacto:** nombre, correo electrónico, teléfono, RUT/DNI/pasaporte, dirección, fecha de nacimiento.
- **Datos financieros (declarados dato sensible, ver más abajo):** cuentas bancarias registradas, saldos, movimientos de ingreso y gasto, categorías de gasto, tarjetas (solo últimos 4 dígitos, nunca el número completo), deudas, metas de ahorro, cupos y facturación de tarjetas de crédito.
- **Datos de seguridad de sesión:** dirección IP, tipo de dispositivo/navegador, país aproximado de cada inicio de sesión.
- **Comprobantes adjuntos** (opcional): boletas o vouchers que el usuario sube para respaldar un movimiento.

**Sí tratamos datos sensibles.** Conforme al Art. 2 letra g) de la Ley 21.719, la **situación socioeconómica** de una persona es un dato personal sensible — y eso es, precisamente, el núcleo del servicio que presta fik (saldos, deudas, movimientos). Por eso pedimos tu **consentimiento expreso y reforzado** para tratar estos datos (Art. 16), separado del consentimiento general de la cuenta.

**Menores de edad:** al registrarte pedimos tu fecha de nacimiento. Si eres menor de 18 años, el registro exige la autorización de tu madre, padre o tutor (nombre, RUT y parentesco), que guardamos como un consentimiento aparte; el RUT del tutor se guarda solo como un código cifrado (HMAC), nunca en claro. Esta autorización es declarativa: no verificamos documentos de identidad.

## 3. Finalidad y base de licitud

| Finalidad                                                                                            | Base de licitud                                                 |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Crear y administrar tu cuenta                                                                        | Ejecución de contrato                                           |
| Registrar y mostrar tus movimientos, cuentas, tarjetas, deudas y ahorros (dato sensible)             | Consentimiento expreso y reforzado (Art. 16)                    |
| Seguridad de la sesión (detectar dispositivos nuevos, prevenir accesos indebidos)                    | Interés legítimo                                                |
| Enviarte correos sobre tu cuenta (confirmar tu correo, recuperar tu contraseña, avisos de seguridad) | Ejecución de contrato                                           |
| Saber si abriste esos correos (seguimiento de aperturas)                                             | Interés legítimo (confirmar que los avisos de seguridad llegan) |
| Comunicaciones de marketing                                                                          | No las enviamos                                                 |

## 4. Con quién compartimos los datos

Para funcionar, fik usa proveedores que tratan tus datos **por encargo nuestro** (encargados del tratamiento): solo pueden usarlos para prestarnos su servicio, no para fines propios. **Todos están fuera de Chile**, así que usar fik implica transferir tus datos al extranjero:

| Proveedor                     | Para qué                                                                | Dónde                                  | Qué datos                                                                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Amazon Web Services (AWS)** | Alojar la aplicación y la base de datos                                 | Estados Unidos (Ohio)                  | Todos los datos de tu cuenta, incluidos los financieros, guardados cifrados                                                                                                 |
| **Cloudflare**                | Entregar el sitio y la app, y proteger la conexión con nuestro servidor | Red global (empresa de Estados Unidos) | Tu IP y navegador, y el contenido de lo que envías y recibes de la app mientras viaja: va cifrado, pero Cloudflare lo descifra en su red para reenviarlo a nuestro servidor |
| **Resend**                    | Enviar los correos de tu cuenta                                         | Estados Unidos y Brasil                | Tu correo, el contenido de esos correos (nunca datos financieros) y si los abriste                                                                                          |
| **IPinfo**                    | Mostrarte el país aproximado de cada inicio de sesión                   | Estados Unidos                         | La IP de cada inicio de sesión                                                                                                                                              |
| **Google (Gmail)**            | Recibir y responder los correos que nos escribes a contacto@mifik.cl    | Estados Unidos                         | Tu correo, tu nombre y lo que nos escribas                                                                                                                                  |

- **Garantías:** cada uno se obliga, en su acuerdo de tratamiento de datos (DPA), a tratar los datos solo según nuestras instrucciones, mantener medidas de seguridad, imponer las mismas obligaciones a sus subcontratistas, avisarnos sin demora de cualquier brecha y borrar los datos al terminar el servicio. El detalle por proveedor está en `21719-anexo-transferencias.md`.
- **Seguimiento de aperturas:** los correos llevan una imagen invisible que le avisa a Resend cuándo se abren. No rastreamos en qué enlaces haces clic: los enlaces de confirmación y de recuperación van directo a `mifik.cl`.
- **Comprobantes adjuntos** (almacenamiento de archivos): hoy **no está activo**. Si se activa, los archivos se guardarían en AWS, junto al resto de tus datos.
- **IPinfo** tiene licencia de datos CC BY-SA 4.0, que exige atribución visible: la mostramos en Perfil → Seguridad.
- **Estadísticas de visitas:** en el sitio público (no en la app), Cloudflare Web Analytics, agregado y sin cookies; nunca en las páginas de los enlaces de correo. Declarado también en las secciones 2 y 3 de la versión publicada.
- No vendemos ni compartimos tus datos con fines de publicidad. No usamos herramientas de marketing ni analítica dentro de la app.

## 5. Por cuánto tiempo

Conservamos tus datos **mientras tu cuenta esté activa**. Cuando eliminas tu cuenta (Perfil → Datos y privacidad → Eliminar cuenta), eliges qué pasa con ellos:

- **Borrar todo (la opción por defecto):** tus datos se eliminan **de inmediato**: tu identidad, tus cuentas, movimientos, deudas, ahorros, consentimientos y todo lo demás.
- **Conservar el historial anonimizado (si lo eliges):** borramos de inmediato todo lo que te identifica (nombre, correo, RUT, teléfono, dirección, fecha de nacimiento, segundo factor), pero **no borramos** tus registros financieros: quedan guardados sin ningún dato que te identifique. Ten presente que un historial financiero detallado, aun sin nombre, podría llegar a relacionarse con una persona por sus patrones; si eso te preocupa, elige borrar todo.

En ambos casos se eliminan de inmediato tus sesiones, llaves de acceso, códigos de recuperación y direcciones de correo, y guardamos solo un **registro de que pediste la eliminación** (la fecha y tu RUT convertido en un código cifrado irreversible, nunca el RUT en claro), como prueba de que cumplimos tu solicitud.

Además:

- **Copias de respaldo:** la base de datos guarda respaldos automáticos de las últimas 24 horas, así que un dato eliminado desaparece también de los respaldos dentro de ese plazo.
- **Datos de sesión y seguridad:** las sesiones cerradas se borran a los 3 días y la caché de país por IP a los 60 días, aunque tu cuenta siga activa.
- **Proveedores:** cada proveedor (sección 4) borra lo que trató por nuestra cuenta según su propio acuerdo; por ejemplo, el registro de los correos enviados queda en Resend según sus plazos.

## 6. Tus derechos

Puedes ejercer **acceso, rectificación, supresión, oposición, portabilidad y bloqueo**, y **retirar tu consentimiento** cuando quieras, escribiendo a contacto@mifik.cl. Respondemos en **30 días corridos** (prorrogables una sola vez por 30 días más). La rectificación, supresión y oposición son siempre gratuitas; el acceso es gratuito al menos una vez por trimestre.

> ⚠️ **Estado real hoy**: puedes rectificar tus datos de perfil desde la app y **eliminar tu cuenta** (Perfil → Datos y privacidad → Eliminar cuenta): la eliminación es real (se borran todos tus datos) salvo que elijas conservar un historial anonimizado. **Portabilidad (parcial, desde la app):** Importar → Plantilla fik → Descargar plantilla → Con mis datos actuales exporta todos los datos financieros en un `.xlsx` reimportable (cuentas, tarjetas, facturaciones, movimientos, traspasos, deudas y pagos, cuotas y pagos, gastos fijos, metas y aportes). No incluye perfil, sesiones ni consentimientos: eso se atiende por correo. Ver hallazgo `data-derechos` en `RESUMEN.md`.

## 7. Decisiones automatizadas

Declaramos que **no** tomamos decisiones automatizadas con efectos jurídicos o significativos sobre ti. fik no hace scoring crediticio, no aprueba ni rechaza nada automáticamente sobre tu situación financiera — solo organiza y muestra la información que tú mismo ingresas.

## 8. Origen de los datos

Todos los datos que tratamos los entregas tú directamente al usar la aplicación (registro, carga de movimientos, configuración de cuentas). No obtenemos datos tuyos desde fuentes externas, salvo la geolocalización aproximada derivada técnicamente de tu IP de conexión.

## 9. Seguridad

Aplicamos medidas técnicas: contraseñas con hash `bcrypt`, autenticación multifactor (TOTP) y llaves de acceso (passkeys/WebAuthn) opcionales, sesiones reales revocables de inmediato, identificadores no adivinables, aislamiento estricto de los datos de cada usuario. Toda conexión va cifrada (HTTPS, TLS 1.2 o superior) y la base de datos y los discos están cifrados. La base de datos solo acepta conexiones de nuestro servidor y de los equipos de administración autorizados, con usuarios de permisos mínimos, y tiene respaldos automáticos.

## 10. Cambios

Podemos actualizar esta política; publicaremos la versión vigente con su fecha.

## 11. Reclamos

Puedes reclamar ante la **Agencia de Protección de Datos Personales** de Chile.

---

_Borrador generado con compliance-cl (pack ley-21719), actualizado el 2026-10-11 con la infraestructura de producción. No constituye asesoría legal._
