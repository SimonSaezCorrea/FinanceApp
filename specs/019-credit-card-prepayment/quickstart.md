# Quickstart: validar el prepago de tarjeta de crédito

Prerrequisitos: API corriendo (`pnpm --filter @finance/api dev`), DB sembrada (`pnpm db:seed`), sesión autenticada (`test@finance.local` / `demo1234`).

## Escenario 1 — Prepagar el período abierto (User Story 1)

1. `GET /accounts` → identificar una cuenta `type: "CREDIT_CARD"` con `creditUsed > "0"` (p. ej. "Banco de Chile · Visa Crédito" del seed).
2. `GET /accounts/:id/credit-statements` → tomar el `id` del período con `status: "OPEN"`.
3. `POST /accounts/:id/credit-statements/:statementId/prepay` con `Idempotency-Key` único, body `{ fromAccountId: "<otra cuenta con saldo>", amount: "<menor al creditUsed actual>" }`.
4. **Esperado**: `200`, respuesta con `status: "OPEN"` (sin cambiar), `prepaidAmount` igual al monto enviado, `amount`/`remainingAmount` bajados por ese monto.
5. `GET /accounts/:id` → `creditUsed` bajó exactamente por el monto prepagado.
6. `GET /transactions?bankAccountId=<fromAccountId>` → aparece el nuevo `EXPENSE`, con `prepaymentStatementId` = el período del paso 2.

## Escenario 2 — Varios prepagos en el mismo período (User Story 2)

1. Repetir el paso 3 del Escenario 1 una segunda vez, con OTRA `Idempotency-Key` y otro monto (menor al remanente actual).
2. **Esperado**: `prepaidAmount` acumula ambos montos; ninguno de los dos `EXPENSE` se pisa (dos filas distintas en `GET /transactions`).
3. Intentar un tercer prepago por MÁS de lo que queda → `422 PAYMENT_EXCEEDS_REMAINING`.

## Escenario 3 — El cierre normal descuenta lo prepagado (User Story 3)

1. Sobre el período del Escenario 2 (ya con prepagos aplicados), forzar su cierre: `POST /accounts/:id/generate-statements` (si `billingCycleDay` ya venció) o ajustar la fecha vía el mecanismo de test habitual del proyecto para simular el cron.
2. `GET /accounts/:id/credit-statements` → el período recién cerrado (`status: "PENDING"`) tiene `amount` = actividad total del período **menos** la suma de los prepagos del Escenario 1+2.
3. `POST /accounts/:id/credit-statements/:statementId/pay` (sin `amount` = pagar todo lo que queda) → `creditUsed` llega a `0` (no queda remanente de lo ya prepagado).

## Escenario 4 — Editar/eliminar un prepago revierte todo (Clarification Q1/Q2)

1. Tomar el `id` de uno de los `EXPENSE` de prepago creados en el Escenario 2.
2. `DELETE /transactions/:id`.
3. **Esperado**: `200`; `GET /accounts/:id` muestra `creditUsed` subido de vuelta por ese monto; `GET /accounts/:id/credit-statements` muestra `prepaidAmount` bajado por ese monto en el período correspondiente.
4. Repetir sobre un prepago cuyo período YA cerró (después del Escenario 3, antes de pagarlo) → el `amount` de esa facturación PENDING sube automáticamente para reflejar la eliminación, sin llamar a `.../sync` a mano.

## Escenario 5 — Formulario web

1. Abrir "Nuevo movimiento" con una cuenta CREDIT_CARD preseleccionada.
2. **Esperado**: el switch de tipo ofrece "Gasto" y "Prepagar" (no "Ingreso" ni "Traspaso", sin cambios de una feature anterior).
3. Elegir "Prepagar" → el formulario muestra selector de cuenta de origen + monto (mismo look que "Pagar facturación"), no los campos de un gasto ordinario.
4. Confirmar → el movimiento creado, al abrir su detalle, muestra un origen distinguible ("Prepago") con enlace a la tarjeta (`/accounts/:id?tab=billing&statement=:id`).
