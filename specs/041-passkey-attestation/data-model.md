# Data Model: Verificar el autenticador de las llaves de acceso (041)

Una migración Prisma (`<timestamp>_passkey_attestation`), **solo expansiva**: una tabla nueva y columnas
nulas en `passkey` y `session`. El código anterior sigue funcionando durante el despliegue.

## `authenticator-model` (nueva tabla-dominio, global, `domain/` + `infrastructure/`)

| Campo               | Tipo      | Notas                                                                 |
| ------------------- | --------- | --------------------------------------------------------------------- |
| `id`                | UUID v7   | PK (Principio VIII).                                                  |
| `aaguid`            | String    | `@unique`. Identificador de negocio del modelo, nunca el PK.          |
| `description`       | String    | Nombre del modelo según el catálogo ("YubiKey 5 Series with NFC").    |
| `statement`         | Json      | La declaración de metadatos, para cargarla en `MetadataService`.      |
| `compromisedStatus` | String?   | Estado del reporte más reciente si es de compromiso (R3), si no null. |
| `statusDate`        | DateTime? | Fecha efectiva de ese reporte.                                        |
| `catalogNumber`     | Int       | `no` del catálogo del que viene la fila.                              |
| `catalogNextUpdate` | DateTime  | `nextUpdate` de ese catálogo (vencido ⇒ no marca llaves nuevas).      |
| `updatedAt`         | DateTime  |                                                                       |

Reemplazo: en una transacción, `deleteMany` + `createMany`, solo si el número nuevo es mayor que el
máximo guardado. **Puerto `AuthenticatorModelRepositoryPort`**: `currentCatalog()` (`{ number, nextUpdate }
| null`), `replaceAll(catalog)`, `findByAaguid(aaguid)`, `statements()`, `compromisedAaguids()`.

## `passkey` (cambios)

| Campo               | Tipo      | Notas                                                              |
| ------------------- | --------- | ------------------------------------------------------------------ |
| `aaguid`            | String?   | El AAGUID del autenticador (solo si quedó verificada).             |
| `authenticatorName` | String?   | Modelo según el catálogo al momento de verificar.                  |
| `verifiedAt`        | DateTime? | null = no verificada (sin attestation, no verificable o anterior). |
| `compromisedAt`     | DateTime? | null = utilizable. Nunca vuelve a null por el catálogo (FR-010).   |
| `compromisedReason` | String?   | El estado del catálogo que la marcó.                               |

Índice `(aaguid)` para la revisión. **Estado derivado** (contrato): `compromised` si `compromisedAt`,
`verified` si `verifiedAt`, si no `unverified`.

**Puerto `PasskeyRepositoryPort`** (cambios): `createWithTx` acepta `aaguid`/`authenticatorName`/
`verifiedAt`; `markCompromisedWithTx(tx, reasonByAaguid, now)` → filas marcadas `{ id, userId,
name }[]` (condicional `compromisedAt IS NULL AND verifiedAt IS NOT NULL`); `countUsable(userId)`.

## `session` (cambios)

| Campo       | Tipo          | Notas                                                                          |
| ----------- | ------------- | ------------------------------------------------------------------------------ |
| `passkeyId` | FK? `passkey` | La llave con que se abrió la sesión. `onDelete: SetNull`. Null para las demás. |

**Puerto `SessionRepositoryPort`**: `closeByPasskeysWithTx(tx, passkeyIds, now)` (solo abiertas).
`SessionIssuer.establish` acepta `passkeyId` opcional.

## Transiciones de una llave

```text
registro sin attestation / no verificable ──▶ no verificada (para siempre)
registro con attestation verificada ──▶ verificada ──revisión: modelo comprometido──▶ comprometida
registro con attestation verificada de modelo comprometido ──▶ rechazado (no se guarda)
comprometida ──▶ (solo quitar o renombrar)
```
