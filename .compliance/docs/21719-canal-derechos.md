# Canal de ejercicio de derechos — fik

> Art. 14 ter: el responsable debe ofrecer un medio para que el titular ejerza sus derechos.
> Actualizado el 2026-10-11 con el estado real de la app y la política publicada.

## 1. Texto público

Publicado en la política de privacidad, sección 6 (`mifik.cl/es/privacy-policy/`, fuente
`apps/landing/src/legal/privacy-policy.es.md`). Canal: **contacto@mifik.cl**, que Cloudflare Email
Routing reenvía a `mifik.general@gmail.com`.

## 2. Procedimiento interno

1. **Recepción:** registrar la solicitud (titular, derecho pedido, fecha de recepción) en una planilla
   de solicitudes y verificar la identidad. Regla práctica: responder solo si el correo desde el que
   escriben es el **correo confirmado** de la cuenta (o pedir que escriban desde él); nunca entregar
   datos a otra dirección.
2. **Plazo de respuesta: 30 días corridos**, prorrogable **una sola vez hasta por 30 días corridos**
   más, avisando al titular (Art. 11).
3. **Gratuidad:** rectificación, supresión y oposición son **siempre gratuitas**. El **acceso** es
   gratuito **al menos una vez por trimestre**.
4. **Ejecución por derecho, estado real en la app:**
   - **Acceso:** ✅ parcial en la app: el titular ve su perfil (Perfil → Información personal), sus
     consentimientos (Perfil → Datos y privacidad → historial de consentimientos) y todos sus datos
     financieros. Lo que no ve directamente (por ejemplo, el detalle de sus sesiones antiguas) se
     entrega por correo con una consulta a la base (usuario `fik_readonly`).
   - **Portabilidad:** ✅ parcial: Importar → Plantilla fik → Descargar plantilla → Con mis datos
     actuales exporta **todos los datos financieros** en un `.xlsx` estructurado y reimportable
     (cuentas, tarjetas, facturaciones, movimientos, traspasos, deudas y pagos, cuotas y pagos, gastos
     fijos, metas y aportes). Perfil, sesiones y consentimientos: por correo, a mano. No existe un
     `GET /auth/me/export`.
   - **Rectificación:** ✅ `PATCH /auth/me` (nombre, dirección, teléfono, identificación, etc.). El
     correo se cambia con verificación (`/auth/me/emails`: se confirma la dirección nueva por enlace
     y se avisa a la anterior).
   - **Supresión:** ✅ `POST /auth/me/delete-account` (Perfil → Datos y privacidad → Eliminar
     cuenta), con contraseña: borrado inmediato de todo, o, si el titular lo elige, anonimización
     (se borra todo lo identificatorio y se conserva el historial financiero sin identidad). Deja un
     registro de la solicitud con el RUT como HMAC (`account-deletion-log`).
   - **Oposición:** ⚠️ sin mecanismo en la app para oponerse a un tratamiento puntual manteniendo la
     cuenta. Los tratamientos por interés legítimo son la seguridad de la sesión y el seguimiento de
     aperturas de los correos: una oposición al seguimiento de aperturas se resolvería apagándolo en
     Resend (es global, no por persona); una oposición a la seguridad de sesión se evalúa caso a caso
     (es necesaria para proteger la cuenta).
   - **Bloqueo:** ⚠️ sin estado de "bloqueo temporal" en la app. Mientras se resuelve una solicitud, se
     puede impedir el acceso cerrando sus sesiones y, si hace falta, editando la fila a mano con
     `fik_admin`; dejar constancia en la planilla.
   - **Retiro del consentimiento:** el consentimiento para datos financieros es la condición para usar
     el servicio, así que retirarlo equivale a eliminar la cuenta (supresión).
5. **Cierre:** responder por escrito desde contacto@mifik.cl y guardar la respuesta y la fecha en la
   planilla de solicitudes.

## 3. Si no se puede cumplir

Informar el motivo legal por escrito. El titular puede reclamar ante la **Agencia de Protección de
Datos Personales**.

## 4. Pendientes

- Oposición y bloqueo sin mecanismo propio en la app (se atienden a mano).
- Exportación del perfil, sesiones y consentimientos (hoy por correo).

---

_Borrador generado con compliance-cl (pack ley-21719), actualizado a mano el 2026-10-11. No constituye
asesoría legal._
