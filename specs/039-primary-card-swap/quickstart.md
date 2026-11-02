# Quickstart: validar cupos por moneda y cambio de principal

## Requisitos

- `pnpm install`, Docker para la base de pruebas.
- Migración aplicada: `pnpm db:migrate` (local) o `pnpm test:integration:local`.

## Tests automatizados (acotados al cambio)

```bash
pnpm --filter @finance/contracts test -- accounts
pnpm --filter @finance/api test:unit -- bank-account transaction credit-statement account-credit-limit import
pnpm test:integration:local test/integration/domains/bank-account test/integration/domains/account-credit-limit test/e2e/domains/bank-account test/e2e/domains/transaction test/e2e/domains/credit-statement
pnpm --filter @finance/web test -- accounts transactions import
pnpm --filter @finance/api exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

## Escenarios manuales (app local, usuario demo)

1. **Cupo USD de la cuenta** — Cuentas → tarjeta de crédito con cupo USD → editar: el bloque "Cupos en
   otras monedas" muestra USD; registrar un gasto USD con una adicional sin tope → baja el disponible USD
   de la cuenta para todas las tarjetas; el disponible en pesos no cambia.
2. **Moneda sin cupo** — en una cuenta sin cupo EUR, intentar un gasto EUR → "La cuenta no tiene cupo en
   esa moneda".
3. **Sub-tope** — adicional con tope USD 500: gasto 400 ok, otro de 200 → rechazado por sub-tope.
4. **Reemplazo del plástico** — principal → apagar "Activa" → panel "Elegir nueva principal" → "Tarjeta
   nueva" (4 dígitos + vencimiento) → Confirmar: la nueva aparece como Principal, la vieja Inactiva y
   Adicional; cupos idénticos; "Generar facturación" funciona.
5. **Marcar como principal** — en una adicional activa → "Marcar como principal" → roles intercambiados.
6. **Eliminar con historia** — eliminar una principal con movimientos → "Desactívala en su lugar".
7. **Doble clic** — confirmar el reemplazo con tarjeta nueva dos veces rápido → una sola tarjeta nueva.
8. **Datos previos** — en una base migrada, una cuenta cuya principal estaba inactiva muestra el aviso
   "Esta cuenta no tiene tarjeta principal activa" con "Elegir principal".

## Verificación de migración (SC-004)

Antes de migrar, anotar `GET /accounts` (`creditPools` y `cards[].limits` de cada cuenta de crédito);
después, para cada cuenta y moneda, `available` del cupo de la cuenta ≥ el disponible previo de la
principal en esa moneda, y cada sub-tope de adicional idéntico.
