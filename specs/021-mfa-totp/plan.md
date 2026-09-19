# Implementation Plan: Autenticación en dos pasos (MFA con TOTP)

**Branch**: `021-mfa-totp` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-mfa-totp/spec.md`

## Summary

Reemplaza el switch decorativo "Verificación en dos pasos" del perfil por MFA real vía TOTP (app
autenticadora). Un usuario activa MFA escaneando un QR y confirmando con un código; al confirmar
recibe códigos de recuperación de un solo uso, mostrados una única vez. Con MFA activo, todo login
exitoso de email+contraseña queda en un estado "pendiente de segundo factor" — no se entrega sesión
real hasta que se valida un código (TOTP o de recuperación, en un único campo que detecta el formato).
Desactivar exige reingresar la contraseña e invalida el secreto y los códigos vigentes. Intentos
repetidos de códigos inválidos quedan frenados por un límite con bloqueo temporal.

## Technical Context

**Language/Version**: TypeScript 5, Node 20

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs` + `@nestjs/jwt` (apps/api), React 19 + Vite +
TanStack Query + react-router v8 (apps/web), Prisma 7, zod (`@finance/contracts`). **Nuevas**:
`otpauth` (generación/validación TOTP, apps/api) y `qrcode` (renderizado del código QR como data
URL, apps/api) — ambas puras en JS, sin dependencias nativas.

**Storage**: PostgreSQL vía Prisma — 4 columnas nuevas en `User` + 1 tabla nueva
(`mfa-recovery-code`).

**Testing**: Vitest — `test:unit`/`test:integration`/`test:e2e` en `apps/api`, Vitest+Testing
Library en `apps/web`.

**Target Platform**: Web (SPA) + API HTTP — sin plataforma nueva.

**Project Type**: Monorepo existente — sin proyecto nuevo.

**Performance Goals**: N/A — el volumen (logins, códigos de recuperación por usuario) es bajo y no
introduce ninguna consulta de alto costo.

**Constraints**: Sin infraestructura de email/SMS en el backend (confirmado); el secreto TOTP debe
poder DESCIFRARSE para validar códigos (a diferencia de una contraseña, que solo se compara —
nunca se hashea de forma irreversible); los códigos de recuperación sí se hashean de forma
irreversible (solo se comparan, nunca se necesita recuperarlos).

**Scale/Scope**: 1 tabla nueva, 4 columnas nuevas en `User`, 2 secretos nuevos en `.env`, 4
endpoints de escritura nuevos + 1 endpoint de login modificado + `GET /auth/me` con 2 campos
nuevos, 2 dependencias npm nuevas, cambios en `LoginRoute`/`SecuritySection`/`useAuth` en el
frontend.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Data gates (always applicable — see Principios II, VII y VIII):**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de Identificadores.
      → `MfaRecoveryCode.id` usa `uuid(7)` (default de schema), igual que toda tabla del sistema.
      Ningún endpoint nuevo recibe este id por path param — nunca se expone por fuera del propio
      dominio `user`, así que no hay validación `rowId` de path param que agregar.
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface.
      → Los 4 endpoints de escritura nuevos (`enroll`, `confirm`, `disable`, `login/mfa-verify`)
      satisfacen la forma (a) — máquina de estados terminal — y NINGUNO mueve saldo, cupo ni
      conteo de cuotas, así que el mecanismo de dos fases (forma c, `Idempotency-Key`) reservado
      para esos casos no aplica aquí. `enroll`: repetir la llamada solo reemplaza el secreto
      pendiente por uno nuevo — un overwrite seguro, no un efecto duplicado (no hay "activación"
      hasta confirmar). `confirm`: una vez `mfaEnabled=true`, un reintento con el mismo código no
      puede "reactivar" nada — la transición PENDIENTE→ACTIVA es terminal. `disable`: una vez
      `mfaEnabled=false`, un reintento es un no-op seguro — la transición ACTIVA→INACTIVA es
      terminal. `login/mfa-verify`: un código de recuperación ya usado se rechaza igual que uno
      inválido (su propio estado usado/sin-usar YA es la protección de una sola vez, FR-014) —
      reintentar con el mismo código nunca lo "usa dos veces".
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership.
      → Ningún endpoint nuevo recibe un id ajeno en el body. `enroll`/`confirm`/`disable` operan
      sobre el propio `userId` de `@CurrentUser` (sesión ya autenticada). `login/mfa-verify` no
      tiene sesión aún — identifica al usuario por el `sub` de un token de "pendiente de segundo
      factor" que el PROPIO SERVIDOR firmó y emitió en el paso 1 (nunca un id que el cliente
      pueda elegir), con su propio secreto de firma (`MFA_PENDING_TOKEN_SECRET`), separado de
      `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` — un token de sesión real nunca puede hacerse pasar
      por uno pendiente ni viceversa (firmas con secretos distintos).

## Project Structure

### Documentation (this feature)

```text
specs/021-mfa-totp/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── mfa-endpoints.md # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/api/prisma/schema.prisma                                # User +4 columnas, tabla mfa-recovery-code

apps/api/src/domains/mfa-recovery-code/                       # dominio-tabla nuevo, sin presentation/
├── domain/
│   ├── mfa-recovery-code.entity.ts
│   └── ports/mfa-recovery-code.repository.port.ts
├── infrastructure/prisma-mfa-recovery-code.repository.ts
└── mfa-recovery-code.data.module.ts                          # leaf, compuesto por `user`

apps/api/src/domains/user/
├── domain/
│   ├── user.aggregate.ts                                     # +props/métodos de MFA
│   └── errors.ts                                              # +5 errores nuevos
├── application/commands/
│   ├── start-mfa-enrollment.{command,handler}.ts               # nuevo
│   ├── confirm-mfa-enrollment.{command,handler}.ts              # nuevo
│   ├── disable-mfa.{command,handler}.ts                        # nuevo
│   ├── verify-mfa-login.{command,handler}.ts                   # nuevo
│   └── login.handler.ts                                        # rama mfaEnabled
├── application/queries/get-me.handler.ts                       # +mfaRecoveryCodesRemaining
├── application/token-issuer.ts                                 # +issueMfaPending/verifyMfaPending
├── application/mfa-secret-cipher.ts                            # nuevo, funciones puras AES-256-GCM
├── infrastructure/prisma-user.repository.ts                    # cifra/descifra el secreto al persistir/leer
├── user.module.ts                                               # importa mfa-recovery-code.data.module
└── presentation/auth.controller.ts                              # 4 rutas nuevas + login/mfa-verify

apps/api/src/infra/config/mfa.config.ts                        # nuevo, getMfaEncryptionKey (mirror de cursor.config.ts)
apps/api/.env.example                                            # +MFA_ENCRYPTION_KEY, +MFA_PENDING_TOKEN_SECRET

packages/contracts/src/auth/index.ts                             # +schemas de los 4 endpoints + loginResponseSchema

apps/web/src/domains/auth/
├── hooks/useAuth.tsx                                            # login() retorna {mfaRequired}; +verifyMfa()
└── routes/LoginRoute.tsx                                        # +segundo paso (un solo campo)

apps/web/src/domains/profile/components/
└── SecuritySection.tsx                                          # switch real + panel de activación + ConfirmModal de desactivar
```

**Structure Decision**: Nuevo dominio-tabla `mfa-recovery-code` siguiendo el patrón "una tabla = un
dominio" (Constitución §VI) — sin capa `presentation/` propia (nunca se expone por un endpoint
directo, es un detalle de implementación del dominio `user`, igual que `card-limit`/
`billing-settings` respecto de `bank-account`). El resto vive dentro del dominio `user` ya
existente, que es dueño de la tabla `User` y de todo el flujo de autenticación.

## Complexity Tracking

> Sin violaciones de la Constitución que requieran justificación — no se llena esta sección.
