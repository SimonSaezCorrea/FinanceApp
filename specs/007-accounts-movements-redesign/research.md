# Research: Rediseño Cuentas y Movimientos con tarjetas secundarias

**Feature**: 007-accounts-movements-redesign · **Date**: 2026-07-02

Todas las decisiones se anclan en patrones ya existentes en el monorepo (código = fuente de verdad). No hay NEEDS CLARIFICATION pendientes: las ambigüedades de dominio se resolvieron en `spec.md` (sección Clarifications).

## D1 — Número de cuenta bancaria

- **Decisión**: Añadir `accountNumber String?` (opcional, nullable) a `BankAccount`. Se guarda y muestra completo.
- **Rationale**: Es un número de cuenta bancaria, no un PAN de tarjeta; la política "solo últimos-4 / nunca PAN/CVV" aplica exclusivamente a `Card`. No hay riesgo PCI en un número de cuenta bancaria estándar.
- **Alternativas**: enmascarar (rechazada por el usuario); reutilizar `institution` (rechazada, es otro dato).

## D2 — Modelo de tarjetas secundarias (self-relation)

- **Decisión**: Añadir `parentCardId String?` a `Card` como auto-relación (`parent`/`children`) con `onDelete: Cascade` (borrar la principal borra sus secundarias). Un solo nivel de anidamiento.
- **Reglas de integridad** (servicio):
  - La principal referida debe ser del mismo `userId` y misma `accountId`.
  - La principal no puede ser a su vez secundaria (un solo nivel).
  - Para pool de cupo, principal y secundaria deben ser `kind = CREDIT`. Débito puede tener `parentCardId` (agrupación/etiqueta "secundaria") pero SIN lógica de pool.
- **Rationale**: Auto-relación es el patrón mínimo; cascade es coherente con el borrado en cascada `Card`→`CardLimit` y `BankAccount`→`Card` existentes.
- **Alternativas**: tabla puente `CardGroup` (rechazada, sobre-ingeniería para 1 nivel); booleano `isSecondary` sin puntero al padre (rechazada, no permite propagar el pool).

## D3 — Cálculo del "usado" del cupo (semilla + derivado)

- **Decisión**: `CardLimit` gana `initialUsed Decimal @default(0)` (semilla). El "usado" reconciliado se **calcula en el servidor al leer** (no se almacena un contador mutable), sumando los gastos de crédito:
  - `used(card, cur) = initialUsed(card,cur) + Σ EXPENSE.amount` de transacciones con `cardId = card.id` y `currency = cur`.
  - Para una tarjeta **principal**: `usedTotal(principal,cur) = used(principal,cur) + Σ_child used(child,cur)` (agrega propias + de todas sus secundarias, incluyendo la semilla de cada hija).
  - Para una **secundaria**: solo su propio `used` (no suma la principal).
- **Enforcement al escribir** un gasto de crédito `A` en la tarjeta `C` (moneda `cur`):
  - `used(C,cur) + A ≤ subLimit/limit(C,cur)` (tope propio de C).
  - Sea `P` la principal de `C` (o `C` si es principal): `usedTotal(P,cur) + A ≤ limit(P,cur)` (pool compartido).
  - Si se excede cualquiera → rechazar con código de error (ver D6).
- **Rationale**: Reflejar `used` como derivado (igual que `balanceSeries` en cuentas se computa on-read) garantiza consistencia automática ante crear/editar/eliminar/mover movimientos, sin drift. La semilla `initialUsed` reproduce el patrón `initialBalance` para representar deuda preexistente al alta.
- **Alternativas**:
  - Contador `used` incremental mantenido por triggers de transacción (rechazada: propenso a drift; obliga a reconciliar como en cuentas).
  - `used` puramente manual actual (rechazada por el usuario: no cumple "el gasto se refleja en el usado").
- **Compatibilidad de contrato**: `cardLimitSchema` pasa a exponer `initialUsed` (entrada/semilla) y `used` (derivado, salida). Migración: el valor `used` actual de filas existentes se copia a `initialUsed` (se preserva el usado ya cargado como semilla).

## D4 — Query de agregación de gastos por tarjeta

- **Decisión**: Añadir al repositorio de accounts un `groupBy` de `Transaction` por `cardId` con `type = EXPENSE`, `sum(amount)`, scoped por `userId`, para las tarjetas de la(s) cuenta(s) devueltas. Un solo query por listado (patrón de `txWindow`/`attachSeries`).
- **Rationale**: Evita N+1; reutiliza el enfoque de "una consulta windowed por listado" ya usado para `balanceSeries`.
- **Nota**: para enforcement al escribir se hace una agregación puntual scoped a la(s) tarjeta(s) implicada(s) dentro de la transacción de escritura.

## D5 — Obligatoriedad de banco y reglas tarjeta/tipo en movimientos

- **Decisión**:
  - `createTransactionSchema`: `bankAccountId` pasa a **requerido**. `updateTransactionSchema` sigue parcial (no fuerza en histórico).
  - Contrato `refine`: si `type = INCOME` ⇒ `cardId` ausente.
  - Reglas dependientes del tipo de cuenta (efectivo) se validan en el **servicio** (necesita leer `account.type`):
    - `EXPENSE` en cuenta `≠ CASH` ⇒ `cardId` requerido y la tarjeta debe pertenecer a esa cuenta.
    - `EXPENSE` en cuenta `CASH` ⇒ `cardId` prohibido.
    - `INCOME` ⇒ `cardId` prohibido (defensa en profundidad).
- **Rationale**: El contrato no conoce el `type` de la cuenta; la regla efectivo/no-efectivo es de servidor. Mantener `bankAccountId` opcional en update preserva movimientos legacy sin banco.
- **Alternativas**: forzar todo en zod (rechazada: no puede consultar el tipo de cuenta).

## D6 — Códigos de error (language-agnostic)

- **Decisión**: nuevos códigos: `CARD_LIMIT_EXCEEDED` (pool de la principal), `CARD_SUBLIMIT_EXCEEDED` (sub-tope de la secundaria), `CARD_REQUIRED` (gasto no-efectivo sin tarjeta), `CARD_NOT_ALLOWED` (ingreso o efectivo con tarjeta), `CARD_ACCOUNT_MISMATCH` (tarjeta no pertenece al banco), `PARENT_CARD_INVALID` (padre inexistente/otra cuenta/otro tipo/anidamiento). El frontend mapea a `errors.<CODE>` en es/en.
- **Rationale**: Principio de errores del proyecto (la API nunca devuelve prosa localizada).

## D7 — Frontend: congruencia visual y modales

- **Decisión**: Extraer/compartir un único componente de fila de movimiento entre la vista global de Movimientos y la vista de Cuenta. "Añadir tarjeta" y CRUD de movimientos usan el primitivo `dialog` (Radix) existente. Filtro banco→tarjeta con `select` encadenado; toggle "incluir inactivas"; badge "Inactiva" con el primitivo `badge`.
- **Rationale**: Reutiliza el sistema de diseño (`shared/ui`) y evita duplicar formato (causa raíz de la inconsistencia reportada).
- **Detalle de estructura**: ver `plan.md` (Project Structure) una vez mapeado el frontend actual.

## D8 — Migración de datos

- **Decisión**: Una migración Prisma: `BankAccount.accountNumber`, `Card.parentCardId` (+ índice, self-relation, onDelete Cascade), `CardLimit.initialUsed` (default 0) y **backfill** `initialUsed = used` para filas existentes. `CardLimit.used` deja de ser columna de entrada mutable; se puede conservar la columna temporalmente o eliminarla (se decide en tasks; preferible eliminarla tras el backfill para que `used` sea siempre derivado).
- **Rationale**: Preserva el usado ya cargado por los usuarios como semilla; sin pérdida de datos.
- **Constitución**: cambios de esquema ⇒ actualizar `constitution.md` + `CLAUDE.md` (Principio V) en esta misma sesión (fase de memory-sync del `/sdd`).
