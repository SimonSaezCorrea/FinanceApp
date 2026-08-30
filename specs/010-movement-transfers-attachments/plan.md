# Implementation Plan: Movimientos — traspasos, comprobantes y paneles rediseñados

**Branch**: `010-movement-transfers-attachments` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-movement-transfers-attachments/spec.md`

## Summary

Dos paneles del dominio de movimientos se rehacen al formato del handoff (panel lateral, monto
protagonista, filas etiqueta/valor, acciones al pie) y ganan cuatro capacidades de frontend puro
(navegación ‹ › paginada, duplicar, saldo tras/proyectado, guardar-y-crear-otro). Detrás, dos
capacidades nuevas de backend: **traspasos** — dos filas `Transaction` unidas por una columna
`transferGroupId` nueva, creadas/editadas/borradas como par en una sola transacción de base de datos,
excluidas de todo agregado de ingreso/gasto — y **adjuntos** — una tabla y un dominio nuevos
(`transaction-attachment`), con el bucket S3 detrás de un `ObjectStoragePort` que responde `503`
mientras no haya credenciales.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20

**Primary Dependencies**: NestJS 11 (Express 5), Prisma 7 + `@prisma/adapter-pg`, `@nestjs/cqrs`,
zod (`@finance/contracts`), `decimal.js` (`@finance/money`), React 19 + Vite, TanStack Query,
react-router v8, Tailwind. **Nuevas**: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
`@types/multer` (dev) — `multer` ya viene con `@nestjs/platform-express`.

**Storage**: PostgreSQL (Prisma, `pnpm db:push`, sin carpeta de migraciones) + almacenamiento de
objetos compatible con S3 para los archivos.

**Testing**: Vitest — `apps/api/test/{unit,integration,e2e}`, `apps/web` con Testing Library,
`packages/contracts` con su propia suite.

**Target Platform**: API Node 20; web SPA en navegadores modernos (teléfono, tablet, escritorio).

**Project Type**: monorepo pnpm + Turborepo, dos apps desplegables + packages compartidos.

**Performance Goals**: la lista de movimientos sigue paginada por keyset (20/página); ‹ › no añade
consultas nuevas; la subida de un adjunto de 5 MB se resuelve en el request.

**Constraints**: sin FX (los dos lados de un traspaso son montos independientes); el tier unitario
corre sin base de datos ni red; la subida pasa por el API y valida magic bytes; el borrado del objeto
ocurre fuera de la transacción de base de datos.

**Scale/Scope**: ~2 tablas tocadas (1 columna nueva + 1 tabla nueva), 1 dominio backend nuevo,
2 paneles web reescritos, ~8 endpoints nuevos.

## Constitution Check

_GATE: revisado antes de Phase 0 y de nuevo tras Phase 1._

| Principio                            | Cumplimiento en este plan                                                                                                                                                                            | Estado |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I. Money Precision                   | Montos de traspaso y saldos derivados con `@finance/money`/`Prisma.Decimal`; `sizeBytes` es lo único numérico y no es dinero. Saldo proyectado también se calcula con `decimal.js`, no con `number`. | ✅     |
| II. Per-User Data Isolation          | `transferGroupId` se resuelve siempre junto a `userId`; `TransactionAttachment.userId` propio + toda consulta scopeada; un adjunto ajeno responde 404, no 403.                                       | ✅     |
| III. i18n Parity                     | Cada texto nuevo (traspaso, adjuntos, saldos, duplicar, nav, 7 códigos de error) en `es.json` y `en.json`.                                                                                           | ✅     |
| IV. Test-First / TDD                 | Cada tarea de lógica escribe su test antes: `TransferPolicy`, `AttachmentPolicy` (magic bytes), exclusión de traspasos del `summary`, atomicidad del par, saldo proyectado.                          | ✅     |
| V. SDD + Living Memory               | Cadena spec → clarify → plan → tasks → analyze → implement; cierre obligatorio actualizando constitución (nueva dependencia + env vars + tabla) y `CLAUDE.md`.                                       | ✅     |
| VI. DDD + CQRS, una tabla un dominio | `transaction-attachment` es dominio nuevo con las cuatro capas y adapter único. El traspaso NO crea tabla, así que vive en el dominio `transaction` que ya posee la tabla.                           | ✅     |

**Normas operativas relevantes**:

- _Paginación_: `list()` no cambia de forma; la exclusión de traspasos afecta solo a `summary()` y
  queda documentada en el contrato. El contador de la nav ‹ › sale de `summary().total`, nunca de las
  filas cargadas.
- _Familia de overlays_: ambos paneles siguen siendo `SidePanel`/`FormSurface` sobre `SurfaceChrome`;
  no se dibuja un marco propio. Las filas etiqueta/valor se extraen a un primitivo compartido nuevo
  en `shared/ui/` (lo usan detalle y formulario, y son la misma fila).
- _Breakpoints_: sin `min-[NNNpx]:` ni queries inline; se usan las etapas de `apps/web/breakpoints.ts`.
- _Sin placeholders silenciosos_: adjuntos sin S3, y la aproximación del "saldo tras el movimiento"
  cuando faltan páginas por cargar, se catalogan en `docs/PENDING.md`.

**Desviaciones**: ninguna. Nada que registrar en Complexity Tracking.

**Riesgo consciente (no es violación)**: al representar el traspaso con `INCOME`/`EXPENSE` +
`transferGroupId` (decisión del usuario, ver research D1), ninguna suma existente lo excluye por sí
sola. Se mitiga con un predicado único `EXCLUDE_TRANSFERS` y un test que afirma SC-004.

## Project Structure

### Documentation (this feature)

```text
specs/010-movement-transfers-attachments/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── transfers.md
│   └── attachments.md
├── checklists/requirements.md
└── tasks.md            # lo genera /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/transactions/
├── index.ts                       # + transferGroupId, createTransferSchema, isTransfer…
└── attachments.ts                 # NUEVO — attachmentSchema, límites, tipos admitidos

apps/api/prisma/schema.prisma      # + Transaction.transferGroupId, + model TransactionAttachment

apps/api/src/domains/transaction/
├── domain/
│   ├── transfer-policy.ts         # NUEVO — reglas del traspaso
│   ├── errors.ts                  # + errores de traspaso
│   └── ports/transaction.repository.port.ts   # + saveTransferPair / updateTransferPair / removeTransferPair / findTransferGroup
├── application/
│   ├── commands/{create,update,remove}-transfer.{command,handler}.ts   # NUEVOS
│   └── queries/{get-transfer.*, transaction-list-filter.ts}            # + EXCLUDE_TRANSFERS
├── infrastructure/prisma-transaction.repository.ts                     # implementa lo nuevo
└── presentation/transactions.controller.ts                             # + rutas /transfers*

apps/api/src/domains/transaction-attachment/          # DOMINIO NUEVO (4 capas)
├── domain/{attachment.aggregate.ts, attachment-policy.ts, errors.ts,
│           ports/{attachment.repository.port.ts, object-storage.port.ts}}
├── application/commands/{upload,remove}-attachment.*
├── application/queries/{list-attachments.*, get-attachment-url.*}
├── infrastructure/{prisma-attachment.repository.ts, s3-object-storage.adapter.ts}
├── presentation/attachments.controller.ts
├── transaction-attachment.data.module.ts             # hoja: puerto → adapter
└── transaction-attachment.module.ts

apps/api/test/{unit,integration,e2e}/…                # espejo de lo anterior

apps/web/src/domains/transactions/
├── components/
│   ├── TransactionDetailPanel.tsx        # contenido del detalle (rediseñado)
│   ├── TransactionFormPanel.tsx          # contenido del formulario (rediseñado)
│   ├── TransferFields.tsx                # origen/destino/montos
│   ├── AttachmentsSection.tsx            # lista + dropzone + borrar
│   └── TransactionDetailModal.tsx        # pasa a ser la cáscara del panel
├── hooks/{useTransferMutations.ts, useAttachments.ts}   # NUEVOS
├── lib/{projectedBalance.ts, transferHelpers.ts}        # NUEVOS, con tests
└── routes/TransactionsRoute.tsx          # provee items/índice/total/fetchNextPage al panel

apps/web/src/shared/ui/detail-row.tsx     # NUEVO primitivo etiqueta/valor
apps/web/src/i18n/{es,en}.json            # claves nuevas en ambos
docs/PENDING.md                            # adjuntos sin S3 + saldo aproximado
```

**Structure Decision**: monorepo existente sin cambios estructurales. La única carpeta nueva del
backend es el dominio `transaction-attachment`, exigido por "una tabla = un dominio"; el traspaso NO
crea carpeta porque no crea tabla — vive en `transaction`, que ya posee la única tabla que toca.
En el frontend se separa el CONTENIDO de cada panel de su cáscara, igual que hizo `CardDetailPanel`,
para poder mostrarlo inline si más adelante hace falta y para poder testearlo sin overlay.

## Fases de implementación (orden previsto para `/speckit-tasks`)

1. **Contratos y esquema** — `transferGroupId`, tabla de adjuntos, shapes zod, códigos de error,
   claves i18n. Todo lo demás depende de esto.
2. **US1 + US2 (P1, frontend puro)** — primitivo `DetailRow`, panel de detalle rediseñado con ‹ ›,
   duplicar y saldo tras; formulario rediseñado con saldo proyectado y guardar-y-crear-otro.
   Entregable independiente: ya mejora la app sin ninguna capacidad nueva.
3. **US3 (P2, traspasos)** — política, puerto y adapter del par, comandos/queries, rutas, exclusión
   en `summary` + test de SC-004, y la UI (tercer segmento, campos origen/destino, distintivo en la
   tabla y en el detalle).
4. **US4 (P3, adjuntos)** — dominio nuevo completo, adapter S3, endpoints, sección de adjuntos en
   ambos paneles.
5. **Cierre** — `docs/PENDING.md`, constitución (dependencia + env vars + tabla + dominio 22),
   `CLAUDE.md`, y las puertas de calidad (`check:boundaries`, `typecheck`, tests del alcance, `build`).

Cada fase queda verde por su cuenta: 2 no depende de 3 ni de 4, y 3 y 4 son independientes entre sí.
