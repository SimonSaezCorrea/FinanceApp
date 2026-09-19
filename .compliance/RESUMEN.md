# Resumen de cumplimiento — FinanceApp

**Corrida:** 2026-09-19 · commit `81430dc` · **Primera corrida** (no hay corrida anterior para comparar drift).

> ⚠️ Esto no constituye asesoría legal — es un borrador fundado en la normativa chilena para que puedas cumplir sin abogado. La decisión final es tuya.

## Postura por marco

| Marco | Score | Controles requeridos | ✅ Pass | ⚠️ Partial | ❌ Fail | ❓ Unknown |
|---|---|---|---|---|---|---|
| **Ley 21.719** (Protección de Datos, vigencia 1-dic-2026) | **46%** | 24 | 7 | 8 | 8 | 1 |
| **Ley 21.595** (Delitos Económicos, ya vigente) | **50%** | 8 | 2 | 4 | 2 | 0 |

Con **micro-empresa (Ley 20.416)**, los primeros 12 meses tras el 1-dic-2026 la Agencia puede aplicar amonestación en vez de multa (Art. sexto transitorio) — hay margen real para cerrar las brechas de la Ley 21.719 antes de que el riesgo de sanción se materialice. La Ley 21.595 ya está vigente hoy.

## Lo bueno: controles ya reales y sólidos
FinanceApp llega con una base técnica de seguridad **mucho más fuerte que el promedio de un proyecto en esta etapa** — esto no es genérico, se verificó leyendo el código:
- **Aislamiento por usuario** (`sec-tenant`) en 29 de 40 repositorios Prisma, con los 11 restantes siendo correctamente tablas de catálogo global sin dueño — es un principio arquitectónico "NON-NEGOTIABLE" del propio proyecto.
- **MFA real** (TOTP) y **llaves de acceso** (passkeys/WebAuthn) implementadas de punta a punta (`sec-mfa`).
- **Contraseñas con bcrypt**, secretos MFA cifrados AES-256-GCM, todos los secretos fuera del código y sin fugas en el historial de git (`sec-passwords`, `sec-secrets`).
- **Privacidad desde el diseño** genuina: identificadores no adivinables (UUID v7 validados en el borde), cursores de paginación firmados con HMAC, claves de almacenamiento de adjuntos opacas — tres endurecimientos que el propio equipo aplicó por decisión arquitectónica, no por esta auditoría (`data-privacy-by-design`).

## Los 3 hallazgos que más importan (priorizados)

### 1. El dato central de FinanceApp es legalmente "sensible" — y no tiene el consentimiento reforzado que exige
La Ley 21.719 (Art. 2 letra g) incluye la **situación socioeconómica** dentro de "datos personales sensibles" — a diferencia del GDPR. Los saldos, movimientos y deudas que FinanceApp gestiona **son**, por definición legal, dato sensible para el 100% de sus usuarios. Eso activa el **Art. 16** (consentimiento expreso y reforzado, separado del genérico) y hace que la **EIPD sea obligatoria** (Art. 15 ter — aplicada, ver `.compliance/docs/21719-eipd.md`). Hoy: **cero checkbox de consentimiento** en el registro (`apps/web/src/domains/auth`).
→ Documentos: `21719-consentimiento.md`, `21719-eipd.md`. Remediación: agregar el checkbox reforzado + registrar prueba de consentimiento (timestamp + versión de política).

### 2. Posibles menores usando la app, sin ningún control de edad
El modelo `User` tiene `birthDate` pero el registro no exige ni valida una edad mínima. La ley tiene régimen reforzado para datos sensibles de adolescentes menores de 16 años — sin verificación, FinanceApp no puede descartar estar tratando esos datos sin la base legal correcta.
→ Remediación: agregar una declaración de mayoría de edad en el registro, como mínimo.

### 3. "Desactivar cuenta" no es "eliminar mis datos" — y no hay forma de exportarlos
El derecho de **supresión** y **portabilidad** (Art. 11) no están implementados: `POST /auth/me/deactivate` solo desactiva (`User.status: DISABLED`), no borra nada; no existe ningún endpoint de exportación. Si llega una solicitud ARCO real hoy, se resolvería manualmente contra la base de datos.
→ Documento: `21719-canal-derechos.md`. Remediación: implementar exportación (JSON/CSV) y borrado definitivo real.

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
Implementar el **checkbox de consentimiento reforzado en el registro** (hallazgo #1) — es la pieza que, sin ella, deja sin base legal válida al dato que es el corazón del producto. ¿Quieres que lo construya ahora (rama nueva, con tests y los gates del repo, siguiendo `references/build/`)?

---
*Generado con [compliance-cl](https://github.com/Lelemon-studio/compliance-cl). No constituye asesoría legal.*
