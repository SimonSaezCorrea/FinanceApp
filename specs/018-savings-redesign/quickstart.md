# Quickstart: validar Ahorros rediseñado

**Feature**: 018-savings-redesign

## Prerrequisitos

```bash
pnpm install
pnpm --filter @finance/api exec prisma generate
pnpm db:reset   # o: pnpm db:push && pnpm db:seed
pnpm dev        # api en :3000 (o el puerto configurado), web en :5173
```

Login demo: `test@finance.local` / `demo1234` (ver memoria del proyecto). Necesitas al menos una
cuenta `CHECKING`/`SIGHT` con saldo (no `CREDIT_LINE`) — el seed ya trae una.

## Escenario 1 — Crear meta y ver su estado (US1 + US2)

1. Ir a Ahorros → "Nueva meta". Crear "Vacaciones" con objetivo 500.000 CLP, sin fecha límite.
2. Verificar: aparece en "En curso", 0%, línea de estado "Sin aportes registrados", ícono/color
   propios y consistentes (recargar la página y confirmar que no cambian).
3. Editar la meta: activar "Con fecha límite", elegir una fecha a 2 meses. Guardar.
4. Verificar: sigue en "En curso" con el mismo estado "Sin aportes" (una meta sin aportes nunca es
   "vencida" aunque tenga plazo — Edge Case de la spec).

## Escenario 2 — Aporte que mueve dinero real (US3)

1. Anotar el saldo actual de la cuenta CHECKING del seed (ej. desde `/cuentas`).
2. En la meta "Vacaciones", "Registrar aporte" → 100.000 CLP, esa cuenta como origen, fecha de hoy.
3. Verificar en `/cuentas`: el saldo de esa cuenta bajó exactamente 100.000.
4. Verificar en la meta: ahorrado sube a 100.000 (20%), aparece en su historial de aportes.
5. Repetir el envío con la misma `Idempotency-Key` (recargar rápido / doble clic en un flujo lento de
   red simulado) — el saldo NO debe bajar una segunda vez.
6. Editar ese aporte a 150.000 CLP. Verificar: la cuenta ahora refleja −150.000 en total (no −250.000
   — el ajuste reemplaza, no acumula), la meta muestra 30%.
7. Eliminar el aporte. Verificar: el saldo de la cuenta vuelve exactamente al valor del paso 1, la
   meta vuelve a 0%.

## Escenario 3 — Cerrar y reabrir una meta cumplida (US4)

1. Crear una meta "Notebook" con objetivo 200.000 CLP.
2. Registrar un aporte de 200.000 CLP desde una cuenta. Verificar: estado "Cumplida".
3. Intentar cerrar una meta que NO esté cumplida/vencida (ej. "Vacaciones" del escenario 1, todavía
   en curso) → la acción de cerrar no debe estar disponible.
4. Cerrar "Notebook" con destino "Retirar a una cuenta", eligiendo la misma cuenta de origen.
   Verificar: el saldo de esa cuenta SUBE 200.000 (dinero real entrando), "Notebook" pasa al bloque
   de "Metas cerradas" con "Cerrada el {fecha} · Retirado a {cuenta}", y deja de sumar en el total /
   ritmo / falta-por-reunir del resumen superior.
5. Expandir "Metas cerradas": el aporte de 200.000 sigue visible en el detalle/historial de
   "Notebook".
6. "Reabrir" la meta. Verificar: el saldo de la cuenta BAJA de vuelta los mismos 200.000 (vuelve al
   valor de antes del paso 4), y "Notebook" vuelve a "Cumplidas" (su grupo real).
7. Con la meta reabierta y cumplida, intentar editar o eliminar su aporte de 200.000 mientras
   estuvo cerrada habría fallado (`SAVINGS_GOAL_CLOSED`) — verificar ahora, reabierta, que SÍ se
   puede editar.

## Escenario 4 — Traspaso entre metas al cerrar

1. Crear "Meta A" (cumplida, con un aporte) y "Meta B" (en curso, misma moneda).
2. Cerrar "Meta A" con destino "Traspasar a otra meta" → elegir "Meta B".
3. Verificar: el ahorrado de "Meta B" sube en el monto del aporte de "Meta A", "Meta A" pasa a
   cerradas sin mover ningún saldo de cuenta real.
4. Crear "Meta C" en otra moneda (ej. USD si "Meta A" es CLP) y confirmar que NO aparece como opción
   de destino al cerrar una meta CLP (regla de misma moneda del clarify).

## Validación técnica

```bash
pnpm --filter @finance/api test:unit
pnpm --filter @finance/api test:integration
pnpm --filter @finance/api test:e2e
pnpm --filter @finance/web test
pnpm typecheck
pnpm run lint
pnpm check:boundaries
```

Casos de test que deben existir (ver `tasks.md`): reversión exacta de saldo en editar/eliminar un
aporte, reversión exacta al reabrir un cierre "retirar a cuenta", rechazo de currency-mismatch en
`close`/`create-entry`, rechazo de cerrar una meta "en curso"/"sin aportes", concurrencia (2
solicitudes simultáneas con la misma `Idempotency-Key` sobre `close`/`create-entry` producen un solo
efecto).
