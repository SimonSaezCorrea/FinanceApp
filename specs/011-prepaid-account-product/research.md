# Phase 0 — Research: Cuenta prepago como producto independiente

Todas las incógnitas de scope se resolvieron con el usuario antes de la spec y en
`/speckit-clarify`; aquí quedan las decisiones técnicas que el plan asume.

## D1. El prepago es un `AccountType`, no una tabla ni un flag

**Decisión**: agregar `PREPAID` al enum `AccountType` (Prisma + `@finance/contracts`).

**Rationale**: una cuenta prepago tiene exactamente los mismos atributos que las demás cuentas con
saldo (emisor, moneda, número de cuenta, saldo inicial y actual) y necesita aparecer en los mismos
lugares (listado, detalle, cartera, patrimonio, filtros de movimientos). Un valor de enum reutiliza
todo eso gratis. La única diferencia — no puede quedar negativa — es una invariante, no una forma de
datos distinta.

**Alternativas descartadas**:

- _Tabla/dominio propio `prepaid-account`_: duplicaría movimientos, traspasos, cartera y patrimonio
  para un producto que es "una cuenta con una restricción". Además rompería el traspaso, que hoy une
  dos filas de `bank-account`.
- _Flag booleano sobre `CASH`/`SIGHT`_: dos fuentes de verdad para "qué es esta cuenta"; el tipo ya es
  el discriminador que usa toda la app.

## D2. La compatibilidad tarjeta ↔ cuenta se expresa como matriz, no como lista de "cardable"

**Decisión**: reemplazar `CARDABLE_ACCOUNT_TYPES`/`isCardableAccountType` por
`allowedCardKinds(type): CardKind[]` en `@finance/contracts` (y derivar `isCardableAccountType` de
ella: cardable = la lista no está vacía).

| Tipo de cuenta | Kinds permitidos |
| -------------- | ---------------- |
| CHECKING       | DEBIT, CREDIT    |
| SIGHT          | DEBIT, CREDIT    |
| CREDIT_LINE    | CREDIT           |
| PREPAID        | PREPAID          |
| SAVINGS        | — (ninguno)      |
| INVESTMENT     | — (ninguno)      |
| CASH           | — (ninguno)      |

**Rationale**: la feature introduce dos reglas nuevas ("prepago solo en cuenta prepago" y "cuenta
prepago solo con prepago") que con la lista actual habría que escribir como dos condiciones sueltas en
sitios distintos (agregado, creación inline de cuenta, formulario web). Una matriz única las expresa
juntas y hace que la UI pueda ofrecer exactamente los kinds válidos en vez de filtrar a mano.
Formalizarla también deja escrito lo que hoy solo está implícito: una CREDIT_LINE nunca lleva débito.

**Alternativas descartadas**: agregar `PREPAID` a `CARDABLE_ACCOUNT_TYPES` y poner dos `if` nuevos —
más corto, pero deja la regla repartida y la UI seguiría adivinando qué kinds ofrecer.

## D3. La tarjeta prepago pierde su pote propio

**Decisión**: eliminar las columnas `CardAccount.prepaidInitialBalance`/`prepaidBalance`, los campos
homónimos del contrato, `BankAccount.prepaidPot`, `MovementPolicy.prepaidDelta`, el `prepaidDeltas` de
los puertos de escritura y `CardAccountRepositoryPort.incrementPrepaidBalanceWithTx`.

**Rationale**: el dinero pasa a vivir en la cuenta (D1). Mantener además un sub-saldo por tarjeta
crearía dos pozos para el mismo dinero y obligaría a decidir cuál manda en cada gasto; el usuario ya
descartó esa opción. Como efecto colateral desaparece la excepción de `accountBalanceDelta` (hoy un
gasto con prepago NO mueve el saldo de la cuenta): con el saldo en la cuenta, un gasto con la tarjeta
prepago es un gasto normal de esa cuenta.

**Alternativas descartadas**: sub-pote por tarjeta análogo al sub-cupo de crédito — coherente con el
modelo de crédito, pero no corresponde a la realidad (varias tarjetas de una cuenta prepago gastan el
mismo saldo) y multiplica los casos de borde en editar/borrar movimientos.

## D4. "Saldo nunca negativo" es una regla del tipo de cuenta

**Decisión**: `MovementPolicy.validate` recibe el saldo actual de la cuenta en su `AccountContext` y,
cuando `account.type === "PREPAID"`, rechaza toda salida (gasto, con o sin tarjeta) que exceda el
saldo disponible, con el mismo código de error existente `PREPAID_INSUFFICIENT_BALANCE`. En edición se
evalúa contra el saldo sin la contribución previa del propio movimiento (el mismo mecanismo de
`prepaidOffset` que ya existía, ahora aplicado al saldo de la cuenta). `TransferPolicy` aplica la
misma comprobación a la pata de salida.

**Rationale**: la restricción es del producto (una cuenta prepago no presta), no del plástico: una
salida por transferencia debe respetarla igual que un gasto con tarjeta. Ponerla en las dos políticas
puras la deja cubierta por tests unitarios sin base de datos, como el resto de las reglas de
movimiento.

**Reutilizar el código de error** en vez de crear `ACCOUNT_INSUFFICIENT_BALANCE`: el código ya existe
con traducción en es/en, su significado ("no alcanza el saldo prepago") no cambia, y ningún otro tipo
de cuenta lo puede disparar. Se ajusta el texto para hablar de la cuenta y no de la tarjeta.

**Alternativas descartadas**: validar en el repositorio/adapter con un `UPDATE … WHERE balance >=` —
más "seguro" ante concurrencia, pero mete regla de negocio en infraestructura y esta app es de un solo
usuario por cuenta, sin escritura concurrente real.

## D5. Cargar la cuenta prepago = traspaso o ingreso; se elimina el endpoint de recarga

**Decisión**: borrar `POST /accounts/:id/cards/:cardId/load`, `LoadPrepaidCardCommand`/Handler,
`loadPrepaidCardSchema`, `cardsApi.load`, `useCardMutations.load` y `LoadPrepaidPanel.tsx`.

**Rationale**: con el saldo en la cuenta, "recargar" es exactamente mover dinero de otra cuenta propia
a esta — el traspaso de la spec 010, que ya crea el par de movimientos, mueve ambos saldos en una sola
`$transaction` y queda excluido de los agregados de ingreso/gasto. Un endpoint dedicado sería un
segundo camino para el mismo hecho, con su propio riesgo de divergir. El dinero que entra desde fuera
de la app (efectivo, transferencia de un tercero) es un INCOME normal.

**Consecuencia documentada**: desaparece el punto 6 de `docs/PENDING.md` ("borrar la recarga de una
tarjeta prepago no devuelve el saldo a la tarjeta"), que existía justamente porque la recarga era un
gasto sin `cardId` que nadie podía revertir hacia el pote.

**Alternativas descartadas**: conservar un botón "Recargar" que por dentro cree el traspaso — se puede
agregar después como atajo de UI; no se incluye ahora para no mantener dos formas de lo mismo mientras
se estabiliza el modelo.

## D6. El tipo de una cuenta existente no se puede cambiar hacia/desde `PREPAID`

**Decisión**: el agregado `BankAccount` rechaza en `update` cualquier transición que involucre
`PREPAID` en cualquiera de los dos extremos, con un código nuevo
`ACCOUNT_TYPE_CHANGE_NOT_ALLOWED`. El resto de las transiciones queda como está hoy.

**Rationale**: decisión del usuario en `/speckit-clarify`. Convertir arrastra tarjetas incompatibles,
cupo, facturación y un saldo que podría ser negativo; corregir un error de tipo es barato (borrar y
crear) comparado con mantener esa matriz de conversiones.

## D7. Emisor: catálogo existente, sin filtrar por `kind`

**Decisión**: `institutionKindForAccountType("PREPAID")` devuelve `undefined` (selector sin filtro).

**Rationale**: en Chile hay prepagos de emisores no bancarios (Tenpo, MACH en su origen) y también de
bancos; filtrar a `NON_BANK_ISSUER` dejaría fuera casos legítimos. Los tipos que sí se filtran a
`BANK` (`CHECKING`/`SIGHT`/`SAVINGS`) no cambian.

## D8. Migración: `db push` + seed rehecho

**Decisión**: sin script de migración de datos. `pnpm db:push` aplica el enum nuevo y el borrado de
columnas; `pnpm db:seed` recrea el usuario demo con una cuenta prepago propia.

**Rationale**: el repo no tiene carpeta `prisma/migrations` (el flujo declarado es `db push`) y la
única fila prepago existente es la del seed. Documentado como supuesto en la spec.

**Nota para quien tenga datos locales**: borrar las columnas destruye los saldos de tarjeta prepago
existentes; `pnpm db:reset` deja todo consistente.
