# Quickstart: validar la plantilla de importación (027)

## Prerrequisitos

- Postgres levantado, `pnpm db:push && pnpm db:seed` (catálogo de categorías sembrado).
- `pnpm --filter @finance/api dev` y `pnpm --filter @finance/web dev`.
- Usuario demo con al menos: una cuenta corriente/vista, una cuenta de tarjeta de crédito con
  `billingCycleDay` configurado y una tarjeta CREDIT, y la cuenta "Efectivo".

## Tests automatizados (acotados a lo tocado)

```bash
pnpm --filter @finance/contracts exec vitest run src/import
pnpm --filter @finance/api exec vitest run test/unit/domains/import test/unit/domains/installment-plan
pnpm --filter @finance/api exec vitest run test/integration/domains/import test/integration/domains/installment-payment
pnpm --filter @finance/api exec vitest run test/e2e/domains/import
pnpm --filter @finance/web exec vitest run src/domains/import src/i18n
```

## Escenarios manuales

1. **Descarga (US1)** — Importar → "Descargar plantilla". Abrir en Excel: 11 hojas visibles (Instrucciones, 9 de datos, Referencia) + oculta
   `_cuadra`; la celda Cuenta de Movimientos despliega solo las cuentas activas; Categoría no ofrece
   categorías de sistema.
2. **Movimientos y traspasos (US2)** — llenar 5 movimientos en 2 cuentas y 1 traspaso a otra cuenta;
   subir con modo "súmalos": cada saldo cambia exactamente por su neto; el traspaso no aparece en los
   totales de `GET /transactions/summary`.
3. **Modo "ya incluye" (FR-022a)** — repetir 2 en un usuario limpio con modo por defecto: los
   movimientos aparecen y el saldo actual de cada cuenta NO cambia; `initialBalance` sí.
4. **Deuda de Victor (US3)** — Deudas: ref `VICTOR`, "Me deben", 200.000, 4 cuotas mensuales.
   Pagos de deudas: 3 filas `VICTOR` en BCI. Resultado: deuda 3/4, pendiente 50.000; 3 ingresos de
   50.000 con origen "Deuda".
5. **Notebook (US4, Q1)** — Cuotas: ref `NOTEBOOK`, 623.992, 6 cuotas, tarjeta de crédito. Pagos de
   cuotas: 4 filas (1–4). Resultado: 4 cuotas pagadas sin movimiento; cupo usado +2 cuotas
   (con modo "súmalos"); generar facturación después del vencimiento de la 5ª: la facturación trae
   solo la 5ª cuota, nunca la 1–4.
6. **Recurrentes y ahorro (US5)** — 1 recurrente mensual, 1 meta con 2 aportes desde BCI: la meta
   muestra la suma; BCI baja por ella; el recurrente no mueve nada.
7. **Errores (US6)** — cuenta inexistente en Movimientos fila 12 + monto vacío en Deudas fila 3:
   ambos listados con hoja/fila, botón de confirmar deshabilitado. Un gasto que deja una cuenta
   prepago en negativo: la vista previa lo señala con su hoja y fila; nada se escribe.
8. **Todo o nada / reintento** — confirmar y reenviar con el mismo `Idempotency-Key` (doble clic):
   mismos registros, sin duplicar.
9. **No es plantilla** — subir una cartola bancaria: mensaje "no es una plantilla de Cuadra" con
   enlace al importador de cartolas.
10. **Excel de referencia (SC-001)** — traspasar a la plantilla la hoja `Finanza` de
    `Finanzas Completo.xlsx` (Transferido ignorado; reservas a MACH como traspasos) y comparar el
    saldo final de cada cuenta con el real.
