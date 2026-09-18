# Quickstart: validar "Personalización financiera del perfil"

## Prerrequisitos

```bash
pnpm install
pnpm --filter @finance/api exec prisma generate
pnpm db:push
pnpm db:seed
pnpm dev   # o: pnpm --filter @finance/api dev / pnpm --filter @finance/web dev
```

Login demo: `test@finance.local` / `demo1234` (ver memoria del proyecto).

## Escenario 1 — Controles removidos

1. Ir a `/profile`, abrir "Personalización financiera".
2. **Esperado**: solo aparecen "Monedas extra" y "Ocultar saldos". No hay rastro de "Inicio del
   ciclo mensual", "Presupuesto mensual objetivo" ni "Redondeo para ahorro".
3. `curl -X PATCH .../auth/me/preferences -d '{"monthlyBudgetTarget":"1000"}'` (o el campo
   equivalente en el body) → **esperado**: 400 de validación zod (el campo ya no existe en el
   schema), no 200.

## Escenario 2 — Universo de monedas acotado

1. Usuario recién creado (o sin `extraCurrencies`): abrir "Nueva cuenta".
2. **Esperado**: el campo de moneda se muestra como texto fijo (la moneda principal), sin abrir
   ningún desplegable al hacer clic.
3. Ir al perfil, agregar una moneda extra (p.ej. USD si la principal es CLP).
4. Volver a "Nueva cuenta".
5. **Esperado**: el campo de moneda ahora es un selector real, con exactamente 2 opciones (la
   principal + la extra agregada) — nunca las 3 del catálogo completo si el usuario no las agregó
   todas.
6. Repetir el mismo chequeo en: editar cuenta, definir tope de tarjeta en otra moneda, crear
   transacción, crear meta de ahorro, crear gasto recurrente, crear plan de cuotas, crear deuda.

## Escenario 3 — Bloqueo de eliminación de moneda en uso

1. Con la moneda extra USD agregada, crear una cuenta bancaria en USD.
2. Ir al perfil, intentar quitar USD de "Monedas extra".
3. **Esperado**: la eliminación se rechaza con un mensaje indicando que la moneda sigue en uso
   (código `CURRENCY_IN_USE`); USD sigue apareciendo en la lista.
4. Eliminar (o cambiar de moneda) la cuenta en USD; sin ningún otro registro en USD, reintentar
   quitarla del perfil.
5. **Esperado**: ahora la eliminación se completa.

## Escenario 4 — Ocultar/revelar saldos, alcance acotado

1. Activar "Ocultar saldos" en el perfil.
2. Ir al Panel (`/`) — **esperado**: patrimonio neto y KPIs de dinero enmascarados (`••••••`).
3. Clic sobre un monto enmascarado — **esperado**: se revela; clic de nuevo (o sobre otro monto) —
   el primero puede seguir revelado mientras el segundo también se revela (independientes).
4. Salir del Panel y volver — **esperado**: todo vuelve a estar enmascarado (no se recuerda el
   revelado entre visitas).
5. Ir al detalle de una cuenta — **esperado**: el saldo aparece enmascarado, revelable con clic.
6. Ir a Ahorros — **esperado**: ahorrado, objetivo, ritmo y faltante, todos enmascarados por
   igual.
7. Ir a Movimientos, Deudas, Recurrentes, Cuotas/Facturación — **esperado**: todos los montos se
   muestran en su valor real, sin ningún `••••••` y sin comportamiento de clic-para-revelar.
8. Desactivar "Ocultar saldos" — **esperado**: todo vuelve a mostrarse en valor real en todas
   partes.

## Verificación técnica

```bash
pnpm --filter @finance/api test:unit -- user           # aggregate + handler nuevos
pnpm --filter @finance/api test:integration -- user     # 8 adapters de currency-usage
pnpm --filter @finance/api test:e2e -- preferences       # PATCH /auth/me/preferences
pnpm --filter @finance/web test -- profile               # FinancialCustomizationSection, MaskedAmount
pnpm --filter @finance/web test -- reference              # CurrencyField, useAllowedCurrencies
pnpm typecheck
pnpm check:boundaries
```

(Recordatorio de la convención del proyecto: correr tests **acotados al cambio**, no la suite
completa, salvo que se pida explícitamente lo contrario.)
