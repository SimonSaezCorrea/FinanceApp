# Política de Privacidad — FinanceApp

**Última actualización:** 2026-09-19

> ⚠️ **Estado de publicación: NO publicada todavía.** Este documento es un borrador vivo en `.compliance/docs/`. Para que cumpla su función legal (Art. 14 ter, deber de información) debe publicarse en una URL real de la aplicación (ej. `/legal/privacidad`) y enlazarse desde el registro y el pie de página — hoy `apps/web` no tiene esa ruta. Ver hallazgo `data-info` en `RESUMEN.md`.

## 1. Responsable del tratamiento
FinanceApp (proyecto en etapa temprana, sin constitución societaria formal — operado por Simón Sáez como persona natural), domicilio en La Florida, Santiago, Chile. Contacto para datos personales: simon.alejandro.saez@gmail.com.

[COMPLETAR: RUT — se usará el RUT personal de Simón Sáez mientras no exista una sociedad constituida; actualizar este documento cuando exista razón social y RUT de empresa.]

## 2. Qué datos tratamos
- **Datos de identidad y contacto:** nombre, correo electrónico, teléfono, RUT/DNI/pasaporte, dirección, fecha de nacimiento.
- **Datos financieros (declarados dato sensible, ver más abajo):** cuentas bancarias registradas, saldos, movimientos de ingreso y gasto, categorías de gasto, tarjetas (solo últimos 4 dígitos, nunca el número completo), deudas, metas de ahorro, cupos y facturación de tarjetas de crédito.
- **Datos de seguridad de sesión:** dirección IP, tipo de dispositivo/navegador, país y ciudad aproximados (cuando el servicio de geolocalización está configurado).
- **Comprobantes adjuntos** (opcional): boletas o vouchers que el usuario sube para respaldar un movimiento.

**Sí tratamos datos sensibles.** Conforme al Art. 2 letra g) de la Ley 21.719, la **situación socioeconómica** de una persona es un dato personal sensible — y eso es, precisamente, el núcleo del servicio que presta FinanceApp (saldos, deudas, movimientos). Por eso pedimos tu **consentimiento expreso y reforzado** para tratar estos datos (Art. 16), separado del consentimiento general de la cuenta.

**Menores de edad:** hoy la aplicación no verifica la edad de quien se registra. Si eres menor de edad, no debes usar el servicio sin la autorización de tu madre, padre o tutor. Estamos trabajando en un control de edad en el registro.

## 3. Finalidad y base de licitud
| Finalidad | Base de licitud |
|---|---|
| Crear y administrar tu cuenta | Ejecución de contrato |
| Registrar y mostrar tus movimientos, cuentas, tarjetas, deudas y ahorros (dato sensible) | Consentimiento expreso y reforzado (Art. 16) |
| Seguridad de la sesión (detectar dispositivos nuevos, prevenir accesos indebidos) | Interés legítimo |
| Enviarte comunicaciones sobre tu cuenta | Ejecución de contrato |
| Comunicaciones de marketing | [No implementado hoy — FinanceApp no envía correos, ver sección 9] |

## 4. Con quién compartimos los datos
- **Almacenamiento de comprobantes** (S3-compatible: AWS S3, MinIO, R2 o Backblaze, según configuración): hoy **no está activo** — sin esa configuración, la función de adjuntos está deshabilitada y ningún archivo sale de nuestra infraestructura.
- **IPinfo.io** (geolocalización aproximada de IP de sesión), cuando está configurado: procesa fuera de Chile. Esta transferencia se ampara en las **cláusulas contractuales modelo aprobadas por el Ministerio de Economía** (ver `21719-anexo-transferencias.md`). Su licencia de datos (CC BY-SA 4.0) exige atribución visible, que mostramos en Perfil → Seguridad.
- No vendemos ni compartimos tus datos con fines de publicidad. No tenemos hoy ningún proveedor de analítica o marketing integrado.

## 5. Por cuánto tiempo
Conservamos tus datos **mientras tu cuenta esté activa**. [COMPLETAR: no existe hoy una política de retención definida tras la baja de una cuenta — se propone como default: conservar los datos financieros hasta 90 días después de la eliminación de la cuenta para permitir su recuperación accidental, y eliminarlos definitivamente después, salvo obligación legal de conservación que aplique (ej. tributaria) — este plazo debe confirmarse como decisión de producto, no está implementado en código todavía.] Los datos de sesión/seguridad se purgan automáticamente: las sesiones cerradas se retienen 3 días y la caché de geolocalización 60 días.

## 6. Tus derechos
Puedes ejercer **acceso, rectificación, supresión, oposición, portabilidad y bloqueo**, y **retirar tu consentimiento** cuando quieras, escribiendo a simon.alejandro.saez@gmail.com. Respondemos en **30 días corridos** (prorrogables una sola vez por 30 días más). La rectificación, supresión y oposición son siempre gratuitas; el acceso es gratuito al menos una vez por trimestre.

> ⚠️ **Estado real hoy**: puedes rectificar tus datos de perfil desde la app (`PATCH /auth/me`) y desactivar tu cuenta (`POST /auth/me/deactivate`), pero **no existe todavía** un endpoint de exportación de datos (portabilidad) ni de eliminación definitiva (supresión real — desactivar no borra los datos). Ver hallazgo `data-derechos` en `RESUMEN.md`.

## 7. Decisiones automatizadas
Declaramos que **no** tomamos decisiones automatizadas con efectos jurídicos o significativos sobre ti. FinanceApp no hace scoring crediticio, no aprueba ni rechaza nada automáticamente sobre tu situación financiera — solo organiza y muestra la información que tú mismo ingresas.

## 8. Origen de los datos
Todos los datos que tratamos los entregas tú directamente al usar la aplicación (registro, carga de movimientos, configuración de cuentas). No obtenemos datos tuyos desde fuentes externas, salvo la geolocalización aproximada derivada técnicamente de tu IP de conexión.

## 9. Seguridad
Aplicamos medidas técnicas: contraseñas con hash `bcrypt`, autenticación multifactor (TOTP) y llaves de acceso (passkeys/WebAuthn) opcionales, sesiones reales revocables de inmediato, identificadores no adivinables, aislamiento estricto de los datos de cada usuario. El cifrado en tránsito (TLS/HTTPS) depende de la configuración del hosting donde se despliegue la aplicación — confírmalo en tu proveedor de infraestructura.

## 10. Cambios
Podemos actualizar esta política; publicaremos la versión vigente con su fecha.

## 11. Reclamos
Puedes reclamar ante la **Agencia de Protección de Datos Personales** de Chile.

---
*Borrador generado con compliance-cl (pack ley-21719). No constituye asesoría legal; revisar con un abogado antes de publicar.*
