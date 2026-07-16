# Quickstart / Validation — 007 Rediseño Cuentas y Movimientos

Guía para validar la feature end-to-end. Detalle de datos en [data-model.md](./data-model.md) y contratos en [contracts/](./contracts/).

## Prerequisitos

```bash
pnpm install
pnpm --filter @finance/api exec prisma generate
pnpm --filter @finance/api exec prisma migrate dev   # aplica migración secondary_cards + backfill
pnpm db:seed                                          # opcional
```

Ejecutar: `pnpm dev` (o `pnpm --filter @finance/api dev` y `pnpm --filter @finance/web dev`).

## Gates de calidad (Definition of Done)

```bash
pnpm check:boundaries
pnpm typecheck
pnpm test
pnpm build
```

## Escenarios de validación

### 1. Pool compartido crédito (User Story 1 / SC-001, SC-007)

1. Crear cuenta crédito con tarjeta principal (tope 1.000.000, initialUsed 0).
2. Añadir tarjeta secundaria de crédito (parentCardId = principal, sub-tope 300.000).
3. Registrar GASTO 100.000 en la secundaria → verificar `used(principal)=100.000`, `used(secundaria)=100.000`.
4. Registrar GASTO 100.000 en la principal → `used(principal)=200.000`, `used(secundaria)=100.000`.
5. Intentar GASTO 250.000 en la secundaria → rechazado `CARD_SUBLIMIT_EXCEEDED`.
6. Llevar el pool cerca de 1.000.000 e intentar exceder → `CARD_LIMIT_EXCEEDED`.

### 2. Reglas banco/tarjeta/tipo (User Story 2 / SC-002)

- GASTO en cuenta no-efectivo sin `cardId` → `CARD_REQUIRED`.
- GASTO en cuenta CASH con `cardId` → `CARD_NOT_ALLOWED`.
- INCOME con `cardId` → `CARD_NOT_ALLOWED`.
- Movimiento nuevo sin `bankAccountId` → rechazado por contrato.

### 3. CRUD desde ambas vistas (User Story 3 / SC-006)

- Crear/editar/eliminar un movimiento desde la vista de Movimientos y desde la vista de Cuenta.
- Editar un gasto cambiándolo de tarjeta de crédito A→B → `used` baja en A y sube en B.
- Eliminar un gasto de crédito → `used` y `currentBalance` recalculan.

### 4. Filtro banco→tarjeta e inactivas (User Story 4 / SC-005)

- Seleccionar banco → aparece filtro de tarjeta; seleccionar tarjeta → la request envía `cardId` (fix `toQuery`) y filtra server-side.
- Activar "incluir inactivas" → cuentas inactivas aparecen con tag "Inactiva".

### 5. Vista de Cuenta rediseñada (User Story 5 / SC-003, SC-004)

- Cuenta con 3 tarjetas → las 3 con el mismo visual (`AccountVisualCard`), sin duplicado arriba/abajo.
- Sin secciones "Tarjetas"/"Información" en el cuerpo principal; info en el sidebar.
- Número de cuenta visible en la preview.
- "Añadir tarjeta" abre un modal.
- Lista de movimientos de la cuenta con el mismo formato que la vista global.

## Notas de i18n

Verificar que toda cadena nueva existe en `apps/web/src/i18n/es.json` y `en.json` con claves idénticas, y que los nuevos códigos de error mapean a `errors.<CODE>` en ambos catálogos.
