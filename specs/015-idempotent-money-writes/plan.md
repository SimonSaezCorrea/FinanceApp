# Implementation Plan: Reintentos y doble envío no pueden duplicar dinero

**Branch**: `015-idempotent-money-writes` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-idempotent-money-writes/spec.md`

## Summary

Diez operaciones que registran o mueven dinero pasan a aceptar una **clave de idempotencia generada
por el cliente** (`Idempotency-Key`), y el servidor recuerda cada intento con su resultado. Repetir un
intento devuelve la misma respuesta sin efecto adicional; dos operaciones distintas que se parecen
siguen entrando las dos, porque la identidad la da la clave y **nunca** el contenido.

Una tabla nueva (`idempotency-record`) con `@@unique([userId, key])` que hace de candado, y un
protocolo de dos fases cuya seguridad depende de una sola cosa: **el efecto y la marca de "aplicado"
se confirman en la misma transacción**. Eso obliga al trabajo estructural de la feature — que el
handler, y no el adapter, sea el dueño de la transacción en los caminos donde hoy no lo es.

Se suma el camino de corrección de un aporte a una meta de ahorro (la única operación de la app que
registra dinero y no se puede deshacer) y las guardas que le faltan al agregado `Debt`.

Implementa el **principio VII** de la constitución v2.0.0 por su forma **(c)**, y cierra la entrada 4
de la deuda de conformidad de `docs/PENDING.md`.

## Technical Context

**Language/Version**: TypeScript 5, Node 20

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs` + `@nestjs/schedule` (API), Prisma 7 con
`@prisma/adapter-pg`, React 19 + TanStack Query (web), zod (contratos). **Cero dependencias nuevas** —
`node:crypto` (ya usado en tres handlers) cubre el hash y el `randomUUID`; `crypto.randomUUID()` del
navegador cubre el lado cliente.

**Storage**: PostgreSQL 16. Una tabla nueva, un enum nuevo, cero columnas nuevas en tablas
existentes, cero migración de datos (`pnpm db:push`, el flujo del repo).

**Testing**: Vitest en `apps/api/test/{unit,integration,e2e}/`. El tier `unit` corre **sin ninguna
conexión a base de datos** (puertos falsos); la garantía de concurrencia (FR-006) **sólo** se puede
verificar en `integration` contra Postgres real.

**Target Platform**: monorepo pnpm + Turborepo, dos apps desplegables.

**Project Type**: web (API + SPA), monorepo con paquetes compartidos.

**Performance Goals**: una escritura protegida agrega **un `INSERT` y un `UPDATE`** al camino. El
`UPDATE` viaja dentro de la transacción que ya existía; el `INSERT` es una transacción propia previa.
Sin impacto perceptible en una app de un solo usuario.

**Constraints**: el `COMPLETED` **debe** estar en la misma transacción que el efecto — es la
invariante de la que depende todo lo demás. Retención 24 h; abandono de un `IN_FLIGHT` a los 60 s.

**Scale/Scope**: 10 operaciones protegidas · 1 tabla + 1 dominio nuevos · 5 métodos `*WithTx` nuevos ·
3 agregados tocados (`SavingsEntry`, `Debt`, y los handlers de `transaction`/`installment-plan`) ·
5 códigos de error · 1 cron de limpieza.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Contra la constitución **v2.0.0**:

| Principio                                 | Estado                 | Cómo                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I. Money Precision**                    | ✅ PASA                | No se introduce aritmética de dinero nueva. `responseBody` guarda el DTO ya serializado, con los montos como strings decimales — nunca se re-calculan al devolver un replay                                                                                                                            |
| **II. Per-User Data Isolation**           | ✅ PASA                | `idempotency-record.userId` con Cascade; **toda** lectura de una clave es `where: { userId, key }`. Una clave adivinada de otro usuario no resuelve nada. Ver la nota de alcance abajo                                                                                                                 |
| **III. i18n Parity**                      | ✅ PASA (gate)         | 5 códigos de error nuevos ⇒ 5 claves en `es.json` **y** `en.json`. Lo verifica `src/i18n/parity.test.ts`, que ya es un test                                                                                                                                                                            |
| **IV. Test-First / TDD**                  | ✅ PASA (gate)         | Tests antes de implementación. El tier `unit` con puertos falsos; **FR-006 exige un test de integración con concurrencia real** — un puerto falso no puede demostrar exclusión mutua                                                                                                                   |
| **V. SDD & Living Memory**                | ✅ PASA                | Cadena spec → plan → tasks. `CLAUDE.md` se actualiza en la misma sesión; la constitución **no** necesita enmienda (§VII ya existe: esto lo implementa)                                                                                                                                                 |
| **VI. DDD + CQRS, una tabla un dominio**  | ✅ PASA                | `idempotency-record` es dominio propio con sus cuatro capas y su hoja `*.data.module.ts`. **Ningún** adapter de otro dominio escribe esa tabla: la escritura transaccional entra por el puerto, como ya hace `pay-credit-statement` con cinco puertos                                                  |
| **VII. Idempotencia de escrituras**       | ✅ **Es esta feature** | Forma **(c)**: identidad de request del cliente + constraint único + respuesta idéntica al primer resultado. Se eligió (c) y no (b) porque (b) rompe FR-002 — ver [research.md](./research.md) §1                                                                                                      |
| **VIII. Identificadores**                 | ✅ PASA                | La PK de la tabla nueva es `cuid()`, igual que las otras 23. **`key` no es un identificador de fila**: es un valor de negocio provisto por el cliente, en columna propia con su validación — exactamente la figura que el principio describe. No se agrega un tercer formato ni se toca la deuda 1 y 2 |
| Cursor con MAC / claves opacas de storage | ➖ N/A                 | Deuda 5 y 6, sin relación con reintentos. Declaradas fuera de alcance en la spec                                                                                                                                                                                                                       |

### Data gates (Principios II, VII y VIII)

- [x] **Toda entidad nueva declara formato de identificador conforme al principio de
      Identificadores.** `IdempotencyRecord.id` es `String @id @default(cuid())`, idéntico a las otras
      23 tablas. `key` es una columna de negocio, no una PK, y su formato lo fija
      `idempotencyKeySchema` (`z.string().min(16).max(255)`).
- [x] **Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface.**
      Los tres endpoints nuevos son `GET/PATCH/DELETE /savings/entries/:id` — idempotentes por
      semántica HTTP, sin necesitar el mecanismo (FR-009). Las diez operaciones **existentes** que se
      protegen declaran la forma **(c)**, tabulada en
      [contracts/idempotency.md](./contracts/idempotency.md) §2.
- [x] **Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership.** La
      única FK que esta feature acepta del cliente es `savingsGoalId` en `PATCH /savings/entries/:id`.
      **Se verifica en `UpdateSavingsEntryHandler.loadContext`**, con un `findOne` scopeado por
      `userId` contra el puerto de `savings-goal`, antes de persistir.

  **Nota de alcance, dicha en voz alta**: `POST /savings/entries` ya acepta hoy un `savingsGoalId` sin
  verificar propiedad — es una de las seis violaciones del principio II que la auditoría encontró.
  Esta feature **cierra ésa**, porque el camino de corrección la toca de todos modos y sería absurdo
  escribir el `PATCH` correcto dejando el `POST` roto al lado. Las **otras cinco** siguen abiertas y
  siguen fuera de alcance (`import`, `investments`, `recurring`, `installments.paymentAccountId`,
  `installments.cardId`).

### Re-evaluación post-diseño

Ninguna puerta cambió de estado. La única desviación a justificar es estructural, no de principio, y
está en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/015-idempotent-money-writes/
├── plan.md              # Este archivo
├── spec.md              # Qué y por qué
├── research.md          # Phase 0 — las decisiones y por qué se descartaron las alternativas
├── data-model.md        # Phase 1 — la tabla, los puertos, los errores
├── quickstart.md        # Phase 1 — 14 escenarios de validación
├── contracts/
│   └── idempotency.md   # Phase 1 — header, operaciones protegidas, semántica de respuesta
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — lo genera /speckit-tasks, NO este comando
```

### Source Code (repository root)

```text
packages/contracts/src/
├── idempotency/index.ts                    # NUEVO — header, schema de la clave, constantes
└── savings/index.ts                        # + updateSavingsEntrySchema

apps/api/prisma/schema.prisma               # + model IdempotencyRecord, + enum IdempotencyStatus

apps/api/src/
├── domains/idempotency-record/             # NUEVO — dominio completo, cuatro capas
│   ├── domain/
│   │   ├── idempotency-record.aggregate.ts     # estados, vencimiento, decisión de replay
│   │   ├── errors.ts                            # los 3 códigos IDEMPOTENCY_*
│   │   └── ports/idempotency-record.repository.port.ts
│   ├── application/commands/purge-expired-records.{command,handler}.ts   # scope: "system"
│   ├── infrastructure/prisma-idempotency-record.repository.ts            # traduce P2002
│   ├── idempotency-record.data.module.ts   # hoja: sólo el binding puerto→adapter
│   └── idempotency-record.module.ts        # handler del purge
├── infra/cqrs/base-idempotent-command.handler.ts   # NUEVO — el protocolo, en un solo lugar
├── infra/cron/idempotency-cleanup.cron.ts          # NUEVO — barrido diario
├── domains/transaction/                    # handlers pasan a dueños de la transacción
│   ├── application/commands/create-transaction.handler.ts
│   ├── application/commands/create-transfer.handler.ts
│   └── infrastructure/prisma-transaction.repository.ts   # + saveNewWithTx, + saveTransferPairWithTx
├── domains/installment-plan/               # create + pay-installment protegidos
├── domains/credit-statement/               # pay protegido (cierra el hueco de concurrencia)
├── domains/debt/                           # 4 comandos protegidos + guardas del agregado
├── domains/savings-entry/                  # + findOne/save/remove, + applyUpdate, + errors.ts
└── domains/savings-goal/presentation/savings.controller.ts   # + 3 rutas de entries

apps/api/test/
├── unit/domains/idempotency-record/        # agregado, decisión de replay, vencimiento
├── unit/domains/debt/                      # las guardas nuevas
├── integration/                            # CONCURRENCIA REAL (FR-006) + el rollback de la fase 2
└── e2e/                                    # los escenarios del quickstart, por HTTP

apps/web/src/
├── shared/lib/apiClient.ts                 # + opción idempotencyKey
├── shared/hooks/useIdempotencyKey.ts       # NUEVO — una clave por formulario-intento
├── domains/transactions/hooks/             # las mutaciones pasan la clave
├── domains/installments/hooks/
├── domains/accounts/hooks/
├── domains/debts/                          # + la clave, + disabled en ActionBtn
└── i18n/{es,en}.json                       # 5 códigos de error nuevos
```

**Structure Decision**: monorepo existente, sin carpetas de primer nivel nuevas. El dominio nuevo
sigue el molde de los 23 que ya existen (cuatro capas + hoja de datos, principio VI). Lo único que
vive fuera de un dominio es `base-idempotent-command.handler.ts`, que va a `infra/cqrs/` junto al
`BaseCommandHandler` que extiende — es infraestructura transversal, exactamente como el interceptor
de logging.

## Phases

- **Phase 0 — Research**: ✅ [research.md](./research.md). Diez decisiones, cada una con sus
  alternativas descartadas y el motivo. Las que más condicionan el resto: por qué (c) y no (b) (§1),
  por qué las dos fases son seguras (§3), por qué handler y no interceptor (§4), y el hallazgo de que
  hoy la transacción se abre en tres lugares distintos (§5).
- **Phase 1 — Design & Contracts**: ✅ [data-model.md](./data-model.md),
  [contracts/idempotency.md](./contracts/idempotency.md), [quickstart.md](./quickstart.md).
- **Phase 2 — Tasks**: lo genera `/speckit-tasks`. **No** lo produce este comando.

### Orden sugerido para las tareas (dependencias reales)

1. Contrato + schema + dominio `idempotency-record` con sus tests unitarios. No depende de nada.
2. `BaseIdempotentCommandHandler` + los `*WithTx` que faltan. **Es el prerrequisito de todo lo demás**
   y donde está el riesgo estructural.
3. Una operación de punta a punta (`transaction.create`) como referencia, con su test de concurrencia.
   Recién cuando ésa cierra, replicar a las otras nueve.
4. Web: `useIdempotencyKey` + `apiClient`, después las mutaciones.
5. `savings-entry` (corrección) y `debt` (guardas) — independientes entre sí y del resto.
6. Cron de limpieza, i18n, `docs/PENDING.md`, `CLAUDE.md`.

## Complexity Tracking

> Una sola desviación, y no es de principio sino de alcance estructural.

| Violation                                                                                                                                                       | Why Needed                                                                                                                                                                                                                                                                               | Simpler Alternative Rejected Because                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mover la apertura del `$transaction` del adapter al handler en `transaction` (`saveNew`, `saveTransferPair`), y envolver por primera vez los comandos de `debt` | El `COMPLETED` **tiene** que confirmarse junto al efecto ([research.md](./research.md) §3). Si el adapter es dueño de la transacción, el handler no puede meter nada adentro, y el `idempotency-record` no puede escribirse desde el adapter de `transaction` sin violar el principio VI | **Completar después de confirmar el efecto** (dos transacciones) parece equivalente y no lo es: una caída entre ambas deja el efecto aplicado y el intento marcado como no aplicado, y el reintento duplica — el defecto exacto que la feature elimina. **Pasarle el puerto de idempotencia a cada adapter** viola "una tabla, un dominio, un adapter". Mitigante: no es una invención, es el patrón que el repo ya usa (`pay-credit-statement.handler.ts:166-209` enlista cinco puertos en una transacción; `prisma-installment-plan.repository.ts:107` ya expone el par `create`/`createWithTx`), y ninguna firma pública cambia |

**Efecto colateral positivo, no una excusa**: envolver los comandos de `debt` cierra además una
carrera que existe desde siempre — hoy `load` y `save` son dos viajes sin bloqueo, así que dos
`register-payment` concurrentes leen el mismo `paidInstallments` y ambos escriben `n+1`.

## Riesgos

| Riesgo                                                             | Mitigación                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El header no sobrevive el preflight de CORS                        | `main.ts:24-25` no fija `allowedHeaders`, así que `cors` refleja los pedidos. **Verificado por lectura, no por ejecución** — el escenario 7 del quickstart existe para confirmarlo con una petición real antes de construir encima       |
| Un `IN_FLIGHT` huérfano bloquea al usuario 24 h                    | Se toma a los 60 s. Es seguro por la invariante de [research.md](./research.md) §3, no por optimismo                                                                                                                                     |
| La clave se regenera y no protege nada                             | Es el error de implementación más probable de toda la feature. Una clave por **formulario-intento**, no por petición ni por apertura ([research.md](./research.md) §7). El escenario 2 del quickstart falla ruidosamente si se elige mal |
| El refactor `*WithTx` rompe caminos de escritura que hoy funcionan | Los métodos actuales se conservan delegando a la variante nueva; ninguna firma pública cambia. Los tests de integración de `transaction` ya existen y son el gate                                                                        |
| Recargar la página sigue duplicando                                | Límite conocido y aceptado. Documentado en spec (Out of Scope), en research §7 y verificado como tal en el escenario 14                                                                                                                  |
