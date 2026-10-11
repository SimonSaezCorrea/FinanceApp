# Implementation Plan: Correos de cuenta y de seguridad

**Branch**: `main` (sin rama de feature) | **Date**: 2026-10-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/032-account-emails/spec.md`

> **Enmienda 2026-10-11:** la captura local en archivos (`FileCaptureEmailSender`,
> `EMAIL_CAPTURE_DIR`, `apps/api/.mail/`) se retiró por decisión del dueño del producto. Fuera de
> producción no se envía nada (`DisabledEmailSender`, los endpoints de enlaces responden
> `503 EMAIL_UNAVAILABLE`). Para probar un envío real en local se invierte a mano la condición de
> `production` en `apps/api/src/infra/email/email.config.ts`, con una `RESEND_API_KEY` en el `.env`.

## Summary

fik empieza a enviar correos: verificación del correo (al registrarse y al cambiarlo), recuperación
de contraseña por RUT y avisos de seguridad. El envío vive en `apps/api/src/infra/email/` detrás de
un puerto con tres adaptadores — Resend (solo en producción con la clave configurada), desactivado
(producción sin clave) y captura en archivos (desarrollo y tests: nunca entrega). Dos tablas nuevas:
el **registro de correos** de cada cuenta (`user-email`: principal / pendiente / historial) y los
**enlaces de un solo uso** (`email-token`, solo el hash). Los enlaces abren dos páginas nuevas del
sitio público. Los avisos salen de un evento de dominio con un listener que nunca hace fallar la
acción que los origina. Decisiones en [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript, Node 22

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs` (API), Prisma 7 (`@prisma/adapter-pg`), Astro 7
(sitio público), Vite + React 19 (app), zod (`@finance/contracts`). **Sin dependencias nuevas**:
Resend se llama con `fetch` nativo (R2).

**Storage**: PostgreSQL 16 — tablas nuevas `user-email` y `email-token`, migración con índices
parciales y migración de datos (primera feature sobre el flujo de migraciones).

**Testing**: Vitest — unit (fakes de puertos, sin base), integration (Postgres real), e2e (HTTP con
`InMemoryEmailSender`); Vitest en web y landing.

**Target Platform**: API en Linux (Docker en EC2 sa-east-1); sitio y app en Cloudflare Pages.

**Project Type**: monorepo web (api + web + landing + packages).

**Performance Goals**: el envío nunca bloquea la respuesta HTTP; el 95% de los correos entregado en
< 1 min (SC-002, depende del proveedor).

**Constraints**: entrega real solo con `NODE_ENV=production`; respuesta idéntica en la recuperación
(contenido y tiempo, R9); enlaces sin datos personales; correos sin información financiera.

**Scale/Scope**: 3 tipos de correo (8 variantes de aviso), 7 endpoints nuevos, 2 páginas públicas,
cambios en Perfil y en el panel de acceso.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio                               | Cumple | Cómo                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Money Precision                      | ✅ N/A | No toca dinero. Los correos no incluyen montos (FR-026).                                                                                                                                                                                                                                                                        |
| II. Per-User Data Isolation             | ✅     | Cada consulta de `user-email`/`email-token` filtra por `userId`; `DELETE /auth/me/emails/:id` verifica ownership en la propia consulta (404 si no es de la cuenta). Los endpoints sin sesión no reciben ids: identifican la cuenta solo por un token imposible de adivinar (verify/reset) o por RUT (forgot, sin revelar nada). |
| III. i18n Parity                        | ✅     | Claves nuevas en `packages/i18n` y `apps/landing/src/i18n` (es/en, tests de paridad existentes). Plantillas de correo con su propio catálogo es/en y su test de paridad. El API sigue sin devolver texto localizado en HTTP (R12).                                                                                              |
| IV. Test-First                          | ✅     | Tareas de test antes de cada implementación (unit/integration/e2e/UI).                                                                                                                                                                                                                                                          |
| V. SDD & Living Memory                  | ✅     | Este ciclo; constitución y `CLAUDE.md` se actualizan al cerrar.                                                                                                                                                                                                                                                                 |
| VI. DDD + CQRS (una tabla = un dominio) | ✅     | Dominios-tabla nuevos `user-email` y `email-token` (`domain/` + `infrastructure/` + `*.data.module.ts`, sin `presentation/`), compuestos desde `user` como `passkey`/`session`. Comandos/queries en `user/application`. `infra/email` es transversal (R1).                                                                      |
| VII. Idempotencia                       | ✅     | Ver gates de datos y R11.                                                                                                                                                                                                                                                                                                       |
| VIII. Identificadores                   | ✅     | UUID v7 en ambas tablas; `:id` validado con `rowId`. El token del enlace no es un identificador de fila (secreto de 256 bits, solo su hash en la base).                                                                                                                                                                         |

**Data gates:**

- [x] **Formato de identificador por entidad nueva**: `user-email.id` y `email-token.id` son UUID v7
      (`@default(uuid(7))`); el id de `email-token` se reutiliza como `Idempotency-Key` del envío.
- [x] **Idempotencia por endpoint de escritura nuevo**:
      `POST /auth/email/verify` (a) · `POST /auth/password/reset` (a) ·
      `POST /auth/email/verification` (b, índice parcial único de un enlace vigente por cuenta y propósito + ventana de 60 s + límite) · `POST /auth/password/forgot` (b, mismo índice) ·
      `POST /auth/me/emails` (b, índice parcial único de un `PENDING` por cuenta + ventana de 60 s) ·
      `DELETE /auth/me/emails/:id` (a, segunda vez → 404 sin efecto). Ninguno mueve saldo ni cupo.
- [x] **Ownership de FK desde el body**: ningún endpoint nuevo acepta una FK en el body. El único id
      que llega por la ruta (`DELETE /auth/me/emails/:id`) se verifica con `WHERE id = :id AND userId =
:currentUser`.

**Re-check post-diseño**: sin violaciones; sin entradas en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/032-account-emails/
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
apps/api/
├── prisma/
│   ├── schema.prisma                         # UserEmail, EmailToken, enums; relaciones en User
│   └── migrations/<fecha>_account_emails/     # tablas, índices parciales, datos (FR-013)
├── src/infra/email/                          # ← carpeta pedida por el usuario
│   ├── email.module.ts                       # elige el adaptador al arrancar (R3)
│   ├── email.config.ts                       # NODE_ENV, RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO,
│   │                                         #   PUBLIC_SITE_URL, EMAIL_CAPTURE_DIR
│   ├── email-sender.port.ts                  # send(message), isAvailable()
│   ├── senders/
│   │   ├── resend-email.sender.ts            # fetch + Idempotency-Key (solo producción)
│   │   ├── file-capture-email.sender.ts      # desarrollo: .html/.txt/.json en .mail/
│   │   ├── disabled-email.sender.ts          # producción sin clave
│   │   └── in-memory-email.sender.ts         # tests
│   ├── templates/
│   │   ├── layout.ts                         # HTML de correo (tablas + estilos en línea) + texto
│   │   ├── escape.ts
│   │   ├── verify-email.ts
│   │   ├── reset-password.ts
│   │   └── security-notice.ts                # 8 variantes por `kind`
│   └── i18n/{es,en}.ts                       # textos de los correos
├── src/domains/user-email/                   # dominio-tabla nuevo
│   ├── domain/{user-email.entity.ts, ports/user-email.repository.port.ts}
│   ├── infrastructure/prisma-user-email.repository.ts
│   └── user-email.data.module.ts
├── src/domains/email-token/                  # dominio-tabla nuevo
│   ├── domain/{email-token.ts, ports/email-token.repository.port.ts}
│   ├── infrastructure/prisma-email-token.repository.ts
│   └── email-token.data.module.ts
├── src/domains/user/
│   ├── domain/events/account-security.event.ts
│   ├── application/commands/                 # verify-email, resend-verification,
│   │                                         #   forgot-password, reset-password,
│   │                                         #   request-email-change, remove-user-email
│   ├── application/queries/list-user-emails.*
│   ├── application/listeners/send-security-notice.listener.ts
│   ├── application/email-links.ts            # emitir token + armar URL + enviar
│   └── presentation/auth.controller.ts       # 7 rutas nuevas
├── src/domains/session/                      # closeAllForUserWithTx
├── src/infra/cron/maintenance.cron.ts        # paso nuevo: limpiar email-token
└── test/{unit,integration,e2e}/…

apps/landing/src/
├── pages/[lang]/verify-email.astro           # noindex; saca el token de la URL
├── pages/[lang]/reset-password.astro         # noindex; formulario de contraseña nueva
├── domains/auth/scripts/{verify-email,reset-password}.ts
├── domains/auth/components/LoginForm.tsx     # "¿Olvidaste tu contraseña?" → formulario por RUT
└── i18n/{es,en}.json

apps/web/src/
├── app/AppLayout.tsx                         # aviso "Confirma tu correo" + reenviar
└── domains/profile/components/
    ├── PersonalInfoSection.tsx               # el correo pasa a "pedir cambio" (pendiente)
    └── EmailHistorySection.tsx               # registro de correos con borrar

packages/contracts/src/auth/                  # esquemas nuevos + CurrentUser.emailVerified
packages/client/src/authApi.ts                # llamadas nuevas
packages/i18n/src/{es,en}.json                # errores y textos de la app
apps/api/src/infra/email/templates/logo.generated.ts  # logo del correo en base64, adjunto inline (cid:); scripts/og.mjs lo genera
```

**Structure Decision**: monorepo actual. El transporte de correo es infraestructura transversal
(`apps/api/src/infra/email/`, pedido explícito); los datos nuevos son dos dominios-tabla siguiendo el
Principio VI; la UI sin sesión vive en el sitio público (decisión de clarify) y la de cuenta en la app.

## Variables de entorno nuevas (API)

| Variable            | Desarrollo                              | Producción                                |
| ------------------- | --------------------------------------- | ----------------------------------------- |
| `PUBLIC_SITE_URL`   | `http://localhost:4321`                 | `https://mifik.cl`                        |
| `EMAIL_FROM`        | (por defecto) `fik <no-reply@mifik.cl>` | igual                                     |
| `EMAIL_REPLY_TO`    | (por defecto) `contacto@mifik.cl`       | igual                                     |
| `RESEND_API_KEY`    | **no se define**                        | clave de Resend con permiso solo de envío |
| `EMAIL_CAPTURE_DIR` | (por defecto) `apps/api/.mail`          | no aplica                                 |

## Complexity Tracking

Sin violaciones de la constitución.
