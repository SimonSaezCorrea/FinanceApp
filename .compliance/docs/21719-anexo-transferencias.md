# Anexo de Transferencia Internacional de Datos — FinanceApp

> Mecanismo: **Cláusulas Contractuales Modelo** aprobadas por el Ministerio de Economía (Resolución RAEX202503748, Diario Oficial 19-12-2025). Texto oficial en `sources/clausulas-modelo-transferencia-economia.pdf` (dentro de la skill `compliance-cl`).

## Transferencia activa hoy: IPinfo.io

- **Exportador de datos:** FinanceApp, RUT [COMPLETAR] (Chile).
- **Importador de datos:** IPinfo Inc. (servicio extranjero, `api.ipinfo.io`).
- **Condición:** esta transferencia **solo ocurre si `IPINFO_TOKEN` está configurado** en el entorno (`apps/api/src/infra/config/ipinfo.config.ts`, `apps/api/.env.example`). Sin el token, cae a MaxMind local (sin transferencia) o no resuelve país.
- **Dato transferido:** la dirección IP de cada login (dato personal — identificador indirecto, Art. 2 letra f).
- **Finalidad:** mostrar al usuario el país/ciudad aproximados desde donde se conectó, como medida de seguridad (detectar accesos desde ubicaciones inusuales).
- **Mitigación ya implementada en código:** caché interna de 60 días (`ip-geolocation-cache`) — una IP ya consultada no se vuelve a enviar a IPinfo, minimizando el volumen transferido. Un fallo de IPinfo nunca se cachea (se reintenta en el siguiente login).
- **Atribución de licencia**: IPinfo Lite es CC BY-SA 4.0 — FinanceApp ya muestra la atribución visible en Perfil → Seguridad (verificado en `SecuritySection.tsx` por el propio changelog del proyecto).

**⚠️ Mecanismo formal pendiente**: hoy no existe un documento firmado/aceptado con IPinfo que incorpore las cláusulas contractuales modelo chilenas — solo se usan sus Términos de Servicio genéricos (orientados a GDPR/EE.UU.). Acción: revisar los términos de IPinfo y, si no cubren el mecanismo chileno, anexar estas cláusulas modelo por referencia en el DPA (`21719-dpa.md`).

## Transferencia potencial: almacenamiento S3 de adjuntos

**Hoy inerte** (sin `S3_BUCKET` configurado, la función de adjuntos está deshabilitada — `503 ATTACHMENTS_UNAVAILABLE`). Si en el futuro se activa con:
- Un proveedor con datacenter **en Chile o Latinoamérica con presencia legal local**: evaluar si aplica transferencia internacional.
- **AWS S3 en una región fuera de Chile** (lo más probable, ej. `us-east-1` o `sa-east-1` en Brasil): **sí aplica** — replicar el mismo mecanismo (cláusulas contractuales modelo) antes de activar el bucket en producción con datos reales de usuarios.

**Recomendación**: si se busca minimizar el riesgo de esta sección, considerar un proveedor S3-compatible con datacenter físico en Chile o exigir contractualmente el mecanismo antes de subir el primer archivo real.

## Compromisos del importador (aplican a cualquier proveedor extranjero que se use)
Tratar los datos solo según instrucciones, aplicar medidas de seguridad equivalentes, no transferir a terceros sin garantías, y colaborar ante solicitudes de los titulares y de la Agencia.

## Declaración en la política
Esta transferencia (IPinfo) ya se declara en `21719-politica-privacidad.md`, sección 4.

---
*Borrador generado con compliance-cl (pack ley-21719). No constituye asesoría legal; revisar con un abogado.*
