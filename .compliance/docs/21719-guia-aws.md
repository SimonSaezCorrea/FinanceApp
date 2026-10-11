# Guía: respaldo contractual de la transferencia de datos a AWS — fik

> Paso a paso para dejar documentado que la transferencia internacional de datos personales a
> Amazon Web Services (AWS) tiene garantías contractuales (Ley 21.719). Orientación práctica, **no
> asesoría legal**: antes de tener usuarios reales, que la revise un abogado.
> Última revisión: 2026-10-11.

## Por qué hace falta

Los datos de los usuarios de fik salen de Chile: el API y la base de datos corren en **AWS, región
US East (Ohio) `us-east-2`, Estados Unidos**. La Ley 21.719 permite transferir datos a un país sin
nivel adecuado de protección si hay **garantías apropiadas**, típicamente cláusulas contractuales.

Lo que tiene AWS:

- El **AWS GDPR Data Processing Addendum (DPA)**: AWS actúa como encargado del tratamiento
  ("processor") y se obliga a proteger los datos, notificar brechas, no usarlos para otros fines, etc.
- **No se firma nada**: los Service Terms de AWS incluyen el DPA siempre que AWS trata datos del
  cliente (§1.14.1).
- **Ojo (leído el 2026-10-11):** el DPA también incorpora las Cláusulas Contractuales Tipo (SCC)
  europeas, pero **solo se aplican a datos sujetos al RGPD que salen del Espacio Económico Europeo**
  (DPA §12.2; Service Terms §1.14.3). No cubren los datos de fik. Lo que sí rige para fik son las
  obligaciones de encargado del resto del DPA (resumidas en `21719-anexo-transferencias.md`).

**Ojo: las SCC son europeas, y Chile ya tiene sus propias Cláusulas Contractuales Modelo**
(Ministerio de Economía, Resolución RAEX202503748, Diario Oficial 19-12-2025; ver
`21719-anexo-transferencias.md`). El DPA de AWS es el respaldo que existe hoy, pero no es el
modelo chileno. Lo que habría que resolver con un abogado es si el DPA de AWS cubre las obligaciones
de las cláusulas chilenas o si hay que anexarlas por referencia en `21719-dpa.md` (sin presupuesto para abogado hoy: ver "Cómo se aborda sin abogado" en el anexo). Los pasos de
esta guía dejan reunida la evidencia para esa revisión.

## Paso 1. Descargar el DPA (5 minutos)

1. Abre el PDF oficial: <https://d1.awsstatic.com/legal/aws-gdpr/AWS_GDPR_DPA.pdf>
   (verificado el 2026-10-11: responde, versión publicada el 27-10-2023).
2. Guárdalo en el repo como `.compliance/proveedores/aws/AWS_GDPR_DPA_descargado-AAAA-MM-DD.pdf`
   (con la fecha del día). La fecha en el nombre es la evidencia de qué versión regía.
3. **Hecho el 2026-10-11:** guardado en `.compliance/proveedores/aws/` (idéntico al publicado por AWS).

Si el enlace dejara de funcionar: busca **"AWS GDPR Center"** en aws.amazon.com/compliance y descarga
el "AWS GDPR Data Processing Addendum" desde ahí.

## Paso 2. Guardar los términos de servicio (5 minutos)

El DPA se aplica **a través** de los Service Terms, así que conviene guardar también esa página:

1. Abre <https://aws.amazon.com/service-terms/>.
2. Imprímela como PDF (Ctrl+P → Guardar como PDF).
3. Guárdala como `.compliance/proveedores/aws/AWS_Service_Terms_AAAA-MM-DD.pdf`.

## Paso 3. Revisar AWS Artifact (opcional, 10 minutos)

AWS Artifact es el portal de documentos de cumplimiento, dentro de la consola.

1. Consola de AWS → busca **Artifact**.
2. **Contratos → Acuerdos de la cuenta:** escribe "Data Processing" en el filtro.
   - **Comprobado en la cuenta de fik (2026-10-11): no aparece.** El filtro "data" solo muestra el
     _Australian_ y el _New Zealand Notifiable Data Breach Addendum_ y el _Healthcare and Life
     Sciences BAA Addendum_. Es lo esperado: el DPA no se acepta aquí, ya rige por los Service Terms
     (Pasos 1 y 2). No hay nada que aceptar en esta sección.
   - **No aceptes** los demás acuerdos de esa lista: el _Business Associate Addendum (BAA)_ es para
     datos de salud de EE. UU. (HIPAA) y el _Australian/New Zealand Notifiable Data Breach Addendum_
     es para esos países. No aplican a fik.
3. **Informes:** aquí están las certificaciones de seguridad de AWS (SOC 2, ISO 27001). Son útiles
   como evidencia en la Evaluación de Impacto (`21719-eipd.md`) de que el encargado tiene medidas de
   seguridad. Descargarlos exige aceptar el acuerdo de confidencialidad (NDA) de Artifact: esos
   informes **no se suben a un repositorio público** ni se comparten.

## Paso 4. Anotar qué servicios y datos usa fik en AWS

**Hecho el 2026-10-11:** quedó en `21719-anexo-transferencias.md`, sección 1, junto con Cloudflare,
Resend e IPinfo. Si algo cambia (un servicio nuevo, otra región), actualizarlo ahí. Resumen:

| Dato          | Valor                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Proveedor     | Amazon Web Services, Inc. (encargado)                                                                                                                        |
| País / región | Estados Unidos, US East (Ohio) `us-east-2`                                                                                                                   |
| Servicios     | EC2 (API), RDS PostgreSQL (base de datos), ECR (imágenes), Systems Manager / Parameter Store (configuración y secretos)                                      |
| Datos         | Todos los datos de la cuenta del usuario: identificación (RUT, nombre, correo), datos financieros (cuentas, movimientos, deudas), sesiones (IP, dispositivo) |
| Garantía      | AWS DPA (obligaciones de encargado), incluido en los Service Terms (Pasos 1 y 2)                                                                             |
| Cifrado       | En tránsito (TLS) y en reposo (RDS y discos cifrados)                                                                                                        |
| Evidencia     | `.compliance/proveedores/aws/`                                                                                                                               |

## Paso 5. Declararlo en la política de privacidad

`21719-politica-privacidad.md` debe decir, en la sección de transferencias internacionales, que los
datos se alojan en AWS en Estados Unidos, bajo el acuerdo de tratamiento de datos de AWS (**hecho el 2026-10-11**).

## Mantención

- **Una vez al año**, o si AWS avisa cambios en sus términos: volver a descargar el DPA y los
  Service Terms con la fecha nueva (Pasos 1 y 2). No borrar los anteriores.
- **Si se cambia de región** (por ejemplo a Santiago cuando AWS la abra, o de vuelta a São Paulo):
  actualizar el país en el Paso 4 y en la política. Una región en Chile dejaría de ser
  transferencia internacional para la base de datos.

## Los otros proveedores

El mismo procedimiento aplica a los demás encargados de fik:

- **Resend** (correos, envía desde Brasil): DPA en su sitio, sección legal (buscar "Resend DPA").
- **Cloudflare** (sitios y proxy del API): DPA incluido en sus términos (buscar "Cloudflare DPA").
- **IPinfo** (país de cada sesión a partir de la IP): revisar sus términos y DPA.

## Fuentes

- AWS Security Blog, _New Standard Contractual Clauses now part of the AWS GDPR Data Processing
  Addendum for customers_:
  <https://aws.amazon.com/blogs/security/new-standard-contractual-clauses-now-part-of-the-aws-gdpr-data-processing-addendum-for-customers>
- AWS GDPR DPA (PDF): <https://d1.awsstatic.com/legal/aws-gdpr/AWS_GDPR_DPA.pdf>
- AWS Artifact, preguntas frecuentes: <https://aws.amazon.com/artifact/faq/>
