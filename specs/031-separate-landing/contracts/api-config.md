# Contract: configuración del API y registro (031)

## `CORS_ORIGIN` (cambia de formato, compatible)

```text
# antes (sigue siendo válido)
CORS_ORIGIN="http://localhost:5173"
# ahora: lista separada por comas
CORS_ORIGIN="http://localhost:4321,http://localhost:5173"
# producción
CORS_ORIGIN="https://cuadra.cl,https://app.cuadra.cl"
```

- `main.ts` → `app.enableCors({ origin: allowedOrigins, credentials: true })`. Un origen fuera de la
  lista no recibe `Access-Control-Allow-Origin`, así que el navegador bloquea la respuesta.
- Valor mal formado (no `http(s)://host[:port]`, con path o barra final) → el API **no arranca**.

## `PASSKEY_RP_ID` (nueva, opcional)

```text
PASSKEY_RP_ID="cuadra.cl"   # producción
# local: se omite → hostname del primer origen = "localhost"
```

- WebAuthn `rpID` = `PASSKEY_RP_ID` ?? hostname del primer origen.
- WebAuthn `expectedOrigin` = **todos** los orígenes de `CORS_ORIGIN` (arreglo).
- Arranque falla si el host de algún origen no es `rpId` ni subdominio de él.
- Afecta a: inicio de registro/confirmación de llave, inicio/verificación de login con llave,
  inicio/verificación de verificación de identidad con llave.

## `POST /api/v1/auth/register` — cuerpo (aditivo)

```jsonc
{
  "name": "…", "email": "…", "password": "…", "identifierValue": "…", "birthDate": "…",
  "sensitiveDataConsent": true,
  "guardianAuthorization": { /* igual que hoy, solo menores */ },
  "locale": "en"            // NUEVO, opcional: "es" | "en"
}
```

- Ausente → la cuenta se crea con `locale = "es"` (comportamiento actual).
- Valor fuera del enum → `400` con el mismo formato de error de validación de siempre.
- Respuesta, cookies y errores sin cambios.

## Sin cambios

`POST /auth/login`, `/auth/login/mfa-verify`, `/auth/login/passkey-options`, `/passkey-verify`,
`/auth/refresh`, `/auth/logout`, `GET /auth/me`: mismas formas, mismas cookies (`httpOnly`,
`SameSite=Lax`, host-only del API).
