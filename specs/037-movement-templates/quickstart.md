# Quickstart: Plantillas de movimientos (037)

## Automated

```bash
pnpm --filter @finance/contracts test -- movement-templates
pnpm --filter @finance/api exec vitest run test/unit/domains/movement-template
pnpm test:integration:local test/integration/domains/movement-template test/e2e/domains/movement-template
pnpm --filter @finance/web exec vitest run src/domains/movement-templates src/domains/transactions src/i18n
```

## Manual (local API + web)

1. Sidebar → Configuración → Plantillas: empty state, "Nueva plantilla".
2. Create "Arriendo mensual": gasto, cuenta corriente, categoría Vivienda, monto 450.000 → listed with its amount.
3. Create "Bencina": gasto, tarjeta débito, sin monto → listed as "monto libre".
4. Create "bencina " → error "ya existe una plantilla con ese nombre".
5. Nuevo movimiento → "Usar plantilla" → Arriendo mensual → form pre-filled, date today → Guardar → movement created normally.
6. Nuevo movimiento: fill a gasto → "Guardar como plantilla" → name "Supermercado", monto libre → template appears; form stays open.
7. Delete the card used by "Bencina" → template still listed without card; using it leaves the card empty.
8. Delete a template → gone from list and picker; movements unchanged.
