# Quickstart — validar los correos de cuenta en local (032)

## Requisitos

- Postgres local arriba y migraciones aplicadas: `pnpm db:migrate`.
- `apps/api/.env` con `RESEND_API_KEY` (una clave de Resend de pruebas) y
  `PUBLIC_SITE_URL=http://localhost:4321`.
- Para enviar en local, invertir a mano la condición de `production` en
  `apps/api/src/infra/email/email.config.ts` (y revertirla al terminar). Sin ese cambio no se
  envía nada y los endpoints de enlaces responden `503 EMAIL_UNAVAILABLE`.
- Registrarse con una dirección propia: los correos llegan a esa bandeja.
- `pnpm dev` (API :3001, app :5173, sitio :4321).

## Escenarios

1. **Verificar al registrarse (US1)**
   - Crear una cuenta en `http://localhost:4321/es/?acceso=registro`.
   - Llega "Confirma tu correo" a la bandeja; la app muestra el aviso "Confirma tu correo".
   - Abrir el enlace del correo → el sitio dice "Correo confirmado"; al volver a la app el aviso ya no
     está.
   - Abrir el mismo enlace otra vez → "Este enlace ya no sirve".

2. **Cambiar el correo (US1, registro de correos)**
   - Perfil → Información personal → cambiar el correo: queda "pendiente"; el principal sigue siendo
     el anterior. Llega un correo de verificación a la dirección nueva.
   - Confirmarlo → la nueva pasa a principal y la anterior al historial; llega el aviso de cambio a la
     anterior.
   - Borrar la anterior del historial → desaparece. El principal no ofrece borrar.

3. **Recuperar la contraseña (US2)**
   - Con una sesión abierta en otra ventana, en el acceso: "¿Olvidaste tu contraseña?" → escribir el
     RUT → mensaje genérico.
   - Abrir el enlace del correo "Elige una contraseña nueva" → elegir contraseña nueva → entrar con ella.
   - La otra ventana pierde la sesión. Si la cuenta tiene segundo factor, se pide al entrar.
   - Repetir con un RUT inexistente → mismo mensaje, ningún correo enviado.
   - Repetir con una cuenta sin el correo confirmado → mismo mensaje, ningún correo enviado.

4. **Avisos de seguridad (US3)** — con el correo confirmado:
   cambiar la contraseña, activar/desactivar el segundo factor, agregar/eliminar una llave de acceso,
   eliminar la cuenta. Cada acción envía su aviso en el idioma de la cuenta.

5. **Producción sin envío (US4)** — `NODE_ENV=production` sin `RESEND_API_KEY`: registrarse funciona;
   "Reenviar correo" muestra que el envío no está disponible; la recuperación responde lo mismo de
   siempre.

## Tests

- `pnpm --filter @finance/api test:unit` — plantillas (paridad es/en, escape HTML), elección del
  adaptador, reglas de `user-email` y `email-token`.
- `pnpm --filter @finance/api test:integration` — consumo atómico del token (dos usos simultáneos →
  uno gana), índices parciales, migración de datos.
- `pnpm --filter @finance/api test:e2e` — cada endpoint de `contracts/http.md`, con
  `InMemoryEmailSender` para leer los enlaces.
- `pnpm --filter @finance/landing test` y `pnpm --filter @finance/web test` — páginas de
  verificación/recuperación, aviso de correo sin confirmar, registro de correos en el Perfil.
