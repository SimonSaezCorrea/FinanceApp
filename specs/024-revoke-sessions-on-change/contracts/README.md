# Contracts: Revocar sesiones al cambiar credenciales

## Sin cambio de contrato HTTP público

Los dos endpoints involucrados **no cambian su forma de request ni de response**:

- `POST /auth/me/password` — sigue aceptando `{ currentPassword, newPassword }`
  (`auth.changePasswordRequestSchema`, `packages/contracts`) y respondiendo `204 No Content`. Un
  cliente que ya integró este endpoint no necesita cambiar nada.
- `POST /auth/me/mfa/disable` — sigue aceptando `{ password }`
  (`auth.disableMfaRequestSchema`) y respondiendo `204 No Content`.

Lo único que cambia es un **efecto colateral interno**: ambas operaciones, al tener éxito, ahora
también cierran las demás sesiones activas del usuario (mismo efecto observable que ya produce
`POST /auth/sessions/revoke-others`, documentado en specs/023). Un cliente puede notar esto
indirectamente — su OTRA sesión (otro dispositivo/pestaña) dejará de poder autenticar peticiones o
refrescar su token — pero eso es exactamente el comportamiento que ya expone
`GET /auth/sessions` (`closedAt` pasa de `null` a una fecha) y `POST /auth/sessions/:id` / `POST
/auth/sessions/revoke-others`, sin ninguna forma nueva.

## Nuevos códigos de error

Ninguno. El único camino de fallo nuevo (la revocación de sesiones falla dentro de la transacción)
se propaga como el mismo error interno que ya maneja `AllExceptionsFilter` para cualquier fallo de
`$transaction` no capturado — no se introduce un `DomainError` con código propio, porque no es un
error de VALIDACIÓN de negocio (como `INVALID_CURRENT_PASSWORD`), es una falla de infraestructura que
ya cuenta con su manejo genérico.

## Interfaz interna extendida (no HTTP)

Ver `../data-model.md` — `SessionRepositoryPort.closeAllExceptForUserWithTx` es la única superficie
nueva, y es un método de un puerto de dominio interno (TypeScript), nunca expuesto por HTTP.
