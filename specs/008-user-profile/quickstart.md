# Quickstart: validar Perfil de Usuario end-to-end

## Prerrequisitos

- `pnpm install`, `apps/api/.env` configurado (ver `CLAUDE.md`), Postgres corriendo (Docker: `pnpm db:reset` si hace falta re-sembrar).
- `pnpm --filter @finance/api exec prisma generate` después de aplicar el cambio de schema.
- `pnpm --filter @finance/api exec prisma db push` para aplicar los campos nuevos de `User`.
- `pnpm dev` (levanta `apps/api` + `apps/web`).
- Usuario demo: `demo@finance.local` / `demo1234` (ver memoria de auth del proyecto).

## Escenarios a validar manualmente (mapeados a los User Stories del spec)

1. **Ver perfil (US1)**: login → clic en el bloque de usuario del sidebar → llega a `/profile` → se
   ven avatar (iniciales), nombre, email, badge "Plan personal", y las 3 estadísticas con valores
   reales (compararlas contra `/accounts` y `/transactions` filtrados al mes actual).
2. **Editar nombre/email (US2)**: cambiar nombre → verificar que se refleja en el sidebar sin recargar.
   Intentar cambiar el email a uno ya usado por otra cuenta demo → debe rechazar con error visible.
3. **Cambiar contraseña (US3)**: cambiar con la contraseña actual correcta → cerrar sesión → volver a
   entrar con la nueva contraseña. Repetir con la contraseña actual incorrecta → debe rechazar.
4. **Preferencias (US4)**: cambiar idioma a inglés → la UI cambia de inmediato. Cambiar moneda/formato
   de fecha → cerrar sesión → volver a entrar (idealmente desde otro navegador) → las preferencias
   siguen aplicadas. Activar/desactivar "Tema oscuro" desde Perfil → debe reflejarse también en el
   toggle del sidebar (misma preferencia).
5. **Desactivar cuenta (US5)**: clic en "Eliminar cuenta" → pide contraseña → confirmar → la sesión
   termina → intentar login de nuevo con esas credenciales → debe rechazar con `ACCOUNT_DISABLED`.
   (Usar un usuario de prueba dedicado, no el demo compartido, para no perder acceso a él.)
6. **Placeholders + logout (US6)**: los switches de 2FA y notificaciones se ven pero no persisten
   ningún cambio real al recargar. "Cerrar sesión" funciona igual que en el resto de la app.

## Automatizado (Vitest)

- `apps/api`: `auth.service.spec.ts` — casos de `changePassword` (éxito/rechazo), `deactivate`
  (éxito/rechazo, y que un login posterior falle), `updatePreferences` (persistencia).
- `apps/web`: tests de componente para el formulario de Perfil (mirror de `ui.test.tsx`) cubriendo
  validación de email duplicado/; formato inválido, y que los switches inertes no disparen mutaciones.
- Gate de done: `pnpm check:boundaries && pnpm typecheck && pnpm test && pnpm build`.
