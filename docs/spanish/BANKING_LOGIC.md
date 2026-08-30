# FinanceApp — Lógica bancaria (Cuentas, Tarjetas, Crédito y Movimientos)

> Versión en inglés: [../english/BANKING_LOGIC.md](../english/BANKING_LOGIC.md)

Estado: **vigente**. Este es un documento narrativo de referencia para la lógica de dominio de
**cuentas / tarjetas / cupos de crédito / movimientos** — las reglas están repartidas entre
`CLAUDE.md` (denso, un párrafo por dominio) y el historial de enmiendas de la constitución
(`.specify/memory/constitution.md`, estilo changelog); este documento existe para explicarlas en un
solo lugar, con ejemplos concretos. Para la estructura de carpetas ver [ARCHITECTURE.md](./ARCHITECTURE.md);
para la visión de producto original ver [APP_CONTEXT_AND_HISTORY.md](./APP_CONTEXT_AND_HISTORY.md).

**Última revisión:** 2026-07-19

---

## 1. El modelo mental en un párrafo

Una **`BankAccount`** es "donde vive el dinero o una línea de crédito" — una cuenta corriente, una
cuenta de ahorro, una tarjeta de crédito independiente, efectivo, etc. Una **`CardAccount`** es el
**instrumento de pago** físico/digital que gira sobre una cuenta; una cuenta puede
tener cero, una o varias tarjetas. Cada **`Transaction`** (ingreso o gasto) está vinculada a
exactamente una cuenta y, opcionalmente, a una tarjeta. Todo lo que sigue se desprende de estos tres
modelos y una idea rectora: **el cupo de crédito le pertenece a la cuenta, en la moneda propia de la
cuenta** — las tarjetas son solo distintas formas de usarlo (o, opcionalmente, de tener su propio
cupo paralelo y más estrecho).

---

## 2. Cuentas bancarias

### 2.1 Tipos de cuenta

| Tipo          | Significado                                                       |    ¿Requiere `accountNumber`?     | ¿Puede tener tarjetas? |    ¿Tiene saldo real en efectivo?     |
| ------------- | ----------------------------------------------------------------- | :-------------------------------: | :--------------------: | :-----------------------------------: |
| `CHECKING`    | Corriente                                                         |          ✅ obligatorio           |           ✅           |                  ✅                   |
| `SIGHT`       | Vista / Cuenta RUT                                                |          ✅ obligatorio           |           ✅           |                  ✅                   |
| `SAVINGS`     | Ahorro                                                            |          ✅ obligatorio           |           ❌           |                  ✅                   |
| `INVESTMENT`  | Inversiones (ej. Fintual)                                         |             opcional              |           ❌           |                  ✅                   |
| `CREDIT_LINE` | Una tarjeta de crédito independiente (sin cuenta bancaria detrás) |             opcional              |           ✅           | ❌ (su "saldo" ES el cupo de crédito) |
| `PREPAID`     | Cuenta prepago (fondos provisionados, emisor bancario o no)       |          ✅ obligatorio           |           ✅           |          ✅ (nunca negativo)          |
| `CASH`        | Efectivo                                                          | opcional (sin institución alguna) |           ❌           |                  ✅                   |

- **`ACCOUNT_NUMBER_REQUIRED_TYPES`** = `CHECKING`/`SIGHT`/`SAVINGS`/`PREPAID` — son tipos que reciben
  depósitos (a los que transferirías dinero), así que un número de cuenta real es obligatorio.
  Se refuerza con un `.refine()` de zod al crear y una verificación a nivel de servicio al editar
  (error `ACCOUNT_NUMBER_REQUIRED`).
- **`ALLOWED_CARD_KINDS`** (matriz tipo de cuenta ↔ `kind` de tarjeta, en `@finance/contracts`) —
  `CHECKING`/`SIGHT`: `DEBIT` + `CREDIT`; `CREDIT_LINE`: solo `CREDIT`; `PREPAID`: solo `PREPAID`;
  `SAVINGS`/`INVESTMENT`/`CASH`: ninguna (en la vida real, su dinero se mueve primero por
  transferencia hacia una cuenta que sí admite tarjeta). `isCardableAccountType` se deriva de ella
  (lista no vacía). Dos rechazos distintos: una cuenta que no admite tarjeta alguna responde
  `ACCOUNT_CANNOT_HAVE_CARD`; una que admite tarjetas pero no ESE kind responde
  `CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT`. Se refuerza en el agregado `BankAccount` (alta y edición de
  tarjeta, y el flujo inline `cards[]` al crear la cuenta) y se refleja en la UI web, que solo
  ofrece los kinds válidos.

### 2.1.1 La cuenta prepago (spec 011)

El prepago es un **producto propio**, no una tarjeta colgada de una cuenta corriente: los fondos los
provisiona el usuario por adelantado y los tiene un emisor (bancario o no bancario), sin línea de
crédito detrás. Reglas:

- Solo admite tarjetas `PREPAID`, y ninguna otra cuenta admite una: son productos distintos.
- Varias tarjetas prepago de la misma cuenta **comparten su saldo**; la tarjeta no tiene saldo
  propio (las columnas `prepaidBalance`/`prepaidInitialBalance` de `card-account` fueron eliminadas).
- **El saldo nunca queda negativo**: toda salida (gasto con tarjeta, gasto sin tarjeta, o la pata de
  salida de un traspaso) se rechaza con `PREPAID_INSUFFICIENT_BALANCE` si excede el saldo. Al editar
  un movimiento se evalúa contra el saldo _antes_ de su propio cargo anterior.
- **Cargarla es un traspaso** desde otra cuenta propia (o un INCOME normal si el dinero viene de
  fuera de la app). No existe endpoint de recarga de tarjeta.
- Sin cupo, sin facturación y sin día de corte; el saldo inicial no puede ser negativo
  (`INVALID_INITIAL_BALANCE`).
- El tipo de una cuenta **no se puede convertir** hacia ni desde `PREPAID`
  (`ACCOUNT_TYPE_CHANGE_NOT_ALLOWED`).
- **Filtro por tipo de institución:** `CHECKING`/`SIGHT`/`SAVINGS` solo pueden vincular una
  institución de tipo `BANK` (no puedes tener una cuenta corriente en un emisor de tarjetas no
  bancario). `INVESTMENT` y `CREDIT_LINE` quedan sin filtrar — `kind` solo distingue bancos de
  emisores de tarjeta no bancarios, y ninguna de las dos categorías representa bien a un gestor de
  inversiones, mientras que una línea de crédito puede legítimamente ser emitida por cualquiera de
  los dos. `CASH` no tiene campo de institución en absoluto.

### 2.2 Saldo

- **`initialBalance`** — un valor semilla que se define una sola vez, al crear la cuenta.
- **`currentBalance`** — el saldo reconciliado y cacheado de la cuenta:
  `currentBalance = initialBalance + Σingresos − Σgastos` sobre todos los movimientos vinculados a
  la cuenta. Se recalcula bajo demanda vía `POST /accounts/:id/reconcile` (no en cada escritura —
  el valor cacheado puede desactualizarse hasta que se reconcilia, algo intencional, siguiendo la
  misma convención de "saldo cacheado" usada en otras partes de la app).
- Una **`balanceSeries`** de 30 días (+ `balanceChangePct`) se calcula en cada lectura para los
  sparklines — recorre hacia atrás desde `currentBalance` deshaciendo cada movimiento dentro de esa
  ventana.

### 2.3 Eliminar una cuenta

Eliminar una cuenta **desvincula** sus movimientos en vez de eliminarlos (`onDelete: SetNull` en
`Transaction.bankAccountId`) — las filas de movimientos sobreviven como historial huérfano.

---

## 3. Tarjetas

### 3.1 Qué es una tarjeta

Una **`CardAccount`** siempre pertenece exactamente a una `BankAccount` (`onDelete: Cascade` —
eliminar la cuenta elimina sus tarjetas). Campos: `kind` (`CREDIT` / `DEBIT` / `PREPAID`), `last4`
(**solo se transmiten o guardan los últimos 4 dígitos — el número completo de la tarjeta nunca sale
del navegador, y no existe campo de CVV en ninguna parte**), `expiryMonth`/`expiryYear`, `isActive`,
e `isPrimary` (ver abajo). Se muestra siempre enmascarada como `•••• last4`.

### 3.2 El modelo de tope: la tarjeta principal refleja la cuenta

Esta es la parte que cambió de forma varias veces durante el desarrollo (ver el historial de
enmiendas de la constitución para el ida y vuelta completo) antes de asentarse en el diseño actual:

> **El cupo de crédito de la cuenta es un único par de números
> (`creditLimit` + `creditUsedInitial`, en la moneda propia de la cuenta). La PRIMERA tarjeta de
> tipo CREDIT de la cuenta queda marcada automáticamente como `isPrimary`, y su tope simplemente
> ES ese cupo — no existe un valor separado guardado para ella.** Cualquier tarjeta CREDIT
> adicional elige entre compartir ese mismo cupo, o tener su propio tope independiente y más
> estrecho.

En concreto:

- **`isPrimary`** (booleano, `@default(false)`) se asigna **automáticamente** — nunca la elige el
  usuario, y a lo más una es `true` por cuenta. Es la que sea que se haya agregado primero como
  tarjeta CREDIT.
- **El tope de la principal ES el `creditLimit`/`creditUsedInitial` de la propia cuenta** —
  editable desde cualquiera de los dos lados (el formulario de edición de la cuenta, o el de la
  propia tarjeta principal; es el mismo valor subyacente en la base de datos, no dos valores
  mantenidos en sincronía). La tarjeta principal nunca tiene una fila `CardLimit` para la moneda
  propia de la cuenta.
- **Toda tarjeta CREDIT debe resolver a un tope determinado antes de poder guardarse**
  (obligatorio). En concreto:
  - La **primera** tarjeta CREDIT de una cuenta **requiere** un monto de tope **en la moneda
    propia de la cuenta** — si falta, o es cero/negativo, lanza `CARD_LIMIT_REQUIRED`. Ese monto se
    escribe directamente en el `creditLimit` de la cuenta (y en `creditUsedInitial`, si se entregó
    un usado inicial semilla).
  - Cada tarjeta CREDIT **siguiente** elige, mediante `usesAccountPool` (booleano, `true` por
    defecto):
    - `true` (por defecto) — **comparte el cupo de la cuenta**. No se crea ninguna fila
      `CardLimit`; su gasto simplemente cuenta hacia el mismo `creditLimit`/`creditUsed`
      compartido.
    - `false` — tiene **su propio tope** ("tope propio"): una fila `CardLimit` por moneda
      (`limitAmount` + `usedInitial`, con un `used` derivado). Si `limits` viene vacío/ausente en
      este caso, también lanza `CARD_LIMIT_REQUIRED`. Un tope propio **en la misma moneda de la
      cuenta** no puede superar el cupo de la propia cuenta (`CARD_SUBLIMIT_EXCEEDS_ACCOUNT`) — un
      tope propio en **cualquier otra moneda** nunca se compara contra él (no existe conversión de
      divisas en ninguna parte de esta app, así que el cupo en CLP de una cuenta y el tope en USD
      de una tarjeta son simplemente números sin relación).

> **Crear una cuenta nueva de tipo `CREDIT_LINE` ya no requiere un paso separado de "agregar
> tarjeta" para la principal.** Una cuenta de tipo tarjeta de crédito independiente no tiene una
> cuenta bancaria real detrás, así que el campo genérico "Número de cuenta" de `AccountCreateModal`
> se reemplaza (solo para este tipo) por "Últimos 4 dígitos" + "Vencimiento" — junto con los campos
> `creditLimit`/`creditUsedInitial` propios de la cuenta (que ya se mostraban para este tipo), el
> modal arma la entrada `CreateCard` de la principal él mismo y la coloca primera en el `cards[]`
> enviado, así que la resolución de "la primera tarjeta CREDIT se vuelve principal" del backend
> (sin cambios) la recoge automáticamente. La sección de armado de tarjetas del modal se renombra
> "Tarjetas adicionales" para este tipo y siempre es solo-adicional (`hasExistingPrimary` de
> `CardForm` forzado a `true`) — editar una cuenta existente, o sumar una tarjeta adicional en
> cualquier OTRO tipo de cuenta, no se ve afectado y sigue el flujo normal `CardsAside` → "Añadir
> tarjeta".

### 3.3 Múltiples monedas en la tarjeta principal ("otros topes")

La tarjeta principal **también** puede tener filas `CardLimit` — pero **solo para monedas
distintas a la propia de la cuenta** (esa, como ya se dijo, vive exclusivamente en
`BankAccount.creditLimit`, nunca duplicada como fila). Esto permite que una misma tarjeta tenga, por
ejemplo, un cupo en CLP (el de la cuenta, obligatorio) **y** un cupo independiente en USD para
gasto en el extranjero, al mismo tiempo. Mecánicamente es exactamente el mismo mecanismo que ya usa
el "tope propio" de una tarjeta no principal — un cupo independiente y no cruzado por moneda extra
— solo que ahora también está disponible para la principal.

El contrato de la cuenta expone esto como un arreglo derivado **`creditPools:
{currency, limit, used}[]`**: el cupo en la moneda propia de la cuenta, más una entrada por cada
moneda extra que tenga la principal. El tope propio de una tarjeta no principal **no** se agrega
aquí — queda acotado solo a esa tarjeta.

### 3.4 Ejemplo trabajado

Supongamos que creas una cuenta **CHECKING** en CLP, y luego le agregas una tarjeta de crédito:

| Paso                                                                                                                    | Qué ocurre                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Creas la cuenta, agregas una tarjeta CREDIT "CMR Visa", le pones un tope de 3.000.000 CLP                            | Esta tarjeta queda `isPrimary: true`. Su tope se escribe en `BankAccount.creditLimit = 3.000.000` (CLP). La tarjeta misma tiene `limits: []` — no se crea ninguna fila para ella.                                                                                          |
| 2. En esa misma tarjeta, agregas también un "otro tope" de 500 USD                                                      | Se crea una fila `CardLimit`: `{cardId, currency: "USD", limitAmount: 500}`. Los `limits` de la tarjeta ahora muestran esa entrada. El `creditPools` de la cuenta pasa a ser `[{CLP, 3.000.000}, {USD, 500}]`.                                                             |
| 3. Agregas una segunda tarjeta CREDIT "CMR Visa · Camila", dejando `usesAccountPool: true`                              | Queda como tarjeta adicional, `isPrimary: false`, sin filas `CardLimit` — cada peso que gaste cuenta hacia el _mismo_ cupo de 3.000.000 CLP que la principal.                                                                                                              |
| 4. Agregas una tercera tarjeta CREDIT "CMR Visa · Sofía" con `usesAccountPool: false` y su propio tope de 1.000.000 CLP | Queda como tarjeta adicional con su **propia** fila `CardLimit` en CLP — topada en 1.000.000, y además topada en ≤ el cupo de 3.000.000 de la cuenta. Su gasto **no** cuenta en absoluto hacia el cupo compartido de 3.000.000.                                            |
| 5. Editas el `creditLimit` de la cuenta directamente (no desde una tarjeta)                                             | Como la principal no tiene un valor propio guardado, esto simplemente cambia el único número que existe — la principal lo "recoge" automáticamente la próxima vez que se lea.                                                                                              |
| 6. Gastas 300.000 CLP y 400 USD en la tarjeta principal                                                                 | Ambos cuentan de forma independiente: el cupo en CLP de la cuenta muestra `used: 300.000`; el propio `CardLimit` en USD de la principal muestra `used: 400`. El gasto en la _tercera_ tarjeta (su propio tope propio en CLP) nunca afecta a ninguno de los dos anteriores. |

### 3.5 Visualización por tarjeta vs. el total combinado de la cuenta

Varias tarjetas pueden compartir exactamente el mismo cupo (el valor por defecto `usesAccountPool:
true` del §3.2). En términos aritméticos muestran el número correcto si la UI simplemente despliega
`account.creditUsed` en cada una — pero _se lee_ mal: tres tarjetas mostrando todas el mismo
"1.686.470 / 3.000.000" parece como si cada una hubiera gastado individualmente ese monto, cuando en
realidad ese es el total **combinado** de las tres juntas.

Para corregir eso, el contrato de cada tarjeta lleva un **`ownUsed`** derivado (moneyString): el
propio Σgastos−Σingresos de esa tarjeta en particular, en la moneda propia de la cuenta, calculado
de la misma forma sin importar si la tarjeta comparte el cupo o tiene su propio `CardLimit`.
`AccountVisualCard` usa `card.ownUsed` — no `account.creditUsed` — como la cifra de "usado" en el
tile de una tarjeta (siempre contra el `creditLimit` compartido como denominador, ya que ese techo
sí es compartido de verdad). El **único** lugar donde todavía se muestra el total totalmente
combinado es el tile a nivel de cuenta sin una `card` específica (ej. el placeholder que se muestra
cuando una cuenta no tiene tarjetas, o donde se resume la cuenta misma y no una tarjeta) — ese sigue
usando `account.creditUsed`.

Vale la pena conocer una asimetría: `ownUsed` **no tiene un valor semilla**. La cuenta tiene
`creditUsedInitial` y el `CardLimit` propio de una tarjeta tiene `usedInitial`, ambos permiten
registrar deuda preexistente anterior a cualquier movimiento — pero una tarjeta que comparte el
cupo no tiene ningún campo donde guardar eso, ya que esa semilla le pertenece conceptualmente a la
cuenta como un todo, no a una tarjeta específica. Así que si el `creditUsedInitial` de una cuenta es
distinto de cero, sumar el `ownUsed` de todas las tarjetas que comparten el cupo quedará corto
respecto a `account.creditUsed` justo por ese monto semilla — es lo esperado, no un bug.

### 3.6 El cupo de la cuenta: saldo persistido, períodos de facturación en vivo, pagos reales

**`BankAccount.creditUsed`** es una **columna persistida y viva** — no se recalcula desde los
movimientos en cada lectura. Se inicializa con `creditUsedInitial` al crear la cuenta, y luego:

- **Cada EXPENSE vía una tarjeta CREDIT que comparte el cupo** (o, en una cuenta `CREDIT_LINE`
  standalone, cualquier EXPENSE) la **incrementa** por el monto del movimiento.
- **INCOME en una cuenta `CREDIT_LINE` standalone** (su única forma de registrar un pago) la
  **decrementa**.
- **Editar o eliminar un movimiento** revierte su contribución anterior y aplica la nueva (un
  delta neto en la misma cuenta, o un revertir+aplicar si el movimiento cambió de cuenta) — ver
  `TransactionsService.creditPoolContribution`/`validateMovement`. **Excepción:** si el movimiento
  ya está ligado a una facturación PAGADA, editarlo/eliminarlo nunca vuelve a tocar `creditUsed` —
  su efecto en el cupo ya quedó saldado (ver más abajo).
- Una tarjeta con su propio `CardLimit` independiente en esa moneda **no** afecta el cupo de la
  cuenta — su `CardLimit.used` sigue siendo derivado de los movimientos igual que antes (sin
  cambios, fuera de alcance de este modelo — ver §3.7).

**Los períodos de facturación (`CreditStatement`) son en vivo, no se calculan después.** Cada
movimiento que contribuye al cupo se liga, en el momento en que se crea, a la facturación
actualmente **ABIERTA** (`closedAt: null`) de la cuenta — creándola si es la primera contribución
desde el último cierre (`TransactionsRepository.findOrCreateOpenStatement`). El enlace de un
movimiento se asigna una sola vez y nunca se reasigna por fecha al editar ("se va llenando"). Tres
estados derivados (no una columna `status` guardada):

- **ABIERTA** (`closedAt` null): sigue acumulando. Su `amount` mostrado se **calcula en vivo** —
  la suma de todos los movimientos actualmente ligados — así que agregar/editar/eliminar un
  movimiento ligado la actualiza sola, sin necesitar corrección manual mientras esté sin pagar.
- **PENDIENTE** (`closedAt` con valor, `paidAt` null): sellada por la generación (ver abajo), a la
  espera de pago. El monto sigue siendo en vivo (un movimiento ligado antes del pago aún podría
  editarse).
- **PAGADA** (`paidAt` con valor): `amount` queda **congelado** en el valor que tenía al momento de
  pagar. Solo entonces se puede corregir manualmente (`PATCH /accounts/:id/credit-statements/:id`,
  `{amount}`) — sin cascada al movimiento de pago ya creado ni a `creditUsed` (deliberado,
  simplificación para uso personal).

**Generación** (`GenerateStatementsHandler`/`GenerateAllDueStatementsHandler`,
`apps/api/src/domains/accounts/application/commands/generate-statements.handler.ts` — el helper
`closeIfDue` que comparten porta 1:1 la lógica del antiguo `BillingGenerationService`) cierra la
facturación ABIERTA cuando
pasa `BillingSettings.billingCycleDay` (`1`-`28`) desde que empezó — pero solo si la cuenta (y su
tarjeta de crédito relevante) sigue `ACTIVE`; si no, se deja abierta indefinidamente ("se dejan de
generar si la cuenta o la tarjeta está inactiva"), y si nunca se abrió una facturación (sin uso
alguno), no hay nada que cerrar ("si no hubo uso, no se genera"). Dos disparadores comparten
exactamente esta lógica: un **cron diario**
(`src/infra/cron/billing-generation.cron.ts`, `@nestjs/schedule`, 3am) sobre todas las cuentas
vencidas de todos los usuarios, y un **botón manual "Generar facturación"**
(`POST /accounts/:id/generate-statements`) scoped a una cuenta.

**Pagar** (`POST /accounts/:id/credit-statements/:id/pay`, `{fromAccountId}`) exige elegir una
cuenta bancaria real (cualquier tipo excepto `CREDIT_LINE`) — atómicamente: crea un `Transaction`
EXPENSE normal en esa cuenta (visible en sus propios Movimientos, igual que cualquier otro gasto —
su `currentBalance` solo se refleja tras "Reconciliar saldo", igual que en el resto de la app, no es
un caso especial), decrementa el `creditUsed` de la cuenta de crédito por el monto de la
facturación (su instantánea al momento de pagar, no un reset total — si hubo compras nuevas después
de cerrarse el período, esas pertenecen al SIGUIENTE período abierto y `creditUsed` las sigue
reflejando, dejando un remanente > 0 después de pagar), y congela la facturación como PAGADA.

`BankAccount.paymentMethod` (`MANUAL` por defecto, o `AUTOMATIC`) guarda la preferencia declarada
del usuario; `AUTOMATIC` está **bloqueado en la UI** (no se puede seleccionar) — ver
`docs/PENDING.md`.

### 3.7 Qué NO está modelado

- No hay conversión de divisas en ninguna parte — un tope en una moneda nunca se convierte para
  compararlo contra un tope en otra. Los cupos en monedas extra son simplemente números paralelos e
  independientes.
- El tope propio de una tarjeta en una moneda **distinta** a la de la cuenta nunca se compara
  contra el cupo de la cuenta (solo los topes propios en la misma moneda lo hacen, vía
  `CARD_SUBLIMIT_EXCEEDS_ACCOUNT`).
- Desactivar/eliminar una tarjeta no reasigna `isPrimary` a otra tarjeta automáticamente — hoy no
  existe un flujo de "ascender a una nueva principal" si se elimina la principal.
- No hay forma de registrar "un pago hacia esta tarjeta de crédito adicional en particular" por
  separado de un ingreso normal de la cuenta, en una cuenta que no es `CREDIT_LINE` (ver §4.2) — un
  ingreso nunca lleva tarjeta en absoluto.
- El `CardLimit.used` propio de una tarjeta **no** forma parte del modelo de facturación por
  períodos del §3.6 — sigue siendo derivado de los movimientos a la manera anterior (todo el
  tiempo, sin períodos, sin acción de pago).
- El método de pago `AUTOMATIC` y la "fecha de pago" (una fecha de vencimiento, distinta de
  `billingCycleDay`) están ambos sin implementar/bloqueados — ver `docs/PENDING.md`.
- Sin catch-up retroactivo de varios períodos: si el cron estuvo caído mucho tiempo, la generación
  cierra solo el boundary vencido más reciente con lo acumulado, en vez de particionar en varios
  períodos históricos.

---

## 4. Movimientos

### 4.1 Reglas de movimiento

Todo movimiento (`INCOME` | `EXPENSE`) se vincula a un `bankAccountId` y, opcionalmente, a un
`cardId`. Las reglas, evaluadas en `TransactionsService.validateMovement`:

| Escenario                                                                                                                         | Regla                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `INCOME`                                                                                                                          | Nunca lleva tarjeta (`CARD_NOT_ALLOWED` si se entrega una).                                                                                                                          |
| `EXPENSE` en una cuenta `CASH`                                                                                                    | Tampoco lleva tarjeta.                                                                                                                                                               |
| `EXPENSE` en una cuenta `CREDIT_LINE`                                                                                             | **Debe** llevar una tarjeta de esa cuenta (`CARD_REQUIRED` si falta, `CARD_ACCOUNT_MISMATCH` si pertenece a otra cuenta).                                                            |
| `EXPENSE` en cualquier otra cuenta no-efectivo                                                                                    | La tarjeta es opcional; si se entrega, debe pertenecer a la cuenta.                                                                                                                  |
| Cada vez que la tarjeta usada es de tipo **CREDIT** (en una cuenta `CREDIT_LINE`, o en cualquier otra cuenta que haya sumado una) | El monto se valida contra **ambos**: el cupo compartido de la cuenta **y**, si esa tarjeta tiene su propio `CardLimit` para la moneda del movimiento, ese tope más estrecho también. |

### 4.2 Aplicación del cupo de crédito

Se ejecutan dos verificaciones independientes para un gasto con tarjeta CREDIT, ambas acotadas por
moneda y ambas respetando el ciclo de facturación de la cuenta (§3.6, si hay uno configurado):

- **`assertWithinCreditPool`** — `creditUsed = creditUsedInitial + Σgastos − Σingresos` (sumado
  **solo** sobre movimientos en la **moneda propia de la cuenta**, desde el inicio del ciclo de
  facturación actual si hay uno definido, y **excluyendo** cualquier tarjeta que tenga su propio
  `CardLimit` **para esa misma moneda** — una tarjeta puede compartir el cupo en su propia moneda
  mientras tiene un tope independiente en otra). Si `usado + monto > creditLimit`, lanza
  `CARD_LIMIT_EXCEEDED`.
- **`assertWithinCardLimit`** — si esa tarjeta en particular tiene una fila `CardLimit` para la
  **moneda propia** del movimiento, se repite el mismo cálculo (misma ventana de ciclo de
  facturación) acotado solo a esa tarjeta+moneda. Si se supera, lanza `CARD_SUBLIMIT_EXCEEDED`.

Ambas son independientes — un movimiento puede fallar en cualquiera de las dos sin importar la
otra (ej. mantenerse bajo el tope propio en USD de una tarjeta no importa si una transacción
distinta y no relacionada en CLP empuja el cupo compartido en CLP por sobre su límite).

> **Por qué se destaca explícitamente "acotado por moneda":** versiones anteriores de esta lógica
> sumaban el gasto de una tarjeta sin verificar la moneda en absoluto, y excluían a una tarjeta de
> la suma del cupo compartido si tenía _cualquier_ fila `CardLimit`, sin importar la moneda. Eso
> era inofensivo mientras las filas `CardLimit` de una tarjeta siempre significaran "totalmente
> independiente, una sola moneda" — pero se convirtió en un bug real en el momento en que una
> misma tarjeta pudo compartir el cupo en una moneda mientras tenía un tope independiente en otra
> (justo el caso de múltiples monedas en la tarjeta principal descrito arriba): el gasto en la
> otra moneda de esa tarjeta habría inflado el `creditUsed` en la moneda propia de la cuenta.
> Ambas sumas ahora están acotadas por moneda.

> **Una segunda corrección, independiente (lanzada junto con los ciclos de facturación):** para una
> cuenta `CREDIT_LINE` independiente, sumar _todos_ los movimientos de la cuenta hacia el cupo de
> crédito es correcto por construcción — un EXPENSE ahí siempre lleva una tarjeta CREDIT, un INCOME
> es un pago, no puede ser otra cosa. Pero para cualquier OTRO tipo de cuenta que solo sumó una
> tarjeta de crédito adicional, esa misma consulta de "sumar todo" también arrastraba operaciones
> bancarias normales del día a día — compras con débito, gastos tipo efectivo, sueldo u otros
> ingresos — que no tienen nada que ver con la línea de crédito. En el peor caso observado, esto
> hacía que el `creditUsed` mostrado llegara a un porcentaje negativo grande en una cuenta corriente
> con ingresos ajenos considerables (el ingreso se restaba como si fuera un pago de tarjeta de
> crédito). Se corrigió exigiendo, para cuentas que no son `CREDIT_LINE`, que solo cuenten los
> EXPENSE hechos con una tarjeta CREDIT que comparte el cupo — el ingreso nunca se resta en este
> caso, ya que hoy no hay forma de registrar "un pago hacia esta tarjeta adicional en particular"
> aparte de un ingreso normal de la cuenta (un ingreso nunca lleva tarjeta en absoluto).

### 4.3 Categoría y otros campos

Los movimientos también llevan `category`, `description`, `observation`, `emisor`/`receptor`
(contraparte) y `lugar`, todos de texto libre — son solo informativos y no participan en ninguna
de las validaciones anteriores.

---

## 4b. Cuotas: pagar una cuota mueve plata, y el faltante se arrastra

Un **plan de cuotas** (`InstallmentPlan`) es una compra que se paga en cuotas fijas. Su calendario se
genera una vez, con `equalPrincipalSchedule` de `@finance/money`, y **nunca se reescribe**: ni pagar
de menos, ni pagar de más, ni corregir un pago cambian el monto programado de ninguna cuota.

**Pagar una cuota registra un gasto real** (`POST /installments/:id/payments/:seq/pay`): crea un
`Transaction` EXPENSE en la cuenta elegida, baja su `currentBalance`, marca la cuota con lo realmente
pagado y aplica el arrastre — los cuatro efectos en un solo `prisma.$transaction`. Deshacer es su
espejo exacto: borra el gasto, restituye el saldo, limpia la cuota y revierte el arrastre **que ese
pago provocó** (nunca el que la cuota recibió: esa deuda pertenece a un pago que sigue en pie).

**Excepción: un plan comprado con tarjeta CREDIT nunca paga una cuota por sí sola.** Esa deuda se
factura a través de la propia facturación de la tarjeta — ver §4c más abajo. El plan ni siquiera
admite cuenta de pago recordada (`INSTALLMENT_CARD_IS_CREDIT`), y los endpoints de pagar/deshacer una
cuota suelta rechazan la solicitud desde el servidor, no sólo ocultan el botón, para ese mismo plan.

### El arrastre, y en qué se parece —y en qué no— al de la facturación

Lo adeudado por una cuota es **su monto programado + el arrastre que recibió** de la anterior. Si el
pago no lo cubre, la diferencia pasa a la **siguiente cuota impaga por número de cuota** (no por
fecha, y no necesariamente la inmediatamente siguiente: deshacer permite pagar fuera de orden). Si lo
excede, el excedente se resta de esa siguiente y sigue propagándose hacia adelante hasta agotarse;
una cuota completamente absorbida queda saldada sin pago propio y **lo adeudado nunca queda
negativo**. Un pago que supera lo que el plan entero adeuda se rechaza (`PAYMENT_EXCEEDS_REMAINING`):
el excedente sin deuda donde aplicarse no se convierte en saldo a favor, concepto que este dominio no
tiene.

Es el **mismo mecanismo** que `CreditStatement.carriedOverAmount` — una cifra propia de quien la
recibe, no un movimiento sintético ni una reescritura del calendario — deliberadamente, para que la
aplicación tenga una sola explicación de "lo que no cubriste" y no dos.

La diferencia está en el final de la fila: una facturación siempre tiene una siguiente donde poner el
faltante; **la última cuota impaga de un plan no**. Por eso ahí la cuota **no se liquida**: conserva
su abono parcial, sigue siendo pagable por el remanente y mantiene el plan activo. Modelarlo al revés
—liquidada pero debiendo— dejaría el mismo faltante contado en dos lugares.

### El movimiento que respalda una cuota es de sólo lectura en Movimientos

`InstallmentPayment.transactionId` apunta al gasto que respalda la cuota. Ese movimiento **no se
edita ni se borra desde Movimientos** (`TRANSACTION_LINKED_TO_INSTALLMENT`, 409): su monto ES el pago
de la cuota, y cambiarlo ahí dejaría el plan mintiendo sin nada que lo detecte. Se corrige deshaciendo
y volviendo a pagar la cuota desde su plan, que mueve las cuatro cifras juntas.

El mismo rechazo protege el movimiento de **compra** de un plan con tarjeta de crédito (§4c), pero no
es el mismo mecanismo: una compra nunca tiene un `InstallmentPayment.transactionId` que apunte a ella
(no es el pago de nadie), así que los handlers de editar/borrar de `transaction` también revisan
`Transaction.installmentPlanId !== null` directamente sobre el movimiento — la única huella que una
compra deja.

**Eliminar un plan revierte todo su historial**: borra los gastos de sus cuotas, restituye el saldo de
cada cuenta afectada (agregado por cuenta: distintas cuotas pueden haberse pagado desde cuentas
distintas) y borra el cargo financiero por interés si lo hubo, en una sola operación indivisible. La
confirmación declara ese impacto **antes** de actuar, calculado con la misma función que lo aplica
(`planDeletionReversal`), que es lo que impide que lo prometido y lo ocurrido se separen.

### Dos monedas, ninguna conversión

Si la cuenta de pago está en otra moneda que el plan, se declaran **dos montos**: lo abonado a la
cuota (en la moneda del plan, que es lo que define el arrastre) y lo cargado a la cuenta (en la suya,
que es el monto del gasto). No se comparan ni se convierten — esta app no tiene tipo de cambio — y si
falta el segundo se rechaza (`PAYMENT_CURRENCY_AMBIGUOUS`) en vez de adivinarlo.

---

## 4c. Un plan con tarjeta de crédito: el cupo se mueve al comprar, la facturación cobra el calendario

Un plan comprado con tarjeta CREDIT reproduce lo que hace el emisor real, y el cupo y la facturación
se mueven en momentos distintos por una razón:

**El cupo se compromete completo el día de la compra.** Crear el plan
(`create-installment-plan.handler.ts`) escribe UN movimiento EXPENSE por el `totalPrincipal`
completo —con el `cardId` de la tarjeta y el `installmentPlanId` del plan— en la misma
`$transaction` que el plan mismo, y ese movimiento consume el cupo de la cuenta de inmediato. Un
plan de 12 × 90.000 baja el disponible en 1.080.000 en el momento de registrarse, tal como un emisor
real reserva el compromiso completo el primer día en vez de liberarlo de a un doceavo.

**Ese mismo movimiento queda excluido del total de toda facturación.** Llevar `installmentPlanId` es
lo que lo saca de `netForStatement`/`netForPeriod`
(`transaction/infrastructure/prisma-transaction-sums.repository.ts`) — el total de un período nunca
es la compra, sólo lo que el CALENDARIO tenga vencido dentro de él. Sin esto, una sola facturación
cobraría el 1.080.000 completo en un mes, que es exactamente el defecto que este diseño elimina.

**Un período factura las cuotas que vencieron en él, y sólo una vez.** `InstallmentPayment` gana una
columna nullable `creditStatementId` — se llena en el instante en que el cierre de un período la
estampa (la selección en `installment-plan/domain/installment-billing.ts` es pura:
`dueDate <= closedAt AND creditStatementId IS NULL`, así que un reintento o un período que cierra
después de un hueco de actividad nunca puede facturar dos veces ni perder una cuota). Por esto existe
la columna: las facturaciones se generan perezosamente (un mes sin actividad en la tarjeta no genera
período), así que derivar "ya facturada" sólo por fecha dejaría huecos por los que una cuota podría
caer sin que nadie lo note.

**Tres situaciones, no dos.** Una cuota de este tipo de plan está `SCHEDULED` (aún no vence),
`BILLED` (facturada en un período que todavía espera su propio pago) o `PAID` — el salto entre ellas
lo decide siempre el cierre o el pago del período, nunca una acción sobre la cuota misma.

**Liquidar el período liquida todas las cuotas que facturó — completo o parcial, igual.** Pagar una
facturación (`PayCreditStatementHandler`) marca `paidAt` en cada cuota que ese período cobró, dentro
de la misma transacción cruzada que ya mueve el cupo y el saldo de la cuenta que paga. "Liquidada" se
decide por el hecho del pago (`paidAt !== null`), nunca por el nombre del estado resultante — un
período pagado en parte deriva igual `PARTIALLY_PAID`, y sus cuotas quedan igual marcadas PAID. Esto
no es un caso especial: es la regla de arrastre de la Constitución I aplicada en el nivel que
realmente recibe el pago. Nadie paga una de estas cuotas por sí sola, así que el faltante le
pertenece a la FACTURACIÓN, no a la cuota — `CreditStatement.carriedOverAmount` lo arrastra al
período siguiente exactamente como ya hace con una compra ordinaria, y marcar además la cuota como
impaga contaría ese mismo faltante dos veces. `InstallmentPayment.carriedOverAmount` —la columna que
usan los planes ordinarios del §4b— queda siempre en `"0"` para las cuotas de un plan con tarjeta de
crédito, por esta misma razón.

**El total de una facturación ganó un tercer sumando.** `CreditStatement.totalFor(linkedAmount,
instalmentAmount = "0")` ahora suma los movimientos ligados al período, lo que arrastró, Y lo que su
calendario facturó — tres cifras de tres fuentes, nunca una derivada como resto de otra. El desglose
de la facturación se compone igual: `credit-statement` le pide al puerto de `transaction` la suma de
compras ligadas y al puerto de `installment-plan` la suma de cuotas facturadas, y las combina él
mismo — el adaptador de `transaction` no tiene por qué saber nada de calendarios de cuotas.

**Dos invariantes se congelan una vez que el plan facturó.** `InstallmentPlan.applyUpdate` rechaza
cambiar la tarjeta desde que alguna cuota lleva `creditStatementId` (`INSTALLMENT_PLAN_BILLED`) — una
facturación ya emitida describió una tarjeta concreta, y que el plan detrás cambie dejaría esa
facturación mintiendo. Eliminar es más estrecho: sólo se rechaza cuando una cuota está en un período
realmente **liquidado** (`INSTALLMENT_PLAN_SETTLED`) — un plan cuyas cuotas están sólo `BILLED`
(período todavía PENDING) sigue pudiendo eliminarse, porque deshacer un período que nadie pagó no
toca dinero real.

---

## 5. Glosario de códigos de error (de este dominio)

| Código                          | Se lanza cuando…                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ACCOUNT_NUMBER_REQUIRED`       | Se crea/edita una cuenta CHECKING/SIGHT/SAVINGS sin `accountNumber`.                                            |
| `ACCOUNT_CANNOT_HAVE_CARD`      | Se agrega una tarjeta (anidada o inline) a una cuenta SAVINGS/INVESTMENT/CASH.                                  |
| `CARD_REQUIRED`                 | Un EXPENSE en una cuenta CREDIT_LINE sin `cardId`.                                                              |
| `CARD_NOT_ALLOWED`              | Se entrega una tarjeta en un INCOME, o en un EXPENSE de una cuenta CASH.                                        |
| `CARD_ACCOUNT_MISMATCH`         | El `cardId` entregado no pertenece al `bankAccountId` entregado.                                                |
| `CARD_LIMIT_REQUIRED`           | Una tarjeta CREDIT (que se vuelve principal, o adicional con `usesAccountPool: false`) no tiene un tope válido. |
| `CARD_LIMIT_EXCEEDED`           | Un movimiento empujaría el cupo compartido de la cuenta (en su propia moneda) por sobre `creditLimit`.          |
| `CARD_SUBLIMIT_EXCEEDED`        | Un movimiento empujaría el `CardLimit` propio de una tarjeta (misma moneda) por sobre su `limitAmount`.         |
| `CARD_SUBLIMIT_EXCEEDS_ACCOUNT` | Al definir el tope propio de una tarjeta, en la moneda propia de la cuenta, más alto que el cupo de la cuenta.  |
| `CARD_NOT_FOUND`                | Al editar/eliminar/leer una tarjeta que no existe (o no es del usuario).                                        |

---

## 6. Referencias rápidas de código

**Enmienda (2026-07-25, migración DDD + CQRS — specs/009):** `accounts` fue el dominio de
referencia de la migración DDD + CQRS. Sus antiguos `accounts.service.ts`/
`accounts.repository.ts`/`cards.service.ts`/`cards.repository.ts`/
`billing-generation.service.ts` quedan retirados; las MISMAS reglas de negocio descritas en este
documento ahora viven en la estructura de cuatro capas de abajo. Ver
`docs/{english,spanish}/ARCHITECTURE.md` para el patrón completo y
`specs/009-ddd-cqrs-architecture/` para el spec/plan/tasks de la migración.

| Concepto                                                                            | Ubicación en el backend                                                                                                                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos de cuenta, helpers de cardable/tipo de institución                            | `packages/contracts/src/accounts/index.ts`                                                                                                          |
| Invariantes de la cuenta (cardable, `ACCOUNT_NUMBER_REQUIRED`, proyección del cupo) | `apps/api/src/domains/accounts/domain/bank-account.aggregate.ts` (`BankAccount`)                                                                    |
| CRUD de tarjetas + resolución de principal/tope obligatorio                         | `BankAccount.resolveCardPlacement`/`planCreation` (mismo archivo del aggregate)                                                                     |
| Ciclo de vida de `CreditStatement` (OPEN/PENDING/PAID)                              | `apps/api/src/domains/accounts/domain/credit-statement.aggregate.ts` + `domain/states/*.ts` (patrón State)                                          |
| Elegibilidad de facturación (CREDIT_LINE vs. tarjeta adicional)                     | `apps/api/src/domains/accounts/domain/billing-eligibility.strategy.ts` (patrón Strategy)                                                            |
| `creditPools`/`Card.ownUsed` derivados (armado de lectura)                          | `apps/api/src/domains/accounts/application/queries/account-dto.mapper.ts`                                                                           |
| Comandos de pagar/generar/corregir                                                  | `apps/api/src/domains/accounts/application/commands/{pay-credit-statement,generate-statements,correct-statement-amount}.handler.ts`                 |
| Queries de listar/obtener                                                           | `apps/api/src/domains/accounts/application/queries/{list-accounts,get-account,list-credit-statements}.handler.ts`                                   |
| Adaptadores Prisma (únicos archivos que importan `@prisma/client` en este dominio)  | `apps/api/src/domains/accounts/infrastructure/prisma-{bank-account,credit-statement}.repository.ts`                                                 |
| Controlador Facade                                                                  | `apps/api/src/domains/accounts/presentation/accounts.controller.ts`                                                                                 |
| Reglas de movimiento + aplicación del cupo                                          | `apps/api/src/domains/transactions/domain/movement-policy.ts` + `domain/transaction.aggregate.ts`, aplicado por `application/commands/*.handler.ts` |
| Sumas de cupo acotadas por moneda y por tarjeta                                     | `TransactionsRepository.sumsForAccount`/`sumsForCard`, `PrismaBankAccountRepository.cardSums`                                                       |
| Helper de ventana de ciclo de facturación                                           | `apps/api/src/domains/accounts/domain/billing-cycle.ts` (`currentCycleStart`)                                                                       |

| Concepto                                                                              | Ubicación en el frontend                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Formulario de tarjeta en 3 estados (ninguna / principal / adicional)                  | `apps/web/src/domains/accounts/components/CardForm.tsx` |
| Formularios de crear/editar cuenta (cupo reflejado, solo lectura, día de facturación) | `AccountCreateModal.tsx`, `AccountForm.tsx`             |
| Tiles de tarjeta + insignia Principal/Adicional + `ownUsed` por tarjeta               | `AccountVisualCard.tsx`, `DraftCardTile.tsx`            |
| Vista ampliada de una tarjeta + topes en otras monedas                                | `CardDetailModal.tsx`                                   |
| Lista de "topes por moneda" a nivel de cuenta                                         | `AccountDetailRoute.tsx`                                |

---

_Fin del documento._
