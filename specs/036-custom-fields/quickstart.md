# Quickstart: validar campos personalizados (036)

## Requisitos

- `pnpm install`, Docker para el Postgres de pruebas.
- Migración aplicada: `pnpm db:migrate` (crea `custom-field` y `transaction-field-value`).
- API y web: `pnpm --filter @finance/api dev`, `pnpm --filter @finance/web dev`; usuario demo
  `test@finance.local` (RUT del seed) con su tarjeta de crédito sembrada.

## Pruebas automatizadas (acotadas a lo tocado)

```bash
pnpm --filter @finance/contracts test -- custom-fields transactions imports
pnpm --filter @finance/api test:unit -- custom-field transaction-field-value transaction import
pnpm test:integration:local test/integration/domains/custom-field test/integration/domains/transaction-field-value test/e2e/domains/custom-field test/e2e/domains/transaction
pnpm --filter @finance/web test -- custom-fields transactions import i18n
```

## Recorrido manual (caso "Transferido")

1. **Crear** (US1): barra lateral → Campos → Nuevo: "Transferido", sí/no, solo gastos, clase de
   tarjeta crédito, por defecto No. El formulario dice cuántos movimientos existentes cumplen;
   marcar "aplicar a existentes". Esperado: el campo aparece con su resumen "No: N · $X".
2. **Default** (US2): registrar un gasto con la tarjeta de crédito → el formulario ya muestra
   "Transferido: No". Registrar un ingreso → el campo no aparece.
3. **Columna** (US2): activar "mostrar como columna" → Movimientos tiene la columna.
4. **Filtrar** (US3): desde el resumen, tocar "No" → Movimientos abre con `Transferido = No`; el
   conteo y el total de gastos coinciden con el resumen.
5. **Bloque + deshacer** (US4): modo selección → "seleccionar todos los del filtro" → asignar "Sí".
   Con > 20 pide confirmar. Tocar "Deshacer" en el aviso → todos vuelven a "No".
6. **Importar** (US5): Importar → Descargar plantilla → la hoja Movimientos tiene la columna
   "Transferido" con lista Sí/No. Llenar 3 filas (Sí, No, vacío) y subir: la vista previa no
   reporta problemas; al importar, la vacía queda en "No" (default). Poner "tal vez" → problema
   en esa fila. Descargar "con mis datos actuales" → la columna trae los valores.
7. **Transferir pendientes** (US6): con `Transferido = No`, seleccionar todos → Transferir
   pendientes: origen cuenta corriente, destino cuenta remunerada → ver monto y cantidad →
   confirmar. Esperado: un traspaso por la suma, saldos movidos, los gastos en "Sí". Doble clic en
   confirmar → un solo traspaso.
8. **Deshacer por borrado** (FR-025): borrar ese traspaso → la confirmación dice "N movimientos
   volverán a No" → al borrar, vuelven a "No"; uno que se cambió a mano antes conserva su valor.
9. **Aislamiento**: con otro usuario, `GET /api/v1/custom-fields` no muestra el campo y
   `PATCH /api/v1/transactions/<id ajeno>/custom-fields` responde 404.
