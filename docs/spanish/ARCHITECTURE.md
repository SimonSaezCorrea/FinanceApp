# FinanceApp — Arquitectura

Estado: **vigente** (monorepo, rama `001-api-frontend-monorepo`). Autoritativo para la estructura.
El contexto de producto/dominio está en [APP_CONTEXT_AND_HISTORY.md](./APP_CONTEXT_AND_HISTORY.md)
(sus detalles de stack/routing son anteriores a esta migración y son históricos). La especificación
formal está en [specs/001-api-frontend-monorepo/](../../specs/001-api-frontend-monorepo/).

> Versión en inglés: [../english/ARCHITECTURE.md](../english/ARCHITECTURE.md)

---

## 1. Visión general

FinanceApp es un gestor de finanzas personales construido como un **monorepo pnpm + Turborepo** con
dos aplicaciones **desplegables por separado** y paquetes compartidos:

- **`apps/api`** — backend NestJS, **único dueño de la base de datos**, expone una API HTTP versionada.
- **`apps/web`** — SPA Vite + React, consume la API solo por HTTP, dueña de la UI y las traducciones.
- **`packages/*`** — contratos compartidos (zod), matemática de dinero (decimal.js) y config de TS.

Las dos apps comparten un repositorio pero **ningún acoplamiento en runtime**: se comunican solo a
través de un contrato HTTP publicado. Esto maximiza mantenibilidad (organización por dominio),
escalabilidad (build/deploy/escalado independientes) y descubribilidad (todo lo de un dominio junto).

```
┌─────────────┐      HTTP /api/v1 (JSON, cookies httpOnly)      ┌──────────────┐
│  apps/web   │ ───────────────────────────────────────────────▶│   apps/api   │
│ Vite + React│ ◀───────────────────────────────────────────────│   NestJS     │
│  (SPA)      │           datos + códigos sin idioma             │ (único dueño │
└─────────────┘                                                  │   de la DB)  │
        │                                                        └──────┬───────┘
        │ imports (tipos/valores)     imports (tipos/valores)           │ Prisma
        ▼                                                               ▼
   ┌──────────────────────── packages/* ───────────────────┐    ┌────────────┐
   │  contracts (zod+tipos) · money (decimal.js) · config   │    │ PostgreSQL │
   └────────────────────────────────────────────────────────┘    └────────────┘
```

### Por qué estas decisiones (justificación)

- **Por qué separar frontend y backend (por servicio):** dueño y seguridad claros — el backend posee
  datos, reglas de negocio y secretos; el navegador solo ve el contrato HTTP publicado (la DB y las
  credenciales nunca llegan al cliente). Además tienen runtimes y perfiles de escalado distintos
  (una API Node con estado cerca de la DB vs. estáticos en un CDN), así cada uno buildea, despliega y
  escala por su cuenta — un fix de frontend no redeploya la API. El contrato es el único acople, así
  que cualquier lado puede reescribirse o sumar otro cliente (móvil/CLI); la lógica se testea sin
  navegador y la UI sin base de datos.
- **Por qué un monorepo (no dos repos):** el contrato compartido (`@finance/contracts`) y la
  matemática de dinero (`@finance/money`) viven en un solo lugar (sin drift de versiones), un cambio
  de contrato más ambos consumidores entran en un PR (atómico), y hay una sola toolchain + CI —
  manteniendo el runtime totalmente desacoplado. La regla de dependencias unidireccional deja a
  `apps/api` + `packages/*` autocontenidos, así que extraer el backend a su propio repo después es
  mecánico.
- **Por qué primero-por-dominio (no por capa):** todo lo de un dominio (p. ej. _debts_) vive en una
  carpeta — navegas por feature, no por una capa técnica dispersa por el árbol. Agregar o quitar un
  dominio completo es local; la app escala por _cantidad de dominios_ en vez de hacer crecer sin
  límite carpetas globales `controllers/`/`services/`.
- **Por qué el formato module/controller/service/repository:** es el layering estándar de NestJS, un
  skeleton repetible por dominio — **controller** = borde HTTP (parsea/valida/devuelve), **service** =
  lógica de negocio, **repository** = único lugar que toca Prisma. Eso mantiene el acotado por usuario
  auditable en un solo punto, hace cada capa testeable por unidad, y vuelve mecánico agregar un
  dominio (copiar el skeleton). Las formas se describen una vez como zod (seguridad en compilación en
  ambos lados); el dinero cruza como strings por precisión.

## 2. Estructura del repositorio

```
finance-app/
├── apps/
│   ├── api/                       # Backend NestJS
│   │   ├── src/
│   │   │   ├── main.ts            # bootstrap: prefijo /api/v1, cookies, CORS(credentials), filtro de errores
│   │   │   ├── app.module.ts      # conecta infra + todos los módulos de dominio
│   │   │   ├── domains/<dominio>/ # auth, accounts, transactions, installments, debts, savings, investments, import, health
│   │   │   │   ├── <d>.module.ts   # layout HISTÓRICO — hoy cada dominio usa las cuatro capas
│   │   │   │   ├── <d>.controller.ts  #   DDD de §12a (domain/application/infrastructure/
│   │   │   │   ├── <d>.service.ts     #   presentation) y estos archivos ya no existen
│   │   │   │   ├── <d>.repository.ts
│   │   │   │   └── <d>.service.spec.ts
│   │   │   └── infra/             # prisma (cliente único), auth (guard + @CurrentUser), http (filtro + ZodValidationPipe), config
│   │   ├── prisma/                # schema.prisma + seed.ts  (la DB vive con la API)
│   │   ├── test/                  # e2e (health)
│   │   └── Dockerfile
│   └── web/                       # SPA Vite + React
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/               # providers (Query, i18n, Auth), router
│       │   ├── domains/<dominio>/ # api/ hooks/ components/ routes/ (+ tests)
│       │   ├── shared/lib/        # apiClient
│       │   └── i18n/              # es.json / en.json (el frontend es dueño de las traducciones)
│       ├── Dockerfile + nginx.conf
│       └── vite.config.ts
├── packages/
│   ├── contracts/                # esquemas zod + tipos inferidos, un módulo por dominio
│   ├── money/                    # helpers de dinero decimal.js, cronograma de cuotas, interés
│   └── config/                   # tsconfig.base.json compartido
├── scripts/check-boundaries.mjs  # hace cumplir los límites de imports
├── .github/workflows/ci.yml
├── turbo.json · pnpm-workspace.yaml · package.json (raíz del workspace)
└── specs/001-api-frontend-monorepo/   # spec, plan, contratos, tareas
```

### Qué contiene cada carpeta

**Backend `apps/api/src/`**

- `main.ts` — bootstrap del proceso: prefijo global `/api/v1`, parser de cookies, CORS (credenciales),
  filtro de errores global, y luego `listen`.
- `app.module.ts` — raíz de composición: importa los módulos de infra + cada módulo de dominio.
- `domains/<dominio>/` — un dominio de negocio. **Esta descripción plana es histórica**: desde
  specs/009 cada dominio se divide en las cuatro capas documentadas en §12a (`domain/`,
  `application/`, `infrastructure/`, `presentation/`), con los tests en
  `apps/api/test/{unit,integration,e2e}/`. En la raíz del dominio solo sobrevive `<d>.module.ts`
  (cableado).
- `infra/` — transversal, **no** es un dominio de negocio: `prisma/` (el único `PrismaService`),
  `auth/` (`JwtAuthGuard` + `@CurrentUser`), `http/` (`AllExceptionsFilter` + `ZodValidationPipe`),
  `config/` (env).
- `common/` — utilidades pequeñas de Nest compartidas por varios dominios (pipes/interceptors).
- `prisma/` — `schema.prisma`, migraciones, `seed.ts` (la definición de la base de datos — ver abajo).
- `test/` — tests e2e que levantan la app Nest.

**Frontend `apps/web/src/`**

- `main.tsx` — monta React dentro de `Providers` + `RouterProvider`.
- `app/` — shell de la app: `providers.tsx` (Query, i18n, Auth), `router.tsx` (tabla de rutas), páginas de nivel superior.
- `domains/<dominio>/` — un dominio de negocio en el cliente: `api/` (llamadas tipadas vía el
  `apiClient` compartido + contracts), `hooks/` (hooks de TanStack Query / contexto), `components/`
  (presentacional), `routes/` (pantallas), más `*.test.tsx`.
- `shared/` — código reutilizable no-dominio: `lib/` (apiClient, helpers) y primitivos de UI.
- `i18n/` — los catálogos es/en (el frontend es dueño de las traducciones) + setup.
- `styles/` — estilos globales.

**`packages/`**

- `contracts/` — esquemas zod + tipos inferidos; un módulo por dominio + `common`. El contrato de la API.
- `money/` — helpers decimal.js, cronograma de cuotas, interés. Matemática financiera en runtime.
- `config/` — `tsconfig.base.json` compartido.

**Raíz del repo** — `scripts/` (p. ej. `check-boundaries.mjs`), `.github/workflows/` (CI),
`turbo.json` / `pnpm-workspace.yaml` / `package.json` (orquestación del workspace), `specs/`, `docs/`,
`.specify/`.

### Dónde viven los modelos de la base de datos

- **Modelo de persistencia (la base de datos):** `apps/api/prisma/schema.prisma` — los modelos
  Prisma, enums e índices. Es la **única fuente de verdad de la DB**, dueño exclusivo el backend; las
  migraciones y `seed.ts` van al lado. El cliente Prisma generado y sus tipos de fila se usan **solo
  dentro de `apps/api`** (en los repositories). El frontend no tiene acceso a ellos.
- **Modelo de API / contrato (lo que ve el frontend):** los **esquemas zod en `packages/contracts`** —
  las formas de request/response que ambas apps comparten. A propósito **no** son los modelos Prisma;
  los services mapean una fila Prisma → un DTO de contrato (p. ej. `Decimal` → string de dinero,
  `Date` → string ISO), así la DB puede evolucionar sin romper la API mientras se actualice el mapeo.
- **Punto único para importar las interfaces de modelos:** `packages/contracts/src/models.ts`
  re-exporta cada tipo de entidad (+ sus inputs create/update y enums) en un solo lugar plano, así
  cualquier código puede hacer `import type { BankAccount, Transaction, Debt } from "@finance/contracts/models"`.
  Es la forma ergonómica y consistente de referenciar las formas de modelo (los esquemas/namespaces
  zod por dominio siguen disponibles desde la raíz del paquete). Al agregar un dominio, añade sus
  tipos ahí también.
- **Regla práctica:** cambiar la DB → editar `apps/api/prisma/schema.prisma` + agregar una migración;
  cambiar lo que recibe el cliente → editar `packages/contracts` + el mapeo del service.

## 3. Backend (`apps/api`)

- **Framework:** NestJS 10 (TypeScript, CommonJS). Los módulos de dominio mapean 1:1 con los dominios de negocio.
- **Skeleton por dominio:** `controller` (HTTP) → `service` (lógica de negocio) → `repository` (el
  único lugar que toca Prisma para ese dominio). Las formas (DTO) vienen de `@finance/contracts`.
- **Dueño de la DB:** un único `PrismaService` (`infra/prisma`, `@Global`) es el único cliente de DB.
  El schema, las migraciones y el seed de Prisma viven en `apps/api/prisma`. Ninguna otra app accede a la DB.
- **Validación:** `ZodValidationPipe` valida cuerpos/queries contra esquemas zod de
  `@finance/contracts`. (No se usa class-validator de Nest, a propósito.)
- **Errores:** un `AllExceptionsFilter` global mapea todo a `{ error: { code, field? } }` con un
  `code` estable en SCREAMING_SNAKE — **nunca texto en idioma**. Se preserva el status HTTP.
- **Superficie de la API:** REST bajo `/api/v1`, por dominio (`/api/v1/accounts`, `/transactions`,
  `/installments`, `/debts`, `/savings`, `/investments`, `/import`, `/auth`). Ver
  [contracts/api-conventions.md](../../specs/001-api-frontend-monorepo/contracts/api-conventions.md).

## 4. Frontend (`apps/web`)

- **Framework:** SPA Vite + React 18. Compila a un bundle estático desplegable en cualquier CDN/host estático.
- **Acceso a la API:** solo a través de `shared/lib/apiClient.ts`, que apunta a `VITE_API_URL`, envía
  `credentials: "include"` (cookies de auth httpOnly), y convierte respuestas no-2xx en
  `ApiRequestError(code, status, field)`.
- **Organización por dominio:** `domains/<dominio>/{api,hooks,components,routes}`. Data fetching con
  TanStack Query; routing con react-router; auth con `AuthProvider`/`useAuth` + `RequireAuth`.
- **i18n:** el frontend es **dueño** de los catálogos es/en (`src/i18n`). Los `code` de error de la API
  se mapean a mensajes `errors.<CODE>` en el cliente. Las claves deben mantener paridad es/en.

## 5. Paquetes compartidos (`packages/*`)

- **`@finance/contracts`** — esquemas zod + tipos TS inferidos; única fuente de verdad del contrato
  de la API. Un módulo por dominio (`accounts`, `transactions`, …) más `common` (`moneyString`,
  `apiError`). Se compila a `dist` (CJS) para Node/Nest; una condición de export `import` apunta al
  `src` para que Vite empaquete el TypeScript directamente.
- **`@finance/money`** — toda la matemática monetaria sobre `decimal.js`: parse/format/suma,
  `equalPrincipalSchedule` (amortización de capital constante; la última cuota absorbe el remanente de
  redondeo) y helpers de interés (`simpleFutureValue`, `compoundFutureValue`, `simpleInterestAccrued`,
  `nominalAnnualToMonthlyRate`). Devuelve strings decimales de escala fija (4 decimales).
- **`@finance/config`** — `tsconfig.base.json` compartido.

**Dirección de dependencias (unidireccional):** `apps → packages`; los `packages` no dependen de nada
del repo; `api ↛ web` y `web ↛ api`. Esto mantiene a `apps/api` + `packages/*` como un subconjunto
autocontenido, de modo que el backend podría extraerse a su propio repositorio de forma mecánica.

## 6. Autenticación

- El backend emite **JWT de acceso + refresh entregados como cookies httpOnly** (`domains/auth`):
  `POST /auth/register|login|refresh|logout`, `GET /auth/me`. El refresh rota el par.
- `JwtAuthGuard` valida la cookie de acceso y adjunta el usuario; `@CurrentUser` lo inyecta.
  Cada endpoint de dominio está acotado al `userId` autenticado (aislamiento de datos por usuario).
- El `AuthProvider` del frontend hidrata desde `/auth/me`, expone `login/register/logout`, y
  `RequireAuth` protege las rutas.
- CORS permite el origen web con credenciales. (La protección CSRF para auth por cookies es endurecimiento planificado.)

## 7. Dinero y precisión

El dinero nunca usa floats de JS. Cruza el límite como **strings decimales** (zod `moneyString`),
se calcula con `@finance/money` (`decimal.js`), y se persiste como `Prisma.Decimal` a la precisión
del schema (`Decimal(18,4)` para montos). El redondeo es explícito (banquero, 4 decimales).

## 8. Tooling, quality gates y límites

- **Turborepo** pipelines: `build`, `dev`, `test`, `lint`, `typecheck` (`turbo.json`); los scripts de
  la raíz delegan a turbo, `--filter` corre una sola app.
- **Tests:** Vitest en apps y paquetes (e2e de NestJS vía plugin SWC para metadata de decoradores;
  React vía Testing Library + jsdom).
- **Límites:** `pnpm check:boundaries` (`scripts/check-boundaries.mjs`) falla el build si `apps/web`
  importa el backend o un cliente de DB, si `apps/api` importa el frontend, o si algún `packages/*`
  importa una app.
- **CI** (`.github/workflows/ci.yml`): install → `check:boundaries` → `turbo typecheck test build`
  (filtrado por afectados en PRs, para que cada app se construya/pruebe independientemente).
- **Definición de listo:** `check:boundaries`, typecheck, tests y build pasan.

## 9. Despliegue

- **`apps/api`** → contenedor Node (`apps/api/Dockerfile`, construido desde la raíz); sirve `/api/v1`.
- **`apps/web`** → bundle estático tras nginx (`apps/web/Dockerfile` + `nginx.conf`, fallback SPA);
  configurado en build con `VITE_API_URL`.
- Cada app tiene su propio ciclo de build/deploy (desplegables por separado).

## 10. Entorno

- `apps/api/.env`: `DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  opcional `ALPHA_VANTAGE_API_KEY`, y el bloque S3 opcional para los comprobantes de movimientos
  (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
  `S3_FORCE_PATH_STYLE`) — si faltan, los adjuntos responden `503 ATTACHMENTS_UNAVAILABLE` y nada más
  se ve afectado.
- `apps/web/.env`: `VITE_API_URL`.
- Los secretos nunca se commitean; ver el `.env.example` de cada app.

## 11. Pendientes conocidos (diferidos)

- **Cotización ETF en vivo de inversiones** (Alpha Vantage + `EtfPriceCache` TTL 24h) — no implementado;
  el dominio investments es solo CRUD.
- **Carga de archivo en import** — `POST /api/v1/import/transactions` acepta filas JSON ya parseadas;
  la carga multipart/xlsx + parseo de Excel en el servidor está diferida.
- **Endurecimiento CSRF** para auth basada en cookies.

## 12a. Patrón backend DDD + CQRS, una tabla por dominio

**Enmienda (2026-07-30, una tabla = un dominio):** los 11 dominios de negocio se dividieron por
tabla. Cada tabla de `prisma/schema.prisma` tiene su carpeta `src/domains/<tabla>/` (kebab-case,
igual que su `@@map`) y **solo un adapter puede consultarla** — 22 dominios-tabla, más `import` y
`health` que no son dueños de ninguna. `accounts` se volvió `bank-account` + `card-account` +
`card-limit` + `billing-settings` + `credit-statement`; `reference` se volvió `country` + `currency` +
`country-currency` + `country-identifier-type` + `financial-institution`; `savings` e `installments`
se partieron en su tabla de meta/plan y la de aporte/cuota; `auth` → `user`,
`wallet` → `wallet-item-dashboard`, `transactions` → `transaction`, y los demás plurales pasaron a
singular. `etf-price-cache` tiene carpeta aunque su feature esté diferida.

Tres reglas hacen que la división no debilite los aggregates:

1. **Los límites de aggregate no cambian.** `CardAccount`/`CardLimit`/`BillingSettings` siguen siendo
   entidades del aggregate `BankAccount` y solo se escriben a través de él — sus dominios son dueños
   de la _tabla_, nunca de las reglas. Igual `InstallmentPayment` bajo `InstallmentPlan` y
   `SavingsEntry` bajo `SavingsGoal`. Esas carpetas tienen solo `domain/` + `infrastructure/`.
2. **Leer una tabla ajena es componer su port**, nunca un `include` de Prisma:
   `PrismaBankAccountRepository` inyecta los ports de tarjeta/tope/facturación/institución para
   hidratar el aggregate; `PrismaTransactionRepository` mueve el cupo vía
   `BankAccountRepositoryPort.incrementCreditUsedWithTx`. La atomicidad cross-tabla no cambia: un
   único `prisma.$transaction(...)` abierto por el handler, y cada participante expone un método
   `*WithTx` que se engancha a él.
3. **Dos módulos por tabla cuando hace falta.** `<tabla>.data.module.ts` es hoja: exporta solo el
   binding port→adapter de esa tabla y no importa ningún otro dominio. `<tabla>.module.ts` tiene
   handlers/controladores e importa las hojas que lee. La orquestación depende de las hojas, nunca al
   revés — es lo único que mantiene el grafo acíclico donde dos tablas se referencian
   (`transaction` ⇄ `bank-account`, `credit-statement` ⇄ `bank-account`).

Las URLs públicas no cambiaron: `/accounts/:id/credit-statements*` y `/generate-statements` los
sirve el Facade propio de `credit-statement`; `/countries`, `/currencies` e `/institutions`, los
suyos.

El resto de esta sección describe el patrón de capas en sí, que no cambió.

### Las cuatro capas (`accounts`/`bank-account` es la referencia)

**Enmienda (2026-07-25, specs/009-ddd-cqrs-architecture):** `apps/api` migró, dominio por
dominio, del esqueleto plano `module → controller → service → repository` de la §1 a DDD táctico +
CQRS completo. `accounts` (específicamente su área de `billing`/facturación) es la implementación
de referencia. **Los 11 dominios están migrados (FR-017) — no queda ningún archivo
`*.service.ts`/`*.repository.ts` bajo `src/domains/`**; el esqueleto plano descrito antes en este
documento es histórico. Para un dominio nuevo, espeja `accounts`.

Cada dominio migrado gana **cuatro capas internas** bajo `src/domains/<dominio>/`:

| Capa              | Contiene                                                                                                                                                                                                           | Nunca contiene                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `domain/`         | Aggregates (invariantes + ciclo de vida), objetos State, objetos Strategy, eventos de dominio, puertos de repositorio (interfaces), errores de dominio propios                                                     | Imports de Prisma, detalles HTTP                          |
| `application/`    | Objetos command/query + sus handlers (`ICommandHandler`/`IQueryHandler` de `@nestjs/cqrs`, sobre un Template Method compartido `BaseCommandHandler`/`BaseQueryHandler` en `src/infra/cqrs/`), listeners de eventos | Imports de Prisma, reglas de negocio duplicadas           |
| `infrastructure/` | Adaptadores Prisma que implementan los puertos del dominio — los ÚNICOS archivos del dominio con permiso para importar `@prisma/client`                                                                            | Reglas de negocio                                         |
| `presentation/`   | El controlador (un Facade delgado: request → command/query vía `CommandBus`/`QueryBus` → response) + DTOs Zod para body/query/**path params** (`ZodParamsPipe`, junto al ya existente `ZodValidationPipe`)         | Reglas de negocio, llamadas directas a repositorio/Prisma |

Árbol de referencia (`accounts`, tras specs/009):

```
apps/api/src/domains/accounts/
├── accounts.module.ts                  # conecta CqrsModule + las 4 capas
├── domain/
│   ├── bank-account.aggregate.ts       # invariantes: tipos cardable, reglas del cupo de crédito
│   ├── credit-statement.aggregate.ts   # patrón State: OPEN → PENDING → PAID
│   ├── states/{credit-statement-state,open-state,pending-state,paid-state}.ts
│   ├── billing-eligibility.strategy.ts # Strategy: elegibilidad CREDIT_LINE vs. tarjeta adicional
│   ├── events/{statement-closed,statement-paid,account-deactivated}.event.ts
│   ├── ports/{bank-account,credit-statement}.repository.port.ts
│   ├── errors.ts
│   └── billing-cycle.ts                # helper puro de fechas (sin cambios respecto a antes)
├── application/
│   ├── commands/*.command.ts + *.handler.ts   # pay/generate/correct/create/update/... + tarjetas
│   ├── queries/*.query.ts + *.handler.ts       # list-accounts, get-account, list-credit-statements
│   └── events/log-statement-paid.listener.ts   # suscriptor Observer de referencia
├── infrastructure/
│   ├── prisma-bank-account.repository.ts
│   └── prisma-credit-statement.repository.ts
└── presentation/
    ├── accounts.controller.ts
    └── dto/*.params.ts                  # esquemas Zod de path params
```

Patrones aplicados y por qué (razonamiento completo en
`specs/009-ddd-cqrs-architecture/spec.md` FR-005–FR-014):

- **State** (`CreditStatement`): cada etapa del ciclo de vida es su propio objeto
  (`OpenState`/`PendingState`/`PaidState`) que responde `canClose()`/`canPay()`/
  `canCorrectAmount()` — el aggregate siempre delega en `this.state`, nunca reimplementa el chequeo.
- **Strategy** (`BillingEligibilityStrategy`): "es esta cuenta/tarjeta elegible para cerrar su
  período" varía por categoría (`CreditLineEligibility`/`AddOnCardEligibility`) y se espera que
  crezca en categorías — una nueva es una clase nueva, no un `if/else` editado.
- **Template Method** (`BaseCommandHandler`/`BaseQueryHandler`, `src/infra/cqrs/`): fija el
  esqueleto load → handle → persist → publish; cada handler concreto solo aporta los tres pasos
  específicos. Un command siempre está tipado `{ scope: "user"; userId }` o
  `{ scope: "system" }` (el `GenerateAllDueStatementsCommand` del cron de facturación es la única
  excepción, nombrada y tipada, a la acotación por usuario — cada fila que toca sigue acotada
  internamente).
- **Adapter** (`infrastructure/prisma-*.repository.ts`): implementa una interfaz
  `domain/ports/*.port.ts`; las capas domain/application dependen solo del puerto.
- **Facade** (`presentation/accounts.controller.ts`): traduce request → command/query → response,
  nada más.
- **Observer** (eventos de dominio + `EventBus` de `@nestjs/cqrs`): una transición de estado
  relevante para el resto del sistema publica un evento (`StatementClosedEvent`/
  `StatementPaidEvent`/`AccountDeactivatedEvent`); los listeners
  (`application/events/*.listener.ts`) se suscriben sin que el publicador sepa que existen.
  **Se despachan síncronamente por defecto** — un listener que falla se ve como parte del mismo
  request; lo asíncrono es opt-in por listener, solo cuando una reacción puede esperar de verdad
  (ninguno lo necesitó todavía).
- **Decorator** (FR-013, `src/infra/cqrs/handler-logging.interceptor.ts`): el logging/timing
  alrededor del dispatch de un command/query es un interceptor de NestJS registrado **una sola vez**
  como `APP_INTERCEPTOR` global en `app.module.ts` — cubre el controlador de todos los dominios, y
  como cada controlador es un Facade delgado que despacha exactamente un command/query, el span del
  request _es_ el span del handler. Nunca envolver `CommandBus.execute` a mano ni poner un `Logger`
  dentro de un handler o de `BaseCommandHandler.execute`.
- **Persistencia cross-aggregate** (FR-020): una acción de negocio que abarca inherentemente más de
  un aggregate en un solo paso atómico (pagar una facturación toca `CreditStatement` + un
  `Transaction` nuevo + `BankAccount`) usa un único `prisma.$transaction(...)` dentro del `persist()`
  propio de ese handler (`saveWithTx(tx, aggregate)` en los puertos) — una excepción pragmática
  documentada, no pureza de un-aggregate-por-transacción forzada más allá de lo útil.
- **Explícitamente fuera de alcance** (FR-009/FR-014): Singleton (el DI de Nest ya lo da), Abstract
  Factory/Prototype (no existe esa necesidad aquí), Proxy (`JwtAuthGuard` ya cumple ese rol),
  Composite (no hay datos recursivos/en árbol en esta app).

Los **tests** se mueven fuera de `src/` a `apps/api/test/{unit,integration,e2e}/`, reflejando
`src/domains/<dominio>/<capa>/...`:

- `test/unit/**` — aggregates, states, strategies, handlers de command/query con **puertos falsos**
  (sin Prisma, sin HTTP, sin ninguna conexión a BD — demostrable corriendo `pnpm --filter
@finance/api test:unit` con Postgres detenido).
- `test/integration/**` — adaptadores Prisma + la garantía de rollback de la transacción
  cross-aggregate, contra una base de datos de test real.
- `test/e2e/**` — flujos HTTP completos a través del controlador Facade, idénticos en
  comportamiento a antes de la migración (sin cambios al contrato público de la API — FR-015).

`pnpm --filter @finance/api test:unit` / `test:integration` / `test:e2e` corren cada nivel de forma
independiente; `pnpm --filter @finance/api test` corre los tres en secuencia.

Esta migración no cambia ningún contrato HTTP público ni ninguna forma de `@finance/contracts` — es
una reorganización puramente interna (FR-015). Ver `.specify/memory/constitution.md` para el
principio constitucional correspondiente y la sección `accounts` de `CLAUDE.md` para la enmienda
narrativa.

## 12b. Movimientos: traspasos y adjuntos (specs/010)

**Traspaso.** Un traspaso entre dos cuentas propias NO es un `TransactionType` nuevo: son **dos filas
corrientes** — un `EXPENSE` en el origen y un `INCOME` en el destino — unidas por la columna nueva
`Transaction.transferGroupId`. Cada cuenta ve su propio lado como un movimiento normal y todo lo que
ya existía (deltas de saldo, paginación por keyset, filtros, la vista de cuenta) sigue funcionando sin
tocarse.

El precio de esa decisión es que ninguna suma existente excluye un traspaso por sí sola, así que la
regla vive en UN solo predicado con nombre: `EXCLUDE_TRANSFERS` (`transaction/application/queries/transaction-list-filter.ts`),
aplicado a `currencyTotals` y `categories` de `GET /transactions/summary`, y replicado en el frontend
por `excludeTransfers` en `domains/dashboard/lib/metrics.ts`. El listado y el contador "N movimientos"
NO los excluyen: ambos lados son filas reales del conjunto en pantalla. **Todo agregado nuevo de
ingreso/gasto debe aplicar el predicado.**

Reglas (`transaction/domain/transfer-policy.ts`): las dos cuentas deben ser distintas y del usuario,
el destino nunca es `CREDIT_LINE` (pagar una línea de crédito es un pago de facturación, con su propio
flujo), ningún lado lleva `cardId` ni `creditStatementId`, y ambos montos son positivos. Las monedas
son las de cada cuenta y nunca se comparan — esta app no hace conversión. Endpoints
`POST/GET/PATCH/DELETE /transactions/transfers[/:groupId]` (declarados ANTES de `:id`).
`DELETE /transactions/:id` sobre un lado borra el par; `PATCH` sobre un lado responde
`409 TRANSFER_EDIT_AS_PAIR`. Cada escritura pasa por `saveTransferPair` / `updateTransferPair` /
`removeTransferPair`, cada uno una sola `prisma.$transaction` que cubre las dos filas Y los dos deltas
de saldo — un traspaso a medio escribir sería dinero desaparecido.

**Adjuntos** (dominio 22, `transaction-attachment`). Tabla propia, dominio propio, sus cuatro capas y
su Facade bajo `/transactions/:id/attachments`: un adjunto tiene ciclo de vida propio (se sube y se
borra sin tocar el movimiento) y sus bytes viven fuera de la base de datos. La subida pasa POR el API
(`FileInterceptor`, memoria, tope de 5 MB, filtro por mimetype) porque es el único lugar donde el
tamaño, el tipo real y la propiedad se comprueban antes de escribir nada; `AttachmentPolicy` valida el
content type declarado Y los **magic bytes** del archivo (JPEG/PNG/WebP/PDF), que es lo que impide un
ejecutable renombrado a `.pdf`. La lectura se delega al bucket con una URL firmada de 5 minutos, así
el API nunca proxya bytes.

`ObjectStoragePort` (`put`/`getSignedUrl`/`delete`/`isConfigured`) mantiene el cliente S3 en
`infrastructure/` — la misma regla de Adapter que ya cumple Prisma —, de modo que el tier unitario usa
un doble en memoria y no toca la red. Sin bucket configurado el puerto responde
`isConfigured() === false` y toda escritura/lectura devuelve `503 ATTACHMENTS_UNAVAILABLE`, mientras
que el listado sigue funcionando y el panel se pinta igual. Al borrar se elimina primero la fila y
DESPUÉS el objeto (una llamada de red no puede vivir dentro de `prisma.$transaction`); si el bucket
falla se registra la clave huérfana y no se revierte el borrado — un archivo huérfano es un problema
de costo, un movimiento que no se deja borrar es uno de corrección.

**Web.** El detalle y el formulario de crear/editar son ambos `SidePanel` construidos sobre el
primitivo compartido `shared/ui/detail-row.tsx`: monto protagonista, filas etiqueta/valor y acciones
al pie. El detalle navega con ‹ › sobre el mismo arreglo que ya tiene la tabla detrás
(`panelNavigation`, sin consulta propia) y ofrece Duplicar (una creación precargada, con fecha de
hoy). "Saldo tras el movimiento" (`balanceAfter.ts`) y "saldo proyectado" (`projectedBalance.ts`) se
calculan en el cliente con `@finance/money` y se OMITEN en vez de aproximarse cuando el conjunto
cargado no los sostiene — ver `docs/PENDING.md`.

## 12c. Escrituras idempotentes: el protocolo de dos fases (specs/015)

**El problema.** Reintentar una escritura que mueve plata no puede duplicar su efecto, pero dos
operaciones genuinamente distintas que se parecen —"dos cafés iguales"— tienen que entrar las dos. El
principio VII de la constitución nombra tres mecanismos aceptables; una llave natural sobre monto/
fecha/cuenta/descripción (forma b) rechazaría el segundo café en silencio, así que esta app usa la
forma (c): una clave `Idempotency-Key` generada por el cliente, que el servidor recuerda.

**El candado es el constraint único, no una validación antes de él.** `IdempotencyRecord`
(`domains/idempotency-record`) tiene `@@unique([userId, key])`. Dos peticiones concurrentes con la
misma clave intentan el mismo INSERT; Postgres deja pasar exactamente una. El repositorio traduce el
`P2002` resultante en un resultado `EXISTS` en vez de tratarlo como error — esa colisión ES el
mecanismo, no un bug que rodear.

**Dos fases, y el orden es todo el argumento de seguridad** (`specs/015/research.md` §3):

1. **RESERVAR** — `reserve(userId, key)` corre en su propia transacción. `EXISTS` significa que
   `decideReplay()` sobre el registro existente decide qué sigue: **replay** de la respuesta guardada
   tal cual (misma operación, mismo hash SHA-256 sobre JSON canónico —
   `infra/cqrs/request-hash.ts`), rechazo con `IDEMPOTENCY_KEY_REUSED` (409 — datos distintos bajo la
   misma clave), respuesta `IDEMPOTENCY_IN_PROGRESS` (409 — el intento original sigue corriendo), o
   **toma de control** de una reserva abandonada una vez vencida (>60 s).
2. **EJECUTAR** — el `handleIdempotent()` del handler abre EXACTAMENTE UNA `prisma.$transaction` que
   cubre TANTO el efecto real (el insert, el delta de saldo, el descuento del cupo, …) COMO la llamada
   a `complete(tx, body, status)`, que estampa el registro `COMPLETED` dentro de esa misma transacción.

Completar el registro en una transacción SEPARADA después de la del efecto parecería equivalente y no
lo es: una caída entre medio deja el efecto aplicado y el registro todavía `IN_FLIGHT`, y el siguiente
reintento —viendo un registro en vuelo— volvería a aplicar el efecto. Como completar es atómico con el
efecto, `IN_FLIGHT` siempre implica que el efecto nunca se comprometió, que es lo que hace segura la
toma de control de una reserva vencida por argumento y no por optimismo.
`BaseIdempotentCommandHandler` (`infra/cqrs/base-idempotent-command.handler.ts`) es el Template Method
que impone esta forma — lanza si el `handleIdempotent()` de un handler concreto retorna sin haber
llamado nunca a `complete()`.

**Consecuencia sobre quién es dueño de la transacción.** Cada escritura protegida necesitó una
variante `*WithTx(tx, …)` de su método de repositorio, y es el _handler_ —no el adapter— quien ahora
abre la `$transaction`, porque es el único lugar que conoce tanto el efecto como la marca de
idempotencia. Esto sacó la propiedad de la transacción de `saveNew`/`saveTransferPair` (que antes
abrían la suya propia) y la puso en `CreateTransactionHandler`/`CreateTransferHandler`; los cuatro
handlers de `debt` además no tenían ninguna transacción antes de esto y ahora hacen el ciclo completo
lectura-mutación-escritura dentro de una, usando `findOneForUpdateWithTx` (`SELECT … FOR UPDATE`) —
necesario porque envolver sólo la escritura dejaba la _lectura_ (antes en `loadContext()`, que corre
ANTES de que la transacción se abra) compitiendo entre peticiones concurrentes: 6 llamadas simultáneas
a `register-payment` sobre la misma deuda avanzaban el contador sólo 2 veces hasta que la lectura se
movió adentro del candado.

**Diez operaciones protegidas**: `POST /transactions`, `POST /transactions/transfers`,
`POST /installments`, `POST /installments/:id/payments/:seq/pay`,
`POST /accounts/:id/credit-statements/:id/pay`, `POST /debts/:id/settle`, `POST /debts/:id/unsettle`,
`POST /debts/:id/payments`, `DELETE /debts/:id/payments`, `POST /savings/entries`. Un cron diario
(`infra/cron/idempotency-cleanup.cron.ts`) purga intentos pasado su período de retención vía el único
comando `scope: "system"` del dominio, siguiendo el molde de `billing-generation.cron.ts`.

**Deliberadamente fuera de alcance**: `POST /import/transactions` (no tiene ningún llamador real
todavía — la ruta web de importación es un placeholder) y recargar la página a mitad de un envío (la
clave en memoria, `useIdempotencyKey`, se pierde — un reenvío es un intento genuinamente nuevo). Ambos
catalogados en `docs/PENDING.md`.

## 12. Agregar un dominio nuevo (resumen)

1. Agrega esquemas zod + tipos en `packages/contracts/src/<dominio>/` y expórtalos desde `src/index.ts`.
2. Backend: crea `apps/api/src/domains/<dominio>/{module,controller,service,repository,spec}` y
   registra el módulo en `app.module.ts`. Acota cada query por `userId`; valida con `ZodValidationPipe`.
3. Frontend: crea `apps/web/src/domains/<dominio>/{api,hooks,routes}`, agrega la ruta a
   `app/router.tsx`, y agrega claves i18n es/en.
4. Corre `pnpm check:boundaries && pnpm typecheck && pnpm test && pnpm build`.

Ver los skeletons por app en [apps/api/README.md](../../apps/api/README.md) y
[apps/web/README.md](../../apps/web/README.md).
