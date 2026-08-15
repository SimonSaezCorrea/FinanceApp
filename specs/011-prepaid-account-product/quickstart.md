# Quickstart — validar la cuenta prepago

## Prerrequisitos

- Docker corriendo (Postgres local vía `docker-compose.yml`).
- `apps/api/.env` y `apps/web/.env` configurados (ver `.env.example` de cada app).

## Puesta en marcha

```bash
pnpm install
pnpm --filter @finance/api exec prisma generate
pnpm db:reset        # aplica el enum nuevo + borra las columnas prepago de card-account y re-siembra
pnpm dev             # api + web
```

`db:reset` es necesario (no basta `db:push`): borrar `CardAccount.prepaidBalance` destruye datos y el
seed cambia de forma. Entrar con `test@finance.local` / `demo1234`.

## Escenarios de validación

Cada uno mapea a una historia de la [spec](./spec.md).

### 1. Registrar la cuenta prepago con su tarjeta (US1)

1. Cuentas → "Nueva cuenta" → tipo **Prepago**.
2. El formulario pide emisor, moneda, número de cuenta y saldo inicial; **no** muestra cupo, día de
   corte ni método de pago.
3. Guardar → la cuenta aparece en el listado y su saldo suma al patrimonio del Panel.
4. En el detalle, "Añadir tarjeta": el selector de tipo ofrece **solo Prepago**; el formulario no pide
   "saldo cargado".
5. Agregar una segunda tarjeta prepago: ambas muestran el mismo saldo (el de la cuenta).

### 2. La matriz de compatibilidad se respeta (US1, FR-003/FR-004)

- En una cuenta corriente, "Añadir tarjeta" ya **no** ofrece Prepago.
- Vía API, forzarlo responde `CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT`:

```bash
curl -X POST http://localhost:3000/api/v1/accounts/<idCorriente>/cards \
  -H 'content-type: application/json' -b cookies.txt \
  -d '{"name":"X","kind":"PREPAID","last4":"1234","expiryMonth":1,"expiryYear":2030}'
```

- Lo mismo al revés (tarjeta CREDIT o DEBIT sobre la cuenta prepago).

### 3. No se puede gastar más que el saldo (US2)

1. Con saldo 50.000, registrar un gasto de 20.000 con la tarjeta prepago → saldo 30.000.
2. Registrar un gasto de 60.000 → error "el saldo no alcanza"
   (`PREPAID_INSUFFICIENT_BALANCE`), el saldo sigue en 30.000.
3. Editar el gasto de 20.000 a 25.000 → pasa (se evalúa sin su propio monto previo).
4. Editarlo a 60.000 → se rechaza y nada cambia.
5. Borrarlo → el saldo vuelve a 50.000.
6. Registrar un gasto **sin** tarjeta en la cuenta prepago → también descuenta y también está acotado.

### 4. Cargar la cuenta (US3)

1. Movimientos → nuevo → pestaña **Traspaso**: origen la cuenta corriente, destino la cuenta prepago.
2. Ambas cuentas muestran su propia pata; el patrimonio total no cambia.
3. El KPI de gastos del mes **no** incluye el traspaso (`EXCLUDE_TRANSFERS`).
4. Un traspaso de salida desde la prepago que exceda su saldo se rechaza.
5. En el detalle de la tarjeta prepago **no** existe la acción "Recargar".

### 5. Paridad con el resto de las cuentas (US4)

- Detalle de la prepago: saldo, movimientos y tarjetas; **sin** pestaña/sección de Facturación ni cupo.
- Fijarla en la cartera del Panel: se ve con el saldo de la cuenta.
- Filtrar movimientos por esa cuenta y por cada una de sus tarjetas funciona igual que en las demás.

### 6. El tipo no se puede convertir (FR-016)

```bash
curl -X PATCH http://localhost:3000/api/v1/accounts/<idPrepago> \
  -H 'content-type: application/json' -b cookies.txt -d '{"type":"CHECKING"}'
# → ACCOUNT_TYPE_CHANGE_NOT_ALLOWED
```

## Gates automáticos

```bash
pnpm check:boundaries
pnpm typecheck
pnpm --filter @finance/api test         # unit + integration + e2e del área tocada
pnpm --filter @finance/web test
pnpm --filter @finance/contracts test
pnpm build
```

Tests que necesariamente cambian: `test/unit/domains/transaction/domain/prepaid-card.spec.ts`
(pasa a ser sobre la cuenta), los handlers de crear/editar/borrar movimiento,
`bank-account.aggregate.spec.ts` y `AccountVisualCard.test.tsx`.
