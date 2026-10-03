# Contract: importación por plantilla (027)

Schemas zod en `packages/contracts/src/import/template.ts` (ver `data-model.md` para cada fila).
Ambos endpoints bajo `JwtAuthGuard`, escopeados al `userId` del token.

## POST /api/v1/import/template/preview

Valida sin escribir.

- **Body**: `TemplateImportRequest`.
- **200**:

```json
{
  "valid": true,
  "counts": {
    "movements": 280,
    "transfers": 12,
    "debts": 4,
    "debtPayments": 7,
    "plans": 5,
    "planPayments": 19,
    "recurring": 6,
    "goals": 2,
    "contributions": 9
  },
  "accounts": [
    {
      "accountId": "…",
      "currency": "CLP",
      "mode": "INCLUDED",
      "netCash": "-152340",
      "netCredit": "410000",
      "balanceAfter": "812400",
      "creditUsedAfter": "95000"
    }
  ],
  "errors": []
}
```

- Con errores de negocio: `200` con `valid: false` y
  `errors: [{ "code": "PREPAID_INSUFFICIENT_BALANCE", "sheet": "movements", "row": 12, "field": "amount" }]`
  — la vista previa enumera **todos** los errores que pueda, no solo el primero.
- **400** `VALIDATION_ERROR` / `INVALID_ID_FORMAT`: el body no cumple el schema (el web ya valida la
  forma antes de enviar).

## POST /api/v1/import/template

Aplica todo o nada.

- **Headers**: `Idempotency-Key` obligatorio (`IDEMPOTENCY_KEY_REQUIRED` si falta). Operación
  `import.template`. Forma (c) del Principio VII: mismo key + mismo body → replay de la respuesta;
  mismo key + otro body → `409 IDEMPOTENCY_KEY_REUSED`.
- **Body**: `TemplateImportRequest`.
- **201**: `{ "counts": { …igual que preview… } }`.
- **400/404/409** (el status del error de dominio correspondiente, mismo patrón que
  `ImportRowRejectedError`): el primer error encontrado, con el código de la regla y
  `field: "<sheet>.<row>"` — `{ "error": { "code": "...", "field": "movements.12" } }`. Nada quedó
  escrito. (El web normalmente ya vio ese error en la vista previa; esto cubre una carrera entre
  preview y confirmación, p. ej. otro movimiento registrado entremedio.)

## Ownership (Principio II)

Toda FK del body se verifica contra el usuario ANTES de persistir, en `loadContext`:
`bankAccountId`/`accountId`/`fromAccountId`/`toAccountId`/`paymentAccountId` →
`BankAccountRepositoryPort.findById(userId, …)`; `cardId` → las tarjetas de las cuentas del usuario
(una tarjeta ajena = `CARD_NOT_FOUND`, nunca "sin tarjeta"); `categoryId` →
`assertSelectableCategory`. Una referencia no resuelta nunca se confunde con "campo vacío".

## Plantilla (formato del archivo)

Generada en el navegador (research R1). Hojas, en este orden, con encabezado localizado en la fila 1
y datos desde la fila 2:

1. **Instrucciones** — cómo llenar cada hoja con un ejemplo por hoja, qué mueve dinero, el aviso de
   reimportación. Las hojas de datos vienen vacías (un ejemplo en ellas se importaría por olvido).
2. **Movimientos** · 3. **Traspasos** · 4. **Deudas** · 5. **Pagos de deudas** · 6. **Cuotas** · 7. **Pagos de cuotas** · 8. **Recurrentes** · 9. **Metas** · 10. **Aportes**
3. **Referencia** — cuentas activas (nombre, tipo, moneda), tarjetas (`<cuenta> · ····1234`),
   categorías elegibles, y las listas cerradas (tipos, direcciones, frecuencias, monedas).
4. **`_cuadra`** (oculta) — `version`, `locale`.

Listas desplegables (`exceljs` data validation, rango de la hoja Referencia) en: tipo, cuenta(s),
tarjeta, categoría, dirección, frecuencia, moneda. Columnas de fecha con formato de fecha; de monto,
numérico.
