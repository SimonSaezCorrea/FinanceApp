# Plan de Respuesta a Brechas de Datos Personales — FinanceApp

**Empresa:** FinanceApp · **Responsable del plan:** Simón Sáez · **Contacto:** simon.alejandro.saez@gmail.com
**Plazo legal:** notificar a la Agencia **sin dilaciones indebidas** (Art. 14 sexies; la ley NO fija 72 horas — eso es GDPR, no texto chileno). Mantener además el registro de vulneraciones (`21719-registro-vulneraciones.md`), se notifiquen o no.

## Roles
- **Coordinador de incidente:** Simón Sáez. **Equipo técnico:** Simón Sáez (equipo de una persona hoy — ver limitación en `21595-matriz-riesgos.md` sobre segregación de funciones). **Apoyo legal:** [COMPLETAR — abogado a definir si escala].

## Fase 1 — Detección y contención (0–4h)
1. Registrar fecha/hora de detección y quién detecta.
2. Contener: rotar `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`MFA_ENCRYPTION_KEY` según corresponda, revocar sesiones activas (`POST /auth/sessions/revoke-others` a nivel de usuario, o a nivel de infraestructura si el acceso comprometido es del propio sistema), rotar credenciales de base de datos/S3/IPinfo si están involucradas.
3. Abrir bitácora del incidente en `21719-registro-vulneraciones.md`.

## Fase 2 — Evaluación (4–24h)
1. Qué datos y de cuántos titulares — usar el inventario de `21719-rat.md` para acotar qué tabla(s) se vieron afectadas.
2. Riesgo para los titulares: **alto** si involucra datos financieros (fila 2 del RAT, dato sensible) o credenciales; **no alto** si es, por ejemplo, un log técnico sin datos personales.
3. Si hay proveedor involucrado (IPinfo, S3), exigirle la información del incidente de su lado.

## Fase 3 — Notificación (sin dilaciones indebidas)
1. **A la Agencia:** naturaleza, categorías y volumen, consecuencias probables, medidas adoptadas, contacto (simon.alejandro.saez@gmail.com).
2. **A los titulares:** obligatorio si hay riesgo alto, y **siempre** si afecta datos sensibles/económicos/financieros/bancarios o de niños — que es exactamente el tipo de dato que FinanceApp trata como su producto central. Canal de aviso: **hoy no existe proveedor de correo transaccional** (ver `docs/PENDING.md` del repo) — mientras no se resuelva, la notificación a titulares tendría que ser manual (ej. anuncio dentro de la app al iniciar sesión), lo cual es una limitación real a resolver antes de producción con usuarios reales.

## Fase 4 — Cierre y mejora
Causa raíz · medidas correctivas · actualizar el RAT y este plan.

## Plantilla de aviso (borrador)
> El [FECHA] detectamos [DESCRIPCIÓN]. Datos afectados: [CATEGORÍAS], ~[N] titulares. Medidas adoptadas: [...]. Contacto: simon.alejandro.saez@gmail.com.

## Brecha crítica a prevenir en este proyecto específico
Dado que el dato central de FinanceApp es financiero (sensible), y que **no hay proveedor de correo para avisar a los titulares**, la prioridad de remediación antes de tener usuarios reales en producción es: (1) implementar el canal de notificación (Resend, ya evaluado en `docs/PENDING.md`), (2) considerar un audit log de accesos a datos financieros para poder responder "qué datos y de cuántos titulares" con precisión en la Fase 2.

---
*Borrador generado con compliance-cl (pack ley-21719). No constituye asesoría legal; revisar con un abogado.*
