# Quickstart — validar 030 de punta a punta

Requisitos: Postgres local con datos del seed (`pnpm db:seed`), `apps/api/.env` completo, salida a
internet hacia `mindicador.cl`. El seed ya trae una tarjeta de crédito con tope USD (spec 028).

## 1. Fuente y registro diario

```bash
curl -s https://mindicador.cl/api | head -c 300          # dolar y uf con fecha y valor
pnpm --filter @finance/api dev                            # primera corrida siembra ~365 días
```

Esperado: log `Exchange rates recorded` y, en la base, una fila por moneda y día
(`select currency, date, value, "valueDate" from "exchange-rate" order by date desc limit 5;`).
Un sábado o domingo: filas con `valueDate` anterior a `date` (arrastradas).

## 2. Fuente caída

Apuntar temporalmente la URL de la fuente a un host inválido y disparar el comando (test de integración
`record-exchange-rates` lo cubre): no se escribe ningún valor; a las 20:00 se copia el último conocido.
Restaurar la fuente: el siguiente tic reemplaza la fila arrastrada y su marca desaparece.

## 3. Consulta e interfaz

`GET /api/v1/exchange-rates?currency=USD&from=2026-09-01&to=2026-09-30` → `items` + `latest`.
En la web: **Tipos de cambio** (sidebar, "Tu dinero") muestra el valor de hoy, el gráfico y la tabla; elegir
una fecha pasada muestra su valor y si fue arrastrado.

## 4. Pagar una facturación USD (028 US2 + sugerencia)

Cuenta "Visa Crédito" con facturación USD cerrada → Facturación → pestaña USD → **Pagar** → elegir una
cuenta en pesos. Esperado: dólares = total adeudado; pesos sugeridos = dólares × valor del día de pago,
rotulado "estimado · <fecha>". Editar los pesos no cambia los dólares. Confirmar: la cuenta de origen baja
por los pesos confirmados, el uso USD baja por los dólares, `creditUsed` en pesos no cambia.

## 5. Prepagar el período USD abierto

Pestaña USD → fila "Abierta" → **Prepagar** → mismo panel con intención prepago. Esperado: sube
`prepaidAmount` del período USD y baja el uso USD; nada cierra el período.

## 6. Equivalente en pesos y patrimonio

Cuenta en USD: "≈ $… (estimado, valor del …)". Con "ocultar saldos" activo queda oculto. El patrimonio neto
muestra las cifras por moneda y aparte "≈ todo en CLP (estimado)".

## 7. Traspaso USD → CLP

Nuevo movimiento → Traspaso, origen cuenta USD, destino cuenta CLP, US$100: los pesos de destino se sugieren;
editarlos no cambia los US$100; guardar registra exactamente lo confirmado.

## 8. Sin valor registrado

Con la tabla vacía y la fuente caída: los campos en pesos quedan vacíos, ningún pago se bloquea y no aparece
ningún "≈".

## Pruebas automáticas

```bash
pnpm --filter @finance/money test
pnpm --filter @finance/contracts test
pnpm --filter @finance/api test:unit  -- exchange-rate credit-statement
pnpm --filter @finance/api test:integration -- exchange-rate credit-statement
pnpm --filter @finance/api test:e2e   -- exchange-rate credit-statement
pnpm --filter @finance/web test       -- exchange-rates accounts transactions i18n
pnpm typecheck && pnpm check:boundaries
```
