# API contract — 030

Prefijo global `/api/v1`. Todas las rutas con `JwtAuthGuard`. Los errores siguen `{ error: { code, field? } }`.

## Nuevo: `GET /exchange-rates`

Valores diarios del dólar y la UF.

| Query      | Tipo                   | Notas                                                                  |
| ---------- | ---------------------- | ---------------------------------------------------------------------- |
| `currency` | `"USD" \| "CLF"`       | opcional; sin él, ambas                                                |
| `from`     | `YYYY-MM-DD`           | opcional; por defecto `to` − 30 días                                   |
| `to`       | `YYYY-MM-DD`           | opcional; por defecto hoy (Chile)                                      |

- Máximo 400 días por consulta (`EXCHANGE_RANGE_TOO_LARGE`, 400); `from > to` → `INVALID_DATE_RANGE`.
- Respuesta `200`: `{ items: ExchangeRate[], latest: { USD: ExchangeRate | null, CLF: ExchangeRate | null } }`,
  `items` en orden descendente por `date`. `latest` es la fila más reciente de cada moneda, independiente
  del rango pedido (lo que la web usa para "el valor vigente").
- `ExchangeRate`: `{ currency, date, value, valueDate }` — `value` como `moneyString`; fechas
  `YYYY-MM-DD`. El cliente deriva `carried = valueDate < date`.
- Sin escritura HTTP: no hay `POST/PATCH/DELETE`. Ninguna operación de este endpoint requiere
  `Idempotency-Key` (solo lectura).

## Extendido: `POST /accounts/:id/credit-statements/:statementId/pay`

Sin ruta nueva. `payCreditStatementSchema.chargedAmount` (ya en el contrato) pasa a tener efecto:

- Si la moneda de la cuenta de origen difiere de la de la facturación, `chargedAmount` es obligatorio
  (`STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS`, 400). Los dos montos **nunca se comparan**.
- Crea: GASTO de `chargedAmount` en la cuenta de origen; INGRESO de liquidación de `amount` en la moneda
  de la facturación sobre la cuenta de crédito con la tarjeta dueña del tope (`settlesStatementId`).
  No toca `creditUsed`. Faltante → período abierto de la misma moneda.
- Sigue exigiendo `Idempotency-Key`.

## Extendido: `POST /accounts/:id/credit-statements/:statementId/prepay`

`prepayCreditStatementSchema` gana `chargedAmount?: moneyString` con la misma regla. Válido sobre un
período abierto en otra moneda; el prepago en la moneda de la cuenta no cambia.

## Extendido: `PATCH .../credit-statements/:statementId/payment`

`updateStatementPaymentSchema.chargedAmount` (ya en el contrato) corrige ambos movimientos de una
facturación en otra moneda.

## Errores nuevos

| Código                                   | HTTP | Cuándo                                                                 |
| ---------------------------------------- | ---- | ---------------------------------------------------------------------- |
| `EXCHANGE_RANGE_TOO_LARGE`               | 400  | rango de consulta > 400 días                                           |
| `INVALID_DATE_RANGE`                     | 400  | `from > to`                                                            |
| `STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS`   | 400  | pago/prepago entre monedas distintas sin `chargedAmount` (ya definido en 028) |
| `TRANSACTION_LINKED_TO_STATEMENT`        | 409  | editar/borrar un movimiento de liquidación (ya definido en 028)        |

Todo código nuevo tiene su clave `errors.<CODE>` en `es.json` y `en.json`.

## Sin cambios

`POST /transactions/transfers` y `createTransferSchema` (`amountOut`, `amountIn`, `currencyOut`,
`currencyIn`) ya aceptan dos montos en dos monedas; la sugerencia es solo de la web.
