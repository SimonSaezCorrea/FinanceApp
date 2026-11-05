# Research: Verificación en dos pasos más completa (040)

Decisiones técnicas que resuelven lo que la spec deja abierto. Cada una: decisión, razón y alternativas.

## R1 — Regenerar códigos: reemplazo atómico en una transacción

- **Decision**: `RegenerateRecoveryCodesHandler` hace, en UNA `prisma.$transaction`: consumir el step-up
  (ver Idempotencia) +
  `MfaRecoveryCodeRepositoryPort.deleteAllForUserWithTx` (ya existe) + `createManyWithTx` (ya existe) +
  `TrustedDeviceRepositoryPort.deleteAllForUserWithTx` (FR-012). Exige `assertRecentStepUp` (ya existe,
  `user/application/step-up.ts`) antes de cualquier escritura. Publica `AccountSecurityEvent`
  `RECOVERY_CODES_REGENERATED` después del commit.
- **Rationale**: borrar e insertar en la misma transacción satisface FR-003 (nunca dos tandas válidas
  ni ninguna). Los puertos ya existen; solo se compone. El step-up reutiliza la ventana de 5 min.
- **Alternatives**: marcar los viejos `usedAt` en vez de borrarlos (conserva historial que nadie lee y
  complica `countUnused`); generar sin step-up (la spec lo exige).
- **Idempotencia (Principio VII)**: **forma (a)**: regenerar **consume el step-up** de la sesión. Dentro
  de la misma transacción, `SessionStepUpPort.consumeWithTx(tx, userId, sessionId, stepUpAt)` hace
  `UPDATE session SET "stepUpAt" = NULL WHERE id = ? AND "userId" = ? AND "stepUpAt" = ?`; si no toca
  exactamente 1 fila, la operación se rechaza con `STEP_UP_REQUIRED` y nada cambia. Un replay o una
  petición concurrente pierde: solo una tanda llega a existir y es la única que se mostró. Se descartó
  `Idempotency-Key` (forma c) porque guardar la respuesta exigiría persistir los códigos en texto plano.
  Consecuencia aceptada: tras regenerar, cerrar otra sesión vuelve a pedir verificación.

## R2 — Dispositivo recordado: token aleatorio, solo su SHA-256 en la base

- **Decision**: nueva tabla-dominio **`trusted-device`**. Al recordar: 32 bytes aleatorios
  (`randomBytes(32)`, base64url) en una cookie httpOnly **`mfa_trusted`**; en la fila solo
  `tokenHash = SHA-256(token)` (`@unique`). La cookie usa las mismas opciones que las de sesión
  (`requiresSecureCookies`, `SameSite=Lax`, `path=/api/v1/auth`) y `maxAge` 30 días.
- **Rationale**: FR-010 — quien roba la tabla no puede fabricar la cookie (preimagen de SHA-256 de 256
  bits). Mismo patrón que `email-token` (hash de un secreto de alta entropía, sin llave de servidor).
- **Alternatives**: JWT firmado sin tabla (no se puede revocar uno por uno ni listar, FR-011/012);
  bcrypt (innecesario con 256 bits de entropía, y costoso en cada login).

## R3 — Una cookie por navegador, no una por cuenta

- **Decision**: una sola cookie `mfa_trusted`. Si en el mismo navegador otra cuenta recuerda el
  dispositivo, la cookie pasa a ser de esa cuenta; la fila de la primera queda en su lista hasta que
  vence o la quita. Al iniciar sesión, la cookie solo vale si su fila pertenece a la cuenta que pasó
  la contraseña (FR-009, escenario 4).
- **Rationale**: un nombre de cookie por cuenta exigiría poner un identificador de la cuenta en el
  nombre; compartir navegador entre dos cuentas con verificación es raro. Se documenta como límite.
- **Alternatives**: cookie con lista de tokens (crece sin control y mezcla cuentas en un valor).

## R4 — Plazo fijo de 30 días, máximo 10, `lastUsedAt` informativo

- **Decision**: `expiresAt = createdAt + 30 días`, nunca se extiende (FR-009). Recordar el 11.º borra
  el más antiguo en la misma transacción (FR-014). `lastUsedAt` se actualiza al usarlo, solo para la
  lista. Las filas vencidas las borra el `MaintenanceCron` (un paso nuevo, aislado como los demás).
- **Alternatives**: plazo deslizante (un dispositivo robado quedaría recordado para siempre si se usa).

## R5 — Olvidar todos los dispositivos: dentro de la transacción de cada evento

- **Decision**: `TrustedDeviceRepositoryPort.deleteAllForUserWithTx` se llama dentro de la transacción
  que ya existe en `ChangePasswordHandler`, `ResetPasswordHandler`, `DisableMfaHandler`, en la nueva de
  `RegenerateRecoveryCodesHandler` y en la de confirmar cambio de método. Cuenta eliminada: cascada.
- **Rationale**: FR-012 y SC-003 al 100%: si la transacción del evento confirma, los dispositivos ya
  no existen; mismo criterio de atomicidad que specs/024 usó para cerrar sesiones.

## R6 — Uso del dispositivo recordado en el login

- **Decision**: `LoginHandler` recibe el token de la cookie (el controller lo lee). Tras validar la
  contraseña y si la cuenta tiene verificación activa: busca la fila por `SHA-256(token)`; si existe,
  es de esta cuenta y no venció, emite la sesión directamente (sin pending token) y actualiza
  `lastUsedAt`. Si no, el flujo de siempre. El bloqueo por contraseña corre antes, igual que hoy.
- **Rationale**: la contraseña nunca se salta (FR-009, escenario 2). No cambia el login con llave.

## R7 — Código por correo: nueva tabla-dominio `mfa-code`, organizada por canal

- **Decision**: tabla **`mfa-code`**: `userId`, `purpose` (`LOGIN` | `ENROLL` | `STEP_UP`), `channel`
  (`EMAIL`; enum preparado para `WHATSAPP`), `codeHash`, `expiresAt` (+10 min), `usedAt`, `createdAt`.
  Índice único parcial `(userId, purpose) WHERE usedAt IS NULL`: un solo código activo por propósito.
  Emitir = en su propia transacción, marcar usado el activo anterior e insertar el nuevo (mismo patrón
  que `EmailTokenRepositoryPort.issue`). El envío pasa por un **`MfaCodeSender`** con una
  implementación por canal (`EmailMfaCodeSender` sobre el `EMAIL_SENDER` existente); el flujo solo
  conoce el puerto (FR-027).
- **Rationale**: reutilizar `email-token` mezclaría enlaces con códigos y amarraría el canal al correo.
  Una tabla propia respeta el Principio VI y deja el canal como dato.
- **Alternatives**: guardar el código en la fila del usuario (no hay historial para límites por hora y
  rompe "un código por propósito"); guardar en el JWT pendiente (no se puede invalidar al reenviar).

## R8 — Hash del código: HMAC-SHA256 con llave derivada, sin variable nueva

- **Decision**: `codeHash = HMAC-SHA256(k, "<mfaCodeId>:<code>")`, con `k = HKDF-SHA256(MFA_ENCRYPTION_KEY,
info="fik/mfa-code")`. La comparación es en tiempo constante contra el código activo de
  `(userId, purpose)`.
- **Rationale**: un código de 6 dígitos tiene solo 10⁶ valores: un hash sin llave (o bcrypt) se revierte
  offline en segundos si se filtra la base. Con HMAC de llave de servidor, la base sola no basta. Derivar
  de `MFA_ENCRYPTION_KEY` (ya obligatoria y ya en Parameter Store) evita una variable nueva que haría
  fallar el despliegue si falta. Incluir el id en el mensaje evita que dos filas tengan el mismo hash.
- **Alternatives**: variable `MFA_CODE_SECRET` nueva (otro secreto que crear antes de desplegar, sin
  ganancia real); bcrypt (no resiste fuerza bruta offline de 10⁶).

## R9 — Envío y límites de reenvío

- **Decision**: `issueAndSend(user, purpose)`: rechaza si el último envío del propósito fue hace < 60 s
  o si hubo ≥ 5 en la última hora (`MFA_CODE_RATE_LIMITED`, 429, con `retryAfterSeconds`), emite el
  código y lo envía al **correo confirmado** (`User.email` con `emailVerified`). Correo con plantilla
  nueva `mfa-code` (es/en, layout existente, sin datos financieros, "nadie de fik te lo pedirá").
  Un fallo del proveedor se registra; el código queda emitido (la persona puede reenviar o usar un
  código de recuperación).
- **Rationale**: mismos números que el límite de enlaces por correo (specs/032).

## R10 — Login con método correo

- **Decision**: `LoginHandler`, con método `EMAIL` y sin dispositivo recordado, emite y envía un código
  `LOGIN` después del commit de la contraseña y devuelve `{ mfaRequired: true, mfaMethod: "email",
codeSent }`. Nuevo `POST /auth/login/mfa-resend` (lee el pending cookie) para reenviar.
  `VerifyMfaLoginHandler` valida, dentro de su transacción con fila bloqueada, según el método:
  código de recuperación (formato), TOTP, o **consumo atómico** del código `LOGIN` (`UPDATE … WHERE
id = ? AND usedAt IS NULL AND expiresAt > now`). Un fallo cuenta en `mfaFailedAttempts` (FR-021).
- **Rationale**: un solo contador para todos los códigos, como hoy entre login y step-up.

## R11 — Método de verificación en el usuario

- **Decision**: `User.mfaMethod` (`TOTP` | `EMAIL`, nullable) y `User.mfaPendingMethod` (nullable). La
  migración pone `mfaMethod = 'TOTP'` a quien tiene `mfaEnabled = true` (backfill en el mismo SQL). El
  código existente sigue leyendo `mfaEnabled`; el viejo código del API (durante el despliegue) ignora las
  columnas nuevas, y una fila con `mfaEnabled` y `mfaMethod` nulo se trata como `TOTP`.
- **Rationale**: expandir sin romper (despliegue sin corte: migración antes del cambio de contenedor).

## R12 — Activar y cambiar de método

- **Decision**: `POST /auth/me/mfa/enroll` acepta `{ method: "totp" | "email" }` (sin cuerpo = `totp`,
  compatibilidad). Sin verificación activa: como hoy. **Con** verificación activa: es un cambio de
  método y exige step-up reciente (en vez de `MFA_ALREADY_ENABLED`). `totp` guarda el secreto pendiente
  (como hoy); `email` exige correo confirmado (`MFA_EMAIL_NOT_VERIFIED`) y envía un código `ENROLL`.
  `POST /auth/me/mfa/confirm` valida según `mfaPendingMethod`. Activación: genera los 10 códigos como
  hoy. Cambio: conserva los códigos de recuperación, borra el secreto TOTP si se pasa a correo, olvida
  los dispositivos recordados y publica `MFA_METHOD_CHANGED`.
- **Rationale**: un solo par de endpoints, sin ruta paralela. El step-up evita que una sesión robada
  cambie el segundo factor.

## R13 — Step-up con código por correo

- **Decision**: `auth.stepUpMethodsFor({ mfaMethod, passkeyCount })`: `totp` si el método es TOTP,
  `email` si es EMAIL, `passkey` si hay llaves, `password` solo si no hay ninguno. Nuevo
  `POST /auth/sessions/step-up/email-code` envía un código `STEP_UP`; `POST /auth/sessions/step-up`
  acepta `{ method: "email", code }`, con el mismo contador y bloqueo. Un código de recuperación nunca
  completa un step-up (FR-002).
- **Rationale**: FR-024; la web ya tiene `StepUpPanel`/`useStepUp`, solo suma una opción.

## R14 — Avisos de seguridad nuevos

- **Decision**: `AccountSecurityKind` suma `RECOVERY_CODES_REGENERATED`, `TRUSTED_DEVICE_ADDED` (con la
  etiqueta del dispositivo) y `MFA_METHOD_CHANGED`. La plantilla `security-notice` y su i18n los cubren.
- **Rationale**: el listener existente ya envía en segundo plano, solo a correo confirmado (specs/032).

## R15 — Web y sitio público

- **Decision**:
  - **Paso del segundo factor** (vive en `apps/landing`, panel de acceso, `LoginForm`): texto según
    `mfaMethod`, botón "Reenviar código" con la espera que devuelve el API, casilla "Recordar este
    dispositivo por 30 días".
  - **Perfil → Seguridad** (`apps/web`, `SecuritySection`): selector de método al activar (con el aviso
    de que el correo es menos seguro y deshabilitado sin correo confirmado), "Cambiar método",
    "Generar códigos nuevos" (step-up vía `useStepUp`, muestra una vez con copiar/descargar), conteo de
    códigos restantes, lista "Dispositivos recordados" con "Quitar". `StepUpPanel` suma el método correo.
  - `@finance/client`: métodos nuevos en `authApi`.
- **Rationale**: el login vive en el sitio público desde specs/031; Seguridad en la app.
