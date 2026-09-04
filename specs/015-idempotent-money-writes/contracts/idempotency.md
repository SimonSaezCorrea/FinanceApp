# Contract: idempotencia de escrituras

**Feature**: 015-idempotent-money-writes

**Ninguna ruta cambia. Ningún body cambia.** Lo que se agrega es un header de petición, tres códigos
de error y una semántica de respuesta para el reintento.

---

## 1. El header

```
Idempotency-Key: <valor opaco generado por el cliente>
```

Schema en `@finance/contracts` (módulo nuevo `src/idempotency/index.ts`):

```ts
export const IDEMPOTENCY_HEADER = "idempotency-key";

/** Opaca para el servidor: sólo se exige que sea larga como para no colisionar
 *  por accidente. El cliente usa `crypto.randomUUID()`. */
export const idempotencyKeySchema = z.string().trim().min(16).max(255);

/** Retención del intento (FR-016) y umbral de abandono de un IN_FLIGHT. */
export const IDEMPOTENCY_RETENTION_HOURS = 24;
export const IDEMPOTENCY_IN_FLIGHT_TIMEOUT_SECONDS = 60;
```

**El header es obligatorio** en las operaciones de la tabla de abajo. Se eligió obligatorio y no
opcional a propósito: opcional significa que una llamada sin clave se procesa sin protección, y
entonces la garantía deja de ser una garantía — un cliente que se olvide del header duplica en
silencio, que es exactamente el defecto que la feature elimina. Falta el header ⇒ `400
IDEMPOTENCY_KEY_REQUIRED`.

---

## 2. Operaciones protegidas

Diez, todas las que registran o mueven dinero (FR-008). Las rutas y los verbos **no cambian**.

| Operación (`operation` guardado) | Ruta                                                    |
| -------------------------------- | ------------------------------------------------------- |
| `transaction.create`             | `POST /transactions`                                    |
| `transaction.createTransfer`     | `POST /transactions/transfers`                          |
| `installmentPlan.create`         | `POST /installments`                                    |
| `installmentPlan.payInstallment` | `POST /installments/:id/payments/:seq/pay`              |
| `creditStatement.pay`            | `POST /accounts/:id/credit-statements/:statementId/pay` |
| `debt.registerPayment`           | `POST /debts/:id/register-payment`                      |
| `debt.undoPayment`               | `POST /debts/:id/undo-payment`                          |
| `debt.settle`                    | `POST /debts/:id/settle`                                |
| `debt.unsettle`                  | `POST /debts/:id/unsettle`                              |
| `savingsEntry.create`            | `POST /savings/entries`                                 |

**No** llevan header: todo `GET`, todo `PATCH`, todo `DELETE` (idempotentes por semántica),
`POST /wallet` (ya deduplica con su `@@unique`), `POST /auth/*`, `POST /accounts/:id/generate-statements`
(idempotente por construcción) y `POST /import/transactions` (fuera de alcance — ver spec).

---

## 3. Semántica de respuesta

| Situación                               | Respuesta                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Primera vez, éxito                      | La respuesta normal de la operación (201/200/204), sin cambios                               |
| **Reintento de un intento completado**  | **Byte por byte la misma respuesta y el mismo status que la primera vez**, sin ejecutar nada |
| Falta el header                         | `400 IDEMPOTENCY_KEY_REQUIRED`                                                               |
| Misma clave, body u operación distintos | `409 IDEMPOTENCY_KEY_REUSED`                                                                 |
| El intento se está ejecutando ahora     | `409 IDEMPOTENCY_IN_PROGRESS`                                                                |

| El intento fue rechazado por una regla de negocio | El error de negocio de siempre (`CARD_LIMIT_EXCEEDED`, …) y **la reserva se borra**: reintentar con la misma clave vuelve a intentarlo |

> **Corrección durante la implementación**: este documento proponía `422` para `IDEMPOTENCY_KEY_REUSED`.
> `DomainError` (`infra/domain/domain-error.ts`) restringe a propósito su `httpStatus` a `400 | 404 | 409`,
> y una clave que contradice lo que ya representa **es** un conflicto con el estado existente. Se usa
> `409` en vez de ensanchar un tipo compartido por una distinción cosmética de status.

El reintento **no** lleva ninguna marca de "esto fue un replay". Es deliberado: FR-007 pide que el
mecanismo sea invisible, y un cliente que tuviera que distinguir los dos casos tendría dos caminos
que mantener. Si algún día hiciera falta para depurar, es un header de respuesta, no un cambio de
cuerpo.

---

## 4. Errores nuevos

Códigos agnósticos del idioma (`{ error: { code, field? } }`), con su prosa en `es.json`/`en.json`.

| Código                     | HTTP | Significado para el usuario                                                                                               |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| `IDEMPOTENCY_KEY_REQUIRED` | 400  | Bug del cliente; nunca debería verlo un usuario                                                                           |
| `IDEMPOTENCY_KEY_REUSED`   | 409  | "Esta operación ya se registró con otros datos" — pasa si el usuario editó el formulario después de un envío que sí llegó |
| `IDEMPOTENCY_IN_PROGRESS`  | 409  | "Ya estamos procesando esto" — reintentar en un momento                                                                   |

---

## 5. Lado cliente

`apiFetch` gana una opción para la clave:

```ts
apiFetch<T>(path, { method: "POST", body, idempotencyKey });
```

que se traduce a `headers[IDEMPOTENCY_HEADER]`. **`rawFetch` ya hace `{ ...init.headers }` al final
(`apiClient.ts:37-39`), así que no hay que cambiar cómo se arman los headers.**

Consecuencia que sale gratis y vale la pena nombrar: el replay silencioso ante `401`
(`apiFetch:104-109`) repite el `init` original, con el header ya adentro — así que **queda protegido
sin tocar `apiFetch`**, que es lo que cierra SC-004.

Regla de generación (FR-001 vs FR-002, ver [research.md](../research.md) §7): **una clave por
formulario-intento**, creada con `crypto.randomUUID()` en el primer submit, guardada en un ref,
descartada al éxito o al cerrar. No una por petición (no protegería nada) ni una por apertura del
formulario ("Guardar y crear otro" reusaría la anterior).

---

## 6. Contrato de `savings-entry` (camino de corrección)

Rutas nuevas, siguiendo exactamente la forma que `savings/goals/:id` ya tiene:

| Método   | Ruta                   | Cuerpo               | Respuesta      |
| -------- | ---------------------- | -------------------- | -------------- |
| `GET`    | `/savings/entries/:id` | —                    | `SavingsEntry` |
| `PATCH`  | `/savings/entries/:id` | `UpdateSavingsEntry` | `SavingsEntry` |
| `DELETE` | `/savings/entries/:id` | —                    | `204`          |

```ts
// packages/contracts/src/savings/index.ts — nuevo
export const updateSavingsEntrySchema = createSavingsEntrySchema.partial().extend({
  currency: z.string().trim().length(3).optional(),
});
```

Mismo tratamiento que `updateSavingsGoalSchema` (`savings/index.ts:30`), incluida la re-declaración
de `currency` como opcional para que el `.default("USD")` del create no reviva en un PATCH — es la
corrección que el commit `e93dc0b` ya hizo para el resto de los schemas de update.

`savingsEntrySchema` **no cambia**: la tabla no tiene `updatedAt` y esta feature no se lo agrega.

`SAVINGS_ENTRY_NOT_FOUND` (404) para un aporte inexistente o de otro usuario — nunca 403, como manda
la constitución.
