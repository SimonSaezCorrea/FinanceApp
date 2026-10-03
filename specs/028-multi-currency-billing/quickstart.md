# Quickstart — validar 028

## Preparación

1. `pnpm install`, Postgres arriba (`docker compose up -d`), `pnpm db:push && pnpm db:seed`.
2. `pnpm dev`. Entrar con un usuario que tenga USD en Perfil → Monedas extra.
3. Cuenta de tarjeta de crédito en CLP (cupo $900.000) con día de facturación y día de pago
   configurados, y en "Topes en otras monedas" un tope USD de 100.

## Escenarios

1. **Dos facturaciones (US1)** — registrar un gasto de $120.000 y uno de US$30 (Moneda USD).
   Facturación: dos períodos abiertos, CLP $120.000 y USD US$30. "Generar facturación" tras el día de
   cierre: ambos quedan pendientes con la misma fecha de cierre. Sin gastos USD en un ciclo: solo
   aparece el CLP.
2. **Pagar USD desde pesos (US2)** — Pagar la facturación USD desde una cuenta corriente CLP:
   US$30 y $28.500. La corriente baja $28.500; el cuadro "Crédito · USD" baja US$30; el cupo CLP no
   cambia; en Movimientos de la corriente aparece el pago; en la cuenta de crédito, el ingreso de
   liquidación (solo lectura, origen "Liquidación de facturación").
3. **Pago parcial USD** — pagar US$20 de US$30: la facturación queda "Pagada en parte" y el período
   USD abierto recibe US$10 de arrastre.
4. **Traspaso (US3)** — con una facturación USD vencida e impaga (o sin día de pago configurado):
   aparece "Vencida — traspasar a pesos". Traspasar con $66.052: estado "Traspasada (US$70,72 →
   $66.052)"; "Crédito · USD" libera US$70,72; el período CLP abierto sube $66.052 y el cupo CLP
   también; el cargo en pesos es de solo lectura en Movimientos con enlace a la facturación.
5. **Deshacer traspaso** — deshacer: todo vuelve como estaba. Si el período CLP que recibió el cargo
   ya fue pagado: se rechaza con mensaje.
6. **Protecciones** — intentar editar/eliminar el ingreso de liquidación o el cargo de traspaso: 409.
   Intentar quitar el tope USD con deuda USD: 409.
7. **Plantilla** — importar una fila de Movimientos USD en la cuenta de crédito: queda en la
   facturación USD abierta.
8. **Excel de referencia (SC-005)** — importar la conversión de `Finanzas Completo.xlsx` y traspasar
   las dos facturaciones USD (US$70,72 → $66.052, US$12,29 → $11.798): "Crédito · USD" queda en
   US$50,41 usados.

## Tests

- `pnpm --filter @finance/api test:unit` (agregado, estados, `canTransferStatement`, handlers con puertos falsos)
- `pnpm --filter @finance/api test:integration` (adaptador Prisma: moneda, liquidación excluida de la sincronización, traspaso y su reversión en una transacción)
- `pnpm --filter @finance/api test:e2e` (pay con dos montos, transfer, undo, 409s)
- `pnpm --filter @finance/web test` (BillingSection por moneda, paneles de pago/traspaso, i18n)
