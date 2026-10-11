# Research — Correos de cuenta y de seguridad (032)

## R1. Dónde vive el envío de correos

**Decision**: `apps/api/src/infra/email/` — infraestructura transversal, igual que `infra/cron`,
`infra/http` o `infra/prisma`. Contiene el puerto `EmailSenderPort`, sus tres adaptadores, la
configuración, las plantillas y sus catálogos es/en. Los datos (registro de correos y enlaces de un
solo uso) viven en dominios-tabla propios (R4), porque la regla "una tabla = un dominio" aplica a lo
que se guarda, no al transporte.

**Rationale**: lo pidió el usuario explícitamente ("una carpeta en infra para lo que es el email con
los templates, las configuraciones"), y calza con la arquitectura: enviar un correo no es una regla
de negocio de ningún dominio, es un canal de salida como el storage de adjuntos.

**Alternatives considered**: un dominio `email` en `src/domains/` — rechazado: no posee tabla, y los
dominios sin tabla están reservados (`import`, `health`).

## R2. Proveedor y transporte

**Decision**: Resend, llamado con `fetch` nativo a `POST https://api.resend.com/emails` (Bearer
`RESEND_API_KEY`, timeout 10 s, cabecera `Idempotency-Key` = id del correo saliente). **Sin
dependencia nueva** (mismo criterio que IPinfo).

**Rationale**: el SDK de Resend es una capa delgada sobre ese mismo endpoint; `fetch` evita una
dependencia y su superficie de auditoría. La `Idempotency-Key` hace que un reintento de red no
entregue dos veces el mismo correo.

**Alternatives considered**: SDK `resend` (una dependencia más sin ganancia real); SMTP con
`nodemailer` (más dependencias, más lento, peor manejo de errores); Amazon SES (descartado en la
conversación por la fricción del sandbox; el puerto permite cambiarlo después cambiando solo el
adaptador).

## R3. Producción vs. desarrollo (FR-004, FR-005)

**Decision**: el adaptador se elige al arrancar, en `email.config.ts`:

> **Enmienda 2026-10-11:** la captura local en archivos (`FileCaptureEmailSender`,
> `EMAIL_CAPTURE_DIR`, `apps/api/.mail/`) se retiró por decisión del dueño del producto. Fuera de
> producción no se envía nada (`DisabledEmailSender`, los endpoints de enlaces responden
> `503 EMAIL_UNAVAILABLE`). Para probar un envío real en local se invierte a mano la condición de
> `production` en `apps/api/src/infra/email/email.config.ts`, con una `RESEND_API_KEY` en el `.env`.

| Entorno            | Condición                                         | Adaptador                | Efecto                                                                                                                                                               |
| ------------------ | ------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Producción         | `NODE_ENV=production` y `RESEND_API_KEY` presente | `ResendEmailSender`      | Entrega real                                                                                                                                                         |
| Producción         | `NODE_ENV=production` sin `RESEND_API_KEY`        | `DisabledEmailSender`    | No envía; `isAvailable()` = false                                                                                                                                    |
| Desarrollo / tests | `NODE_ENV` ≠ `production`                         | `FileCaptureEmailSender` | Nunca entrega: escribe `.html`, `.txt` y `.json` en `EMAIL_CAPTURE_DIR` (por defecto `apps/api/.mail/`, en `.gitignore`) y deja en el log la ruta y el primer enlace |

Los tests de integración/e2e sobrescriben el puerto con un `InMemoryEmailSender` para leer el enlace
del correo capturado.

**Rationale**: el usuario pidió que los correos salgan **solo en producción**. Que la decisión dependa
de `NODE_ENV=production` y no solo de que exista la clave impide que una clave copiada en un `.env`
local envíe correos reales a usuarios por error. La captura en archivos permite recorrer el flujo
completo (abrir el enlace) sin infraestructura extra.

**Alternatives considered**: Mailpit/MailHog en Docker (otra pieza que levantar para algo que unos
archivos resuelven); una página interna de "bandeja local" (más código, se puede agregar después
sobre los mismos archivos); usar el modo de pruebas de Resend en desarrollo (sigue saliendo a
internet y exige la clave en local).

## R4. Modelo de datos

**Decision**: dos tablas nuevas, cada una con su dominio-tabla (sin `presentation/`, compuestas desde
`user` como `passkey` y `session`):

- **`user-email`**: el registro de correos de cada cuenta (estado `PRIMARY | PENDING | PAST`,
  `verifiedAt`, fechas). Restricciones con índices parciales en la migración SQL (ahora que el repo
  usa migraciones): **un solo `PRIMARY` por cuenta** y **un solo `PENDING` por cuenta**.
- **`email-token`**: los enlaces de un solo uso (propósito `VERIFY_EMAIL | RESET_PASSWORD`, hash del
  token, vencimiento, uso).

`User.email` se conserva como **espejo del correo principal** (ya es `@unique`, lo leen muchas partes
y el registro ya lo valida) y la columna heredada `User.emailVerified` — que nadie usa hoy — pasa a
ser el espejo de `verifiedAt` del principal. Ambos se actualizan en la misma transacción que la fila
`PRIMARY`. Detalle en `data-model.md`.

**Rationale**: el usuario pidió explícitamente "una tabla de correos con FK de user y un atributo de
principal". Mantener los espejos en `User` evita tocar cada lectura existente (perfil, registro,
`CurrentUser`) y abre la puerta a un `GET /auth/me` sin join.

**Alternatives considered**: columnas `pendingEmail`/`emailVerifiedAt` en `User` (no guarda historial,
que el usuario pidió); quitar `User.email` y leer siempre de `user-email` (cambio grande y transversal
sin beneficio para esta feature).

## R5. Unicidad de correos (ajuste a FR-012d)

**Decision**: es único entre cuentas **el correo principal** (confirmado o no), como hoy
(`User.email @unique`). Un correo en historial o pendiente en una cuenta no impide que otra lo
registre o lo pida. Confirmar un pendiente que ya es principal de otra cuenta responde
`EMAIL_TAKEN`.

**Rationale**: la spec decía "principal **confirmado**". Pero el registro ya rechaza hoy cualquier
correo que otra cuenta tenga como principal (`EMAIL_TAKEN`), y permitir dos principales iguales sin
confirmar obligaría a quitar el `@unique` de `User.email` y a resolver colisiones al confirmar. Se
mantiene la regla actual, más simple y más estricta; FR-012d se ajusta en la spec para que coincidan.

**Alternatives considered**: unicidad solo entre confirmados (permite que alguien "reserve" un correo
ajeno sin confirmarlo, un problema que ya existe hoy; resolverlo es una feature aparte).

## R6. Tokens de los enlaces (FR-011, FR-017, FR-025)

**Decision**: 32 bytes aleatorios (`crypto.randomBytes`) en base64url en el enlace; en la base solo
se guarda su **SHA-256** (`tokenHash @unique`). Consumir un token es **un `UPDATE ... WHERE
tokenHash = ? AND usedAt IS NULL AND expiresAt > now()`**: si no afecta una fila, el enlace no sirve.
Pedir un enlace nuevo del mismo propósito marca como usados los anteriores de la cuenta.

**Rationale**: un hash rápido basta porque el token tiene 256 bits de entropía (no es una contraseña
adivinable); permite buscar por igualdad. El `UPDATE` condicional cierra la carrera de dos clics
simultáneos sin transacción larga. Ningún dato personal va en el enlace.

**Alternatives considered**: JWT firmado (no se puede invalidar al pedir otro sin guardar estado
igual); bcrypt del token (obliga a buscar sin índice).

## R7. Enlaces y páginas (FR-010a)

**Decision**: los enlaces apuntan al sitio público: `{PUBLIC_SITE_URL}/{es|en}/verify-email/?token=…`
y `{PUBLIC_SITE_URL}/{es|en}/reset-password/?token=…`, en el idioma de la cuenta. Dos páginas nuevas
en `apps/landing` (`noindex`), con un script mínimo que **saca el token de la URL**
(`history.replaceState`) apenas carga, lo envía al API y muestra el resultado o el formulario de
contraseña nueva. El API recibe la nueva variable `PUBLIC_SITE_URL`.

**Rationale**: decisión de clarify. El token no queda en el historial, y la política
`Referrer-Policy: strict-origin-when-cross-origin` (ya en `_headers`) evita que viaje en el
`Referer`.

## R8. Avisos de seguridad sin afectar la acción (FR-006, FR-021)

**Decision**: los handlers que ya existen publican un evento de dominio nuevo,
`AccountSecurityEvent { userId, kind, occurredAt, previousEmail? }`, después de confirmar su
transacción. Un listener (`SendSecurityNoticeListener`, patrón Observer como
`LogStatementPaidListener`) arma y envía el aviso dentro de un `try/catch` que solo registra el
error. El envío no se espera dentro de la respuesta HTTP.

`kind`: `PASSWORD_CHANGED`, `PASSWORD_RESET`, `MFA_ENABLED`, `MFA_DISABLED`, `PASSKEY_ADDED`,
`PASSKEY_REMOVED`, `EMAIL_CHANGED`, `ACCOUNT_DELETED`.

**Rationale**: los eventos ya se despachan de forma síncrona y "un listener que falla aparece en la
misma request"; por eso el listener se protege a sí mismo. Agregar avisos nuevos después es agregar
un `kind`, sin tocar los handlers.

Caso especial: **eliminar la cuenta** borra el correo. El handler captura el correo principal
confirmado y el idioma **antes** de borrar y los lleva en el evento.

## R9. Respuesta idéntica en la recuperación (FR-016, SC-003)

**Decision**: `POST /auth/password/forgot` responde **siempre 202 con el mismo cuerpo**, y hace la
búsqueda por RUT, el chequeo de límite y el envío **después** de responder (tarea en segundo plano
con su propio manejo de errores). Así el tiempo de respuesta tampoco revela si la cuenta existe.

## R10. Límites de envío (FR-024)

**Decision**: máximo **5 enlaces por cuenta y propósito por hora**, contados desde `email-token`
(sin tabla nueva). Además, una **ventana de deduplicación de 60 s**: si ya existe un enlace vigente
del mismo propósito creado hace menos de 60 s, no se crea otro ni se reenvía. Superar el límite:
`429 EMAIL_RATE_LIMITED` en el reenvío de verificación; en la recuperación, la misma respuesta 202
de siempre.

**La base impone "a lo más un enlace vigente"** (corrección de `/speckit-analyze`, C1): índice
parcial único en `email-token` sobre (`userId`, `purpose`) `WHERE "usedAt" IS NULL`. Emitir un enlace
es, en una transacción: marcar `usedAt` en el vigente anterior (si hay) e insertar el nuevo. Si dos
pedidos simultáneos llegan a la vez, el segundo choca con el índice (`P2002`) y se trata como "ya
enviado" (no envía otro correo). La ventana de 60 s queda como atajo previo que evita la
transacción, no como la garantía.

## R11. Idempotencia de las escrituras nuevas (Principio VII)

| Endpoint                                   | Forma | Cómo                                                                                                                                                              |
| ------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/email/verify`                  | (a)   | El token pasa a usado; un replay recibe `EMAIL_TOKEN_INVALID` y no cambia nada                                                                                    |
| `POST /auth/password/reset`                | (a)   | Igual: token terminal, consumido en un `UPDATE` condicional                                                                                                       |
| `POST /auth/email/verification` (reenviar) | (b)   | Índice parcial único: un solo enlace vigente por (cuenta, propósito); la carrera choca con él y se trata como "ya enviado". Más ventana de 60 s y límite por hora |
| `POST /auth/password/forgot`               | (b)   | Ídem (mismo índice); además responde siempre lo mismo                                                                                                             |
| `POST /auth/me/emails` (pedir cambio)      | (b)   | Índice parcial único: un solo `PENDING` por cuenta; repetir la misma dirección dentro de 60 s no crea otro enlace                                                 |
| `DELETE /auth/me/emails/:id`               | (a)   | Borrar dos veces: la segunda responde `404` sin efecto                                                                                                            |

Ninguna mueve saldo ni cupo, así que (a) es suficiente donde se usa.

## R12. Plantillas (FR-002, FR-003)

**Decision**: funciones TypeScript puras en `infra/email/templates/` que reciben datos tipados y el
idioma y devuelven `{ subject, html, text }`. Un `layout` compartido (HTML con tablas y estilos en
línea, que es lo que soportan los clientes de correo, más el logo de fik como PNG servido desde el
sitio público). Textos en `infra/email/i18n/{es,en}.ts`, con un test de paridad de claves. Todo
valor interpolado pasa por una función de escape HTML.

**Rationale**: sin dependencias (React Email sumaría React al API); los mismos datos alimentan la
versión HTML y la de texto; el test de paridad cumple el Principio III.

**Nota sobre el Principio III**: "el API nunca devuelve texto localizado" se refiere a las
respuestas HTTP, que siguen devolviendo solo códigos. Un correo es un canal distinto: alguien tiene
que traducirlo y el navegador no participa. Se documenta como alcance del principio, no como
excepción.

## R13. Cierre de sesiones y bloqueo al recuperar (FR-019, FR-020)

**Decision**: el reset de contraseña, en **una transacción**, cambia el hash, cierra **todas** las
sesiones (nuevo `closeAllForUserWithTx`, sin excepción porque no hay sesión actual), pone en cero
`loginFailedAttempts` y `loginLockedUntil` y consume el token. `mfaEnabled` no se toca. No inicia
sesión automáticamente: la persona entra con su contraseña nueva (y su segundo factor si lo tiene).
