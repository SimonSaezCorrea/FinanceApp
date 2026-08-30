# Phase 0 — Research: Movimientos, traspasos y comprobantes

## D1 — Representación de un traspaso

**Decision**: Dos filas `Transaction` corrientes (`EXPENSE` en el origen, `INCOME` en el destino)
unidas por una columna nueva `transferGroupId`. El enum `TransactionType` NO cambia.

**Rationale**: cada cuenta ve su lado como un movimiento normal; `balanceDelta`, la paginación por
keyset, los filtros y todo el CRUD siguen funcionando sin tocar un solo `switch`. Elegido por el
usuario sobre la alternativa de valores nuevos en el enum.

**Alternatives considered**:

- `TRANSFER_OUT`/`TRANSFER_IN` en el enum: el compilador habría forzado a revisar cada suma, pero
  obligaba a tocar 14 archivos que hoy asumen dos valores.
- Un `TRANSFER` con columna de dirección: dos columnas para decidir el signo del saldo.

**Riesgo aceptado y mitigación (SC-004 / FR-017)**: al no cambiar el tipo, ninguna suma existente
excluye un traspaso por sí sola. Mitigación obligatoria: un único predicado nombrado
`EXCLUDE_TRANSFERS` (`transferGroupId: null`) definido una vez en
`transaction/application/queries/transaction-list-filter.ts` y aplicado en **todos** los agregados de
ingreso/gasto — `summary()` (KPI strip, totales por moneda, categorías) — más un test que registra un
traspaso y afirma que el resumen del período no se mueve. La lista de movimientos SÍ los incluye
(cada cuenta debe ver su lado); solo los agregados los excluyen.

**Alcance de la exclusión** (auditado con `grep INCOME`):

| Consumidor                                    | ¿Excluye traspasos? | Por qué                                         |
| --------------------------------------------- | ------------------- | ----------------------------------------------- |
| `summary()` — `currencyTotals`, `categories`  | Sí                  | FR-017 / SC-004                                 |
| `summary().total` (contador "N movimientos")  | No                  | Son movimientos reales del conjunto filtrado    |
| `list()`                                      | No                  | Cada cuenta ve su lado                          |
| `balanceDelta` / `currentBalance`             | No                  | El dinero sí se mueve                           |
| `sumsForCard` / `sumsByAccount` (cupo)        | Irrelevante         | Un traspaso nunca lleva tarjeta (FR-019)        |
| `netForPeriod` (conciliación de facturación)  | Irrelevante         | Misma razón; además el destino nunca es crédito |
| Dashboard `metrics.ts` (flujo del mes, donut) | Sí                  | Deriva de las mismas filas; filtra en cliente   |

## D2 — Almacenamiento de adjuntos

**Decision**: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, con endpoint configurable
(sirve para AWS S3, MinIO, Cloudflare R2, Backblaze). Subida **por el API** (multipart), lectura por
URL prefirmada de corta duración emitida por el API.

**Rationale**: la subida a través del API es el único camino donde el tamaño y el tipo real se
validan de verdad y donde la propiedad del movimiento se comprueba antes de escribir nada; 5 MB es un
volumen que un servidor Node absorbe sin problema. La lectura sí se delega al bucket con una URL
firmada para no proxyar bytes en cada vista.

**Alternatives considered**: URL prefirmada también para subir (validación real queda en el bucket y
exige un segundo paso de confirmación); cliente `minio` (más liviano, menos ubicuo).

**Nuevas variables de entorno** (todas opcionales; su ausencia deja la función inerte):
`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
`S3_FORCE_PATH_STYLE` (MinIO/R2).

**Sin configurar** (FR-024): el módulo se registra igual, pero el adapter responde `503`
`ATTACHMENTS_UNAVAILABLE` a subir/leer/borrar. El listado de adjuntos de un movimiento sigue
funcionando (devuelve lo que haya en la tabla, típicamente vacío), así que el panel no se rompe.
La sección se pinta siempre. Queda catalogado en `docs/PENDING.md`.

**Multipart en NestJS 11 / Express 5**: `@nestjs/platform-express` ya trae `multer`; se usa
`FileInterceptor` con `limits.fileSize` = 5 MB y un `fileFilter` por mimetype, memoria (no disco),
para que un archivo rechazado nunca toque el sistema de archivos. Se añade `@types/multer` (devDep).

## D3 — Validación real del tipo de archivo

**Decision**: se valida la extensión + el `Content-Type` declarado + los **magic bytes** del inicio
del buffer (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`, PDF `%PDF-`). Sin dependencia
nueva: son 5 comparaciones de prefijo en una función pura y testeable del dominio.

**Rationale**: el `Content-Type` lo elige el cliente; aceptar un ejecutable renombrado a `.pdf` y
devolverlo después con ese tipo es exactamente el vector que este chequeo cierra.

## D4 — Borrado del objeto (FR-025)

**Decision**: el borrado del movimiento/adjunto elimina el objeto del bucket **después** de la
transacción de base de datos, no dentro. Un fallo remoto se registra (`logger.error` con la clave
huérfana) y no revierte el borrado.

**Rationale**: la llamada de red al bucket no puede vivir dentro de un `prisma.$transaction` — la
mantendría abierta a merced de la latencia de S3 —, y un archivo huérfano es un problema de costo,
no de corrección; un movimiento que no se deja borrar sí lo es.

## D5 — Navegación ‹ › con lista paginada (FR-004/FR-004a)

**Decision**: el panel no consulta nada nuevo. Recibe del padre el array de items ya cargados por
`useInfiniteTransactions`, el índice actual, el `total` de `useTransactionsSummary` y un
`fetchNextPage`. Al pedir "siguiente" estando en el último item cargado y con `hasNextPage`, dispara
`fetchNextPage()` y avanza cuando llega.

**Rationale**: reutiliza exactamente el conjunto que la vista ya mantiene (mismos filtros, mismo
orden, misma caché de TanStack Query); una consulta propia del panel podría describir un conjunto
distinto al de la tabla que está detrás.

**Alternatives considered**: endpoint "vecinos de este movimiento" (una consulta por cada flecha, y
duplicaría la definición del conjunto filtrado).

## D6 — Saldo tras el movimiento / saldo proyectado (FR-002, FR-009)

**Decision**: se calculan en el cliente con `@finance/money`.

- Proyectado (formulario): `account.currentBalance + balanceDelta(tipo, monto)` — al editar, primero
  se revierte el delta del movimiento original si es la misma cuenta.
- Tras el movimiento (detalle): `account.currentBalance` menos la suma de los deltas de los
  movimientos posteriores a él **entre los ya cargados**.

**Rationale**: no hay endpoint de saldo histórico por movimiento y añadir uno es una feature en sí.
Es un dato informativo (así lo declara la spec).

**Regla exacta de visibilidad** (cierra A1 del análisis): la fila "Saldo tras el movimiento" se
muestra si y solo si se cumplen las tres condiciones:

1. la cuenta lleva saldo (`type !== "CREDIT_LINE"`),
2. no hay filtro de fecha activo (`from`/`to` vacíos) — un rango recortado esconde movimientos
   posteriores que sí afectan al saldo, y
3. el movimiento está entre los cargados desde el más reciente sin hueco, es decir, su índice cae
   dentro de las páginas ya traídas, que siempre empiezan en el presente.

Si falla cualquiera, la fila se omite (no se muestra un número aproximado sin avisar). Se cataloga
en `docs/PENDING.md` como cobertura parcial deliberada.

## D7 — Dominio del adjunto

**Decision**: tabla nueva `transaction-attachment` → dominio propio
`apps/api/src/domains/transaction-attachment/` (Principio VI: una tabla, un dominio, un adapter),
con las cuatro capas y su propio Facade bajo `/transactions/:id/attachments`.

**Rationale**: es una tabla nueva; la constitución no admite que otro dominio la consulte. El
`Attachment` no es entidad interna del agregado `Transaction` (tiene ciclo de vida propio: se sube y
se borra sin tocar el movimiento), así que es raíz de su propio agregado, con las cuatro capas.

## D8 — El cliente de S3 como puerto

**Decision**: `ObjectStoragePort` (`domain/ports/object-storage.port.ts`) con
`put/ getSignedUrl / delete / isConfigured`; el adapter S3 vive en `infrastructure/`. Los tests
unitarios usan un fake en memoria y no tocan la red.

**Rationale**: es la misma regla de Adapter que ya cumple Prisma; además es lo que permite que el
tier unitario siga sin dependencias externas (Principio IV).
