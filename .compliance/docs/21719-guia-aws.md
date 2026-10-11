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
- Dentro del DPA, las **Cláusulas Contractuales Tipo (SCC)** de la Comisión Europea (versión 2021).
- **No se firma nada**: AWS declara que el DPA y las SCC forman parte de sus términos de servicio
  (Service Terms) y _"se aplican automáticamente siempre que un cliente usa los servicios de AWS"_.

Las SCC son europeas. La Agencia de Protección de Datos chilena puede aprobar sus propios modelos
de cláusulas; mientras no existan, las SCC del DPA de AWS son el respaldo disponible. Esto es lo
que conviene confirmar con un abogado.

## Paso 1. Descargar el DPA (5 minutos)

1. Abre el PDF oficial: <https://d1.awsstatic.com/legal/aws-gdpr/AWS_GDPR_DPA.pdf>
   (verificado el 2026-10-11: responde, versión publicada el 27-10-2023).
2. Guárdalo en el repo como `.compliance/proveedores/aws/AWS_GDPR_DPA_descargado-AAAA-MM-DD.pdf`
   (con la fecha del día). La fecha en el nombre es la evidencia de qué versión regía.
3. Ábrelo y confirma que trae las cláusulas: busca "Standard Contractual Clauses" o "SCC".

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
   - Si aparece un "GDPR Data Processing Addendum", ábrelo y descárgalo también.
   - Si no aparece, es normal: el DPA ya rige por los Service Terms (Paso 1).
   - **No aceptes** los demás acuerdos de esa lista: el _Business Associate Addendum (BAA)_ es para
     datos de salud de EE. UU. (HIPAA) y el _Australian/New Zealand Notifiable Data Breach Addendum_
     es para esos países. No aplican a fik.
3. **Informes:** aquí están las certificaciones de seguridad de AWS (SOC 2, ISO 27001). Son útiles
   como evidencia en la Evaluación de Impacto (`21719-eipd.md`) de que el encargado tiene medidas de
   seguridad. Descargarlos exige aceptar el acuerdo de confidencialidad (NDA) de Artifact: esos
   informes **no se suben a un repositorio público** ni se comparten.

## Paso 4. Anotar qué servicios y datos usa fik en AWS

Completa en `21719-anexo-transferencias.md` (sección AWS):

| Dato          | Valor                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Proveedor     | Amazon Web Services, Inc. (encargado)                                                                                                                        |
| País / región | Estados Unidos, US East (Ohio) `us-east-2`                                                                                                                   |
| Servicios     | EC2 (API), RDS PostgreSQL (base de datos), ECR (imágenes), Systems Manager / Parameter Store (configuración y secretos)                                      |
| Datos         | Todos los datos de la cuenta del usuario: identificación (RUT, nombre, correo), datos financieros (cuentas, movimientos, deudas), sesiones (IP, dispositivo) |
| Garantía      | AWS GDPR DPA + SCC, incorporados a los Service Terms (Pasos 1 y 2)                                                                                           |
| Cifrado       | En tránsito (TLS) y en reposo (RDS y discos cifrados)                                                                                                        |
| Evidencia     | `.compliance/proveedores/aws/`                                                                                                                               |

## Paso 5. Declararlo en la política de privacidad

`21719-politica-privacidad.md` debe decir, en la sección de transferencias internacionales, que los
datos se alojan en AWS en Estados Unidos, bajo cláusulas contractuales.

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
