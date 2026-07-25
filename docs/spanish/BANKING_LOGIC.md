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

| Tipo          | Significado                          | ¿Requiere `accountNumber`?          | ¿Puede tener tarjetas? | ¿Tiene saldo real en efectivo? |
| ------------- | ------------------------------------- | :-----------------------------------: | :----------------------: | :------------------------------: |
| `CHECKING`    | Corriente                             | ✅ obligatorio                        | ✅                        | ✅                                |
| `SIGHT`       | Vista / Cuenta RUT                    | ✅ obligatorio                        | ✅                        | ✅                                |
| `SAVINGS`     | Ahorro                                | ✅ obligatorio                        | ❌                        | ✅                                |
| `INVESTMENT`  | Inversiones (ej. Fintual)              | opcional                              | ❌                        | ✅                                |
| `CREDIT_LINE` | Una tarjeta de crédito independiente (sin cuenta bancaria detrás) | opcional | ✅ | ❌ (su "saldo" ES el cupo de crédito) |
| `CASH`        | Efectivo                              | opcional (sin institución alguna)     | ❌                        | ✅                                |

- **`ACCOUNT_NUMBER_REQUIRED_TYPES`** = `CHECKING`/`SIGHT`/`SAVINGS` — son tipos que reciben
  depósitos (a los que transferirías dinero), así que un número de cuenta real es obligatorio.
  Se refuerza con un `.refine()` de zod al crear y una verificación a nivel de servicio al editar
  (error `ACCOUNT_NUMBER_REQUIRED`).
- **`CARDABLE_ACCOUNT_TYPES`** = `CHECKING`/`SIGHT`/`CREDIT_LINE` — solo estos pueden tener tarjeta
  propia. `SAVINGS`/`INVESTMENT`/`CASH` nunca la tienen (en la vida real, su dinero se mueve
  primero por transferencia hacia una cuenta que sí admite tarjeta). Se refuerza en
  `CardsService.create` y en el flujo inline `cards[]` de `AccountsService.create` (error
  `ACCOUNT_CANNOT_HAVE_CARD`), y se refleja también en la UI web.
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

| Paso                                                                              | Qué ocurre                                                                                                                    |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1. Creas la cuenta, agregas una tarjeta CREDIT "CMR Visa", le pones un tope de 3.000.000 CLP | Esta tarjeta queda `isPrimary: true`. Su tope se escribe en `BankAccount.creditLimit = 3.000.000` (CLP). La tarjeta misma tiene `limits: []` — no se crea ninguna fila para ella. |
| 2. En esa misma tarjeta, agregas también un "otro tope" de 500 USD                | Se crea una fila `CardLimit`: `{cardId, currency: "USD", limitAmount: 500}`. Los `limits` de la tarjeta ahora muestran esa entrada. El `creditPools` de la cuenta pasa a ser `[{CLP, 3.000.000}, {USD, 500}]`. |
| 3. Agregas una segunda tarjeta CREDIT "CMR Visa · Camila", dejando `usesAccountPool: true` | Queda como tarjeta adicional, `isPrimary: false`, sin filas `CardLimit` — cada peso que gaste cuenta hacia el *mismo* cupo de 3.000.000 CLP que la principal. |
| 4. Agregas una tercera tarjeta CREDIT "CMR Visa · Sofía" con `usesAccountPool: false` y su propio tope de 1.000.000 CLP | Queda como tarjeta adicional con su **propia** fila `CardLimit` en CLP — topada en 1.000.000, y además topada en ≤ el cupo de 3.000.000 de la cuenta. Su gasto **no** cuenta en absoluto hacia el cupo compartido de 3.000.000. |
| 5. Editas el `creditLimit` de la cuenta directamente (no desde una tarjeta)       | Como la principal no tiene un valor propio guardado, esto simplemente cambia el único número que existe — la principal lo "recoge" automáticamente la próxima vez que se lea. |
| 6. Gastas 300.000 CLP y 400 USD en la tarjeta principal                          | Ambos cuentan de forma independiente: el cupo en CLP de la cuenta muestra `used: 300.000`; el propio `CardLimit` en USD de la principal muestra `used: 400`. El gasto en la *tercera* tarjeta (su propio tope propio en CLP) nunca afecta a ninguno de los dos anteriores. |

### 3.5 Visualización por tarjeta vs. el total combinado de la cuenta

Varias tarjetas pueden compartir exactamente el mismo cupo (el valor por defecto `usesAccountPool:
true` del §3.2). En términos aritméticos muestran el número correcto si la UI simplemente despliega
`account.creditUsed` en cada una — pero *se lee* mal: tres tarjetas mostrando todas el mismo
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

**Generación** (`BillingGenerationService`,
`apps/api/src/domains/accounts/billing-generation.service.ts`) cierra la facturación ABIERTA cuando
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

| Escenario                                              | Regla                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `INCOME`                                                  | Nunca lleva tarjeta (`CARD_NOT_ALLOWED` si se entrega una).                     |
| `EXPENSE` en una cuenta `CASH`                            | Tampoco lleva tarjeta.                                                          |
| `EXPENSE` en una cuenta `CREDIT_LINE`                      | **Debe** llevar una tarjeta de esa cuenta (`CARD_REQUIRED` si falta, `CARD_ACCOUNT_MISMATCH` si pertenece a otra cuenta). |
| `EXPENSE` en cualquier otra cuenta no-efectivo             | La tarjeta es opcional; si se entrega, debe pertenecer a la cuenta.             |
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
> la suma del cupo compartido si tenía *cualquier* fila `CardLimit`, sin importar la moneda. Eso
> era inofensivo mientras las filas `CardLimit` de una tarjeta siempre significaran "totalmente
> independiente, una sola moneda" — pero se convirtió en un bug real en el momento en que una
> misma tarjeta pudo compartir el cupo en una moneda mientras tenía un tope independiente en otra
> (justo el caso de múltiples monedas en la tarjeta principal descrito arriba): el gasto en la
> otra moneda de esa tarjeta habría inflado el `creditUsed` en la moneda propia de la cuenta.
> Ambas sumas ahora están acotadas por moneda.

> **Una segunda corrección, independiente (lanzada junto con los ciclos de facturación):** para una
> cuenta `CREDIT_LINE` independiente, sumar *todos* los movimientos de la cuenta hacia el cupo de
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

## 5. Glosario de códigos de error (de este dominio)

| Código                           | Se lanza cuando…                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ACCOUNT_NUMBER_REQUIRED`          | Se crea/edita una cuenta CHECKING/SIGHT/SAVINGS sin `accountNumber`.                                  |
| `ACCOUNT_CANNOT_HAVE_CARD`         | Se agrega una tarjeta (anidada o inline) a una cuenta SAVINGS/INVESTMENT/CASH.                        |
| `CARD_REQUIRED`                    | Un EXPENSE en una cuenta CREDIT_LINE sin `cardId`.                                                     |
| `CARD_NOT_ALLOWED`                 | Se entrega una tarjeta en un INCOME, o en un EXPENSE de una cuenta CASH.                               |
| `CARD_ACCOUNT_MISMATCH`            | El `cardId` entregado no pertenece al `bankAccountId` entregado.                                       |
| `CARD_LIMIT_REQUIRED`              | Una tarjeta CREDIT (que se vuelve principal, o adicional con `usesAccountPool: false`) no tiene un tope válido. |
| `CARD_LIMIT_EXCEEDED`              | Un movimiento empujaría el cupo compartido de la cuenta (en su propia moneda) por sobre `creditLimit`. |
| `CARD_SUBLIMIT_EXCEEDED`           | Un movimiento empujaría el `CardLimit` propio de una tarjeta (misma moneda) por sobre su `limitAmount`. |
| `CARD_SUBLIMIT_EXCEEDS_ACCOUNT`    | Al definir el tope propio de una tarjeta, en la moneda propia de la cuenta, más alto que el cupo de la cuenta. |
| `CARD_NOT_FOUND`                   | Al editar/eliminar/leer una tarjeta que no existe (o no es del usuario).                               |

---

## 6. Referencias rápidas de código

| Concepto                                             | Ubicación en el backend                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Tipos de cuenta, helpers de cardable/tipo de institución | `packages/contracts/src/accounts/index.ts`                                            |
| CRUD de cuentas + resolución de principal en `cards[]` inline | `apps/api/src/domains/accounts/accounts.service.ts`                              |
| CRUD de tarjetas + resolución de principal/tope obligatorio | `apps/api/src/domains/accounts/cards.service.ts` (`resolveCreditLimits`)          |
| Búsqueda de la tarjeta principal                        | `apps/api/src/domains/accounts/cards.repository.ts` (`findPrimaryCreditCard`)         |
| `creditPools` derivado                                  | `toContract` de `AccountsService` (combina `creditLimit` + los `CardLimit` extra de la principal) |
| `Card.ownUsed` derivado (uso por tarjeta)                | `toContract` de `CardsService` (`apps/api/src/domains/accounts/cards.service.ts`)      |
| Reglas de movimiento + aplicación del cupo               | `apps/api/src/domains/transactions/transactions.service.ts`                           |
| Sumas de cupo acotadas por moneda y por tarjeta          | `TransactionsRepository.sumsForAccount`/`sumsForCard`, `AccountsRepository.sumsByAccount`, `CardsRepository.sumsByCard` |
| Helper de ventana de ciclo de facturación                | `apps/api/src/domains/accounts/billing-cycle.ts` (`currentCycleStart`)                |

| Concepto                                             | Ubicación en el frontend                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Formulario de tarjeta en 3 estados (ninguna / principal / adicional) | `apps/web/src/domains/accounts/components/CardForm.tsx`                     |
| Formularios de crear/editar cuenta (cupo reflejado, solo lectura, día de facturación) | `AccountCreateModal.tsx`, `AccountForm.tsx`                    |
| Tiles de tarjeta + insignia Principal/Adicional + `ownUsed` por tarjeta | `AccountVisualCard.tsx`, `DraftCardTile.tsx`                          |
| Vista ampliada de una tarjeta + topes en otras monedas   | `CardDetailModal.tsx`                                                                  |
| Lista de "topes por moneda" a nivel de cuenta            | `AccountDetailRoute.tsx`                                                               |

---

_Fin del documento._
