# Plan de Respuesta a Brechas de Datos Personales — fik

**Responsable:** Simón Sáez, persona natural, RUT 20.640.480-9 · **Contacto público:** contacto@mifik.cl
**Plazo legal:** notificar a la Agencia **sin dilaciones indebidas** (Art. 14 sexies; la ley chilena NO
fija 72 horas, eso es del RGPD europeo). Llevar además el registro de vulneraciones
(`21719-registro-vulneraciones.md`), se notifiquen o no. Actualizado el 2026-10-11 con la
infraestructura de producción (`docs/DEPLOY.md`).

## Roles

- **Coordinador y equipo técnico:** Simón Sáez (equipo de una persona; ver la limitación de
  segregación de funciones en `21595-matriz-riesgos.md`). **Apoyo legal:** ninguno por ahora (sin
  presupuesto).

## Por dónde puede llegar el aviso de una brecha

| Fuente                               | Llega a                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------- |
| AWS (servidor, base de datos)        | `mifik.general@gmail.com` + el contacto de seguridad alternativo de AWS |
| Cloudflare (sitio, proxy del API)    | `simon.alejandro.saez@gmail.com` (cuenta de Cloudflare)                 |
| Resend (correos)                     | `mifik.general@gmail.com`                                               |
| IPinfo                               | el correo de la cuenta de IPinfo                                        |
| Un usuario o un tercero              | `contacto@mifik.cl` → `mifik.general@gmail.com`                         |
| GitHub (secreto filtrado en el repo) | el correo de la cuenta de GitHub                                        |

## Fase 1 — Detección y contención (0–4 h)

1. Registrar fecha y hora de detección y quién detectó.
2. Contener según lo comprometido (ver `docs/DEPLOY.md`):
   - **Secretos del API:** cambiar el parámetro en Parameter Store (`/fik/prod/<NOMBRE>`) y desplegar
     el API (_Actions → Deploy → api_). Cambiar `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` invalida todas
     las sesiones. **No** cambiar `MFA_ENCRYPTION_KEY` ni `IDENTIFIER_HASH_SECRET` sin plan: dejan
     ilegibles los datos ya guardados.
   - **Cerrar sesiones:** de un usuario, desde su Perfil o directo en la tabla `session`; de todos,
     cambiando los secretos JWT.
   - **Base de datos:** cambiar las contraseñas de `fik_app`/`fik_migrate` (Parameter Store +
     `deploy/aws/db-roles.sql` + desplegar), quitar las IP de administración
     (`deploy/aws/db-allow-my-ip.sh --revoke`).
   - **Proveedores:** rotar la clave de Resend, el token de IPinfo y los tokens de Cloudflare/GitHub
     que corresponda.
3. Abrir la bitácora del incidente en `21719-registro-vulneraciones.md`.

## Fase 2 — Evaluación (4–24 h)

1. Qué datos y de cuántos titulares: usar el inventario de `21719-rat.md` para acotar las tablas
   afectadas. La base guarda respaldos de 24 h (restauración a cualquier minuto) para comparar.
2. Riesgo: **alto** si involucra datos financieros (dato sensible) o credenciales; **no alto** si es,
   por ejemplo, un log técnico sin datos personales.
3. Si hay un proveedor involucrado, pedirle la información del incidente de su lado (cada DPA lo obliga
   a cooperar: ver `21719-anexo-transferencias.md`).

## Fase 3 — Notificación (sin dilaciones indebidas)

1. **A la Agencia:** naturaleza, categorías y volumen, consecuencias probables, medidas adoptadas,
   contacto (contacto@mifik.cl).
2. **A los titulares:** obligatorio si hay riesgo alto, y **siempre** si afecta datos financieros o de
   niños, que es exactamente lo que trata fik. **Canal: correo, vía Resend.** No hay una función de
   envío masivo en la app: sacar la lista de correos confirmados de la base (usuario `fik_readonly`,
   tabla `user-email`, `status = PRIMARY` y `verifiedAt` no nulo) y enviar con Resend (_Broadcasts_, o la API).
   Si el incidente afecta a Resend o a la base, avisar además con un mensaje en la landing.

## Fase 4 — Cierre y mejora

Causa raíz · medidas correctivas · actualizar el RAT, este plan y `docs/DEPLOY.md`.

## Plantilla de aviso (borrador)

> El [FECHA] detectamos [DESCRIPCIÓN]. Datos afectados: [CATEGORÍAS], ~[N] personas. Lo que hicimos:
> [...]. Lo que te recomendamos: [cambiar tu contraseña / revisar tus sesiones en Perfil → Seguridad].
> Contacto: contacto@mifik.cl.

## Mejoras pendientes

- Un registro de accesos a datos financieros (audit log), para responder con precisión "qué datos y de
  cuántos titulares" en la Fase 2.
- Una forma de enviar un aviso a todos los usuarios desde la app, en vez de armar la lista a mano.

---

_Borrador generado con compliance-cl (pack ley-21719), actualizado a mano el 2026-10-11. No constituye
asesoría legal._
