# Research: Reintentos y doble envío no pueden duplicar dinero

**Feature**: 015-idempotent-money-writes · **Date**: 2026-09-02

Todo lo de acá está verificado contra el código, no supuesto. Los `file:line` son reales.

---

## 0. Estado de partida (lo que la auditoría encontró)

| Hecho                                        | Evidencia                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No existe ninguna maquinaria de idempotencia | grep `idempoten` en `apps`+`packages`: sólo comentarios y nombres de test. Cero header, cero tabla, cero store                                                           |
| Ningún id se genera en el cliente            | grep `crypto.randomUUID\|uuid\|nanoid` en `apps/web/src`: **cero aciertos**                                                                                              |
| Ningún endpoint lee un header                | grep `@Headers\|req.header` en `apps/api/src`: **cero**. El único `@Req()` (`auth.controller.ts:74`) lee una cookie                                                      |
| No hay persistencia de borradores            | `localStorage` en `apps/web/src` se usa sólo para el sidebar y el tema                                                                                                   |
| **El cliente YA reintenta escrituras**       | `apiClient.ts:104-109`: ante `401` renueva la sesión y **repite `rawFetch(path, init)`** con el mismo body                                                               |
| Las mutaciones de react-query NO reintentan  | `providers.tsx:14-26`: `defaultOptions` tiene `queries` y **ninguna clave `mutations`** ⇒ default `retry: 0`                                                             |
| Los botones de submit SÍ se deshabilitan…    | `form-surface.tsx:105` `disabled={!canSubmit                                                                                                                             |     | submitting}`, usado por movimientos, cuotas y facturación |
| …**salvo en deudas**                         | `DebtTable.tsx:184-198` — `ActionBtn` es un `<button>` que **no acepta `disabled`**. `settle`/`unsettle`/`registerPayment`/`undoPayment` son todos clickeables dos veces |

---

## 1. Decisión: identidad de request provista por el cliente (forma **(c)** del principio VII)

**Decision**: cada operación protegida acepta una clave de idempotencia generada por el cliente, y el
servidor recuerda el intento y su resultado.

**Rationale**: es la única de las tres formas del principio VII que satisface FR-001 y FR-002 a la
vez. La forma (b) —llave natural con constraint único— exigiría una restricción sobre
`(userId, amount, occurredAt, bankAccountId, description)`, que es exactamente lo que **bloquearía
el segundo de dos cafés iguales**. La forma (a) —máquina de estados— ya existe donde puede existir
(`CreditStatement`) y por definición no aplica a un _create_: no hay estado previo que consultar.

**Alternatives considered**:

- **(b) llave natural sobre los datos del movimiento** — rechazada: rompe FR-002, que es un requisito
  explícito y no negociable del usuario.
- **Ventana de "ya registraste algo igual hace 5 segundos, ¿seguro?"** — rechazada: es fricción
  (viola FR-002/SC-003), es heurística, y no protege contra el reintento automático del propio
  cliente, que ocurre sin que nadie vea el diálogo.
- **Deduplicar en el cliente** (deshabilitar el botón) — insuficiente, pero **se hace igual como
  defensa en profundidad**: no sobrevive un reload, no cubre dos pestañas y no cubre el replay del
  `apiClient`. Hoy ya existe en todos lados menos deudas.

---

## 2. Decisión: transporte por header `Idempotency-Key`

**Decision**: header HTTP `Idempotency-Key`, no un campo del body.

**Rationale**: el body es el modelo de dominio; la clave es metadato de transporte. Meterla en el
body obligaría a tocar **todos** los schemas zod de creación y a que cada agregado ignore un campo
que no le pertenece. Es además el nombre que la industria ya usa (Stripe, PayPal, la propuesta
IETF `draft-ietf-httpapi-idempotency-key-header`), así que no hay que inventar semántica.

**Verificación de viabilidad** (no era obvia — no hay precedente en el repo):

- Nest expone `@Headers("idempotency-key")` sin configuración extra.
- CORS: `main.ts:24-25` llama `enableCors({ origin, credentials: true })` **sin `allowedHeaders`**, y
  el middleware `cors` en ese caso refleja `Access-Control-Request-Headers`. Un header custom pasa el
  preflight sin cambios. **Verificado por lectura, a confirmar con una petición real en quickstart.**
- `apiClient.rawFetch` (`apiClient.ts:30-41`) ya hace `{ ...init.headers }` al final, así que un
  llamador puede agregar el header sin tocar el cliente.

**Alternatives considered**: campo `requestId` en el body — rechazado por contaminar todos los
contratos de dominio; query param — rechazado, un identificador de intento en la URL termina en logs
de acceso y en el historial del navegador (mismo problema que la constitución acaba de nombrar para
las claves de storage).

---

## 3. Decisión: el protocolo de dos fases, y por qué es seguro

**Decision**:

```
Fase 1 (transacción propia) — RESERVAR
  INSERT idempotency-record (userId, key, operation, requestHash, status = IN_FLIGHT)
  ├─ ok                    → seguimos, somos dueños de este intento
  └─ violación de unicidad → leer el registro existente:
       COMPLETED + mismo hash + misma operación → devolver la respuesta guardada  (FR-003)
       COMPLETED + hash u operación distintos   → 409 IDEMPOTENCY_KEY_REUSED       (FR-005)
       IN_FLIGHT reciente                        → 409 IDEMPOTENCY_IN_PROGRESS      (FR-006)
       IN_FLIGHT vencido                         → tomarlo y seguir                (ver abajo)

Fase 2 (UNA sola transacción) — EJECUTAR
  efecto de negocio  +  UPDATE record SET status = COMPLETED, response = ...
```

**Rationale — el argumento de seguridad, que es el corazón del diseño**:

Porque el efecto y el `COMPLETED` viajan en la **misma** transacción, sólo hay dos desenlaces
posibles: _ambos_ se confirman, o _ninguno_. De ahí se sigue la invariante que hace todo lo demás
seguro:

> **Un registro en `IN_FLIGHT` significa siempre que el efecto NO se confirmó** — salvo que su
> transacción esté corriendo en este preciso instante.

Por eso **tomar un `IN_FLIGHT` vencido es seguro**, no una apuesta: si venció, su transacción ya
terminó (confirmada ⇒ estaría `COMPLETED`; abortada ⇒ no hay efecto). El umbral de vencimiento sólo
tiene que ser mayor que la duración máxima de una transacción. Con **60 segundos** sobra: la más
larga de estas operaciones escribe un plan de cuotas con su calendario y un movimiento.

Sin esta atomicidad el diseño se cae: si el efecto se confirmara y el `COMPLETED` se escribiera
después, una caída entre los dos dejaría un efecto aplicado con el intento marcado como no aplicado,
y el reintento **duplicaría** — justo lo que la feature existe para impedir.

**Alternatives considered**:

- **Marcar COMPLETED después de confirmar el efecto** (dos transacciones) — rechazada por lo
  anterior. Es la variante que parece equivalente y no lo es.
- **Bloqueo pesimista (`SELECT … FOR UPDATE`) sobre una fila de intento** — rechazada: el `INSERT`
  con constraint único ya da exclusión mutua, sin fila previa que bloquear ni riesgo de deadlock, y
  es el patrón que el repo ya usa para el email (`prisma-user.repository.ts:100-108`).
- **Guardar sólo el id del recurso creado en vez de la respuesta completa** — rechazada: FR-003 pide
  _el mismo resultado_, y releer el recurso puede devolver algo distinto si se editó entremedio.

---

## 4. Decisión: dónde vive el mecanismo — capa de aplicación, no interceptor

**Decision**: una clase base `BaseIdempotentCommandHandler`, que extiende el Template Method
existente. El controlador lee el header y lo pasa dentro del command.

**Rationale**: la fase 2 **obliga** a que el `COMPLETED` esté dentro de la transacción del efecto. Un
interceptor global —que es como el repo resuelve el logging (`handler-logging.interceptor.ts`,
registrado en `app.module.ts:47-50`)— vive **fuera** de esa transacción: sólo podría escribir el
`COMPLETED` después de que el handler retorne, que es exactamente la variante insegura del punto 3.

Se evaluó un híbrido (interceptor para reservar y responder el replay, handler para completar), y se
rechazó: parte una sola invariante en dos archivos que pueden divergir, y el principio VI ya dice que
la lógica que protege una regla vive donde no se pueda saltar.

**Consecuencia estructural** — `BaseCommandHandler.execute` (`base-command.handler.ts:33-39`) es
`load → handle → persist → publish` y **no tiene ningún punto donde vea la petición HTTP**. La clave
entra como campo del command, igual que `userId`, y es el handler base quien envuelve el flujo.

---

## 5. Hallazgo: quién abre la transacción hoy es **inconsistente**, y hay que unificarlo

Éste es el trabajo estructural que la feature no puede evitar. Los cuatro caminos de escritura que
hay que proteger abren su transacción en tres lugares distintos:

| Operación                                | Dónde se abre el `$transaction`                                                       | Evidencia                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `POST /transactions`                     | **en el adapter** (`saveNew`)                                                         | `prisma-transaction.repository.ts:210-247`     |
| `POST /transactions/transfers`           | **en el adapter** (`saveTransferPair`)                                                | `prisma-transaction.repository.ts:333-368`     |
| `POST /installments`                     | **en el handler**, dentro de `handle()`                                               | `create-installment-plan.handler.ts:104-114`   |
| pago de facturación                      | **en el handler**, dentro de `persist()`                                              | `pay-credit-statement.handler.ts:166-209`      |
| deudas (`register-payment`, `settle`, …) | **en ninguna parte** — `load` y `save` son dos viajes sueltos sin bloqueo entre medio | los 7 handlers de `debt/application/commands/` |

**Decision**: el handler es el dueño de la transacción, uniformemente. Los adapters que hoy la abren
por dentro ganan una variante `*WithTx` y su método actual pasa a ser una llamada a esa variante con
el cliente base — que es **el patrón que el repo ya tiene escrito**:
`prisma-installment-plan.repository.ts:107` hace literalmente
`return this.createWithTx(this.prisma, userId, plan)`.

**Rationale**: es la única forma de meter el `COMPLETED` en la misma transacción sin filtrar el
concepto de idempotencia dentro de cada adapter (lo que violaría "una tabla, un dominio, un adapter"
del principio VI: el adapter de `transaction` no puede escribir en la tabla de `idempotency-record`).
Además es la dirección en la que el repo ya venía: `pay-credit-statement` enlista cinco puertos en
una sola transacción.

**Alternatives considered**: pasar el puerto de idempotencia a cada adapter — rechazado, viola el
principio VI. Dejar la transacción en el adapter y completar afuera — rechazado, punto 3.

**Nota sobre deudas**: hoy no abren transacción alguna. Al envolverlas, además de la idempotencia se
cierra una carrera real que existe desde siempre: dos `register-payment` concurrentes leen el mismo
`paidInstallments` y ambos escriben `n+1`.

---

## 6. Decisión: `sha256` canónico del body como huella de la petición

**Decision**: `requestHash` = SHA-256 sobre el JSON del body con claves ordenadas. Sólo se usa para
detectar el caso de FR-005 (misma clave, datos distintos), **nunca** para decidir si dos operaciones
son la misma.

**Rationale**: es la distinción que hace todo el diseño coherente. La huella responde _"¿es este
reintento del mismo intento?"_; jamás responde _"¿este movimiento ya existe?"_. Dos cafés iguales
tienen la misma huella y **claves distintas**, así que entran los dos. `node:crypto` ya está
disponible (`randomUUID` se usa en tres handlers).

**Alternatives considered**: comparar el body crudo — rechazado, el orden de claves de `JSON.stringify`
en el cliente no está garantizado entre versiones. No guardar huella y aceptar cualquier body con la
misma clave — rechazado, viola FR-005 y esconde un bug del cliente aplicando datos que el usuario ya
había cambiado.

---

## 7. Decisión: la clave la genera el formulario, no cada envío

**Decision**: `crypto.randomUUID()` al **primer** submit de un formulario, guardada en un ref y
reusada mientras ese formulario siga abierto. Se descarta al cerrarse o al completarse con éxito.

**Rationale**: si la clave se generara en cada envío, un reintento sería un intento nuevo y no
protegería nada. Si se generara al _abrir_ el formulario, un "Guardar y crear otro" reusaría la
clave de la operación anterior y el segundo registro sería rechazado como duplicado.

Dos comportamientos caen solos de esta decisión:

- **El replay del `apiClient` queda protegido gratis.** `apiFetch:104-109` repite el `init` original,
  y el header ya viaja adentro de `init.headers` — así que el reintento silencioso manda la misma
  clave por construcción, sin tocar `apiFetch`.
- **Reintentar tras un error de negocio funciona.** Un intento rechazado borra su reserva (FR-004),
  así que el usuario corrige el monto, vuelve a apretar con la misma clave, y se procesa como nuevo.

**Límite conocido, documentado y no resuelto**: si el usuario **recarga la página** en medio de un
envío, el ref se pierde. Un reenvío será un intento nuevo y puede duplicar. Evitarlo exige persistir
borradores (`localStorage`), que hoy no existe para ningún formulario y es un problema de experiencia
aparte. Queda en Out of Scope de la spec.

**Alternatives considered**: derivar la clave del contenido del formulario — es la forma (b)
disfrazada, rompe FR-002. Generarla en el `apiClient` por petición — no distingue reintento de
operación nueva, que es justamente lo único que importa.

---

## 8. Decisión: retención 24 h, limpieza por cron

**Decision**: `expiresAt = createdAt + 24 h`; un cron diario borra los vencidos. `IN_FLIGHT` se
considera abandonado a los **60 segundos** (punto 3).

**Rationale**: 24 h es el estándar de la industria y cubre con enorme holgura cualquier reintento
plausible — el más largo acá es "se me cayó internet, vuelvo en un rato". `infra/cron/` ya existe con
`billing-generation.cron.ts`, y la constitución ya bendice el `scope: "system"` para un cron: la
limpieza sigue ese molde exacto, sin inventar mecanismo.

**Alternatives considered**: no expirar nunca — rechazado, la tabla crece sin techo y FR-016 pide
poder olvidar. Borrar al leer un replay — rechazado, un cliente puede reintentar más de una vez.

---

## 9. Hallazgos que NO son idempotencia pero salen en el mismo camino

Se arreglan acá porque son la misma línea de código o el mismo test:

1. **`Debt.settle()` no tiene guarda** (`debt.aggregate.ts:146-150`): cada llamada re-estampa
   `settledAt = new Date()`. La idempotencia impide el reintento, pero un clic legítimo sobre una
   deuda ya liquidada **igual** movería la fecha. Necesita su guarda propia, como `unsettle` ya
   tiene.
2. **`Debt.undoPayment()` limpia `settledAt` incondicionalmente** (`:179`): deshacer un pago sobre una
   deuda liquidada a mano también la des-liquida, aunque el pago deshecho no fuera el que la liquidó.
3. **`ActionBtn` no acepta `disabled`** (`DebtTable.tsx:184-198`): hay que agregárselo para poder
   deshabilitar los cuatro botones de deudas mientras la mutación está en vuelo, como ya hace el
   resto de la app.
4. **`Debt.applyUpdate()` no valida nada** (`:128-144`): permite dejar `totalInstallments` por debajo
   de `paidInstallments`. Lo pide FR-014.

---

## 10. Verificado: qué NO hay que tocar

- **`WalletItemDashboard`** ya deduplica (`add-wallet-item.handler.ts:52-53` + los dos `@@unique`).
  Es la forma (b) y está bien resuelta.
- **`installment-payment.stampWithTx`** (`prisma-installment-payment.repository.ts:69-78`) es
  idempotente por construcción: la precondición vive en el `WHERE`
  (`creditStatementId: null`). Es el mejor ejemplo del repo y no se modifica.
- **`POST /auth/register`** ya está cubierto por `email @unique` + el catch de `P2002`.
- **Todo `PATCH`/`DELETE`** es idempotente por semántica; el `deleteMany` scopeado devolviendo cero
  filas ⇒ 404 lo hace natural.
- **`generate-statements`** es idempotente por construcción (`generate-statements.handler.ts:88-98`).
