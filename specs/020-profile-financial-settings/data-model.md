# Data Model: Personalización financiera del perfil

No se crea ninguna tabla nueva. Se modifica `User` (columnas removidas) y se agregan 8 puertos de
solo lectura (sin tabla propia — leen columnas `currency` que ya existen).

## `User` (tabla `user`) — cambios

| Columna                | Antes                        | Después                                                                                                                          |
| ---------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `preferredCurrency`    | `String @default("CLP")`     | Sin cambios                                                                                                                      |
| `extraCurrencies`      | `String[] @default([])`      | Sin cambios en el schema; gana una regla de negocio nueva (no se puede quitar un elemento en uso — ver "Regla de negocio" abajo) |
| `hideBalances`         | `Boolean @default(false)`    | Sin cambios en el schema; su cobertura de UI se amplía (ver plan.md)                                                             |
| `monthlyBudgetTarget`  | `Decimal? @db.Decimal(18,4)` | **Eliminada**                                                                                                                    |
| `billingCycleStartDay` | `Int?`                       | **Eliminada**                                                                                                                    |

Sin migración (`prisma/migrations` no existe en este repo — el workflow es `db push` +
`db:seed`, datos de desarrollo únicamente, sin producción).

### Regla de negocio: eliminar una moneda de `extraCurrencies`

**Invariante**: una moneda solo puede quitarse de `User.extraCurrencies` si ningún registro
propiedad del usuario la está usando actualmente.

**Dónde se aplica**: `UpdatePreferencesHandler` (`apps/api/src/domains/user/application/commands/
update-preferences.handler.ts`), antes de aplicar el patch al agregado. No vive dentro de
`User.aggregate.ts` porque la comprobación requiere consultar 8 tablas fuera del dominio `user`
— el agregado permanece una entidad pura sin acceso a repositorios ajenos (Constitución §VI).

**Algoritmo**:

1. Si el patch trae `extraCurrencies`, calcular `removed = user.extraCurrencies.filter(c => !patch.extraCurrencies.includes(c))`.
2. Si `removed` está vacío, continuar sin chequeo (agregar monedas, o no tocar el campo, nunca
   requiere este chequeo).
3. Para cada moneda en `removed`, consultar en paralelo los 8 puertos
   `isCurrencyInUse(userId, currency)`.
4. Si alguna moneda de `removed` está en uso en cualquiera de las 8 tablas, lanzar un error de
   dominio nuevo `CurrencyInUseError` (código `CURRENCY_IN_USE`, 409, `field: "extraCurrencies"`,
   con el/los código(s) de moneda en conflicto) — el patch completo se rechaza (no se aplica
   parcialmente).
5. Si ninguna está en uso, continuar con `applyPreferencesUpdate` normalmente.

## Puertos nuevos: `CurrencyUsageLookupPort` (uno por dominio-tabla)

Mismo shape en las 8 tablas, cada una con su propio símbolo de inyección y su propio adapter
Prisma (Constitución §VI: un adapter por tabla) — replican el patrón ya usado por
`BankAccountLookupPort`.

```typescript
export interface CurrencyUsageLookupPort {
  isCurrencyInUse(userId: string, currency: string): Promise<boolean>;
}
```

| Dominio             | Símbolo                            | Tabla / columna consultada  | Filtro `userId`                                                                                                                 |
| ------------------- | ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `bank-account`      | `BANK_ACCOUNT_CURRENCY_USAGE`      | `BankAccount.currency`      | `userId` directo                                                                                                                |
| `transaction`       | `TRANSACTION_CURRENCY_USAGE`       | `Transaction.currency`      | `userId` directo                                                                                                                |
| `installment-plan`  | `INSTALLMENT_PLAN_CURRENCY_USAGE`  | `InstallmentPlan.currency`  | `userId` directo                                                                                                                |
| `debt`              | `DEBT_CURRENCY_USAGE`              | `Debt.currency`             | `userId` directo                                                                                                                |
| `savings-goal`      | `SAVINGS_GOAL_CURRENCY_USAGE`      | `SavingsGoal.currency`      | `userId` directo                                                                                                                |
| `savings-entry`     | `SAVINGS_ENTRY_CURRENCY_USAGE`     | `SavingsEntry.currency`     | `userId` directo                                                                                                                |
| `recurring-expense` | `RECURRING_EXPENSE_CURRENCY_USAGE` | `RecurringExpense.currency` | `userId` directo                                                                                                                |
| `card-limit`        | `CARD_LIMIT_CURRENCY_USAGE`        | `CardLimit.currency`        | vía `card.userId` (`CardAccount.userId` ya existe como columna indexada — `CardLimit` se une a `CardAccount` en la misma query) |

Cada adapter implementa la consulta como `count > 0` (o `findFirst` con `select: { id: true }`)
sobre su propia tabla — un `EXISTS` acotado por índice, sin necesidad de traer filas completas.

`user.module.ts` importa los 8 `*.data.module.ts` correspondientes e inyecta sus puertos en
`UpdatePreferencesHandler`. **Prerrequisito descubierto en `/speckit-analyze`**: 6 de los 8 leaves
ya existen; `debt` y `recurring-expense` hoy solo tienen un `*.module.ts` combinado (orquestación +
repositorio) sin leaf separado — hay que extraerlo primero (mismo tratamiento que
`installment-plan` recibió en specs/014) antes de poder exportar su puerto nuevo sin arrastrar el
módulo de orquestación completo.

## Contrato (`@finance/contracts`) — cambios

`packages/contracts/src/auth/index.ts`:

- `updatePreferencesRequestSchema`: se eliminan los campos `monthlyBudgetTarget` y
  `billingCycleStartDay`.
- El schema de respuesta del usuario actual (`currentUserSchema` o equivalente que expone estos
  campos) pierde los mismos dos campos.
- Nuevo código de error compartido: `CURRENCY_IN_USE` (se agrega donde vivan los demás códigos de
  error de este dominio, junto a los ya existentes como `INVALID_CURRENT_PASSWORD`).

## Frontend — entidades de UI (no de datos)

- **`useAllowedCurrencies()`** (hook, `domains/reference/hooks/`): deriva de `useAuth()` (usuario
  actual) + `useCurrencies()` (catálogo), sin estado propio — resultado memoizado
  `[{code, name}]` con la moneda principal primero.
- **`CurrencyField`** (componente, `domains/reference/components/`): props equivalentes a un
  campo de formulario estándar del repo (`value`, `onChange`, `aria-label`, etc.), decide
  internamente entre texto estático y `SearchableSelect` según `useAllowedCurrencies().length`.
- **`MaskedAmount`** (existente, se modifica): gana estado local `revealed` y manejo de
  clic/teclado; su contrato de props (`children: ReactNode`) no cambia — retrocompatible con sus
  usos actuales en `NetWorthCard`/`AccountVisualCard`.
