# Implementation Plan: Verificación en dos pasos más completa

**Branch**: `dev` (sin rama propia) | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/040-mfa-options/spec.md`

## Summary

Tres mejoras a la verificación en dos pasos, en orden de entrega: **(US1)** regenerar los 10 códigos de
recuperación tras un step-up, reemplazándolos en una sola transacción; **(US2)** "recordar este
dispositivo" 30 días con una cookie httpOnly cuyo token solo existe en la base como SHA-256 (tabla nueva
`trusted-device`), revocable en Seguridad y olvidada en cada evento sensible; **(US3)** código de 6
dígitos por correo como método alternativo a TOTP, en una tabla nueva `mfa-code` organizada por canal,
con HMAC de llave derivada de `MFA_ENCRYPTION_KEY`, un código activo por propósito y los mismos límites
de intentos. Detalle de cada decisión en [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript, Node 22.

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs`, Prisma 7 (PostgreSQL 16), zod (`@finance/contracts`),
`otpauth` (existente), `node:crypto` (HMAC, HKDF, SHA-256, `randomBytes`), React 19 (web), Astro 7 +
React en el panel de acceso (landing). **Sin dependencias nuevas.**

**Storage**: PostgreSQL. Migración expansiva: `user.mfaMethod`, `user.mfaPendingMethod`, tablas
`trusted-device` y `mfa-code`, 3 enums. Índice único parcial a mano en `mfa-code`.

**Testing**: Vitest — unit (fakes, sin base), integration y e2e contra Postgres desechable
(`pnpm test:integration:local`), web y landing con Testing Library.

**Target Platform**: API en EC2 (Docker), app y sitio en Cloudflare Pages.

**Project Type**: Monorepo web (api + web + landing + packages).

**Performance Goals**: el login con dispositivo recordado agrega una búsqueda indexada por hash; el envío
del código no bloquea la respuesta más allá del envío al proveedor.

**Constraints**: despliegue sin corte (migración compatible con el código anterior; contrato aditivo);
correo solo en producción; ningún secreto nuevo.

**Scale/Scope**: ~10 endpoints tocados o nuevos, 2 tablas, 3 pantallas/paneles.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Money**: no aplica (no hay montos).
- **II. Aislamiento por usuario**: todas las consultas nuevas filtran por `userId` (de `@CurrentUser` o del
  pending token firmado). `DELETE /me/mfa/trusted-devices/:id` borra con `WHERE id AND userId` (404 si no
  es propio). Una cookie de otra cuenta no salta el segundo factor (la fila se compara con la cuenta que
  pasó la contraseña). ✅
- **III. i18n**: textos de Seguridad, del paso del segundo factor, de los correos (código y avisos) y de
  los errores en es/en, con sus tests de paridad. ✅
- **IV. Test-first**: cada historia empieza por sus tests (unit del agregado y handlers con fakes,
  integration de los adapters, e2e HTTP). ✅
- **V. SDD y memoria viva**: este ciclo; al cerrar, constitución (conteo de tablas 35 → 37, Principio VI)
  y `CLAUDE.md`. ✅
- **VI. Una tabla = un dominio**: `trusted-device` y `mfa-code` son dominios-tabla nuevos con `domain/` +
  `infrastructure/` y su `*.data.module.ts` hoja; los comandos viven en `user` (como `passkey`,
  `mfa-recovery-code`, `session`). Ningún adapter toca tablas ajenas. ✅
- **VII. Idempotencia**: declarada por endpoint en [contracts/http.md](./contracts/http.md): reenvíos y
  step-up por correo = (b) índice único parcial; regenerar códigos = (a) consume el step-up con UPDATE condicional; quitar
  dispositivo = (a); login/verify/enroll/confirm no cambian su forma actual. Ninguno mueve dinero. ✅
- **VIII. Identificadores**: las dos tablas usan UUID v7; `:id` de dispositivo validado con `rowId`. El
  token del dispositivo y el código no son identificadores de fila. ✅

**Data gates:**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de Identificadores
      (UUID v7 en `trusted-device` y `mfa-code`).
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface
      (tabla en contracts/http.md).
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership: no hay FK
      en cuerpos; el único id externo es `:id` del dispositivo, verificado por `userId` en el adapter.

**Re-check post-design**: sin violaciones; no hace falta Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/040-mfa-options/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/http.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/auth/index.ts          # mfaMethod, login response, enroll/confirm, step-up email,
                                              # recovery-codes, trusted devices, stepUpMethodsFor
packages/client/src/authApi.ts                # métodos nuevos

apps/api/prisma/schema.prisma                 # user.mfaMethod/mfaPendingMethod, TrustedDevice, MfaCode, enums
apps/api/prisma/migrations/<ts>_mfa_options/  # + backfill TOTP + índice único parcial
apps/api/src/domains/
├── trusted-device/                           # NUEVO: domain/ (entidad, puerto) + infrastructure/ + data.module
├── mfa-code/                                 # NUEVO: domain/ (entidad, puerto, propósito/canal) + infrastructure/
├── user/
│   ├── domain/user.aggregate.ts              # mfaMethod, pending method, cambio de método
│   ├── domain/events/account-security.event.ts   # 3 kinds nuevos
│   ├── application/mfa-code-service.ts       # emitir + límites + enviar por canal (MfaCodeSender)
│   ├── application/mfa-code-hash.ts          # HKDF + HMAC, comparación en tiempo constante
│   ├── application/trusted-device-cookie.ts  # token, hash, opciones de cookie
│   ├── application/commands/                 # regenerate-recovery-codes, resend-mfa-login-code,
│   │                                         # send-step-up-email-code, remove-trusted-device (+ cambios en
│   │                                         # login, verify-mfa-login, start/confirm-mfa-enrollment,
│   │                                         # verify-step-up, change-password, reset-password, disable-mfa)
│   ├── application/queries/list-trusted-devices.*
│   └── presentation/auth.controller.ts       # rutas nuevas, cookie mfa_trusted
├── infra/email/templates/mfa-code.ts         # correo con el código (es/en)
└── infra/cron/maintenance.cron.ts            # + purga de dispositivos vencidos y códigos viejos
apps/api/test/{unit,integration,e2e}/...      # espejo de lo anterior

apps/landing/src/domains/auth/components/LoginForm.tsx   # método, reenviar, recordar
apps/web/src/domains/profile/components/
├── SecuritySection.tsx                       # método, códigos nuevos, dispositivos recordados
├── MfaEnrollmentPanel.tsx                    # elegir app o correo
├── RecoveryCodesPanel.tsx                    # NUEVO: mostrar una vez, copiar/descargar
├── TrustedDevicesList.tsx                    # NUEVO
└── StepUpPanel.tsx                           # + método correo
packages/i18n/src/{es,en}.json               # textos
```

**Structure Decision**: monorepo existente. Backend en `user` + dos dominios-tabla hoja; UI de login en
`apps/landing` (panel de acceso), UI de Seguridad en `apps/web`.

## Delivery order

US1 → US2 → US3 (la spec), cada una cerrada con sus tests antes de la siguiente. La migración se escribe
una sola vez al inicio con todo el esquema (expansiva), para no encadenar tres migraciones.

## Risks

- **Correo fuera de producción**: el método correo no se puede probar a mano sin activar el envío
  local; los e2e usan el buzón en memoria.
- **Cliente viejo en caché** durante el despliegue: el contrato es aditivo (`mfaMethod` opcional para el
  cliente, `rememberDevice` opcional), así que un panel de acceso viejo sigue funcionando con TOTP.
- **Cuenta con método correo y correo sin confirmar** (caso borde): entra con un código de recuperación y
  cambia de método; documentado en la spec.

## Complexity Tracking

Sin violaciones.
