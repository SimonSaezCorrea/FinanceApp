# Anexo de Transferencia Internacional de Datos — fik

> Mecanismo: **Cláusulas Contractuales Modelo** aprobadas por el Ministerio de Economía (Resolución RAEX202503748, Diario Oficial 19-12-2025). Texto oficial en `sources/clausulas-modelo-transferencia-economia.pdf` (dentro de la skill `compliance-cl`).
>
> Actualizado el 2026-10-11 con la infraestructura real de producción (`docs/DEPLOY.md`).

- **Exportador de datos (todas las transferencias):** fik (antes "FinanceApp"), proyecto operado por Simón Sáez como persona natural, RUT 20.640.480-9, Chile.
- **Resumen:** cinco encargados extranjeros activos (el quinto, Google, solo para el buzón de contacto). AWS y Cloudflare reciben **todos** los datos de la app (AWS los guarda; Cloudflare los ve en tránsito); Resend recibe correos y contenido de los avisos; IPinfo recibe solo IPs.

| Encargado  | País donde se tratan          | Qué datos                               | Garantía hoy (DPA leído el 2026-10-11)               | Mecanismo chileno |
| ---------- | ----------------------------- | --------------------------------------- | ---------------------------------------------------- | ----------------- |
| AWS        | EE.UU. (Ohio, `us-east-2`)    | todos los datos de la cuenta, cifrados  | DPA de AWS: obligaciones de encargado (automático)   | ⚠️ no incorporado |
| Cloudflare | red global (empresa EE.UU.)   | todo el tráfico, descifrado en su borde | DPA v6.4: se somete a la ley del país de origen      | ⚠️ no incorporado |
| Resend     | EE.UU. y Brasil (`sa-east-1`) | correo, contenido de avisos, aperturas  | DPA con lista cerrada de leyes (el más débil)        | ⚠️ no incorporado |
| IPinfo     | EE.UU.                        | IP de cada inicio de sesión             | DPA de autoservicio: toda ley aplicable, incluye IPs | ⚠️ no incorporado |

## 1. Amazon Web Services (alojamiento del API y la base de datos)

- **Importador de datos:** Amazon Web Services, Inc. (EE.UU.), encargado del tratamiento.
- **Dónde:** región **US East (Ohio) `us-east-2`**, Estados Unidos. Se eligió en vez de São Paulo por costo (≈ US$32 contra ≈ US$55 al mes, ver `docs/DEPLOY.md`); para la ley ambas son transferencia internacional.
- **Servicios:** EC2 (el API), RDS PostgreSQL 16 (la base de datos), ECR (imágenes del API), Systems Manager / Parameter Store (configuración y secretos).
- **Datos transferidos:** **todos** los datos que el titular ingresa a fik: identificación (nombre, RUT, correo, fecha de nacimiento, teléfono y dirección si los completa), datos financieros (cuentas, tarjetas, movimientos, deudas, cuotas, ahorros: **dato sensible**, situación socioeconómica, Art. 2 letra g), sesiones (IP, dispositivo, país aproximado), consentimientos y autorizaciones de tutor.
- **Finalidad:** prestar el servicio (guardar y procesar los datos de la cuenta).
- **Medidas ya implementadas:**
  - Cifrado en reposo (RDS y discos del servidor) y en tránsito (TLS verificado entre servidor y base; HTTPS de punta a punta).
  - Base de datos sin acceso salvo desde el servidor y las IP de administración autorizadas; usuarios de base con mínimo privilegio (`fik_app` solo filas, `fik_readonly` solo lectura, `fik_migrate` estructura, `fik_admin` solo administración).
  - Respaldos automáticos de 1 día (restauración a cualquier minuto de las últimas 24 h).
  - Secretos cifrados en Parameter Store; el servidor no puede leer la contraseña maestra de la base.
  - Sin acceso SSH al servidor (Session Manager).
- **Garantía contractual hoy (leída el 2026-10-11):** el **AWS Data Processing Addendum** (versión 27-10-2023), que los Service Terms de AWS incluyen siempre que AWS trata datos del cliente (§1.14.1, versión 15-09-2026). No se firma. Evidencia: `.compliance/proveedores/aws/`. Lo que obliga a AWS, aplicable a fik:
  - actuar como encargado y tratar los datos solo según las instrucciones del cliente (§1.1, §2);
  - no acceder, usar ni divulgar los datos salvo para prestar el servicio o por orden legal; ante una solicitud de un gobierno, intentar redirigirla al cliente y avisarle salvo prohibición legal (§3);
  - mantener las medidas de seguridad del Anexo 1 (control de acceso, pruebas de penetración, gestión de incidentes, destrucción segura de discos) (§5);
  - avisar con 30 días antes de sumar un subencargado, imponerle las mismas obligaciones y responder por él (§6);
  - notificar una brecha de seguridad sin demora indebida y ayudar a notificarla (§9);
  - no sacar los datos de la región elegida (Ohio) salvo lo necesario para el servicio o por orden legal (§12.1);
  - devolver o borrar los datos al terminar, con 90 días de plazo (§14).
- **Lo que NO cubre:** las Cláusulas Contractuales Tipo europeas incorporadas al DPA **solo se aplican a datos sujetos al RGPD que salen del Espacio Económico Europeo** (DPA §12.2; Service Terms §1.14.3). Los datos de fik no lo están, así que esas cláusulas no son la garantía de esta transferencia.
- **⚠️ Mecanismo chileno pendiente:** las cláusulas modelo chilenas (Resolución RAEX202503748) no están incorporadas. Con un proveedor como AWS no se negocian contratos individuales: el DPA es lo disponible. Ver "Cómo se aborda sin abogado" al final.

## 2. Cloudflare (sitios públicos y proxy del API)

- **Importador de datos:** Cloudflare, Inc. (EE.UU.), encargado del tratamiento.
- **Dónde:** red global de Cloudflare (el tráfico desde Chile normalmente entra por su nodo en Santiago, pero la empresa y parte del procesamiento están fuera de Chile).
- **Servicios:** Cloudflare Pages (`mifik.cl`, `app.mifik.cl`), proxy y DNS de `api.mifik.cl`, reenvío de correo entrante de `@mifik.cl`.
- **Datos transferidos:** la IP y el navegador de cada visita, y **todo el contenido de cada llamada al API**: Cloudflare termina el HTTPS en su borde y vuelve a cifrar hacia el servidor, así que ve en tránsito los datos financieros y las credenciales que viajan en esas llamadas. También los correos que llegan a `contacto@mifik.cl`.
- **Finalidad:** entregar los sitios, proteger el API (solo Cloudflare puede llegar al servidor), reenviar el correo de contacto y, en el sitio público solamente, **contar visitas** (Cloudflare Web Analytics: página, origen, país, dispositivo y velocidad, agregados y sin cookies; nunca en la app ni en las páginas con token).
- **Medidas ya implementadas:** HTTPS obligatorio (TLS 1.2 mínimo, 1.3 disponible); conexión Cloudflare → servidor con certificado de origen y autenticación mutua (Authenticated Origin Pulls).
- **Garantía contractual hoy (leída el 2026-10-11):** el **Cloudflare Data Processing Addendum v6.4** (vigente desde el 3-04-2026), que forma parte del Self-Serve Subscription Agreement que acepta toda cuenta. Evidencia: `.compliance/proveedores/cloudflare/`. Lo más relevante para fik:
  - define la ley aplicable como **todas** las leyes de protección de datos que apliquen al tratamiento (no solo la europea o la de EE.UU.), así que cubre la Ley 21.719;
  - **§7.3: no participará en transferencias desde el país de origen de los datos (Chile) salvo en pleno cumplimiento de la ley de ese país**; es la cláusula más cercana a lo que pide la ley chilena entre todos los proveedores;
  - trata los datos solo según instrucciones, con personal bajo confidencialidad;
  - notifica brechas sin demora indebida (§3.1e);
  - avisa con 30 días antes de sumar subencargados, a los que impone las mismas obligaciones y por los que responde (§4);
  - ante una solicitud de un tercero o un gobierno: avisa al cliente salvo prohibición legal, lo redirige al cliente, entrega lo mínimo y recurre judicialmente si hay conflicto de leyes (§8); publica un informe de transparencia semestral y declara no haber entregado nunca claves de cifrado;
  - borra o devuelve los datos al terminar (§3.1i).
- **Mecanismo chileno:** no incorpora las cláusulas modelo chilenas, pero su §7.3 lo obliga a respetar la ley de origen.

## 3. Resend (correos de cuenta y de seguridad, specs/032)

- **Importador de datos:** Resend, Inc. (EE.UU., `api.resend.com`), encargado del envío de correos transaccionales.
- **Dónde:** el dominio `mifik.cl` envía desde la región **São Paulo (`sa-east-1`), Brasil**, pero el DPA dice que el procesamiento principal de Resend ocurre en **Estados Unidos** (§6.1), y sus 22 subencargados están todos en EE.UU. (AWS, Cloudflare, Datadog, Anthropic, Snowflake, entre otros; lista guardada). Para la política: **Estados Unidos y Brasil**.
- **Datos transferidos:** la dirección de correo del titular y el contenido del correo: enlace de verificación o de recuperación (un token de un solo uso, 48 h / 30 min), o un aviso de seguridad (qué cambió y cuándo). **Nunca** montos, cuentas ni movimientos. Además, desde el 2026-10-11, **si y cuándo el titular abre cada correo** (seguimiento de aperturas, con una imagen invisible en `links.mifik.cl`).
- **Cuándo:** solo en producción (`NODE_ENV=production` y `RESEND_API_KEY`); fuera de producción no se envía ningún correo.
- **Minimización ya implementada:**
  - El contenido de los correos no lleva datos financieros; los avisos de seguridad solo van a direcciones confirmadas.
  - **Seguimiento de clics apagado a propósito**: los enlaces con token no pasan por los servidores de Resend.
  - TLS obligatorio (Enforced) hacia el servidor de correo del destinatario.
  - Remitente y respuesta: `contacto@mifik.cl`.
- **Garantía contractual hoy (leída el 2026-10-11):** el **Resend Data Processing Addendum** (Plus Five Five, Inc., actualizado el 31-12-2025), vinculante al aceptar los términos de servicio, sin firma aparte; la versión ejecutada para la cuenta se descarga desde el panel de Resend (**Settings → Documents**). Evidencia: `.compliance/proveedores/resend/`. Obliga a Resend a:
  - tratar los datos solo para prestar el servicio y según instrucciones (§2.2), con personal bajo confidencialidad (§3);
  - avisar **con 14 días** antes de sumar subencargados, imponerles obligaciones comparables y responder por ellos (§4);
  - notificar brechas sin demora indebida (§8.6);
  - ante una solicitud de un gobierno: redirigirla al cliente y avisarle salvo prohibición legal (§6.6.2);
  - borrar o devolver los datos al terminar (§2.4).
- **Lo que NO cubre bien:** a diferencia de Cloudflare e IPinfo, su DPA define la ley aplicable con una **lista cerrada** (CCPA, RGPD, leyes de Reino Unido y Suiza) y define "titular" como alguien en Europa o un consumidor de California. Las obligaciones de encargado aplican a los datos que tratan, pero el DPA no menciona otras leyes; de los cuatro proveedores, es la garantía más débil para datos de chilenos. Mitigación: Resend nunca recibe datos financieros (solo el correo y el contenido de los avisos).
- **⚠️ Mecanismo chileno pendiente.** El seguimiento de aperturas ya se declara en la política de privacidad.

## 4. IPinfo.io (país aproximado de cada sesión)

- **Importador de datos:** IPinfo Inc. (EE.UU., `api.ipinfo.io`).
- **Condición:** esta transferencia **solo ocurre si `IPINFO_TOKEN` está configurado** (`apps/api/src/infra/config/ipinfo.config.ts`). En producción **está configurado**. Sin el token, la sesión simplemente queda sin país (MaxMind local se eliminó el 2026-10-10).
- **Dato transferido:** la dirección IP de cada inicio de sesión (dato personal: identificador indirecto, Art. 2 letra f).
- **Finalidad:** mostrar al titular el país aproximado desde donde se conectó, como medida de seguridad (detectar accesos desde ubicaciones inusuales).
- **Mitigación ya implementada en código:** caché interna de 60 días (`ip-geolocation-cache`): una IP ya consultada no se vuelve a enviar a IPinfo. Un fallo de IPinfo nunca se cachea (se reintenta en el siguiente login).
- **Atribución de licencia:** IPinfo Lite es CC BY-SA 4.0; fik muestra la atribución en Perfil → Seguridad (`SecuritySection.tsx`).
- **Garantía contractual hoy (leída el 2026-10-11):** el **IPinfo Self-Serve Online Data Processing Agreement** (actualizado el 11-08-2026), que rige para las cuentas de autoservicio creadas o renovadas desde su publicación (la de fik es una cuenta Lite de autoservicio). Evidencia: `.compliance/proveedores/ipinfo/`. Lo relevante:
  - define la ley aplicable como **toda la legislación mundial** de protección de datos que aplique al tratamiento, así que cubre la Ley 21.719;
  - **acepta tratar las direcciones IP bajo el DPA** aunque no esté resuelto si son datos personales;
  - notifica brechas sin demora indebida; avisa con 30 días antes de sumar subencargados (con derecho a objetar) y les impone el mismo nivel de protección;
  - borra o devuelve los datos al terminar el servicio.
- **Mecanismo chileno:** no incorpora las cláusulas modelo chilenas, pero su DPA se somete a la ley aplicable de cualquier país.

## 5. Google (buzón de `contacto@mifik.cl`)

- **Importador de datos:** Google LLC (EE.UU.), servicio Gmail.
- **Cómo llegan los datos:** Cloudflare Email Routing reenvía todo correo a `contacto@mifik.cl` a la cuenta **`mifik.general@gmail.com`** (regla verificada el 2026-10-11), desde donde se lee y se responde.
- **Datos transferidos:** lo que escriba quien contacta: su correo, su nombre y el contenido (por ejemplo, solicitudes para ejercer derechos sobre sus datos). No hay datos de la app salvo los que la persona escriba.
- **Garantía contractual hoy:** los términos de Gmail para cuentas personales. **No hay un DPA**: Google ofrece acuerdo de tratamiento de datos solo en Google Workspace (de pago). Es la garantía más débil de la lista, mitigada porque el volumen es bajo y solo contiene lo que la persona decide escribir.
- **Mejora posible:** pasar `contacto@mifik.cl` a Google Workspace u otro proveedor de correo con DPA cuando haya usuarios reales.

## Transferencia potencial: almacenamiento S3 de adjuntos

**Hoy inerte** (sin `S3_BUCKET` configurado, la función de adjuntos está deshabilitada: `503 ATTACHMENTS_UNAVAILABLE`). Si en el futuro se activa:

- Con **AWS S3 en `us-east-2`** (lo natural, junto al resto): se suma a la transferencia de la sección 1, con el mismo mecanismo; agregar S3 a la lista de servicios.
- Con un proveedor con datacenter **en Chile**: evaluar si deja de ser transferencia internacional.

## Compromisos del importador (aplican a cualquier proveedor extranjero que se use)

Tratar los datos solo según instrucciones, aplicar medidas de seguridad equivalentes, no transferir a terceros sin garantías, y colaborar ante solicitudes de los titulares y de la Agencia.

## Declaración en la política

`21719-politica-privacidad.md`, sección 4, declara los cuatro proveedores con su país y el seguimiento de aperturas de los correos (actualizado el 2026-10-11).

## Cómo se aborda sin abogado (decisión 2026-10-11)

fik es un proyecto personal sin presupuesto para asesoría legal. Con proveedores como AWS, Cloudflare o Resend no se negocian contratos: se aceptan sus términos y su DPA. Lo razonable a este nivel:

1. **Guardar la evidencia** de las garantías que cada proveedor sí da (sus DPA, con fecha) en `.compliance/proveedores/`.
2. **Ser transparente:** la política de privacidad dice qué proveedores reciben los datos, en qué país y para qué, y que todos están fuera de Chile.
3. **Minimizar:** cada proveedor recibe solo lo que necesita (Resend nunca ve datos financieros; IPinfo solo la IP, con caché).
4. **Revisar antes del 1-12-2026** (entrada en vigencia de la Ley 21.719) si la Agencia publicó guías sobre cómo aplicar las cláusulas modelo con proveedores de nube, y antes de tener usuarios que no sean conocidos.

Esto no reemplaza una revisión legal; deja el riesgo identificado y documentado.

## Pendientes para cerrar este anexo

1. ~~Exportador~~: Simón Sáez, persona natural, RUT 20.640.480-9 (sin razón social).
2. ~~DPA y términos de servicio de cada proveedor~~ (leídos y guardados el 2026-10-11 en `.compliance/proveedores/<proveedor>/`: el DPA más los términos que lo incorporan; de Google, solo sus condiciones generales, porque una cuenta personal de Gmail no tiene DPA). Repetir la descarga una vez al año, con fecha nueva y sin borrar las anteriores. Opcional: descargar la versión ejecutada del DPA de Resend desde su panel (Settings → Documents).
3. Revisión legal: no hay presupuesto hoy; ver la sección anterior.
4. ~~Actualizar la política de privacidad~~ (hecho el 2026-10-11).

---

_Borrador generado con compliance-cl (pack ley-21719), actualizado a mano con la infraestructura de producción. No constituye asesoría legal; revisar con un abogado._
