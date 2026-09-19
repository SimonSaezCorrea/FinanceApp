# Implementation Plan: Llave de acceso (Passkey / WebAuthn)

**Branch**: `022-passkey-login` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-passkey-login/spec.md`

## Summary

Reemplaza el botón "Configurar" deshabilitado de Seguridad por soporte real de passkeys
(WebAuthn). Un usuario registra una o varias llaves nombradas desde su perfil (ceremonia
`navigator.credentials.create()`); en el login, escribe su email, elige "Iniciar sesión con llave
de acceso" y confirma con su dispositivo (`navigator.credentials.get()`) — entra directo, sin
contraseña ni TOTP, aunque tenga MFA activo. Sin enumeración: un email sin llaves (o inexistente)
se rechaza con el mismo error genérico que una contraseña incorrecta. El login con contraseña
(+TOTP) sigue intacto siempre — las llaves son un método adicional, nunca el único.

## Technical Context

**Language/Version**: TypeScript 5, Node 20

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs` + `@nestjs/jwt` (apps/api), React 19 + Vite
(apps/web), Prisma 7, zod. **Nueva**: `@simplewebauthn/server` (apps/api únicamente) — genera y
verifica las opciones/respuestas de registro y autenticación WebAuthn (firma, `rpId`/origen,
contador anti-clonado); es la librería estándar del ecosistema Node para esto, evita reimplementar
verificación criptográfica a mano. **Sin dependencia nueva en el frontend**: el navegador ya expone
`navigator.credentials.create()/get()` de forma nativa — solo se necesitan helpers propios de
~30 líneas para codificar/decodificar `ArrayBuffer`↔base64url (mismo criterio que specs/021 mantuvo
el frontend sin dependencias nuevas para el QR).

**Storage**: PostgreSQL vía Prisma — 1 tabla nueva (`passkey`), sin columnas nuevas en `User`.

**Testing**: Vitest — `test:unit`/`test:integration`/`test:e2e` en `apps/api`, Vitest+Testing
Library en `apps/web`.

**Target Platform**: Web (SPA) + API HTTP — sin plataforma nueva.

**Project Type**: Monorepo existente — sin proyecto nuevo.

**Performance Goals**: N/A — volumen bajo (unas pocas llaves por usuario), sin consulta costosa.

**Constraints**: La verificación WebAuthn necesita conocer el `rpId` (dominio efectivo) y el
origen esperado del frontend — se reutiliza la env var **ya existente `CORS_ORIGIN`** como origen
esperado (nunca se agrega una nueva), y se deriva `rpId` de su hostname en runtime (sin nueva env
var tampoco). El desafío (`challenge`) de cada ceremonia debe sobrevivir entre el paso 1 (pedir
opciones) y el paso 2 (verificar la respuesta) sin agregar infraestructura nueva (no hay Redis en
este proyecto) — se resuelve con una cookie httpOnly firmada de corta vida, mismo mecanismo que el
`mfa_pending_token` de specs/021, con su propio secreto de firma.

**Scale/Scope**: 1 tabla nueva, 1 dependencia npm nueva (solo backend), 6 endpoints nuevos (2 de
registro guardados + list + delete, 2 de login público), sin cambios de esquema en `User`.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Data gates (always applicable — see Principios II, VII y VIII):**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de Identificadores.
      → `Passkey.id` usa `uuid(7)` (default de schema), igual que toda tabla del sistema. El
      `credentialId` que entrega el autenticador (bytes crudos, codificados base64url) es un
      **identificador de negocio** — columna propia `credentialId` (`@unique`), NUNCA el `id` de
      la fila, mismo tratamiento que el `code` de una institución financiera o un CBU (precedente
      explícito de la constitución). Se valida en el borde con `z.string().min(1)` (no es un UUID,
      es un blob base64url de longitud variable propio del estándar — no aplica `rowId`).
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface.
      → Los 4 endpoints de escritura (`register-options`, `register-verify`, `passkey-verify`,
      `DELETE /passkeys/:id`) satisfacen la forma (a) — máquina de estados terminal — y ninguno
      mueve saldo/cupo/conteo de cuotas. `register-options`: repetir la llamada solo emite un
      desafío nuevo (sobrescribe la cookie de desafío anterior) — no hay "registro" hasta el paso
      de verificación. `register-verify`: una vez creada la fila `Passkey`, un reintento con la
      MISMA respuesta de assertion falla la verificación de firma del propio WebAuthn (el desafío
      ya se consumió/expiró) — el estándar mismo impide el replay, no hace falta un mecanismo
      propio. `passkey-verify` (login): igual — el desafío de un solo uso y el contador
      anti-clonado del propio protocolo WebAuthn son la protección; un reintento con la misma
      respuesta falla por diseño del estándar, no por lógica de esta app. `DELETE /passkeys/:id`:
      eliminar una fila ya eliminada es un 404 idempotente estándar.
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership.
      → `DELETE /auth/me/passkeys/:id` verifica que la llave pertenezca al `userId` autenticado
      antes de borrar (mismo patrón que cualquier otro dominio). Los endpoints de login público
      (`passkey-options`/`passkey-verify`) no reciben ningún id de fila — solo un `email`, resuelto
      internamente a lo sumo a un `userId` que nunca se revela en la respuesta (anti-enumeración,
      FR-005a) — no hay FK de cuerpo que verificar ahí, es resolución interna de identidad, igual
      que el `email`+`password` del login existente.

## Project Structure

### Documentation (this feature)

```text
specs/022-passkey-login/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── passkey-endpoints.md # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/api/prisma/schema.prisma                                # tabla passkey nueva

apps/api/src/domains/passkey/                                  # dominio-tabla nuevo, sin presentation/
├── domain/
│   ├── passkey.entity.ts
│   └── ports/passkey.repository.port.ts
├── infrastructure/prisma-passkey.repository.ts
└── passkey.data.module.ts                                     # leaf, compuesto por `user`

apps/api/src/domains/user/
├── domain/errors.ts                                            # +errores de passkey
├── application/
│   ├── commands/
│   │   ├── start-passkey-registration.{command,handler}.ts      # nuevo
│   │   ├── confirm-passkey-registration.{command,handler}.ts    # nuevo
│   │   ├── remove-passkey.{command,handler}.ts                  # nuevo
│   │   ├── start-passkey-login.{command,handler}.ts             # nuevo, sin guard
│   │   └── verify-passkey-login.{command,handler}.ts            # nuevo, sin guard
│   ├── queries/list-passkeys.{query,handler}.ts                 # nuevo
│   ├── passkey-challenge-token.ts                                # nuevo, firma/verifica la cookie de desafío
│   └── token-issuer.ts                                           # sin cambios (reusa issue() existente)
├── user.module.ts                                                # importa passkey.data.module
└── presentation/auth.controller.ts                               # 6 rutas nuevas

apps/api/src/infra/config/passkey.config.ts                     # nuevo, deriva rpId/origin/secreto de CORS_ORIGIN + env

packages/contracts/src/auth/index.ts                             # +schemas de los 6 endpoints + Passkey

apps/web/src/shared/lib/webauthn.ts                              # nuevo, helpers base64url<->ArrayBuffer, sin dependencia
apps/web/src/domains/auth/
├── api/passkeyApi.ts                                             # nuevo
├── hooks/useAuth.tsx                                             # +loginWithPasskey()
└── routes/LoginRoute.tsx                                         # +paso "llave de acceso" (email primero)

apps/web/src/domains/profile/components/
├── PasskeySection.tsx                                            # nuevo, lista + registrar + eliminar
└── SecuritySection.tsx                                           # botón "Configurar" pasa a abrir PasskeySection
```

**Structure Decision**: Nuevo dominio-tabla `passkey` (Constitución §VI) sin `presentation/` propia
— igual que `mfa-recovery-code`, es un detalle de implementación compuesto desde `user`, que ya es
dueño de todo el flujo de autenticación. Las rutas viven en `auth.controller.ts` bajo
`/auth/me/passkeys*` (gestión, guarded) y `/auth/login/passkey-*` (login, público) — mismo patrón
exacto que specs/021 ya estableció para MFA.

## Complexity Tracking

> Sin violaciones de la Constitución que requieran justificación — no se llena esta sección.
