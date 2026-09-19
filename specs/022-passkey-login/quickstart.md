# Quickstart: validar passkeys de punta a punta

Prerrequisitos: API corriendo (`pnpm --filter @finance/api dev`), Postgres arriba, `.env` con
`PASSKEY_CHALLENGE_SECRET` (string largo random) agregado. `db push` tras el cambio de schema.

**Nota**: un flujo de passkey real requiere un autenticador de verdad (el navegador, con Windows
Hello / Touch ID / una llave de seguridad) — no es practicable por `curl`. La validación de punta a
punta de esta feature se hace principalmente vía el navegador (`http://localhost:5173`) y vía los
tests e2e del backend, que usan `@simplewebauthn/server`'s propias utilidades de test para simular
un autenticador virtual sin hardware real.

## 1. Registrar una llave (US1) — navegador

1. Iniciar sesión normal en `http://localhost:5173`.
2. Perfil → Seguridad → "Llave de acceso" → Configurar.
3. El navegador pide confirmar con el dispositivo (Windows Hello, Touch ID, o una llave USB si hay
   una conectada).
4. Ponerle un nombre. **Esperado**: aparece en la lista con su fecha de registro.

## 2. Iniciar sesión con la llave (US2) — navegador

1. Cerrar sesión.
2. En el login, escribir el email y elegir "Iniciar sesión con llave de acceso" (en vez de
   contraseña).
3. Confirmar con el dispositivo. **Esperado**: entra directo, sin que se pida contraseña ni,
   si tiene MFA activo, el código TOTP.

## 3. Gestionar llaves (US3) — navegador

1. Perfil → Seguridad → "Llave de acceso" → ver la lista (nombre, fecha de registro, último uso).
2. Eliminar una. **Esperado**: desaparece de la lista; intentar usarla en un login posterior falla.
3. Eliminar la ÚLTIMA llave. **Esperado**: el login con email+contraseña (y TOTP si aplica) sigue
   funcionando exactamente igual — nunca queda sin forma de entrar.

## 4. Anti-enumeración (FR-005a) — backend

```sh
curl -X POST http://localhost:3000/api/v1/auth/login/passkey-options \
  -H "Content-Type: application/json" -d '{"email":"nadie@existe.local"}'
# {"options": {...}} — misma FORMA que para un email real con llaves, allowCredentials vacío
```

**Esperado**: la respuesta nunca distingue "email no existe" de "email existe sin llaves" de
"email existe con llaves" — siempre `200` con la misma forma.
