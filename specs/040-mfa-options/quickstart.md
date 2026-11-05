# Quickstart: validar 040 de punta a punta

## Prerrequisitos

- `pnpm install`, Docker (para `pnpm test:integration:local`), `apps/api/.env` como siempre.
- Fuera de producción no se envía correo: las pruebas e2e usan el buzón en memoria
  (`test/e2e/support/email-outbox.ts`). Para probar a mano el método por correo hay que activar el
  envío local cambiando a mano el chequeo de `email.config.ts` (ver CLAUDE.md, specs/032).

## Pruebas automatizadas (por tier, acotadas a lo tocado)

```bash
pnpm --filter @finance/contracts test
pnpm --filter @finance/api test:unit -- test/unit/domains/user test/unit/domains/trusted-device test/unit/domains/mfa-code
pnpm test:integration:local test/integration/domains/user test/integration/domains/trusted-device test/integration/domains/mfa-code test/e2e/domains/user
pnpm --filter @finance/web test -- src/domains/profile
pnpm --filter @finance/landing test -- src/domains/auth
```

## Escenarios (ver spec)

1. **Códigos nuevos (US1)**: con TOTP activo, `POST /auth/sessions/step-up` (totp) →
   `POST /auth/me/mfa/recovery-codes` → 10 códigos; un código viejo en `login/mfa-verify` →
   `INVALID_MFA_CODE`; uno nuevo → entra. Sin step-up → `STEP_UP_REQUIRED`. Llega el aviso
   `RECOVERY_CODES_REGENERATED` al buzón.
2. **Recordar dispositivo (US2)**: `login` → `mfa-verify` con `rememberDevice: true` → cookie
   `mfa_trusted`; `logout`; `login` con la misma cookie → `mfaRequired: false`. Con contraseña incorrecta
   → `INVALID_CREDENTIALS`. Con la cookie de otra cuenta → `mfaRequired: true`. `POST /auth/me/password`
   → la cookie deja de servir. `DELETE /auth/me/mfa/trusted-devices/:id` → idem para ese dispositivo.
3. **Código por correo (US3)**: `POST /auth/me/mfa/enroll {method:"email"}` → código en el buzón →
   `confirm` → activo + 10 códigos. `login` → `{ mfaRequired, mfaMethod:"email", codeSent:true }` →
   código del buzón en `mfa-verify` → entra. Reusar el código → rechazo. `mfa-resend` dos veces en < 60 s →
   429 con `retryAfterSeconds`. Código anterior tras reenviar → rechazo. 5 incorrectos → `MFA_LOCKED`.
4. **Cambio de método**: con TOTP activo y step-up, `enroll {method:"email"}` + `confirm` → método
   correo, códigos de recuperación intactos, dispositivos recordados olvidados.

## En la app

- Perfil → Seguridad: activar eligiendo método; "Generar códigos nuevos"; "Dispositivos recordados".
- Panel de acceso del sitio: el paso del segundo factor muestra el método, "Reenviar código" y
  "Recordar este dispositivo por 30 días".
