# FinanceApp — contexto canónico e historia técnica

> Versión en inglés: [../english/APP_CONTEXT_AND_HISTORY.md](../english/APP_CONTEXT_AND_HISTORY.md)
>
> **Nota:** este documento describe la app **monolítica Next.js original** (anterior a la migración
> al monorepo). El stack/routing aquí son **históricos**; la **visión de producto, el modelo de
> datos y las reglas de negocio siguen vigentes**. Para la arquitectura actual ver
> [ARCHITECTURE.md](./ARCHITECTURE.md).

Documento de referencia histórica y operativa para agentes y personas que mantienen el proyecto. El **código del repo** es la fuente de verdad; este archivo resume intención, estructura y convenciones observadas.

**Última revisión:** 2026-05-15

---

## 1. Origen y visión del producto

**Visión:** aplicación web de **finanzas personales** pensada para uso individual o doméstico: registrar **ingresos y gastos**, seguir **cuotas** (installments), **deudas** (prestado / debido), **metas de ahorro** y movimientos asociados, **cuentas bancarias** con saldo cacheado, **vistas/resúmenes y gráficos** (p. ej. Recharts en el stack), **inversiones** tipo **ETF** (cotización vía **Alpha Vantage**) y **cuentas remuneradas** (tasa anual, principal), e **importación desde Excel** (SheetJS / `xlsx`). El diseño apunta a **precisión monetaria** (tipos `Decimal` en DB y `decimal.js` en lógica de negocio) y despliegue moderno en la nube (p. ej. **Vercel**, alineado con Next.js).

**Stack tecnológico (estado actual del repo, `package.json`):**

| Área             | Tecnología                                                                   |
| ---------------- | ---------------------------------------------------------------------------- |
| Framework UI     | **Next.js** 14.x (App Router), **React** 18                                  |
| Base de datos    | **PostgreSQL** (documentado en `.env.example` como **Supabase** Postgres)    |
| ORM              | **Prisma** 6.x, `@prisma/client`                                             |
| Auth             | **NextAuth** v5 (`next-auth` beta), **Prisma adapter**, JWT sessions         |
| i18n             | **next-intl** 4.x, rutas bajo `/[locale]`                                    |
| UI / estilo      | **Tailwind CSS**, **Radix UI**, **next-themes** (light/dark/system)          |
| Números / dinero | **decimal.js** en utilidades financieras; **Prisma `Decimal`** en esquema    |
| Gráficos         | **recharts**                                                                 |
| Excel            | **xlsx** (SheetJS)                                                           |
| Validación       | **zod**                                                                      |
| Cotizaciones ETF | **Alpha Vantage** (`ALPHA_VANTAGE_API_KEY`; cliente en `lib/finance/etf.ts`) |

---

## 2. Línea de tiempo del repositorio (hechos verificables)

Lo siguiente se infiere del **estado del código**, no de una narrativa de control de versiones externa.

1. **Inicialización:** proyecto **Next.js** con App Router, TypeScript, Tailwind y dependencias listadas arriba (`package.json`).

2. **Persistencia:** modelo relacional definido en `prisma/schema.prisma` y materializado en SQL por migraciones.

3. **Migración inicial:** carpeta `prisma/migrations/20260515143000_init/` con `migration.sql` que crea ENUMs (`TransactionType`, `DebtDirection`, `InvestmentKind`), tablas de NextAuth (`User`, `Account`, `Session`, `VerificationToken`) y dominio financiero (`BankAccount`, `Transaction`, `InstallmentPlan`, `InstallmentPayment`, `Debt`, `SavingsGoal`, `SavingsEntry`, `Investment`, `EtfPriceCache`), con índices según el schema.

4. **Seed (`prisma/seed.ts`, comando `npm run db:seed`):**

   - Elimina y recrea solo usuarios con emails demo `demo@finance.local` y `partner@finance.local` (alineado con login dev en `auth.ts`).
   - No usa **bcrypt** ni contraseñas persistidas: el flujo de credenciales en desarrollo hace **upsert** de `User` por email sin hash.
   - Carga datos de ejemplo: cuentas, plan de cuotas, transacciones, deudas, ahorros, inversiones ETF + remunerada, y una fila demo en `EtfPriceCache` para `VTI`.

5. **Internacionalización:** `next-intl` con plugin en `next.config.mjs` apuntando a `i18n/request.ts`; mensajes en `messages/es.json` y `messages/en.json`; routing central en `lib/i18n/routing.ts` (`defaultLocale: "es"`, `localePrefix: "always"`).

6. **Theming / ajustes:** `components/providers.tsx` envuelve la app con `ThemeProvider` (next-themes) y `SessionProvider`. Ajustes de UI (tema e idioma) en `components/layout/SettingsSheet.tsx` con traducciones `settings.*`.

---

## 3. Arquitectura

### 3.1 App Router

- **`app/layout.tsx`:** layout raíz (`<html lang="es">`), fuente Inter, `Providers` (tema + sesión cliente).
- **`app/[locale]/layout.tsx`:** valida `locale` contra `routing.locales`, `setRequestLocale`, `NextIntlClientProvider`, `HtmlLang` para sincronizar atributo `lang` del documento.
- **Route groups:**
  - `(auth)` — login, registro (placeholder que enlaza a login).
  - `(dashboard)` — páginas autenticadas: dashboard, cuentas, transacciones, cuotas, deudas, ahorros, inversiones, importación.

### 3.2 API Routes (`app/api/`)

Rutas REST bajo `app/api/.../route.ts` (accounts, transactions, installments, debts, savings, investments, import, auth). **No pasan** por la cadena de middleware de locale/auth de la misma forma que las páginas: el `matcher` de `middleware.ts` **excluye** `api`. Cada handler usa **`auth()`** de `@/auth` y responde `401` si no hay sesión válida (patrón unificado de protección en API).

### 3.3 `lib/` — capas

| Ruta                                              | Rol                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `lib/prisma.ts`                                   | Singleton `PrismaClient` con logs en desarrollo                                                   |
| `lib/i18n/routing.ts`                             | Locales soportados y `defineRouting` (default `es`)                                               |
| `lib/i18n/pathname.ts`                            | Utilidad usada en middleware para extraer locale del pathname                                     |
| `lib/finance/installments.ts`                     | Cuotas: amortización a **capital constante** + interés simple opcional por periodo (`decimal.js`) |
| `lib/finance/interest.ts`                         | Interés compuesto / simple y utilidades de tasas (`decimal.js`)                                   |
| `lib/finance/etf.ts`                              | Cotización Alpha Vantage + caché `EtfPriceCache` con TTL **24 h** en código                       |
| `lib/utils/excel-parser.ts`                       | Parseo Excel → filas normalizadas para transacciones                                              |
| `lib/utils/currency.ts`, `formatters.ts`, `cn.ts` | Formato y utilidades UI                                                                           |

### 3.4 Componentes

- **`components/layout/`** — shell del dashboard: `Sidebar`, `Topbar`, `MobileNav`, `SettingsSheet`, `LanguageSwitcher`, `UserMenu`, `HtmlLang`.
- **`components/ui/`** — primitivos estilo shadcn (button, sheet, etc.).
- **`components/auth/`** — formularios de login.
- **`components/providers/`** — `theme-provider` (next-themes).

### 3.5 Middleware

Archivo `middleware.ts`:

1. Construye middleware **next-intl** con `routing`.
2. Lo envuelve con **`auth()`** de NextAuth: tras aplicar i18n, si la ruta no es pública y no hay sesión, **redirige** a `/{locale}/login`.
3. **Rutas públicas** (sin prefijo de locale en la lógica interna): `pathnameWithoutLocale === "/login"` o `=== "/register"`.
4. **`matcher`:** excluye `api`, `_next`, `_vercel` y archivos estáticos (`.*\\..*`).

### 3.6 Variables de entorno

Documentadas en **`.env.example`**:

- `DATABASE_URL` — Postgres (ej. Supabase).
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth opcional.
- `ALPHA_VANTAGE_API_KEY` — cotizaciones ETF.

**Nunca** versionar `.env` con secretos reales.

### 3.7 Config Next

`next.config.mjs`: plugin **next-intl** (`./i18n/request.ts`); `experimental.serverComponentsExternalPackages: ["@prisma/client"]`.

---

## 4. Modelo de datos y reglas de negocio (Prisma)

Fuente: `prisma/schema.prisma` y módulos en `lib/finance/`.

### 4.1 Autenticación (NextAuth / Auth.js)

- `User`, `Account`, `Session`, `VerificationToken` — esquema estándar con `@auth/prisma-adapter`.

### 4.2 Dominio financiero

- **`BankAccount`:** nombre, moneda, institución opcional, **`currentBalance`** como saldo **cacheado** (comentario en schema: reconciliar vía transacciones en lógica de app).
- **`Transaction`:** `INCOME` | `EXPENSE` (`TransactionType`), monto `Decimal(18,4)`, opcionalmente ligada a `BankAccount` y a **`InstallmentPlan`**.
- **`InstallmentPlan` + `InstallmentPayment`:** plan con principal total, número de cuotas, fechas de vencimiento por secuencia; pagos con `paidAt` opcional. La librería `buildEqualPrincipalSchedule` documenta reparto de **capital igual** e interés simple sobre saldo si se pasa APR por periodo (la alineación exacta con campos del plan en UI/API depende de cómo se consuma en cada pantalla).
- **`Debt`:** dirección `OWED_TO_YOU` | `YOU_OWE`, contraparte, principal, fechas, **`interestApr`** opcional (`Decimal(8,4)`).
- **`SavingsGoal` + `SavingsEntry`:** meta con monto objetivo; entradas opcionalmente ligadas a una meta.
- **`Investment`:** `ETF` (símbolo, acciones) o `REMUNERATED_ACCOUNT` (tasa anual, principal, opcionalmente `bankAccountId`).
- **`EtfPriceCache`:** una fila por **símbolo** único; `fetchedAt` + OHLCV; `rawJson` opcional. Comentario en schema: TTL ~24 h — la app considera **stale** lo anterior y refetch + upsert; la constante **`TTL_MS`** está replicada en `lib/finance/etf.ts` (**24 h**).

### 4.2 Dinero

- PostgreSQL: tipo `Decimal` con precisiones definidas por modelo.
- JS: **`decimal.js`** en cálculos financieros; Prisma usa `Prisma.Decimal` en seed.

### 4.3 Importación Excel — mapeo de columnas

**Archivo de referencia:** `lib/utils/excel-parser.ts`.

El parser espera un objeto **`mapping`** (validado con zod) que relaciona **nombres de columnas del Excel** con campos lógicos:

| Campo lógico | Clave en mapping | Notas                                                        |
| ------------ | ---------------- | ------------------------------------------------------------ |
| Fecha        | `date`           | Preferir ISO `yyyy-mm-dd` en hojas                           |
| Monto        | `amount`         | Positivo; signo negativo puede forzar gasto                  |
| Descripción  | `description`    | Opcional                                                     |
| Categoría    | `category`       | Opcional                                                     |
| Tipo         | `type`           | Opcional: sinónimos INCOME/EXPENSE (en/es) o signo del monto |
| Moneda       | `currency`       | Opcional                                                     |
| Cuenta       | `account`        | Opcional (texto)                                             |

La ruta **`POST app/api/import`** existe pero al 2026-05-15 devuelve un **stub** (`imported: 0`, nota de cablear SheetJS + parser); el parser en `lib` está **listo** para integrarse.

---

## 5. Autenticación y seguridad

### 5.1 Configuración (`auth.ts`)

- **Adapter:** `PrismaAdapter(prisma)`.
- **Sesión:** **`strategy: "jwt"`** (aunque existan tablas `Session` de Prisma, la config actual usa JWT).
- **Providers:**
  - **Google:** solo si `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` están definidos; `allowDangerousEmailAccountLinking: true`.
  - **Credentials** (`id: "dev-credentials"`): **solo si `NODE_ENV !== "production"`** — autoriza con solo email, hace `upsert` de usuario; útil contra datos del **seed**.
- **Callbacks:** propagan `sub` y email en JWT/session para `session.user.id`.
- **Páginas:** `signIn: "/login"` (ruta con locale gestionada por app).
- **`trustHost: true`**

### 5.2 Rutas protegidas

- Middleware: todo excepto `/login` y `/register` (con prefijo de locale) requiere **`req.auth`**.
- APIs: comprobar `session` con `auth()` en cada route handler.

### 5.3 Secretos

- No commitear **`.env`** ni claves reales; seguir `.env.example`.
- `NEXTAUTH_SECRET`: generación sugerida en comentario del example (`openssl rand -base64 32`).

---

## 6. Reglas para IA / construcción (convenciones del proyecto)

Resumen para futuros agentes, alineado con patrones del repo y expectativas de mantenimiento:

- **Cambios acotados:** edits mínimos al objetivo; evitar refactors masivos no solicitados.
- **Estilo:** imitar imports, naming y estructura existentes en el archivo tocado.
- **Commits:** crear commits **solo** cuando el usuario lo pida explícitamente.
- **i18n:** nuevas cadenas de UI en **`messages/en.json`** y **`messages/es.json`**; rutas y links con `@/i18n/navigation` (`Link`, `redirect`, etc.) cuando aplique.
- **Dinero:** preferir **`decimal.js`** / `Prisma.Decimal` para cálculos y redondeos coherentes con el schema.
- **Auth:** no exponer datos de un usuario a otro — filtrar por `session.user.id` en queries.
- **API:** mantener comprobación `auth()` y respuestas JSON consistentes.
- **Documentación Markdown:** no añadir archivos `.md` no pedidos salvo requerimiento explícito (este documento es una excepción solicitada).

---

## 7. Cómo extender

### 7.1 Nuevo locale (según comentarios en `lib/i18n/routing.ts`)

1. Ampliar el tuple **`locales`** en `lib/i18n/routing.ts` con el código nuevo.
2. Añadir **`messages/<code>.json`** con las mismas claves que `es`/`en`.
3. Donde exista `switch (locale)` exhaustivo con tipo `Locale`, TypeScript indicará rutas a actualizar.

Opcional: revisar `app/[locale]/layout.tsx` (`generateStaticParams` ya usa `routing.locales`).

### 7.2 Nuevo modelo Prisma

1. Editar **`prisma/schema.prisma`** (modelos, enums, índices, relaciones con `onDelete` coherentes).
2. Ejecutar **`npm run db:migrate`** (o `db:push` en prototipos locales) y regenerar cliente (`postinstall` ya ejecuta `prisma generate`).
3. Si afecta al seed demo, actualizar **`prisma/seed.ts`** con cuidado de no borrar usuarios que no sean `DEMO_EMAILS`.

### 7.3 Seed y orden de comandos

- Variables: copiar `.env.example` → `.env` y rellenar.
- Migraciones: `npm run db:migrate` (desarrollo) o `npm run db:migrate:deploy` (CI/prod).
- Datos demo: `npm run db:seed` (resets controlados para emails demo).
- Exploración: `npm run db:studio`.

### 7.4 Integrar import Excel end-to-end

Conectar en **`app/api/import/route.ts`**: multipart `file`, `parseExcelTransactions` desde `lib/utils/excel-parser.ts`, persistencia en `Transaction` / vínculo a cuentas según reglas de producto.

---

## Referencias rápidas de rutas en código

| Concepto                          | Ubicación                                        |
| --------------------------------- | ------------------------------------------------ |
| Auth NextAuth                     | `auth.ts`, `app/api/auth/[...nextauth]/route.ts` |
| Middleware i18n + auth            | `middleware.ts`                                  |
| Routing locales                   | `lib/i18n/routing.ts`                            |
| Cotizaciones ETF + caché 24h      | `lib/finance/etf.ts`, modelo `EtfPriceCache`     |
| Cuotas (lógica capital constante) | `lib/finance/installments.ts`                    |
| Excel                             | `lib/utils/excel-parser.ts`                      |
| Env ejemplo                       | `.env.example`                                   |

---

_Fin del documento canónico._
