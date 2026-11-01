# Research: Plantillas de movimientos (037)

## R1 — Una tabla-dominio nueva, `movement-template`

- **Decision**: tabla `movement-template` (modelo `MovementTemplate`), dominio
  `apps/api/src/domains/movement-template/` con las cuatro capas, más una hoja
  `movement-template.data.module.ts`. Misma forma que `custom-field` (specs/036).
- **Rationale**: Principio VI (una tabla = un dominio). Una plantilla es un agregado propio:
  se crea/edita/borra sin que ningún movimiento cambie.
- **Alternatives**: guardar plantillas como JSON en `User` (rompe isolation por columna, sin
  FKs, sin `SetNull`); reutilizar `transaction` con un flag (contaminaría todos los totales).

## R2 — Referencias: FKs reales con `onDelete: SetNull`

- **Decision**: `bankAccountId` → `BankAccount`, `cardId` → `CardAccount`, `categoryId` →
  `Category`, `recurringExpenseId` → `RecurringExpense`, todas nullable con `SetNull`.
  Valores de columnas propias en `customFieldValues Json` (`{ [fieldId]: value }`), no FK.
- **Rationale**: FR-010 — borrar una cuenta/tarjeta/categoría/gasto fijo nunca se bloquea ni
  borra la plantilla. Las columnas propias son N por plantilla y validadas por el agregado
  `CustomField`; un JSON evita una tabla puente. Una columna borrada deja una llave huérfana
  que la LECTURA filtra (las respuestas solo traen ids de columnas que existen) — así no hay
  que tocar `custom-field` al borrar.
- **Alternatives**: tabla `movement-template-field-value` (más esquema para ≤ 20 valores por
  plantilla, sin consulta que lo necesite).

## R3 — Escritura como reemplazo completo (`PUT`)

- **Decision**: `POST /movement-templates` crea, `PUT /movement-templates/:id` reemplaza el
  estado completo con el mismo cuerpo que crear, `DELETE /movement-templates/:id` borra.
- **Rationale**: el formulario de edición siempre envía todo; un reemplazo valida el estado final
  completo (tarjeta-cuenta, cargo del emisor sin tarjeta) sin mezclar parches, y es idempotente
  por naturaleza.
- **Idempotency (Principio VII)**: POST forma (b) — `@@unique([userId, nameKey])`: un replay
  responde `MOVEMENT_TEMPLATE_NAME_TAKEN` en vez de duplicar. PUT forma (b) — escribe el estado
  absoluto de su propia fila. DELETE forma (a) — terminal; un replay responde
  `MOVEMENT_TEMPLATE_NOT_FOUND`. Ninguna mueve dinero, por eso no se pide `Idempotency-Key`.

## R4 — Verificación de ownership (Principio II)

- **Decision** (en `application/template-references.ts`, compartida por crear y reemplazar):
  - cuenta → `BankAccountLookupPort.accountOwned` (`ACCOUNT_NOT_FOUND` 404);
  - tarjeta → exige cuenta (refine del contrato) y `CardAccountRepositoryPort.findOnAccount(userId,
accountId, cardId)` — una tarjeta ajena o de otra cuenta responde `CARD_NOT_FOUND` 404;
  - categoría → `assertSelectableCategory(lookup, id, type)` (`CATEGORY_NOT_FOUND`/`CATEGORY_NOT_ALLOWED`);
  - gasto fijo → `RecurringExpenseRepositoryPort.findOne` (`RECURRING_NOT_FOUND` 404);
  - columnas propias → `CustomFieldRepositoryPort.listForUser` y `CustomField.parseValue` por
    valor (`CUSTOM_FIELD_NOT_FOUND` 404 si el id no es de la persona, `CUSTOM_FIELD_INVALID_VALUE`).
- **No se valida "aplica a este movimiento"** de una columna: una plantilla puede no tener cuenta;
  la aplicabilidad la decide el formulario al usarla (FR-011).

## R5 — Límite y nombre

- **Decision**: `MOVEMENT_TEMPLATE_MAX = 50` por persona (`MOVEMENT_TEMPLATE_LIMIT_REACHED` 409),
  nombre 1–60 caracteres, `nameKey` = `customFields.normalizeFieldName(name)` (misma regla:
  minúsculas, sin acentos, espacios colapsados). Lista ordenada por nombre.
- **Known gap**: dos creaciones concurrentes con 49 existentes pueden dejar 51 (mismo hueco
  aceptado en `custom-field`). Sin dinero en juego; no se bloquea la fila del usuario.

## R6 — Monto y moneda

- **Decision**: `amount` (`Decimal(18,4)`, positivo) y `currency` (ISO de 3) opcionales; si hay
  monto, la moneda es obligatoria (refine). Al usar la plantilla, la moneda del formulario la
  decide la cuenta elegida (si hay cuenta activa), igual que al elegirla a mano; sin cuenta, la de
  la plantilla.
- **Rationale**: Principio I (decimal string, nunca float); la moneda permite mostrar "$450.000"
  en la lista aunque la cuenta se haya borrado.

## R7 — Uso en el formulario (solo web)

- **Decision**: función pura `applyTemplate(template, ctx)` en
  `apps/web/src/domains/movement-templates/lib/applyTemplate.ts` que devuelve el parche del
  formulario: cuenta solo si está entre las seleccionables; tarjeta solo si pertenece a esa cuenta
  y la cuenta es "cardable"; categoría solo si es seleccionable para el tipo; gasto fijo solo si
  existe; columnas propias solo las que existen y aplican al movimiento rellenado (`fieldsFor`).
  En una cuenta de tarjeta de crédito un ingreso se vuelve gasto (mismas reglas que
  `handleAccountChange`), y sin tarjeta elegida se toma la principal.
- **"Guardar como plantilla"**: diálogo con nombre + switch "Guardar el monto"; arma el cuerpo con
  `templateFromForm(form, fields)`; disponible solo en modo gasto/ingreso y solo al crear.
- **Editor de plantillas**: el mismo `TransactionFormPanel` con un prop `templateMode` (oculta fecha,
  saldo proyectado, adjuntos, Traspaso y Prepagar) dentro de un `FormSurface` con el campo nombre.

## R8 — Borrado de la cuenta de la persona y exportación

- **Decision**: `userId` FK con `onDelete: Cascade` (borrar la cuenta borra las plantillas). La
  exportación JSON de "Descargar mis datos" incluye `movementTemplates` (FR-015, SHOULD).
  REPLACE de la plantilla de importación no toca las plantillas (sus FKs pasan a null por
  `SetNull` cuando se borran las cuentas) — aceptable: son configuración, no historia.
