# Phase 1 — Data model

## `Transaction` (tabla `transaction`) — modificada

| Campo             | Tipo                | Nota                                                              |
| ----------------- | ------------------- | ----------------------------------------------------------------- |
| `transferGroupId` | `String?` **nuevo** | Identifica el par de un traspaso. `null` en gastos e ingresos.     |

- Índice nuevo: `@@index([transferGroupId])`.
- Invariante: **exactamente dos** filas comparten un mismo `transferGroupId` — una `EXPENSE` (lado de
  salida) y una `INCOME` (lado de entrada), ambas del mismo `userId`, en cuentas distintas.
- Invariante: una fila con `transferGroupId` tiene `cardId = null` y `creditStatementId = null`
  (FR-019); `bankAccountId` es obligatorio en ambos lados.
- No se usa FK ni tabla `Transfer` propia: el grupo es un identificador compartido, no una entidad con
  datos propios. (Una tabla `transfer` implicaría un dominio más para no guardar nada que las dos
  filas no digan ya.)
- El resto del modelo no cambia. `type` sigue siendo `INCOME | EXPENSE`.

## `TransactionAttachment` (tabla `transaction-attachment`) — nueva

| Campo           | Tipo       | Nota                                                       |
| --------------- | ---------- | ---------------------------------------------------------- |
| `id`            | `String`   | `cuid()`, PK                                                |
| `userId`        | `String`   | FK → `User`, `onDelete: Cascade`. Aislamiento por usuario   |
| `transactionId` | `String`   | FK → `Transaction`, `onDelete: Cascade`                     |
| `storageKey`    | `String`   | Clave del objeto en el bucket, `@unique`                    |
| `fileName`      | `String`   | Nombre original, máx. 255                                   |
| `contentType`   | `String`   | Uno de los 4 admitidos                                      |
| `sizeBytes`     | `Int`      | ≤ 5.242.880                                                 |
| `createdAt`     | `DateTime` | `@default(now())`                                           |

- Índices: `@@index([userId])`, `@@index([transactionId])`.
- `@@map("transaction-attachment")`.
- `storageKey` = `u/<userId>/t/<transactionId>/<attachmentId>-<slug del nombre>`. Se deriva del id,
  no del nombre subido, así que dos archivos con el mismo nombre en el mismo movimiento conviven.
- El `Cascade` en base de datos garantiza que no queden filas colgando; el borrado del OBJETO en el
  bucket lo hace el handler, después de la transacción (D4).

## Reglas de validación (dominio)

**Traspaso** (`TransferPolicy`, `transaction/domain/transfer-policy.ts`):

1. `fromAccountId ≠ toAccountId` → `TRANSFER_SAME_ACCOUNT`
2. ambas cuentas existen y pertenecen al usuario → `ACCOUNT_NOT_FOUND`
3. la cuenta destino no es `CREDIT_LINE` → `TRANSFER_TO_CREDIT_ACCOUNT`
4. ningún lado lleva `cardId` → `CARD_NOT_ALLOWED`
5. ambos montos son positivos → `INVALID_AMOUNT`
6. las monedas de cada lado son las de su cuenta; no se comparan entre sí

**Adjunto** (`AttachmentPolicy`, `transaction-attachment/domain/attachment-policy.ts`):

1. `contentType ∈ {image/jpeg, image/png, image/webp, application/pdf}` → `ATTACHMENT_TYPE_NOT_ALLOWED`
2. los magic bytes coinciden con el tipo declarado → `ATTACHMENT_TYPE_NOT_ALLOWED`
3. `sizeBytes ≤ 5 MB` → `ATTACHMENT_TOO_LARGE`
4. el almacenamiento está configurado → `ATTACHMENTS_UNAVAILABLE` (503)
5. el movimiento pertenece al usuario → `TRANSACTION_NOT_FOUND` (404, nunca 403: no se confirma la
   existencia de datos ajenos)

## Estados y transiciones

Ninguna entidad nueva tiene ciclo de vida multi-etapa, así que **no** se introducen objetos State.
Un traspaso existe o no existe; un adjunto existe o no existe.

## Códigos de error nuevos

`TRANSFER_SAME_ACCOUNT`, `TRANSFER_TO_CREDIT_ACCOUNT`, `TRANSFER_ACCOUNT_NOT_FOUND`,
`ATTACHMENT_TYPE_NOT_ALLOWED`, `ATTACHMENT_TOO_LARGE`, `ATTACHMENTS_UNAVAILABLE`,
`ATTACHMENT_NOT_FOUND`. Todos con su clave en `errors.*` de `es.json` y `en.json` (Principio III).
