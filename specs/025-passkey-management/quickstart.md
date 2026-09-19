# Quickstart: Renombrar passkeys y autocompletado condicional

## Escenario 1 — Renombrar

1. Con una llave ya registrada, `PATCH /auth/me/passkeys/:id` con `{name: "Nuevo nombre"}` y las
   cookies del dueño → `200`, la respuesta trae el nuevo nombre, `createdAt`/`lastUsedAt` intactos.
2. Repetir con las cookies de OTRO usuario (o un id inexistente) → `404 PASSKEY_NOT_FOUND`.
3. Repetir con `{name: ""}` o un nombre de 61+ caracteres → `400`, el nombre en BD no cambia.

## Escenario 2 — Autocompletado condicional (manual, requiere navegador real)

1. Registrar una passkey desde Perfil → Seguridad en un navegador con soporte (Chrome/Safari
   recientes).
2. Cerrar sesión, ir a `/login`.
3. Hacer clic en el campo de email SIN escribir nada — el navegador debería ofrecer la passkey como
   sugerencia de autocompletado (icono de llave nativo del navegador).
4. Elegirla debe completar el login exactamente como el botón explícito "Iniciar sesión con llave de
   acceso" (verificar en Network que pega a los mismos dos endpoints).
5. En Firefox (sin soporte de conditional UI): confirmar que no aparece ningún error en consola y que
   el botón explícito sigue funcionando igual.

## Resultado esperado

SC-001 a SC-004 de `spec.md` se cumplen.
