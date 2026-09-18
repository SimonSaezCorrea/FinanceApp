# Contrato: `PATCH /auth/me/preferences`

No cambia la ruta ni el método — cambia el shape del body aceptado y de la respuesta, y se agrega
un nuevo código de error posible.

## Request (`UpdatePreferencesRequest`)

**Antes**:
```typescript
{
  preferredCurrency?: string;
  locale?: "es" | "en";
  theme?: "dark" | "light" | "system";
  hideBalances?: boolean;
  monthlyBudgetTarget?: string | null;   // ← eliminado
  billingCycleStartDay?: number | null;  // ← eliminado
  extraCurrencies?: string[];
  budgetAlertThreshold?: number | null;  // sin cambios (fuera de alcance)
}
```

**Después**:
```typescript
{
  preferredCurrency?: string;
  locale?: "es" | "en";
  theme?: "dark" | "light" | "system";
  hideBalances?: boolean;
  extraCurrencies?: string[];
  budgetAlertThreshold?: number | null;
}
```

## Response (`CurrentUser`)

Pierde los mismos dos campos (`monthlyBudgetTarget`, `billingCycleStartDay`) en cualquier schema
de respuesta que los exponga (`GET /auth/me`, la respuesta de este mismo `PATCH`, `login`/
`register` si los incluyen).

## Errores nuevos

| Código | HTTP | `field` | Cuándo |
|---|---|---|---|
| `CURRENCY_IN_USE` | 409 | `extraCurrencies` | El patch intenta quitar de `extraCurrencies` una moneda que algún registro del usuario (cuenta, transacción, plan de cuotas, deuda, meta de ahorro, aporte de ahorro, gasto recurrente o tope de tarjeta) sigue usando. |

## Comportamiento no cambiado

- Agregar una moneda a `extraCurrencies` nunca requiere el chequeo de "en uso" (solo aplica a
  monedas que se remueven).
- El endpoint sigue sin requerir `Idempotency-Key` — no mueve dinero, cupo ni cuotas (Principio VII
  no aplica).
- `preferredCurrency` sigue validándose y guardándose exactamente igual que hoy; esta feature no
  toca esa parte del contrato.

## Contrato implícito nuevo: universo de monedas ofrecido en selectores

No es un endpoint nuevo — es una regla de UI que consume datos ya expuestos hoy (`GET /auth/me`
para `preferredCurrency`/`extraCurrencies`, `GET /currencies` para el catálogo completo). El
frontend combina ambas respuestas para decidir qué ofrecer; no requiere ningún endpoint adicional
ni cambio en `GET /currencies` (que sigue devolviendo el catálogo completo del MVP, sin filtrar —
sigue siendo consumido tal cual por `PreferencesSection`, la vista donde se elige la moneda
principal).
