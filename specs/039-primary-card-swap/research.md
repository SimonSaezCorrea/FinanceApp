# Research: Cupos por moneda en la cuenta y cambio de tarjeta principal

Fecha: 2026-11-01. Fuentes: el código en la rama `039-primary-card-swap` (base `fix/inactive-cards`).

## Estado actual (relevado)

- El cupo en la moneda de la cuenta vive en `BankAccount.creditLimit`/`creditUsedInitial`, con
  `creditUsed` persistido (lo mueven los movimientos y los pagos).
- El cupo en OTRA moneda vive como fila `CardLimit` de la **tarjeta principal**
  (`bank-account.aggregate.ts` `planCreation`/`resolveCardPlacement`: los `limits` de otra moneda
  del primario se guardan como `CardLimit`). Su uso se deriva de movimientos de esa tarjeta
  (`transaction/application/card-limit-usage.ts` → `sumsForCard(…, openOnly)` + el
  `carriedOverAmount` de la cuenta solo si la tarjeta es la principal).
- Un `CardLimit` de una ADICIONAL en otra moneda es un pozo independiente: no se compara con nada
  (`MovementPolicy.contribution`: `ownPool = cardLimit !== null && isForeign`).
- **Hueco detectado**: un gasto en otra moneda con una tarjeta SIN `CardLimit` en esa moneda devuelve
  `contribution = amount` y suma al cupo en pesos (`movement-policy.ts:186-187`). El modelo nuevo lo
  cierra: un cargo en otra moneda exige cupo de la cuenta en esa moneda.
- Liquidación de una facturación en otra moneda: `credit-statement/application/foreign-settlement.ts`
  crea un INCOME con `cardId` = principal, que exige un `CardLimit` en esa moneda
  (`CardLimitNotFoundError`).
- La principal se asigna sola (primera tarjeta CREDIT sin principal existente) y no hay forma de
  cambiarla. `NoCreditLineEligibility` exige principal CREDIT activa para generar facturación.
- `Transaction.cardId`, `InstallmentPlan.cardId`, `RecurringExpense.cardId`, `MovementTemplate.cardId`
  son `onDelete: SetNull`; `CardLimit` y `WalletItemDashboard` son `Cascade`.

## R1 — Dónde guardar el cupo en otra moneda

- **Decisión**: tabla nueva `account-credit-limit` (modelo `AccountCreditLimit`: `accountId`,
  `currency`, `limitAmount`, `usedInitial`; `@@unique([accountId, currency])`, `onDelete: Cascade`),
  dominio-tabla nuevo `account-credit-limit` (`domain/` + `infrastructure/` + leaf
  `account-credit-limit.data.module.ts`), entidad del agregado `BankAccount` como `card-limit`.
  Solo guarda monedas DISTINTAS a la de la cuenta; la de la cuenta sigue en `BankAccount`.
- **Rationale**: Principio VI (una tabla = un dominio). La moneda de la cuenta ya tiene un `creditUsed`
  persistido que mueven ~15 handlers; moverla a la tabla nueva multiplica el cambio sin beneficio.
  El contrato ya expone `creditPools` (moneda de la cuenta + otras), así que la lectura no cambia de forma.
- **Alternativas**: (a) reutilizar `card-limit` con `cardId` nullable + `accountId` — mezcla dos
  conceptos en una tabla y rompe `@@unique([cardId, currency])`; (b) columnas JSON en `bank-account` —
  sin constraint de unicidad ni tipos decimales; (c) seguir en la principal y mover filas al cambiar —
  descartado por el usuario en clarify.

## R2 — Cómo se calcula lo usado de un cupo en otra moneda

- **Decisión**: derivado, igual que hoy pero a nivel de cuenta: `usedInitial` + Σ EXPENSE − Σ INCOME
  de TODOS los movimientos de la cuenta en esa moneda que siguen adeudados (`STILL_OWED`, ya existente)
  - el `carriedOverAmount` adeudado de la cuenta en esa moneda (`carriedOverOwed`). Método nuevo
    `TransactionRepositoryPort.sumsForAccountCurrency(userId, accountId, currency, excludeTxId?)` y
    `TransactionSumsRepositoryPort.sumsByAccountCurrency(accountIds)` (lote, para el DTO). Una función
    compartida `transaction/application/credit-pool-usage.ts` (`creditPoolUsage`) para validar y el
    mapper del DTO para mostrar, con la misma fórmula.
- **Rationale**: no hay `creditUsed` persistido por moneda extranjera hoy y persistirlo exige reconciliar
  ~10 caminos (pago, prepago, traspaso, deshacer, importación). La fórmula ya está probada en
  `cardLimitUsage`; solo cambia el filtro (`bankAccountId` en vez de `cardId`). Los INCOME de
  liquidación existentes (con `cardId` de la principal) entran igual, porque el filtro ya no mira la tarjeta.
- **Alternativas**: persistir `creditUsed` por moneda — más rápido de leer, mucho más riesgo de deriva.

## R3 — Reglas del movimiento (MovementPolicy)

- **Decisión**: en una cuenta `CREDIT_CARD`, un movimiento en otra moneda:
  - exige cupo de la cuenta en esa moneda → nuevo error `CREDIT_POOL_CURRENCY_NOT_FOUND` (400);
  - EXPENSE (con tarjeta o cargo del emisor): `used + amount ≤ limit` del cupo de esa moneda →
    `CARD_LIMIT_EXCEEDED` (mismo código que el cupo en pesos); y si la tarjeta es adicional con
    sub-tope en esa moneda, el sub-tope → `CARD_SUBLIMIT_EXCEEDED`;
  - INCOME: paga el cupo de esa moneda; puede llevar o no tarjeta (los antiguos llevan la principal);
  - **nunca** contribuye al cupo en pesos (`contribution` = "0" para todo movimiento en otra moneda).
    `MovementPolicy.validate` recibe un `CreditPoolContext | null` (`{limitAmount, used}`) para la
    moneda del movimiento cuando es extranjera; `paysCardOwnLimit` se reemplaza por "INCOME en moneda con
    cupo de la cuenta".
- **Rationale**: es exactamente FR-002/FR-006. Cierra el hueco de R0.
- **Alternativas**: dejar que un cargo extranjero sin cupo sume a pesos — es el bug actual.

## R4 — Sub-topes de adicionales

- **Decisión**: siguen siendo `CardLimit` (sin cambio de tabla). Reglas nuevas en el agregado
  (`BankAccount.normalizeLimits`/`resolveCardPlacement`): solo en tarjetas NO principales; solo en
  monedas en que la cuenta tiene cupo (`CREDIT_POOL_CURRENCY_NOT_FOUND`); `limitAmount > 0` y
  `≤ cupo de esa moneda` (`CARD_SUBLIMIT_EXCEEDS_ACCOUNT`, hoy solo para la moneda de la cuenta).
  Bajar o quitar un cupo de la cuenta por debajo de un sub-tope existente → `CARD_SUBLIMIT_EXCEEDS_ACCOUNT`.
  Uso de un sub-tope = `sumsForCard(…, openOnly)` sin el agregado de arrastre (el arrastre es de la
  cuenta, R2).
- **Rationale**: FR-004/FR-005; mismo mecanismo que hoy en la moneda de la cuenta.

## R5 — Liquidación de facturaciones en otra moneda

- **Decisión**: el INCOME de liquidación (`planForeignSettlement`) se crea **sin `cardId`**; se exige
  que la cuenta tenga cupo en esa moneda (`CREDIT_POOL_CURRENCY_NOT_FOUND`, reemplaza
  `CARD_LIMIT_NOT_FOUND` en este camino). `settlementCardId` desaparece.
- **Rationale**: FR-003 (libera el cupo de la cuenta sin depender de una tarjeta). Con R2 el uso es por
  cuenta, así que la tarjeta no aporta nada; y ya no hay que re-apuntar liquidaciones al cambiar de
  principal.
- **Compatibilidad**: los INCOME viejos con `cardId` = principal siguen sumando en el cupo de la cuenta
  (R2) y no afectan sub-topes (la principal no tiene). Si la principal vieja pasa a adicional, sus
  liquidaciones viejas solo entrarían en su sub-tope si tuviera uno; nunca lo tiene (FR-015).

## R6 — Cambio de principal: operaciones y mecanismo

- **Decisión**: dos endpoints nuevos en el Facade de `bank-account`:
  - `POST /accounts/:id/cards/:cardId/make-primary` (sin cuerpo) → `MakePrimaryCardCommand`.
  - `POST /accounts/:id/cards/:cardId/replace-primary` (`{ action: "DEACTIVATE" | "DELETE",
replacement: { cardId } | { newCard } }`) → `ReplacePrimaryCardCommand`.
    Y dos rechazos en los existentes: `PATCH /accounts/:id/cards/:cardId` con `isActive: false` sobre la
    principal y `DELETE /accounts/:id/cards/:cardId` sobre la principal responden
    **`PRIMARY_CARD_REPLACEMENT_REQUIRED`** (409).
    Método de agregado `BankAccount.changePrimary(newPrimaryId)`: valida (CREDIT, activa, de la cuenta,
    distinta) → `PRIMARY_CARD_INVALID_REPLACEMENT` (400); la nueva queda `isPrimary` sin `limits`; la
    anterior `isPrimary=false` sin `limits`. Nada del cupo cambia.
- **Rationale**: un endpoint con intención explícita es más claro que cargar el PATCH genérico con un
  campo condicional, y deja el rechazo del PATCH como red de seguridad para clientes viejos.
- **Alternativas**: `PATCH` con `replacement` opcional — mezcla edición de datos con un cambio de rol y
  vuelve condicional la idempotencia.

## R7 — Idempotencia y concurrencia (Principio VII)

- `make-primary`: **forma (a)**, estado absoluto — repetirlo deja la misma tarjeta como principal
  (no-op si ya lo es). No mueve saldo, cupo ni cuotas.
- `replace-primary`: **forma (c)** — crea una fila (la tarjeta nueva) y cambia roles; `Idempotency-Key`
  obligatorio, operación `card.replacePrimary`, `BaseIdempotentCommandHandler`, todo en una
  `$transaction` que estampa el `COMPLETED`. Un replay devuelve la misma respuesta sin crear otra tarjeta
  (FR-019/SC-006).
- `PATCH /accounts/:id` con `extraCreditLimits`: estado absoluto (reemplaza el conjunto) — se repite y
  converge; no mueve usado.
- **Concurrencia**: los tres leen la cuenta con `SELECT … FOR UPDATE` (`findByIdForUpdateWithTx`, nuevo
  en `BankAccountRepositoryPort`) dentro de la transacción. **Red de seguridad en la base**: índice único
  parcial `card-account(accountId) WHERE "isPrimary"` (SQL a mano en la migración; precedente:
  `user-email`), así dos cambios simultáneos nunca dejan dos principales.

## R8 — Eliminar la principal: ¿tiene historia?

- **Decisión**: `replace-primary` con `action: "DELETE"` consulta dos puertos de solo lectura —
  `TransactionRepositoryPort.existsForCard(userId, cardId)` e
  `InstallmentPlanRepositoryPort.existsForCard(userId, cardId)` — y responde
  **`PRIMARY_CARD_HAS_HISTORY`** (409) si alguno es verdadero. Gastos fijos y plantillas no cuentan.
- **Rationale**: decisión de clarify (opción A).

## R9 — Tarjeta nueva como reemplazo

- **Decisión**: `newCard` = `{ name, last4, expiryMonth, expiryYear, network?, isVirtual?,
isAdditional?, cardholderName? }` (subconjunto de `createCardSchema`, siempre `kind: CREDIT`, sin
  `limits`). Se crea dentro de la misma transacción con `CardAccountRepositoryPort.createWithTx`
  (ya existe) y queda principal. La creación de la PRIMERA tarjeta CREDIT de una cuenta
  (`resolveCardPlacement` sin principal) acepta omitir el límite en la moneda de la cuenta cuando la
  cuenta ya tiene `creditLimit > 0` (usa el de la cuenta); si lo trae, sigue escribiéndolo en la cuenta
  (compatibilidad con `AccountCreateModal`).

## R10 — Compatibilidad con clientes viejos durante el despliegue

- La app se despliega antes que la API. Una app vieja:
  - guarda los cupos en otra moneda como `limits` de la principal (`ExtraCurrencyLimits` → PATCH card).
    **La API nueva traduce**: los `limits` de otra moneda enviados para la principal (crear cuenta con
    `cards[]`, crear o editar la principal) se escriben como cupos de la cuenta, no como `CardLimit`.
  - lee `card.limits` de la principal para mostrar USD → la API nueva sigue exponiendo los cupos
    extranjeros también en `primary.limits` (espejo de solo lectura, con `id` del cupo de cuenta),
    marcado como obsoleto en el contrato; se quita en una entrega posterior.
- Una API vieja con una app nueva: la app nueva manda `extraCreditLimits` (campo desconocido → la API
  vieja con `.strict()`? `updateBankAccountSchema` no es strict, lo ignora) y no encuentra los endpoints
  nuevos (404 → toast genérico). Ventana de ~1 min, aceptado.

## R11 — Migración de datos (expand → contract)

- **Decisión**: migración `<timestamp>_account_credit_limits` (expand):
  1. `CREATE TABLE "account-credit-limit"` + unique `(accountId, currency)`.
  2. Para cada cuenta y cada moneda ≠ la de la cuenta presente en `card-limit` de sus tarjetas CREDIT:
     `limitAmount` = (límite de la principal en esa moneda, o 0) + Σ límites de las adicionales en esa
     moneda; `usedInitial` = Σ de los `usedInitial`. Así la capacidad total nunca baja: antes eran pozos
     independientes que se sumaban; cada adicional sigue acotada por su sub-tope, y la principal solo
     gana disponible (SC-004).
  3. Los `card-limit` de las adicionales quedan como sub-topes (ya caben por construcción).
  4. Los `card-limit` en otra moneda de las PRINCIPALES **no se borran** en esta migración (el código
     viejo los lee durante el minuto de despliegue); el código nuevo los ignora. Se borran en una
     migración de contracción de una entrega posterior (anotado en `docs/PENDING.md`).
  5. `CREATE UNIQUE INDEX … ON "card-account"("accountId") WHERE "isPrimary"`.
- Un `card-limit` de la principal en la MISMA moneda de la cuenta no debería existir; si existe, se ignora.
- Esto **ajustó FR-008 del spec** (antes decía "el cupo sube al valor del sub-tope"; con varias
  adicionales o con principal y adicional en la misma moneda, sumar es lo que garantiza que ningún
  disponible baje). Corregido en el spec tras `/speckit-analyze` (F1).
- El bloque de backfill de `migration.sql` va entre `-- backfill:start` y `-- backfill:end` para que el
  test de integración lo ejecute sobre datos armados dentro de una transacción que se revierte.

## R15 — Traspaso de facturación en otra moneda (spec 028 US3)

- `transfer-statement.handler.ts` también usa `settlementCardId` para el INCOME que cierra el período
  extranjero. Con R5 ese INCOME tampoco lleva tarjeta y exige cupo de la cuenta en esa moneda. Deshacer el
  traspaso borra los movimientos por id, sin depender de la tarjeta.

## R16 — Monedas ofrecidas al registrar un movimiento

- En una cuenta `CREDIT_CARD`, el formulario de movimiento ofrece la moneda de la cuenta y las que tienen
  cupo de la cuenta (`account.creditPools`), no todas las del perfil; la API sigue siendo la que decide
  (`CREDIT_POOL_CURRENCY_NOT_FOUND`).

## R12 — Web

- `ExtraCurrencyLimits` (en `AccountForm`/`AccountCreateModal`) pasa a escribir `extraCreditLimits` de
  la cuenta (no la principal) y lista las monedas del perfil (`useAllowedCurrencies`).
- `CardForm`: la principal no muestra sección de tope (texto "Usa el 100% del cupo de la cuenta"); una
  adicional con "Tope propio" ofrece solo monedas con cupo de la cuenta y valida `≤ cupo`.
- `CardDetailPanel`: cupos de la cuenta por moneda (de `account.creditPools`), acción "Marcar como
  principal" (CREDIT adicional activa, cuenta con principal); se quita el aviso de "cupo único
  multimoneda" (ya no aplica).
- Flujo de reemplazo: `ReplacePrimaryPanel` (`FormSurface` panel) — radio entre tarjetas CREDIT activas
  de la cuenta + "Tarjeta nueva" (últimos 4, vencimiento, red), aviso "los cupos no cambian"; lo abren
  apagar "Activa" en la principal (`CardForm`) y "Eliminar" en la principal (`CardDetailPanel`).
- Aviso de cuenta sin principal activa en `AccountDetailRoute` (derivado: hay tarjetas CREDIT y ninguna
  principal activa) con botón que abre `ReplacePrimaryPanel` en modo "elegir".
- Mutaciones invalidan `["accounts"]`, `["transactions"]` (las tarjetas de cada fila) y `["wallet"]`.

## R13 — Importación / plantilla

- La plantilla (Tarjetas: "un tope en otra moneda" por tarjeta) **no cambia de formato**: el tope en otra
  moneda de la principal se lee como cupo de la cuenta; el de una adicional, como sub-tope (validado
  contra el cupo). La exportación con datos escribe los cupos de la cuenta en la fila de su principal.
  `template-plan.ts` deja de seguir el uso por (tarjeta, moneda) para la principal y lo sigue por
  (cuenta, moneda); los eventos `settle` liberan el uso de la cuenta. Sin cambio de `TEMPLATE_VERSION`.
- El importador de cartola (`import-plan.ts`) solo acepta la moneda de la cuenta: sin cambio.

## R14 — Otros consumidores

- `user` (bloqueo de quitar una moneda del perfil, `CurrencyUsageLookupPort`): se agrega el puerto de
  `account-credit-limit`.
- Semilla: los topes USD de las principales sembradas pasan a cupos de cuenta.
- Borrado de cuenta y "Reemplazar todo": cascada desde `bank-account`, sin código nuevo (se agrega
  `countForUser` al preview de reemplazo si lo usa por tabla — verificar en tareas).
