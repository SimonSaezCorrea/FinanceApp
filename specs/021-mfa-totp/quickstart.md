# Quickstart: validar MFA de punta a punta

Prerrequisitos: API corriendo (`pnpm --filter @finance/api dev`), Postgres arriba, `.env` con
`MFA_ENCRYPTION_KEY` (32 bytes, p.ej. `openssl rand -hex 32`) y `MFA_PENDING_TOKEN_SECRET` (string
largo random) agregados. `db push` tras el cambio de schema (dev, sin migración).

## 1. Activar MFA (US1)

```sh
# login normal, guarda cookies en cookies.txt
curl -c cookies.txt -b cookies.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"test@finance.local","password":"demo1234"}'
# {"mfaRequired":false,"user":{...}}  ← aún sin MFA

curl -c cookies.txt -b cookies.txt -X POST http://localhost:3000/api/v1/auth/me/mfa/enroll
# {"qrCodeDataUrl":"data:image/png;base64,...","secret":"JBSWY3DPEHPK3PXP"}
```

Cargar `secret` en una app TOTP (o calcular el código con `otpauth`/`oathtool -b --totp SECRET`),
luego:

```sh
curl -c cookies.txt -b cookies.txt -X POST http://localhost:3000/api/v1/auth/me/mfa/confirm \
  -H "Content-Type: application/json" -d '{"code":"123456"}'
# {"recoveryCodes":["AB3D-9F2K", ... 10 códigos]}
```

**Esperado**: `GET /auth/me` ahora muestra `mfaEnabled: true`, `mfaRecoveryCodesRemaining: 10`.

## 2. Login con MFA activo (US2)

```sh
curl -c cookies2.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"test@finance.local","password":"demo1234"}'
# {"mfaRequired":true}  ← sin sesión todavía, solo cookie mfa_pending_token

curl -c cookies2.txt -b cookies2.txt -X POST http://localhost:3000/api/v1/auth/login/mfa-verify \
  -H "Content-Type: application/json" -d '{"code":"123456"}'
# {"user":{...}}  ← sesión completa, cookies access_token/refresh_token
```

**Esperado**: un código incorrecto responde `401 INVALID_MFA_CODE` y NO entrega cookies de sesión;
5 incorrectos seguidos responden `429 MFA_LOCKED` incluso con el código correcto después.

## 3. Login con código de recuperación (US4)

Repetir el paso 2 pero enviando `{"code":"AB3D-9F2K"}` (uno de los 10 mostrados en el paso 1) en vez
del TOTP. **Esperado**: funciona una vez; reintentar el MISMO código responde `401
INVALID_MFA_CODE`; `mfaRecoveryCodesRemaining` baja de 10 a 9.

## 4. Desactivar MFA (US3)

```sh
curl -c cookies.txt -b cookies.txt -X POST http://localhost:3000/api/v1/auth/me/mfa/disable \
  -H "Content-Type: application/json" -d '{"password":"demo1234"}'
# 204
```

**Esperado**: `GET /auth/me` vuelve a `mfaEnabled: false`; un login posterior ya no pide segundo
paso; los códigos de recuperación restantes (paso 3) ya no funcionan si se reactiva MFA de nuevo
(se generan 10 códigos nuevos).

## Frontend

`http://localhost:5173/profile` → sección Seguridad → switch "Verificación en dos pasos" dispara el
mismo flujo (QR real, campo de código, pantalla de códigos de recuperación con copiar, y el
`ConfirmModal` de reingresar contraseña para desactivar). `http://localhost:5173/login` pide el
segundo paso automáticamente cuando `mfaRequired: true`.
