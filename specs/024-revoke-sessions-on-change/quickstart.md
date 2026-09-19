# Quickstart: Revocar sesiones al cambiar credenciales

Valida de punta a punta que cambiar la contraseña o desactivar MFA cierra las demás sesiones,
manteniendo viva solo la que hizo el cambio.

## Prerrequisitos

- API corriendo (`pnpm --filter @finance/api dev`) contra una Postgres real (`pnpm db:push` +
  `pnpm db:seed` si es un entorno nuevo).
- Un usuario de prueba con contraseña conocida (el seed ya trae uno — ver `apps/api/prisma/seed.ts`).

## Escenario 1 — Cambiar la contraseña cierra las demás sesiones

1. Iniciar sesión dos veces con el mismo usuario, en dos "clientes" distintos (dos pestañas en
   modo incógnito distinto, o dos llamadas `POST /auth/login` guardando cada cookie por separado) —
   quedan sesión A y sesión B.
2. `GET /auth/sessions` con las cookies de A → confirmar 2 filas, ambas con `closedAt: null`.
3. `POST /auth/me/password` con las cookies de A, `{ currentPassword, newPassword }` correcto →
   `204`.
4. `GET /auth/sessions` con las cookies de A → sigue funcionando, B aparece con `closedAt` seteado.
5. Cualquier request autenticado con las cookies de B (ej. `GET /auth/me`) → `401` (la sesión ya no
   existe como activa para `JwtAuthGuard`).
6. Repetir el paso 3 con una `currentPassword` INCORRECTA → `400 INVALID_CURRENT_PASSWORD`, y
   repetir el paso 5 con una sesión C nueva (no B, que ya se cerró) → sigue funcionando (nada se
   cerró por el intento fallido).

## Escenario 2 — Desactivar MFA cierra las demás sesiones

1. Con un usuario que tiene MFA activo, repetir los pasos 1-2 del escenario 1 (sesiones A y B).
2. `POST /auth/me/mfa/disable` con las cookies de A, `{ password }` correcto → `204`.
3. Repetir los pasos 4-5 del escenario 1 (A sigue viva, B ya no).

## Escenario 3 — Atomicidad (validación en test de integración, no manual)

No es reproducible manualmente sin instrumentar el código (requiere forzar un fallo dentro de la
transacción) — ver `apps/api/test/integration/domains/user/application/change-password.integration.spec.ts`
y su equivalente de MFA, que fuerzan un error en `closeAllExceptForUserWithTx` (mock del puerto) y
verifican que la contraseña/el estado de MFA NO cambiaron.

## Frontend

1. Iniciar sesión en dos navegadores/perfiles distintos con el mismo usuario.
2. En el navegador A, ir a Perfil → Seguridad → "Cambiar" (contraseña) → confirmar que el diálogo
   muestra el aviso "esto cerrará tus demás sesiones" ANTES del botón de guardar.
3. Completar el cambio → en el navegador B, cualquier acción autenticada redirige a login.
4. En A, la lista de "Sesiones y dispositivos" ya no muestra a B como activa sin necesidad de
   recargar la página (invalidación de la query `["sessions"]`).
5. Repetir 2-4 con "Desactivar verificación en dos pasos" en vez de cambiar la contraseña.

## Resultado esperado

Los 4 criterios de éxito de `spec.md` (SC-001 a SC-004) se cumplen, más SC-005 (el aviso aparece
ANTES de confirmar, nunca después).
