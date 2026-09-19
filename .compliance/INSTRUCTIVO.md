# Instructivo — Qué hacer ante cada situación (FinanceApp)

Manual operativo generado por `compliance-cl` el 2026-09-19. Simón Sáez (responsable de datos / encargado de prevención) lo ejecuta **solo**; un abogado solo es necesario en el caso C (fiscalización), por ser representación reservada por ley.

---

## A. Llega un derecho del titular (acceso, rectificación, supresión, oposición, portabilidad, bloqueo)
**Plazo: 30 días corridos, prorrogable una sola vez por 30 días más** (avisando al titular). Gratuidad: rectificación/supresión/oposición siempre gratis; acceso gratis al menos una vez por trimestre.

1. Registra la solicitud (fecha, quién, qué pide) y verifica identidad.
2. Ubica sus datos — hoy están en la base de datos PostgreSQL propia (`apps/api`), sin proveedores externos que guarden dato financiero.
3. Ejecuta:
   - **Acceso/portabilidad** → ⚠️ **no hay endpoint automatizado hoy** — tendrías que exportar manualmente desde la base de datos filtrando por `userId`. Prioriza implementar el endpoint (ver `RESUMEN.md`, hallazgo `data-derechos`).
   - **Supresión** → `POST /auth/me/deactivate` NO basta (solo desactiva) — hoy la eliminación real requeriría un borrado manual en base de datos. Prioriza implementar borrado real.
   - **Rectificación** → `PATCH /auth/me` ya funciona.
   - **Oposición/bloqueo** → no hay mecanismo específico; documenta la gestión manual mientras tanto.
4. Responde por escrito y **guarda evidencia** (usa `21719-canal-derechos.md` como plantilla del proceso).

## B. Brecha de seguridad (acceso no autorizado, fuga, pérdida, alteración)
**Plazo: notificar a la Agencia sin dilaciones indebidas** (Art. 14 sexies; la ley NO fija 72h).

1. **Contén:** rota `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`MFA_ENCRYPTION_KEY`/`CURSOR_SIGNING_SECRET` según corresponda, revoca sesiones, rota credenciales de base de datos/S3/IPinfo. Abre bitácora.
2. **Evalúa:** qué tabla(s) de `apps/api/prisma/schema.prisma` se vieron afectadas (usa `21719-rat.md` para mapear a categorías de datos), cuántos titulares, nivel de riesgo.
3. **Notifica:** a la **Agencia**; a los **titulares** si hay riesgo alto o afecta datos sensibles/económicos/financieros — que es el caso típico en FinanceApp dado su giro. ⚠️ **Hoy no hay proveedor de correo transaccional** — la notificación a titulares tendría que ser manual (anuncio in-app) hasta que se implemente (ver `docs/PENDING.md` del repo, sección "Envío de correos transaccionales").
4. **Registra** la vulneración en `.compliance/docs/21719-registro-vulneraciones.md`, aunque no se notifique.
5. **Cierra:** causa raíz + fix + actualiza el RAT y el plan de respuesta.

## C. Te fiscaliza la Agencia de Protección de Datos
El único caso donde conviene un **abogado** (representación reservada por ley).

1. Designa un contacto único (Simón Sáez). Todo por escrito.
2. Identifica la etapa: ¿solicitud de información (preliminar) o **pliego de cargos** (formal)?
3. Reúne los antecedentes — ya están todos en `.compliance/docs/`: RAT, evidencia de consentimiento (una vez implementado), medidas de seguridad, registro de vulneraciones, DPA, EIPD.
4. Responde en plazo, cargo por cargo, mostrando debida diligencia y remediación.
5. **Atenuantes:** MIPYME tiene gracia el primer año (dic-2026 a dic-2027); el MPD/MPI y la corrección rápida ayudan.
6. **Nunca:** ocultar o destruir documentos, ni ignorar plazos.

## D. Cambia la ley o sale un reglamento
1. Actualiza el corpus en `sources/` de la skill (re-descarga, ver `sources/FUENTES.md`).
2. Ajusta el pack afectado y los controles.
3. Re-corre `/compliance-cl` sobre este repo → `state.json` mostrará qué cambió.

## E. Calendario de revisión

| Cuándo | Qué | Quién |
|---|---|---|
| Anual (o ante cambios) | Revisar y actualizar el RAT (`21719-rat.md`) | Simón Sáez |
| Anual | Supervisión externa del MPD (21.595, obligatoria, **no self-service**) | Tercero independiente a contratar |
| Anual | Capacitación (autoformación mientras el equipo sea de 1 persona) | Simón Sáez |
| Al activar S3 o IPinfo con datos reales | DPA + anexo de transferencia (`21719-dpa.md`, `21719-anexo-transferencias.md`) | Simón Sáez |
| Antes de tener usuarios reales en producción | Implementar consentimiento reforzado + control de edad (hallazgos de la EIPD) | Simón Sáez |
| Cada release relevante | Re-correr `/compliance-cl` (detecta drift) | Simón Sáez |

---
*Guía operativa de compliance-cl. No es asesoría legal.*
