# Contrato — Adjuntos (`@finance/contracts` → `transactions/attachments`)

## Shapes

```ts
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const attachmentSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
  fileName: z.string(),
  contentType: z.enum(ATTACHMENT_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(ATTACHMENT_MAX_BYTES),
  createdAt: z.string(),
});

/** URL firmada de lectura, de vida corta. */
export const attachmentUrlSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
});
```

El cuerpo de la subida es `multipart/form-data` (campo `file`), no un schema zod — la validación de
tipo/tamaño/magic bytes ocurre en el interceptor y en `AttachmentPolicy`.

## Endpoints

| Método   | Ruta                                          | Cuerpo               | Respuesta        |
| -------- | --------------------------------------------- | -------------------- | ---------------- |
| `GET`    | `/transactions/:id/attachments`               | —                    | `Attachment[]`   |
| `POST`   | `/transactions/:id/attachments`               | `multipart` (`file`) | `Attachment`     |
| `GET`    | `/transactions/:id/attachments/:attachmentId/url` | —                | `AttachmentUrl`  |
| `DELETE` | `/transactions/:id/attachments/:attachmentId` | —                    | `204`            |

La descarga no se proxya: el API firma una URL de 5 minutos contra el bucket y el navegador la abre.

## Errores

| Código                        | HTTP | Cuándo                                                     |
| ----------------------------- | ---- | ---------------------------------------------------------- |
| `ATTACHMENTS_UNAVAILABLE`     | 503  | El almacenamiento no está configurado (FR-024)             |
| `ATTACHMENT_TYPE_NOT_ALLOWED` | 400  | Tipo declarado o magic bytes fuera de la lista             |
| `ATTACHMENT_TOO_LARGE`        | 400  | > 5 MB                                                     |
| `ATTACHMENT_NOT_FOUND`        | 404  | No existe, o no es del usuario                             |
| `TRANSACTION_NOT_FOUND`       | 404  | El movimiento no existe o no es del usuario                |

## Capacidad

`GET /health` (o el propio `GET .../attachments`) no expone una bandera de capacidad: la UI pinta
siempre la sección y reacciona al `503` de la subida con el mensaje de `ATTACHMENTS_UNAVAILABLE`.
Es lo que decidió el usuario en `/speckit-clarify` ("falla y ya") y evita una bandera que después
haya que mantener.

## Variables de entorno (`apps/api/.env.example`)

```
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
```

Todas opcionales. Si `S3_BUCKET` o las credenciales faltan, `ObjectStoragePort.isConfigured()` es
`false` y los tres endpoints de escritura/lectura de archivo responden `503`.
