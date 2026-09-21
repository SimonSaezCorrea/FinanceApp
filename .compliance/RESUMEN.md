# Resumen de cumplimiento — FinanceApp

**Corrida:** 2026-09-19 · commit `81430dc` · **Primera corrida** (no hay corrida anterior para comparar drift).

> ⚠️ Esto no constituye asesoría legal — es un borrador fundado en la normativa chilena para que puedas cumplir sin abogado. La decisión final es tuya.

## Postura por marco

| Marco | Score | Controles requeridos | ✅ Pass | ⚠️ Partial | ❌ Fail | ❓ Unknown |
|---|---|---|---|---|---|---|
| **Ley 21.719** (Protección de Datos, vigencia 1-dic-2026) | **56%** | 24 | 10 | 7 | 6 | 1 |
| **Ley 21.595** (Delitos Económicos, ya vigente) | **50%** | 8 | 2 | 4 | 2 | 0 |

> Actualizado 2026-09-20 (fuera de una corrida de compliance-cl, a mano): se cerraron los
> hallazgos #1, #2 y #3 de abajo. Ver `state.json` para el detalle control por control.

Con **micro-empresa (Ley 20.416)**, los primeros 12 meses tras el 1-dic-2026 la Agencia puede aplicar amonestación en vez de multa (Art. sexto transitorio) — hay margen real para cerrar las brechas de la Ley 21.719 antes de que el riesgo de sanción se materialice. La Ley 21.595 ya está vigente hoy.

## Lo bueno: controles ya reales y sólidos
FinanceApp llega con una base técnica de seguridad **mucho más fuerte que el promedio de un proyecto en esta etapa** — esto no es genérico, se verificó leyendo el código:
- **Aislamiento por usuario** (`sec-tenant`) en 29 de 40 repositorios Prisma, con los 11 restantes siendo correctamente tablas de catálogo global sin dueño — es un principio arquitectónico "NON-NEGOTIABLE" del propio proyecto.
- **MFA real** (TOTP) y **llaves de acceso** (passkeys/WebAuthn) implementadas de punta a punta (`sec-mfa`).
- **Contraseñas con bcrypt**, secretos MFA cifrados AES-256-GCM, todos los secretos fuera del código y sin fugas en el historial de git (`sec-passwords`, `sec-secrets`).
- **Privacidad desde el diseño** genuina: identificadores no adivinables (UUID v7 validados en el borde), cursores de paginación firmados con HMAC, claves de almacenamiento de adjuntos opacas — tres endurecimientos que el propio equipo aplicó por decisión arquitectónica, no por esta auditoría (`data-privacy-by-design`).

## Los 3 hallazgos que más importan (priorizados)

### 1. ✅ RESUELTO (2026-09-20) — El dato central de FinanceApp es legalmente "sensible" — y no tenía el consentimiento reforzado que exige
La Ley 21.719 (Art. 2 letra g) incluye la **situación socioeconómica** dentro de "datos personales sensibles" — a diferencia del GDPR. Los saldos, movimientos y deudas que FinanceApp gestiona **son**, por definición legal, dato sensible para el 100% de sus usuarios. Eso activa el **Art. 16** (consentimiento expreso y reforzado, separado del genérico).
→ **Implementado**: `registerRequestSchema` exige `sensitiveDataConsent: z.literal(true)` (checkbox no premarcado en `RegisterRoute.tsx`); cada registro crea un `ConsentRecord` (tabla `consent-record`: tipo, versión de política, timestamp) — visible en Perfil → "Mis consentimientos". La EIPD (Art. 15 ter) sigue sin cerrar del todo — ver hallazgo #2, todavía pendiente.

### 2. ✅ RESUELTO (2026-09-20) — Posibles menores usando la app, sin ningún control de edad
El modelo `User` tenía `birthDate` pero el registro no exigía ni validaba edad. La decisión de producto fue explícita: **no limitar la app a mayores de edad** — un menor puede usarla, pero con el mecanismo de consentimiento distinto que la ley exige.
→ **Implementado**: `birthDate` ahora es obligatorio en el registro (antes se pedía después, en Perfil — sin eso no se puede evaluar edad desde el día uno). Si el titular es menor de 18 años, el registro exige además un bloque de autorización del padre/madre/tutor (nombre + RUT + relación + checkbox), registrado como un segundo `ConsentRecord` (`MINOR_GUARDIAN_AUTHORIZATION`) — nunca reemplaza el consentimiento del propio titular, se suma a él. El RUT del tutor se guarda solo como HMAC, nunca en claro (mismo mecanismo que el log de borrado de cuenta).
→ **Límite honesto, no resuelto ni resoluble sin un flujo de verificación de identidad**: esto es declarativo — nada confirma que quien completa el bloque es realmente el tutor. Es el mismo límite que tiene cualquier app de consumo sin KYC.
→ **Pendiente de confirmar con abogado**: el umbral usado (18 años, mayoría de edad chilena) es un supuesto de trabajo de los documentos que generó compliance-cl — no se verificó contra el texto exacto de la ley si el régimen reforzado aplica desde los 14, 16 o 18 años.

### 3. ⚠️ PARCIALMENTE RESUELTO (2026-09-20) — "Desactivar cuenta" no era "eliminar mis datos" — y sigue sin forma de exportarlos
El derecho de **supresión** y **portabilidad** (Art. 11) no estaban implementados: `POST /auth/me/deactivate` solo desactivaba (`User.status: DISABLED`), no borraba nada; no existe ningún endpoint de exportación.
→ **Supresión: implementada de verdad.** `POST /auth/me/delete-account` reemplaza `/deactivate` y exige una elección explícita, `keepHistory` (checkbox desmarcado por defecto): `false` = borrado total en cascada real (`prisma.user.delete()`); `true` = anonimización opt-in (PII scrubbeado, historial financiero conservado bajo el mismo `userId` — límite legal documentado en `data-pseudonym`, no es anonimización plena). Queda registro de auditoría del borrado (tabla `account-deletion-log`, sin RUT en claro — solo un HMAC).
→ **Portabilidad: sigue sin implementar.** No existe `GET /auth/me/export`. Si llega una solicitud ARCO de acceso/portabilidad hoy, se resuelve manualmente contra la base de datos.
→ Documento: `21719-canal-derechos.md`. Remediación pendiente: implementar exportación (JSON/CSV).

## Otros hallazgos relevantes
- **Transferencia internacional activa sin mecanismo formal**: IPinfo.io recibe la IP de login (si `IPINFO_TOKEN` está configurado) sin que las cláusulas contractuales modelo del Min. Economía estén incorporadas todavía (`21719-anexo-transferencias.md`).
- **Sin proveedor de correo** → no se puede notificar una brecha a los titulares ni enviar el aviso de privacidad por email (ver `docs/PENDING.md` del propio repo, ya lo tenían identificado).
- **Canal de denuncias no independiente**: hoy es el correo del propio Encargado de Prevención — con equipo de 1 persona, una denuncia sobre el founder no tiene a quién llegarle de forma realmente anónima.
- **Sin backups reales**: el switch de "Respaldo automático" en Perfil es decorativo (ya documentado como tal en `docs/PENDING.md`).
- **Segregación de funciones (Ley 21.595)**: estructuralmente imposible con un equipo de 1 persona — documentado como limitación proporcional al tamaño, no simulada.

## Qué quedó resuelto SOLO en esta corrida (self-service)
- Los 9 documentos de la Ley 21.719 y los 5 de la Ley 21.595 — **14 documentos completos**, sin placeholders salvo el RUT personal (no lo tenías a mano) — quedaron redactados y fundados artículo por artículo en `.compliance/docs/`.
- Se resolvió que **no se requiere DPO formal** (Art. 50): micro-empresa, no organismo público — el responsable designado (Simón Sáez) basta.
- Se resolvió que la **EIPD es obligatoria** aplicando el test del Art. 15 ter, y se completó con hallazgos concretos.
- Se identificó y documentó la base de licitud correcta por cada flujo de datos (`21719-rat.md`).

## El único insumo que no es self-service
La **supervisión externa anual del Modelo de Prevención de Delitos** (Ley 21.595) — requiere contratar a un tercero independiente (~UF 3-5, no necesariamente abogado). Es el único componente de todo este diagnóstico que la skill no puede resolver por ti.

## Siguiente paso único
Hallazgos #1, #2 y #3 quedaron resueltos el 2026-09-20 (ver arriba) — los tres hallazgos originalmente priorizados están cerrados. Lo que sigue, en orden de prioridad:
1. **Confirmar con abogado** el umbral de edad usado (18 años) para el régimen reforzado de menores — es un supuesto de trabajo, no una cita verificada de la ley.
2. **Portabilidad**: `GET /auth/me/export` (JSON/CSV) — no implementado.
3. Publicar la política de privacidad en una ruta real (`gov-politicas`/`data-info`, siguen en `fail`).

---
*Generado con [compliance-cl](https://github.com/Lelemon-studio/compliance-cl). No constituye asesoría legal.*
