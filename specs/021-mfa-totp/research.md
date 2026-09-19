# Research: MFA con TOTP

## R1 — Librería TOTP

**Decision**: `otpauth` (paquete npm puro JS, sin deps nativas, mantenido, soporta RFC 6238
completo: secret base32, período 30s, 6 dígitos, ventana de tolerancia configurable).

**Rationale**: cero deps nativas = sin fricción de build en Docker/CI. API simple:
`new OTPAuth.Secret()` genera secreto random, `new OTPAuth.TOTP({secret, ...}).generate()` /
`.validate({token, window})` cubre enroll+verify con una sola librería.

**Alternatives considered**: `speakeasy` (no mantenido desde 2018, vulnerabilidades abiertas sin
parchear); `node-2fa` (wrapper delgado sobre `notp`+`thirty-two`, menos control sobre la ventana de
tolerancia).

## R2 — Librería QR

**Decision**: `qrcode` (npm, genera PNG como data URL server-side vía `QRCode.toDataURL(otpauthUri)`).

**Rationale**: el QR se genera en el backend y se manda como data URL — cero dependencias nuevas
en el frontend, consistente con cómo ya se resuelven los adjuntos (S3 firmado, nunca lógica de
archivo en el cliente).

**Alternatives considered**: renderizar el QR en el frontend (`qrcode.react` u otra lib) — se
descartó porque agrega una dependencia de frontend nueva para algo que el backend ya puede resolver
como texto plano (data URL es solo una string en el JSON de respuesta).

## R3 — Formato del secreto almacenado y cifrado en reposo

**Decision**: el secreto TOTP (base32) se cifra con AES-256-GCM usando una clave de 32 bytes desde
`MFA_ENCRYPTION_KEY` (env var nueva, `getOrThrow` — mismo patrón fail-fast que
`CURSOR_SIGNING_SECRET`). Se guarda `iv:authTag:ciphertext` (todos hex) en una sola columna
`mfaSecretEncrypted` (String nullable). El cifrado/descifrado vive ÚNICAMENTE en
`PrismaUserRepository` (funciones puras en `apps/api/src/domains/user/application/mfa-secret-cipher.ts`,
usadas por el adapter, nunca importadas por el dominio) — el agregado `User` trabaja siempre con el
secreto en texto plano en memoria, igual que ya hace con `Prisma.Decimal`↔string para montos: la
capa de dominio no sabe nada de la representación de persistencia.

**Rationale**: a diferencia de una contraseña (que solo se compara, nunca se recupera), un código
TOTP se valida recalculando el HOTP esperado a partir del secreto — así que el secreto DEBE poder
descifrarse. AES-256-GCM da autenticación integrada (el authTag detecta manipulación) sin depender
de una librería extra (Node `crypto` built-in).

**Alternatives considered**: hashear el secreto (imposible — se necesita el valor original para
validar); cifrado a nivel de columna de Postgres (`pgcrypto`) — se descartó porque movería lógica de
negocio a la base de datos, rompiendo el patrón "Prisma es un adapter detrás de un puerto" ya
establecido en todo el proyecto.

## R4 — Códigos de recuperación: cantidad, formato, almacenamiento

**Decision**: 10 códigos por activación, formato `XXXX-XXXX` (8 caracteres alfanuméricos
mayúsculas, sin ambigüedad — se excluyen `0/O/1/I`), generados con `crypto.randomBytes`. Se
hashean con bcrypt (mismo costo que las contraseñas, `bcryptjs` ya es dependencia) antes de
guardarse — nunca se guarda ni se puede recuperar el texto plano después de mostrarlo una vez.

**Rationale**: 10 es el estándar de facto (GitHub, Google, AWS usan 8-10). El formato con guion
mejora la legibilidad al copiar/transcribir. Hashear como una contraseña (no cifrar) porque nunca
se necesita el texto plano de vuelta — solo comparar.

**Alternatives considered**: cifrar en vez de hashear (innecesario — igual que una contraseña,
comparar es suficiente y hashear es más seguro al no requerir guardar una clave de descifrado).

## R5 — Modelo de la tabla `mfa-recovery-code`

**Decision**: tabla propia, dominio-tabla nuevo `mfa-recovery-code` (Constitución §VI). Columnas:
`id` (uuid v7), `userId` (FK → User, `onDelete: Cascade`), `codeHash`, `usedAt` (nullable),
`createdAt`. "Marcar usado" es una escritura condicional `UPDATE ... WHERE id = ? AND usedAt IS
NULL` (mismo patrón "race-safe mark used" que otros flujos de un-solo-uso en el proyecto) para que
dos requests concurrentes con el mismo código de recuperación no puedan ambos pasar.

**Rationale**: una tabla propia (no un array JSON en `User`) permite el `UPDATE condicional`
atómico por fila y dimensiona igual sin importar cuántos códigos tenga cada usuario. Reactivar MFA
borra TODAS las filas del usuario (`deleteMany`) y crea 10 nuevas — "no reusar códigos viejos al
reactivar" es automático porque las viejas ya no existen.

**Alternatives considered**: guardar un array de hashes en una columna `User.mfaRecoveryCodeHashes
String[]` — se descartó porque marcar-usado-atómico requeriría un `UPDATE` que reemplace el array
completo (riesgo de condición de carrera al usar dos códigos casi simultáneamente) y porque
"cuántos quedan sin usar" (FR del spec) es un simple `COUNT WHERE usedAt IS NULL` con tabla propia,
vs. filtrar un array en cada lectura.

## R6 — El "segundo paso" del login: diseño del handshake

**Decision**: `POST /auth/login` (sin cambios de firma) sigue validando email+contraseña. Si
`user.mfaEnabled`, en vez de emitir `access_token`/`refresh_token` emite un tercer tipo de cookie
httpOnly de vida corta (5 minutos), `mfa_pending_token`, firmada con un secreto TOTALMENTE
independiente `MFA_PENDING_TOKEN_SECRET` (nunca `JWT_ACCESS_SECRET` — así una confusión de tipos de
token entre el guard de sesión real y el de pendiente-de-MFA es estructuralmente imposible, no solo
por convención) y payload `{sub: userId, purpose: "mfa-pending"}`. La respuesta HTTP de
`POST /auth/login` gana un campo `mfaRequired: boolean` (sin body de usuario/tokens cuando es
`true`) — el frontend lo usa para decidir si mostrar el segundo paso. Nuevo endpoint
`POST /auth/login/mfa-verify` (sin guard — no hay sesión aún), body `{code: string}`: lee la cookie
`mfa_pending_token`, la verifica, resuelve el usuario, valida `code` contra el secreto TOTP
descifrado (ventana ±1 período = tolera 30s de desfase de reloj) O contra un código de recuperación
sin usar; si es válido, limpia la cookie pendiente y emite las cookies reales de sesión exactamente
como `login.handler.ts` ya hace.

**Rationale**: reusa el mecanismo de cookies httpOnly existente en vez de inventar uno nuevo
(localStorage, body token, etc.) — consistente con "todo el auth es cookie httpOnly" ya establecido.
Separar el secreto de firma es defensa en profundidad barata (una sola constante más) contra que un
bug futuro trate un pending-token como uno de sesión real.

**Alternatives considered**: devolver un token "pendiente" en el BODY de la respuesta de login (no
en cookie) y que el frontend lo reenvíe manualmente en el segundo paso — se descartó por inconsistencia
con el resto del sistema (cero tokens viajan fuera de cookies httpOnly hoy) y porque expondría el
token a lectura por JS (XSS), justo el problema que httpOnly ya evita en todos lados.

## R7 — Límite de intentos (rate limiting)

**Decision**: contador `mfaFailedAttempts` (Int, default 0) + `mfaLockedUntil` (DateTime nullable)
en `User`. Cada código inválido en `login/mfa-verify` incrementa el contador; al llegar a 5 falla,
`mfaLockedUntil = now + 15min` y se rechaza con `MfaLockedError` (nuevo, `httpStatus: 429`,
`code: "MFA_LOCKED"`). Mientras `mfaLockedUntil > now`, cualquier intento (válido o no) se rechaza
de inmediato sin siquiera verificar el código, con el mismo error (evita que un atacante deduzca
"casi acierto" cronometrando la respuesta). Un código VÁLIDO resetea `mfaFailedAttempts = 0` y
`mfaLockedUntil = null`. El cuerpo del error sigue la forma estándar `{error:{code,field?}}` sin
campos adicionales (ni `retryAfterSeconds` ni similares) — consistente con el resto del proyecto,
que nunca amplía esa forma; el frontend deriva su mensaje del código `MFA_LOCKED` solamente.

**Rationale**: 5 intentos/15 min es un umbral estándar (similar a GitHub/Google) — suficientemente
permisivo para un usuario real que se equivoca tipeando, suficientemente estricto para hacer
inviable probar los ~1M códigos posibles (un atacante necesitaría ~1M/5 × 15min ≈ décadas). El
límite vive en el MISMO `User` (no una tabla de intentos aparte) porque el estado relevante es
"¿puede intentar ahora?", una pregunta de una sola fila, no un historial a auditar.

**httpStatus 429 es seguro de agregar**: confirmado leyendo `all-exceptions.filter.ts` — lee
`exception.httpStatus`/`code`/`field` genéricamente sin whitelist de status, así que ampliar el
union type de `DomainError.httpStatus` (hoy `400 | 401 | 404 | 409`) a incluir `429` no requiere
tocar el filtro.

**Alternatives considered**: bloqueo permanente hasta soporte manual (mala UX, sin mecanismo de
soporte en este proyecto); IP-based rate limiting (el proyecto no trackea IPs hoy, y un atacante
distribuido lo evade igual — el límite por CUENTA es lo que efectivamente detiene fuerza bruta
contra un usuario específico).

## R8 — Excepción de persistencia: contador de intentos fallidos en el camino de error

**Decision**: `VerifyMfaLoginCommandHandler` NO sigue el template `load→handle→persist→publish`
estándar para el camino de error — `handle()` mismo llama `this.userRepo.save(user)` DIRECTAMENTE
tanto en el camino de éxito (con el contador reseteado) como en el de código inválido (con el
contador incrementado, antes de lanzar `InvalidMfaCodeError`), dejando el hook `persist()` de la
clase base como no-op. Documentado como excepción deliberada, mismo espíritu que
`PayCreditStatementHandler` ya documenta para su propio caso de escritura cross-agregado.

**Rationale**: el Template Method (`BaseCommandHandler`) asume que `persist()` corre DESPUÉS de que
`handle()` retorna exitosamente — si `handle()` lanza, `persist()` nunca corre. Pero acá el efecto
que hay que guardar (incrementar el contador de intentos) es precisamente el resultado del camino
de FALLA — no hay nada que "persistir tras el éxito" en ese caso, hay que persistir ANTES de lanzar
el error. Forzar esto en el template existente (p.ej. con un `persist()` que inspeccione un flag de
error) sería más confuso que la excepción documentada, ya precedentada.

**Alternatives considered**: mover el contador a una tabla de intentos aparte con su propio INSERT
(no requeriría esta excepción) — descartado por R7 (el estado relevante es una pregunta de una sola
fila del propio `User`, no un historial).

## R9 — Estado de "activación pendiente" vs. "activa"

**Decision**: sin columna de estado separada. `mfaSecretEncrypted !== null && !mfaEnabled` =
pendiente de confirmar (el usuario generó un QR pero no confirmó); `mfaSecretEncrypted !== null &&
mfaEnabled === true` = activa. `mfaEnabled` por sí solo ya es la fuente de verdad de "¿MFA protege
el login?" — el guard de login solo mira ese booleano, nunca el secreto.

**Rationale**: evita una tercera columna de estado (`mfaStatus: enum`) cuando dos columnas ya
codifican las 3 combinaciones posibles sin ambigüedad (inactiva / pendiente / activa) — mismo
principio que otros dominios del proyecto ya aplican (p.ej. `CreditStatement` deriva su estado de
`closedAt`/`paidAt` en vez de una columna de estado redundante).

**Alternatives considered**: enum `MfaStatus` (INACTIVE/PENDING/ACTIVE) — rechazado por redundante
frente a lo que ya expresan `mfaSecretEncrypted`/`mfaEnabled`.

## R10 — Reintentar `enroll` (llamar dos veces sin confirmar)

**Decision**: cada llamada a `POST /auth/me/mfa/enroll` genera un secreto NUEVO y sobrescribe
`mfaSecretEncrypted` — el anterior (si nunca se confirmó) simplemente se pierde, sin error. Esto es
seguro porque mientras `mfaEnabled=false` no hay nada "activo" que romper.

**Rationale**: UX — un usuario que refresca la pantalla de activación o cierra sin confirmar no debe
quedar en un estado roto donde el QR viejo ya no sirve pero tampoco puede pedir uno nuevo.

**Alternatives considered**: rechazar un segundo `enroll` mientras hay uno pendiente
(`MfaEnrollmentAlreadyPendingError`) — rechazado por peor UX sin beneficio de seguridad real (el
secreto pendiente nunca protegió nada).
