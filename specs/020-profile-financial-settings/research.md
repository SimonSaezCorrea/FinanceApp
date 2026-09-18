# Research: Personalización financiera del perfil

No quedaron `NEEDS CLARIFICATION` en el Technical Context — el spec ya venía con contexto técnico
suficiente (proporcionado por el dueño del producto) y la exploración del código confirmó los
puntos de integración exactos. Este documento registra las decisiones de diseño tomadas durante
esa exploración.

## D1 — Cómo bloquear "quitar una moneda extra en uso"

**Decisión**: un puerto de solo lectura nuevo por cada tabla que tiene columna `currency`
(`bank-account`, `transaction`, `installment-plan`, `debt`, `savings-goal`, `savings-entry`,
`recurring-expense`, `card-limit`), cada uno con un único método
`isCurrencyInUse(userId, currency): Promise<boolean>`. `user.module.ts` importa los 8
`*.data.module.ts` (leaves ya existentes) y `UpdatePreferencesHandler` los consulta en paralelo
(`Promise.all`) solo para las monedas que el patch efectivamente remueve de `extraCurrencies`
(diff contra el valor actual del usuario, no contra todas sus monedas).

**Rationale**: la Constitución (§VI, "una tabla = un dominio") prohíbe que `user` consulte esas 8
tablas directamente — cada una solo puede ser consultada por su propio adapter Prisma. El patrón
`BankAccountLookupPort.accountOwned` (`apps/api/src/domains/bank-account/domain/ports/bank-account-
lookup.port.ts`) ya resuelve exactamente este tipo de necesidad ("un dominio externo necesita una
respuesta booleana acotada sobre otra tabla, sin la totalidad de su repositorio") — este diseño lo
replica 8 veces en vez de inventar un mecanismo nuevo. `user.module.ts` ya importa
`BankAccountDataModule` hoy (para crear la cuenta de efectivo al registrar), así que este patrón de
importar leaves ya es parte de este módulo.

**Alternativas consideradas**:
- *Una tabla `CurrencyUsageIndex` mantenida por triggers/eventos* — rechazada: introduce una fuente
  de verdad derivada que puede desincronizarse, y el volumen de datos por usuario es bajo (8
  consultas indexadas por `userId`, no un escaneo), así que no hay necesidad real de
  materializarlo.
- *Una sola query cruzada con Prisma `$queryRaw` uniendo las 8 tablas* — rechazada: viola
  directamente el principio de un adapter por tabla, y acopla `user` a la forma interna de 8
  dominios que no le pertenecen.
- *Guardar `extraCurrencies` sin bloqueo y resolver el problema solo en el frontend* — rechazada:
  el usuario pidió explícitamente que el bloqueo sea real ("no nos interesa" dejarlo como aviso
  blando); un bloqueo solo-frontend es trivialmente evitable (DevTools, llamada directa a la API) y
  dejaría datos huérfanos exactamente como el diseño original quería evitar.

**Nota sobre condición de carrera (hallazgo U2 de `/speckit-analyze`)**: el chequeo "¿está en uso?"
se resuelve con lectura-luego-escritura, sin un lock exclusivo tipo `findOneForUpdateWithTx` (el
mecanismo que sí usa `debt`, specs/015, para cerrar esta misma clase de carrera en flujos que mueven
dinero real). Existe una ventana teórica: el usuario pasa el chequeo justo cuando, en otra pestaña,
crea un registro nuevo en esa misma moneda. **Decisión**: riesgo aceptado sin mitigación adicional
— es una preferencia de conveniencia, no un movimiento de dinero (a diferencia de `debt`, donde un
duplicado real mueve saldo dos veces); el peor caso posible ya está cubierto por el comportamiento
normal de FR-008 (el registro se sigue mostrando correctamente, solo deja de ofrecerse para
selección nueva). Documentado también como edge case aceptado en `spec.md`.

## D2 — Cómo centralizar los selectores de moneda del frontend

**Decisión**: un hook nuevo `useAllowedCurrencies()` (en `domains/reference/hooks/`) que devuelve
`{ code, name }[]` = `[preferredCurrency, ...extraCurrencies]` resuelto contra el catálogo de
`useCurrencies()` (para el `name` de cada código), y un componente nuevo `CurrencyField` que:
- si `allowed.length <= 1` → renderiza un valor estático (texto, sin interacción de selector).
- si `allowed.length > 1` → renderiza `SearchableSelect` acotado a esas opciones.

Los 8 formularios que hoy instancian su propio `SearchableSelect` sobre `useCurrencies()` completo
(`AccountForm`, `AccountCreateModal`, `CardForm`, `TransactionFormPanel`, `SavingsGoalFormPanel`,
`RecurringFormPanel`, `InstallmentFormPanel`, `DebtFormPanel`) migran a `CurrencyField`.

**Rationale**: la exploración del código confirmó que los 8 sitios ya comparten casi literalmente
el mismo patrón (`(currencies ?? []).map(c => ({ value: c.code, label: ... }))`) — centralizarlo es
más seguro que editar 8 veces la misma lógica de filtrado, y es el único punto donde vive la regla
"colapsa a estático si no hay extras". `SearchableSelect` (`shared/ui/searchable-select.tsx`) no
tiene hoy ningún modo "sin dropdown" — agregarlo ahí acoplaría un primitivo genérico de UI a una
regla de negocio de un solo dominio (moneda del usuario), así que el modo estático vive en
`CurrencyField` (que decide no renderizar `SearchableSelect` en absoluto) en vez de en el
primitivo compartido.

**Alternativas consideradas**:
- *Agregar un prop `readOnly`/`staticWhen` a `SearchableSelect` mismo* — rechazada: mezclaría una
  regla de negocio específica (moneda del usuario) en un primitivo de UI genérico reutilizado por
  selectores no relacionados con moneda (instituciones, categorías).
- *Dejar cada formulario resolviendo su propio universo de monedas permitidas* — rechazada: 8
  copias de la misma lógica de filtrado, alto riesgo de que una quede desactualizada.

**Nota de alcance explícita**: el selector de la moneda PRINCIPAL en el perfil
(`PreferencesSection.tsx`, que hoy usa una lista fija de las 3 monedas del MVP) NO se toca — no
tendría sentido acotar el universo de la moneda principal por las monedas extra (sería circular).
Tampoco se toca el propio selector de "qué moneda agregar como extra" en
`FinancialCustomizationSection.tsx` — debe seguir ofreciendo el catálogo completo, ya que su
propósito es ampliar el universo, no quedar limitado por él. Solo se acotan los selectores que
eligen la moneda de un registro nuevo (cuenta, tope de tarjeta, transacción, meta, recurrente, plan
de cuotas, deuda). Esta exclusión quedó registrada explícitamente en `spec.md` (SC-001) tras el
`/speckit-analyze` de esta feature (hallazgo F1), que notó que el spec original decía "100% de los
selectores" sin esta excepción.

## D3 — Cómo implementar el revelado tipo switch en `MaskedAmount`

**Decisión**: `MaskedAmount` gana un `useState<boolean>` local (`revealed`) y se envuelve en un
elemento clickeable (`role="button"`, `tabIndex=0`, maneja `onClick` + `onKeyDown` para
Enter/Espacio) que alterna `revealed`. Sin estado global ni persistencia: al desmontarse (salir de
la vista) el estado se pierde naturalmente, que es exactamente el comportamiento pedido en el edge
case del spec ("al volver a entrar a esa vista, el monto debe mostrarse enmascarado de nuevo").

**Rationale**: la exploración confirmó que el componente actual **no tiene ninguna capacidad de
revelado** — solo enmascara sin escape. Un `useState` local por instancia satisface exactamente la
clarificación ("varios montos pueden estar revelados a la vez, cada uno de forma independiente")
sin necesitar contexto compartido ni store: cada instancia de `MaskedAmount` en el árbol de React
es independiente por construcción.

**Alternativas consideradas**:
- *Un store global (`hideBalancesStore`) con un set de "ids revelados"* — rechazada: sobre-
  ingeniería para un requisito que ya cumple el estado local de React; requeriría inventar ids
  estables para cada monto sin necesidad real.
- *`sessionStorage` para recordar qué montos están revelados entre navegaciones* — rechazada:
  contradice explícitamente el edge case del spec (debe re-enmascararse al volver a la vista).

## D4 — Alcance de `MaskedAmount` en Ahorros

**Decisión**: envolver con `MaskedAmount` cada figura de dinero en los 6 archivos identificados
(`SavingsTotalCard`, `SavingsGoalRow`, `SavingsGoalTable`, `SavingsInsightsRail`,
`SavingsGroupHeader`, `SavingsGoalStatusLine`) — ahorrado, objetivo, ritmo y faltante por igual,
conforme a la clarificación del spec (Sesión 2026-09-18, pregunta 3).

**Rationale**: ya resuelto en la fase de clarificación del spec; este research solo registra la
lista exacta de archivos/líneas encontrada en la exploración de código, que serán la base de las
tareas de implementación.

## D5 — `budgetAlertThreshold` no se toca

**Decisión**: la columna `User.budgetAlertThreshold` (usada por el slider de umbral de alertas en
la sección de Notificaciones del perfil, NO en "Personalización financiera") queda fuera de
alcance de esta feature.

**Rationale**: el spec y la conversación previa con el usuario acotaron el alcance a los 5
controles de la sección "Personalización financiera" (`FinancialCustomizationSection.tsx`).
`budgetAlertThreshold` vive en una sección distinta del perfil y, aunque también es hoy un control
sin efecto real (según `CLAUDE.md`, "no real alert sent"), tocarlo expandiría el alcance más allá
de lo pedido explícitamente. Queda documentado aquí para que quede claro que es una omisión
deliberada, no un olvido.

## D6 — Sin validación de moneda en el backend al crear/editar cuenta, tope de tarjeta, etc.

**Decisión**: el backend NO rechaza guardar una cuenta/tope/transacción/etc. en una moneda fuera
del universo `preferredCurrency + extraCurrencies` del usuario — la restricción es puramente de
qué se **ofrece** en los selectores del frontend (FR-005 del spec dice "ofrecer", no "validar").

**Rationale**: agregar una validación de negocio en 8 dominios distintos (rechazar un `currency`
no permitido) es una expansión de alcance no pedida y con riesgo real de romper flujos legítimos
existentes (p.ej. instituciones que fuerzan cierta moneda, datos ya migrados). El spec es explícito
en que "no hay conversión de tipo de cambio... agregar una moneda extra solo amplía qué monedas se
pueden elegir en los formularios" — es una feature de UX/reducción de fricción, no una regla de
integridad de datos.
