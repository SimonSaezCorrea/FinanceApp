# Implementation Plan: Verificar el autenticador de las llaves de acceso contra el catálogo FIDO

**Branch**: `dev` (sin rama propia) | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/041-passkey-attestation/spec.md`

## Summary

Al registrar una llave se pide attestation (`direct`) sin exigirla. El catálogo de metadatos de la FIDO
Alliance se baja y verifica a diario con lo que ya trae `@simplewebauthn/server` (`verifyMDSBlob`) y se
guarda en una tabla global nueva, **`authenticator-model`**, desde donde se carga en el `MetadataService`
de la librería para validar la cadena del certificado al registrar. Una llave verificada guarda su
modelo; un modelo comprometido (`REVOKED` o uno de los cuatro estados de compromiso) se rechaza al
registrar y, si pasa a comprometido después, la revisión diaria marca sus llaves, cierra las sesiones
abiertas con ellas y avisa por correo. Una attestation no verificable se reintenta como `none`, así que
nunca rechaza. Detalle en [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript, Node 22.

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs`, Prisma 7 (PostgreSQL 16), zod
(`@finance/contracts`), `@simplewebauthn/server` 13.3 (existente: `verifyRegistrationResponse`,
`MetadataService`, `verifyMDSBlob` y CBOR desde `/helpers`), React 19 (web). **Sin dependencias nuevas.**

**Storage**: PostgreSQL. Migración expansiva: tabla `authenticator-model`; columnas nulas
`passkey.aaguid/authenticatorName/verifiedAt/compromisedAt/compromisedReason`, `session.passkeyId` (FK
`SetNull`).

**Testing**: Vitest — unit con fakes, integration/e2e contra Postgres desechable; el catálogo real no se
baja en los tests (catálogo de prueba y verificación de la librería simulada, como los e2e de passkeys).

**Target Platform**: API en EC2 (salida a internet ya usada por IPinfo/Banco Central), web en Cloudflare
Pages.

**Project Type**: Monorepo web (api + web + packages).

**Performance Goals**: el registro suma una consulta indexada por AAGUID y la carga del catálogo en
memoria solo cuando cambió; la revisión diaria es un UPDATE por AAGUID comprometido.

**Constraints**: despliegue sin corte (contrato aditivo, migración expansiva); nunca rechazar por falta
de catálogo o de attestation; ningún secreto ni variable nueva.

**Scale/Scope**: ~1.000 modelos en el catálogo; 1 endpoint nuevo, 4 handlers tocados, 1 paso de
mantención, la lista de llaves en Perfil.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Money**: no aplica.
- **II. Aislamiento por usuario**: la sugerencia, el registro y la lista operan sobre la cuenta de la
  sesión; la revisión marca por AAGUID y avisa/cierra sesiones a cada dueño (`userId` de la fila
  marcada). `authenticator-model` es referencia global sin datos de personas (como `exchange-rate`). ✅
- **III. i18n**: distintivos, mensajes de error y el correo nuevo en es/en con sus paridades. ✅
- **IV. Test-first**: cada historia abre con sus tests. ✅
- **V. SDD y memoria viva**: al cerrar, constitución (tablas 37 → 38) y `CLAUDE.md`. ✅
- **VI. Una tabla = un dominio**: `authenticator-model` es un dominio-tabla nuevo (`domain/` +
  `infrastructure/` + data module hoja); la lógica vive en `user` (como `passkey`/`session`). Cada
  adapter toca solo su tabla. ✅
- **VII. Idempotencia**: `register-suggestion` no escribe; `register-verify` mantiene su forma actual (el
  desafío firmado de un solo uso y `credentialId @unique`); reemplazo del catálogo = (b) número de
  catálogo creciente; marcado de llaves = (a) `compromisedAt IS NULL`, correo y cierre solo para lo que
  la ejecución marcó. ✅
- **VIII. Identificadores**: `authenticator-model.id` UUID v7; el AAGUID es identificador de negocio en su
  propia columna `@unique`, nunca el PK. ✅

**Data gates:**

- [x] Toda entidad nueva declara formato de identificador (UUID v7; AAGUID como llave de negocio).
- [x] Todo endpoint de escritura nuevo declara su forma de idempotencia (contracts/http.md).
- [x] Ninguna FK llega en un cuerpo; `session.passkeyId` lo escribe el servidor desde la llave ya
      verificada como propia.

**Re-check post-design**: sin violaciones.

## Project Structure

### Documentation (this feature)

```text
specs/041-passkey-attestation/
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
packages/contracts/src/auth/index.ts          # passkey status/authenticatorName/compromisedAt,
                                              # register-suggestion request/response
packages/client/src/passkeyApi.ts (o authApi) # registerSuggestion
apps/api/prisma/schema.prisma + migrations/<ts>_passkey_attestation/
apps/api/src/domains/
├── authenticator-model/                      # NUEVO: domain/ (entidad, puerto, estado de compromiso)
│                                             # + infrastructure/ + data.module
├── passkey/                                  # columnas nuevas, markCompromisedWithTx, countUsable
├── session/                                  # passkeyId, closeByPasskeysWithTx
├── user/
│   ├── application/authenticator-catalog.ts  # bajar/verificar/reemplazar, cargar MetadataService
│   ├── application/passkey-attestation.ts    # verificar registro (con reintento como none), AAGUID
│   ├── application/commands/                 # confirm/start registration, verify login/step-up,
│   │                                         # refresh-authenticator-catalog (nuevo), suggestion
│   ├── domain/events/account-security.event.ts   # PASSKEY_COMPROMISED, model opcional
│   └── presentation/auth.controller.ts       # register-suggestion
├── infra/email/                              # aviso PASSKEY_COMPROMISED, modelo en PASSKEY_ADDED
└── infra/cron/maintenance.cron.ts            # paso "FIDO catalog"
apps/web/src/domains/profile/
├── components/PasskeySection.tsx             # nombre sugerido, distintivos, explicación comprometida
├── components/StepUpPanel.tsx                # solo llaves usables
└── lib/personalData.ts                       # modelo y estado en la hoja de llaves
packages/i18n/src/{es,en}.json
apps/landing/src/legal/privacy-policy.{es,en}.md   # una línea sobre el catálogo FIDO
```

**Structure Decision**: monorepo existente; lógica en `user` + un dominio-tabla hoja global.

## Delivery order

Migración y catálogo primero (base de todo), luego US1 (verificar y mostrar), US2 (rechazar al
registrar), US3 (revisión diaria, bloqueo, sesiones, correo).

## Risks

- **Ruta interna de la librería**: `verifyMDSBlob` y el CBOR se importan del subpath público `/helpers`;
  un cambio mayor de la librería podría moverlos. Un test unitario importa ambos y falla si desaparecen.
- **Aviso del navegador con llaves físicas** (`direct`): Chrome puede pedir permiso para mostrar el
  modelo; si la persona lo niega, la llave queda no verificada (spec, edge case).
- **No hay autenticador real en los tests**: la verificación de la librería se simula en unit/e2e; la
  verificación real con una YubiKey queda para la prueba manual (quickstart).
- **Catálogo grande** (~varios MB): se baja una vez al día en la mantención, nunca en una petición.

## Complexity Tracking

Sin violaciones.
