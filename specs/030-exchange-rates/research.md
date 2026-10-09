# Research — 030 Tipos de cambio y conversión estimada USD↔CLP, UF

Decisiones tomadas leyendo el código actual (`credit-statement`, `transaction`, `bank-account`,
`ip-geolocation-cache`, `infra/cron`, `accounts/lib/netWorth.ts`, `PayStatementPanel`,
`BillingSection`, `TransferFields`) y la API real de mindicador.cl.

## R1 — Fuente: mindicador.cl, verificada contra la API viva (2026-10-08)

- **Decision**: `GET https://mindicador.cl/api` devuelve el último valor publicado de todos los
  indicadores en una sola llamada: `dolar` ("Dólar observado", `fecha`, `valor`) y `uf`. Para
  historia, `GET /api/dolar/{yyyy}` y `/api/uf/{yyyy}` devuelven la serie del año
  (`serie: [{fecha, valor}]`); `GET /api/dolar/dd-mm-yyyy` devuelve un día. Sin API key.
- **Fecha del valor**: `fecha` viene como `2026-10-08T03:00:00.000Z`. Se toma la **parte de fecha UTC**
  (`2026-10-08`), no la hora local de Chile: en horario de invierno `03:00Z` caería el día anterior.
- **Dos hechos que moldean el diseño** (verificados): el dólar observado de HOY aún no está publicado a
  las 8:00 (se publica a media jornada), mientras que la UF se publica con días de anticipación. Por eso
  "el valor de las 8:00" casi siempre es el de ayer para el dólar, y por eso el reintento horario de la
  clarificación no es solo para caídas: es el mecanismo normal con que el valor real del día reemplaza
  al arrastrado.
- **Alternatives**: API del Banco Central (credenciales); ingreso manual. Descartadas en la fase de
  especificación.

## R2 — Un registro por (moneda, día de calendario de Chile); "arrastrado" se deriva

- **Decision**: tabla `exchange-rate` con `currency` (`USD`|`CLF`), `date` (día de Chile), `value`
  (Decimal(18,4)) y **`valueDate`** (la fecha en que ese valor fue publicado). `carried` NO se guarda:
  es `valueDate < date`. Una sola verdad; el reemplazo por el valor real es un upsert que fija
  `valueDate = date`, y la marca desaparece sola.
- **Rationale**: FR-002/FR-004 piden marcar y des-marcar; una columna booleana se desincronizaría.
- **Alternatives**: booleano `carried` (rechazado: dos fuentes de verdad); tabla aparte de "intentos"
  (rechazado: la spec no pide auditar intentos, solo no inventar valores).

## R3 — Cron: tic horario 08:00–20:00 hora de Chile, idempotente por diseño

- **Decision**: `ExchangeRateCron` (`infra/cron/`, delgado, patrón de `StatementGenerationCron`) con
  `@Cron("0 8-20 * * *", { timeZone: "America/Santiago" })` despacha `RecordExchangeRatesCommand`
  (`scope: "system"`, la excepción nombrada del Principio II). El handler: si hoy ya hay `valueDate ==
date` para ambas monedas, no hace nada. Si no, llama a `/api`, y por cada moneda hace upsert de
  `(currency, today)` con el valor más reciente y su `valueDate`. Si la llamada falla **no escribe
  nada** (no se inventa); en el tic de las 20:00 (último), si aún no hay fila de hoy, la completa
  copiando la última fila conocida (`valueDate` anterior ⇒ arrastrada).
- **Idempotencia (Principio VII, forma b)**: `@@unique([currency, date])` + upsert. Correr dos veces el
  mismo tic, o dos instancias a la vez, deja una fila.
- **Relleno de huecos**: al empezar cada corrida se rellenan los días faltantes entre la última fila y
  hoy con el valor publicado más reciente `<=` ese día, usando la serie anual (una llamada por moneda).
  Cubre un servidor caído varios días y fines de semana/feriados sin lógica de calendario propia: la
  fuente ya sabe qué días publica.
- **Alternatives**: un job con reintentos exponenciales (rechazado: la regla pedida es "cada hora hasta
  las 20:00", que un cron horario satisface sin estado nuevo).

## R4 — Siembra de histórico

- **Decision**: con la tabla vacía (primera corrida), el mismo handler carga la serie de los últimos 365
  días de ambas monedas desde la serie anual. No hay comando manual ni endpoint de importación.
- **Rationale**: "ver temporal pasado" pide historia desde el primer día, y las sugerencias para
  operaciones con fecha pasada (FR-014) necesitan valores anteriores al despliegue. Es una sola
  llamada por moneda y año.

## R5 — El valor es dato global; sin `userId`

- **Decision**: la tabla no tiene `userId` (igual que `Currency`/`Country`/`ip-geolocation-cache`). Lectura
  para cualquier usuario autenticado (`JwtAuthGuard`), escritura solo desde el comando de sistema.
- **Rationale**: Principio II exige scoping para datos de una persona; esto es referencia pública.
  Se documenta como la misma excepción que las tablas de referencia.

## R6 — Conversión: función pura en `@finance/money`, la misma en servidor y web

- **Decision**: `convertAmount(amount, rate, toCurrency)` (decimal.js, redondea a
  `currencyScale(toCurrency)` —CLP 0, USD 2—) y `rateOn(rows, date)` (la fila con mayor `date <=` la
  pedida, o `null`) en `packages/money` / `packages/contracts`. El servidor no convierte nada que se
  persista: solo la web sugiere. Mismo criterio que `equalPrincipalSchedule` (Principio I: una
  implementación).
- **Rationale**: FR-013 — la estimación nunca se escribe sola; lo que llega al API son los montos que la
  persona confirmó.

## R7 — Pagar una facturación USD: se absorbe 028 US2 (decisión del usuario)

- **Hallazgo**: la spec 028 solo implementó la Historia 1. `payCreditStatementSchema` ya trae
  `chargedAmount` pero `PayCreditStatementHandler` no lo usa, la UI oculta toda acción en períodos de
  otra moneda (`if (isForeign(s)) return none`) y `PayStatementPanel` opera siempre en
  `account.currency`. La sugerencia de 030 no tiene dónde montarse sin esto.
- **Decision**: 030 implementa el diseño de 028 R3–R5, R10 y R13 tal como están escritos (INGRESO de
  liquidación en la moneda de la facturación con la tarjeta dueña del tope y `settlesStatementId`;
  GASTO en la cuenta de origen por `chargedAmount`; relectura con lock dentro de la transacción; solo
  lectura de ambos movimientos; corrección de pago con `chargedAmount`). Las tareas T031–T041 de 028
  se re-expresan en el `tasks.md` de 030 y se marcan absorbidas.
- **Fuera**: 028 US3 (traspasar una facturación USD vencida a pesos, T043–T058) sigue pendiente y no
  se toca.

## R8 — Prepagar el período USD abierto (extiende 028 R14)

- **Decision**: `POST .../credit-statements/:statementId/prepay` ya identifica el período por id. Para un
  período abierto en otra moneda, el cuerpo gana `chargedAmount` (obligatorio si la moneda de la cuenta
  de origen difiere, igual que `pay`). El handler, bajo `findByIdForUpdateWithTx`, crea el INGRESO de
  liquidación USD (R7) y el GASTO en la cuenta de origen, y sube `prepaidAmount` del período USD; no
  toca `creditUsed` (el cupo en pesos no cambia). El prepago en la moneda de la cuenta no cambia.
- **UI**: en la fila abierta de la pestaña USD, "Prepagar" abre `PayStatementPanel` con
  `intent="prepay"` (no el formulario de movimiento, que está atado a la cuenta de crédito y su
  moneda).

## R9 — La sugerencia vive en la web; la fecha del pago manda

- **Decision**: `PayStatementPanel`, el panel de prepago y `TransferFields` calculan la sugerencia con
  `convertAmount(usd, rateOn(rates, fechaDelPago))`. Mantienen un indicador "editado a mano": mientras
  la persona no haya tocado los pesos, cambiar los dólares o la fecha recalcula la sugerencia; en
  cuanto edita los pesos, se congela. Los dólares nunca se recalculan desde los pesos (clarify Q3/Q4).
- **Sin valor** (`rateOn` = null): campo vacío, sin sugerencia (FR-012); nada bloquea el pago.

## R10 — Equivalente en cuentas y patrimonio

- **Decision**: componente compartido `ApproxClp` (`≈ $950.000 · estimado, 8 oct`), respeta
  `MaskedAmount`/ocultar saldos. Se usa en `AccountVisualCard`, `AccountCard` y el KPI de saldo del
  detalle de una cuenta USD. El patrimonio neto (`accounts/lib/netWorth.ts`) conserva su cifra por
  moneda y gana `estimatedTotalClp(netsByCurrency, rates)`: suma la cifra CLP más cada otra moneda
  convertida, o `null` si falta algún valor necesario.
- **Decisión que el plan deja a la persona (ver plan.md, "Pendiente de aprobación")**: FR-016 pide solo
  USD; una cuenta en UF (CLF) quedaría fuera de un total que dice ser "todo en CLP". Como el valor de la
  UF ya se registra, el plan propone convertirla también en ese total; sin esa decisión el total
  omitiría silenciosamente su saldo o tendría que ocultarse.

## R11 — Pantalla "Tipos de cambio"

- **Decision**: ruta autenticada `/exchange-rates`, ítem "Tipos de cambio" en el grupo "Tu dinero" del
  sidebar. Muestra valor de hoy de dólar y UF (con su fecha y si es arrastrado), un gráfico de línea
  Recharts con selector de rango (30 días / 1 año) y una tabla por fecha con un selector de fecha para
  saltar a un día. Solo lectura. `GET /exchange-rates?currency=&from=&to=` (máx. 400 días por
  consulta, orden descendente).
- **Alternatives**: solo en estimados (rechazado en clarify Q1).

## R12 — Observabilidad y fallos

- **Decision**: cada corrida registra por `Logger` si usó el valor real, arrastró o falló, y cuántos días
  rellenó. Una fuente caída produce `warn`, no excepción: el cron nunca debe tirar el proceso. Timeout de
  10 s por llamada (`AbortSignal.timeout`), igual que `GeoIpLookup`.

## R13 — Regla "sin conversión" que se enmienda

- **Decision**: CLAUDE.md y la constitución dicen en varios sitios que "la app no convierte monedas"
  (`TransferPolicy`, instalments, spec 028). La enmienda es precisa: **la app puede SUGERIR una
  conversión editable; ninguna regla de dominio compara ni valida montos de monedas distintas, y lo
  persistido es siempre lo que la persona confirmó.** `TransferPolicy`, `MovementPolicy` y las
  validaciones de pago siguen sin comparar las dos monedas.
