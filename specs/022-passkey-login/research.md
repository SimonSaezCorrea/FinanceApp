# Research: Llave de acceso (Passkey / WebAuthn)

## R1 — Librería backend

**Decision**: `@simplewebauthn/server` (apps/api). Expone `generateRegistrationOptions`,
`verifyRegistrationResponse`, `generateAuthenticationOptions`, `verifyAuthenticationResponse` —
cubre la firma/`rpId`/origen/contador anti-clonado sin reimplementar criptografía a mano.

**Rationale**: es la librería de referencia del ecosistema Node/TypeScript para WebAuthn del lado
servidor, mantenida activamente, y su shape de entrada/salida es JSON-friendly (no requiere manejar
`ArrayBuffer` en el backend, solo strings base64url) — encaja directo con el resto del stack (zod,
JSON sobre HTTP).

**Alternatives considered**: implementar la verificación de firma a mano sobre la librería `crypto`
nativa de Node — descartado: WebAuthn tiene múltiples algoritmos de firma (ES256, RS256, EdDSA) y
formatos de `attestationObject`/`authenticatorData` en CBOR; reimplementarlo es exactamente el tipo
de superficie criptográfica que este proyecto no reinventa en ningún otro dominio (bcrypt para
contraseñas, `otpauth` para TOTP — siempre librerías de referencia, nunca crypto a mano).

## R2 — Sin dependencia nueva en el frontend

**Decision**: `navigator.credentials.create()`/`navigator.credentials.get()` se llaman
directamente — un helper propio nuevo, `apps/web/src/shared/lib/webauthn.ts`, codifica/decodifica
los campos `ArrayBuffer` (challenge, `user.id`, `rawId`, etc.) a/desde base64url para que puedan
viajar en JSON. ~30 líneas, sin lógica de negocio.

**Rationale**: mismo criterio que specs/021 (el QR se genera server-side precisamente para no
agregar una dependencia de frontend) — la API del navegador ya es nativa, y el único trabajo real
es la codificación base64url, que no justifica una librería (`@simplewebauthn/browser` es en
esencia el mismo helper empaquetado).

**Alternatives considered**: `@simplewebauthn/browser` — descartado por ser una dependencia nueva
para envolver algo que el navegador ya expone nativamente y que se resuelve en pocas líneas.

## R3 — Dónde vive el desafío (`challenge`) entre los dos pasos de cada ceremonia

**Decision**: una cookie httpOnly firmada de corta vida (5 min), mismo mecanismo que el
`mfa_pending_token` de specs/021 — nueva función `passkey-challenge-token.ts` con
`issuePasskeyChallenge({ challenge, userId })`/`verifyPasskeyChallenge(token)`, firmada con un
secreto propio (`PASSKEY_CHALLENGE_SECRET`, `getOrThrow`, mismo patrón fail-fast que los demás
secretos). El payload lleva `userId: string | null` — `null` cuando el email del paso de login no
corresponde a ningún usuario o no tiene llaves, para que el paso de verificación pueda fallar de
forma genérica sin haber revelado nada en el paso de opciones.

**Rationale**: este proyecto no tiene Redis ni ninguna forma de estado de servidor de corta vida
fuera de Postgres — agregar una tabla solo para un desafío de 5 minutos sería más pesado que una
cookie firmada, y el patrón (JWT de corta vida, secreto propio, distinto de los de sesión) ya está
precedentado y probado por el `mfa_pending_token`.

**Alternatives considered**: guardar el desafío en una tabla Postgres con expiración — descartado
por peso innecesario (una fila + limpieza periódica) para resolver lo mismo que ya resuelve una
cookie firmada sin estado.

## R4 — Anti-enumeración en el login con llave de acceso (FR-005a)

**Decision**: `POST /auth/login/passkey-options` **siempre** responde con la misma forma
(`{challenge, allowCredentials, rpId}`) sin importar si el email existe o tiene llaves — cuando no
hay llaves reales, `allowCredentials` es un arreglo vacío y el `userId` interno de la cookie de
desafío es `null`. `POST /auth/login/passkey-verify` sencillamente no puede completar una
assertion válida contra una lista vacía (el navegador ni siquiera podría producir una respuesta
válida), y cualquier fallo devuelve el mismo `InvalidCredentialsError` (`INVALID_CREDENTIALS`) que
ya usa el login con contraseña — **reutilizado tal cual, sin código de error nuevo**, para que sea
estructuralmente indistinguible de una contraseña incorrecta en el frontend (cero wiring de i18n
nuevo para este caso).

**Rationale**: mismo principio que `login.handler.ts` ya aplica ("rejects an unknown email with
INVALID_CREDENTIALS — no user-enumeration") — reutilizar el error existente en vez de crear uno de
passkeys evita que la sola EXISTENCIA de un código de error distinto filtre información.

**Alternatives considered**: responder `404`/error específico cuando el email no tiene llaves —
descartado explícitamente, es justo la enumeración que FR-005a prohíbe.

## R5 — `rpId` y origen esperado: sin variables de entorno nuevas

**Decision**: `apps/api/src/infra/config/passkey.config.ts`'s `getPasskeyExpectedOrigin(config)`
devuelve `CORS_ORIGIN` tal cual (ya existente, ya usado por `main.ts` para el mismo propósito de
identificar el frontend confiable); `getPasskeyRpId(config)` deriva el `rpId` parseando el hostname
de esa misma URL (`new URL(origin).hostname`) — WebAuthn exige que `rpId` sea el dominio (sin
puerto/protocolo) del origen que sirve la página.

**Rationale**: `CORS_ORIGIN` ya es, por definición, "el origen del frontend en el que confía este
backend" — exactamente el dato que WebAuthn necesita para `expectedOrigin`/`rpId`. Inventar una
env var nueva sería duplicar una fuente de verdad que ya existe.

**Alternatives considered**: env vars `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` separadas — descartado por
redundante; si `CORS_ORIGIN` cambia (deploy a un dominio nuevo) y estas no se actualizaran en
paralelo, quedarían desincronizadas silenciosamente.

## R6 — Contador anti-clonado (`counter`)

**Decision**: `Passkey.counter` (Int, default 0) se actualiza en cada login exitoso vía
`verifyAuthenticationResponse`'s `authenticationInfo.newCounter`. Si el contador que llega en una
assertion es menor o igual al almacenado, la librería lanza — tratado igual que cualquier otro
fallo de verificación (`INVALID_CREDENTIALS` genérico, R4).

**Rationale**: comportamiento estándar del protocolo — un contador que retrocede es la señal
clásica de un autenticador clonado. `@simplewebauthn/server` ya lo verifica; este dominio solo
persiste el valor nuevo tras cada verificación exitosa.

## R7 — Relación con MFA (specs/021): completamente independiente

**Decision**: el login con llave de acceso emite la sesión completa DIRECTAMENTE en
`passkey-verify` — nunca pasa por `mfa_pending_token` ni por `VerifyMfaLoginCommand`, aun si
`user.mfaEnabled` es `true`. Ningún campo de `User` relacionado con MFA se lee ni se modifica en
todo este flujo.

**Rationale**: decisión explícita del usuario en el clarify de esta spec (FR-007) — la llave de
acceso es su propio mecanismo de autenticación fuerte (posesión del dispositivo + biometría/PIN),
no necesita un segundo factor adicional encima, igual que ningún proveedor real (Google, GitHub)
pide un TOTP después de una passkey.

## R8 — `CurrentUser` no cambia

**Decision**: a diferencia de MFA (que agregó `mfaEnabled`/`mfaRecoveryCodesRemaining` al
contrato), esta feature **no** agrega campos a `CurrentUser` — cuántas passkeys tiene un usuario se
consulta aparte, vía `GET /auth/me/passkeys` (la lista completa, ya con nombre/fechas que
`PasskeySection` necesita mostrar), nunca como un conteo embebido en el usuario actual.

**Rationale**: a diferencia del conteo de códigos de recuperación (un número que MFA necesita en
varios puntos del perfil), la lista de passkeys solo se consulta en una pantalla — no hay
necesidad de embeberla en el objeto de sesión.
