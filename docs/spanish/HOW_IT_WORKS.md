# FinanceApp — Cómo funciona y cómo ejecutarlo

Complemento práctico de [ARCHITECTURE.md](./ARCHITECTURE.md). Ese documento dice _qué son las piezas_;
este dice _cómo se ejecutan y cómo fluye un request de punta a punta_.

> Versión en inglés: [../english/HOW_IT_WORKS.md](../english/HOW_IT_WORKS.md)

---

## 1. El modelo mental en un párrafo

Hay **dos programas independientes** que conviven en un repo: un **backend** (`apps/api`, NestJS) que
es dueño de la base de datos y responde requests HTTP bajo `/api/v1`, y un **frontend** (`apps/web`,
una app React de una sola página) que corre entero en el navegador y habla con el backend por HTTP.
Nunca comparten memoria ni código en runtime — solo **paquetes compartidos** en build
(`@finance/contracts` para las formas de request/response, `@finance/money` para la matemática de
dinero). Puedes arrancar, detener, construir y desplegar cada uno por su cuenta.

## 2. Qué corre dónde

| Proceso    | Qué es                                                 | URL por defecto         | Dueño de                                             |
| ---------- | ------------------------------------------------------ | ----------------------- | ---------------------------------------------------- |
| `apps/api` | Server Node/NestJS de larga vida                       | `http://localhost:3001` | La base de datos (Prisma), lógica de negocio, auth   |
| `apps/web` | Dev server de Vite (dev) / estáticos tras nginx (prod) | `http://localhost:5173` | La UI, el routing, las traducciones                  |
| PostgreSQL | La base de datos                                       | `:5432`                 | Datos persistidos — accedida **solo** por `apps/api` |

El navegador descarga la SPA de `apps/web`, y luego cada acción de datos es un `fetch()` a `apps/api`.

## 3. Ejecutarlo en local

```bash
# 1. instalar todo (todos los workspaces)
pnpm install

# 2. generar el cliente Prisma del backend
pnpm --filter @finance/api exec prisma generate

# 3. configurar env (copia los ejemplos, completa valores)
#    apps/api/.env  -> DATABASE_URL, PORT, CORS_ORIGIN, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#    apps/web/.env  -> VITE_API_URL=http://localhost:3001

# 4. preparar la base de datos (migraciones + datos demo)
pnpm db:migrate
pnpm db:seed

# 5. correr ambas apps juntas (Turborepo las corre en paralelo)
pnpm dev
```

O por **separado** (demuestra el desacople):

```bash
pnpm --filter @finance/api dev   # solo backend, en :3001
pnpm --filter @finance/web dev   # solo frontend, en :5173
```

Chequeo de salud (backend solo, sin necesitar el frontend):

```bash
curl http://localhost:3001/api/v1/health   # -> {"status":"ok","service":"finance-api"}
```

## 4. Cómo arranca el backend (`apps/api/src/main.ts`)

1. Nest crea la app desde `AppModule`, que importa `ConfigModule` (env), el `PrismaModule` global
   (un cliente de DB) y cada módulo de dominio (`auth`, `accounts`, …).
2. Setup global: prefijo `/api/v1`, parser de cookies, CORS para el origen web **con credenciales**, y
   el filtro de errores global que convierte cualquier error en `{ error: { code } }`.
3. Escucha en `PORT` (3001). `PrismaService.onModuleInit` abre la conexión a la DB.

## 5. Ciclo de vida de un request (lo importante)

### a) Login

```
Navegador (LoginRoute)              apps/api                         PostgreSQL
   │  POST /api/v1/auth/login          │                                 │
   │  { email, password } ───────────▶ │ AuthController.login            │
   │                                   │  → ZodValidationPipe (valida)   │
   │                                   │  → AuthService.validateCredentials
   │                                   │     → AuthRepository.findByEmail ─▶ SELECT user
   │                                   │     → bcrypt.compare(password)   │
   │                                   │  → emite JWT acceso + refresh    │
   │ ◀── 200 { id, email, name } ──────│  Set-Cookie: access_token (httpOnly)
   │     + cookies httpOnly            │  Set-Cookie: refresh_token (httpOnly)
```

Los tokens viven en **cookies httpOnly**, así JavaScript no puede leerlos (seguro ante XSS). El
frontend solo recibe el objeto usuario y lo guarda en estado de React (`AuthProvider`).

### b) Un request autenticado (p. ej. listar cuentas)

```
Navegador (useAccounts → apiClient)      apps/api
   │  GET /api/v1/accounts                 │
   │  (cookies enviadas solas) ──────────▶ │ JwtAuthGuard: verifica cookie access_token
   │                                       │   → adjunta { id: userId } al request
   │                                       │ AccountsController.list(@CurrentUser)
   │                                       │   → AccountsService.list(userId)
   │                                       │      → AccountsRepository.list(userId)  // ¡acotado!
   │                                       │   → mapea Decimal → string, Date → ISO
   │ ◀── 200 [ {id,name,currentBalance:"…"} ]
```

Aquí siempre se cumplen dos reglas:

- **Aislamiento por usuario:** la query del repositorio se filtra por el `userId` del token — un
  usuario nunca puede ver datos de otro.
- **Dinero como strings:** los montos cruzan como strings decimales (p. ej. `"1240.5000"`), parseados
  con `@finance/money` en ambos lados, nunca como floats.

### c) Cuando el access token expira

El frontend llama a `POST /api/v1/auth/refresh`; el backend valida la cookie de refresh, emite un par
acceso+refresh nuevo (rotación) y se reintenta el request. El logout limpia ambas cookies.

### d) Errores

La API responde fallos con un código estable, p. ej. `401 { "error": { "code": "INVALID_CREDENTIALS" } }`.
El frontend mapea ese código a un mensaje localizado (`errors.INVALID_CREDENTIALS` en es/en) — la API
nunca manda texto humano, así el idioma queda como asunto del frontend.

## 6. Cómo corre el frontend (`apps/web`)

1. `index.html` carga `src/main.tsx`, que monta React dentro de `<Providers>` (TanStack Query +
   i18n + `AuthProvider`) y un `RouterProvider`.
2. Al cargar, `AuthProvider` llama a `GET /auth/me`. Si responde OK → usuario logueado; si falla →
   `RequireAuth` redirige las rutas protegidas a `/login`.
3. Cada pantalla vive en `domains/<dominio>/routes`, hace fetch vía un query en `domains/<dominio>/hooks`
   que llama a `domains/<dominio>/api` (tipado con `@finance/contracts`), que usa el `apiClient` compartido.
4. El `apiClient` siempre envía `credentials: "include"` (las cookies) y convierte no-2xx en un
   `ApiRequestError(code)` tipado que la UI puede traducir.

## 7. Por qué los paquetes compartidos importan en runtime vs build

- `@finance/contracts` es **pegamento en build**: ambas apps importan el mismo esquema/tipo zod para,
  digamos, una transacción, así que si la forma cambia, ambos lados rompen en compilación (no en producción).
- `@finance/money` es **lógica en runtime**: la matemática decimal real (sumas, cronogramas de cuotas,
  interés) corre igual donde sea que se la llame.
- Ninguna app importa a la otra; `scripts/check-boundaries.mjs` falla el build si eso se viola alguna
  vez. Eso es lo que mantiene a las dos mitades genuinamente independientes.

## 8. Tests, quality gates, build y deploy

```bash
pnpm test              # Vitest en api + web + paquetes
pnpm typecheck         # tsc --noEmit por paquete
pnpm check:boundaries  # web↛api/db, api↛web, packages↛apps
pnpm build             # Turborepo construye paquetes y luego ambas apps
```

El CI (`.github/workflows/ci.yml`) corre los mismos gates en cada PR. Salidas de build:

- `apps/api` → app Node compilada (`dist/main.js`), enviada como contenedor Node (`apps/api/Dockerfile`).
- `apps/web` → bundle estático (`dist/`), servido por nginx (`apps/web/Dockerfile` + `nginx.conf`),
  horneado con `VITE_API_URL` en build.

Como construyen y despliegan por separado, puedes lanzar un fix de frontend sin redeployar la API, y
escalar la API independientemente del frontend estático.

## 9. Dónde mirar cuando…

| Quieres…                              | Ve a                                                          |
| ------------------------------------- | ------------------------------------------------------------- |
| Cambiar la forma de un endpoint       | `packages/contracts/src/<dominio>/` (luego ambas apps siguen) |
| Agregar lógica de negocio / una query | `apps/api/src/domains/<dominio>/{service,repository}.ts`      |
| Cambiar una pantalla                  | `apps/web/src/domains/<dominio>/routes/`                      |
| Tocar auth                            | `apps/api/src/domains/auth/` + `apps/api/src/infra/auth/`     |
| Agregar una traducción                | `apps/web/src/i18n/{es,en}.json`                              |
| Matemática de dinero                  | `packages/money/src/`                                         |
| Agregar un dominio completo           | el resumen en [ARCHITECTURE.md §12](./ARCHITECTURE.md)        |
