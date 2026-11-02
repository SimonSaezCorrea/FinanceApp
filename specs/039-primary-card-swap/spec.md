# Feature Specification: Cupos por moneda en la cuenta y cambio de tarjeta principal (titular)

**Feature Branch**: `039-primary-card-swap`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "Cambiar la tarjeta principal (titular) de una cuenta de tarjeta de crédito. Desactivar o eliminar la principal obliga a elegir su reemplazo en el mismo paso (otra tarjeta de crédito activa de la cuenta, o una nueva creada ahí mismo); además, 'Marcar como principal' en cualquier adicional activa. La cuenta siempre tiene exactamente una principal activa. El cupo no cambia; la anterior pasa a adicional." Ampliado en clarify: los cupos en cada moneda (CLP y USD) viven en la cuenta; la titular usa el 100%; las adicionales comparten el cupo o tienen sub-topes parciales en cualquier moneda dentro del cupo de la cuenta.

## Contexto

Así funciona una tarjeta de crédito real: el cupo (en pesos y en dólares) es **de la cuenta**, no de cada
plástico. La tarjeta **titular** (principal) puede usar el 100% del cupo de la cuenta en cada moneda; las
**adicionales** gastan del mismo pozo común, ya sea sin límite propio (hasta el cupo total) o con un
**sub-tope parcial** que fija el titular (p. ej. $200.000 y USD 500). Todo lo que gasta cualquiera de las
tarjetas se descuenta del cupo de la cuenta en esa moneda, y el estado de cuenta es uno solo.

Hoy la aplicación modela esto a medias: el cupo en la moneda de la cuenta vive en la cuenta, pero el cupo
en otra moneda (USD) vive **en la tarjeta principal** como un tope propio de ese plástico, y el tope en
otra moneda de una adicional es un pozo independiente que no se compara con nada. Además, la principal se
asigna sola (la primera tarjeta de crédito de la cuenta) y nunca cambia.

Cuando el banco reemplaza el plástico titular (vencimiento, robo, pérdida), el usuario desactiva la
tarjeta vieja. Desde la rama previa (`fix/inactive-cards`) una tarjeta desactivada ya no recibe
movimientos nuevos, pero sigue siendo la principal: la cuenta deja de poder facturar, no hay forma de
nombrar otra titular, y el cupo en USD queda atado al plástico viejo. Eliminarla deja la cuenta sin
principal.

## Clarifications

### Session 2026-11-01

- Q: ¿Se puede eliminar una principal que tiene movimientos? → A: No. Eliminar la principal solo se permite si no tiene movimientos ni planes de cuotas; si los tiene, se rechaza y se sugiere desactivarla.
- Q: ¿Dónde viven los cupos en otra moneda y cómo se resuelve un conflicto de topes al cambiar la principal? → A: Se cambia el modelo en este mismo spec: los cupos en cada moneda viven en la cuenta; la principal usa el 100% en todas las monedas y no tiene topes propios; las adicionales comparten el cupo o tienen sub-topes parciales en cualquier moneda, siempre dentro del cupo de la cuenta en esa moneda. Al cambiar la principal no hay topes que mover; la tarjeta que pasa a principal pierde sus sub-topes.
- Q: Al migrar, ¿qué pasa con el tope en otra moneda de una adicional cuando la cuenta no tiene cupo en esa moneda o el tope lo supera? → A: Nada queda inválido y ningún disponible baja. Precisado en el plan (research R11): como antes eran pozos independientes, el cupo de la cuenta en esa moneda = límite de la principal (o 0) + suma de los topes de las adicionales, con usado inicial = suma de los usados iniciales; los topes de las adicionales quedan como sub-topes.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Cupos de la cuenta en cada moneda (Priority: P1)

El usuario configura su cuenta de tarjeta de crédito con el cupo que le dio el banco en cada moneda: por
ejemplo $2.000.000 en pesos y USD 3.000. Ve en la cuenta, por cada moneda, el cupo, lo usado y lo
disponible. Cualquier compra en una moneda, hecha con cualquier tarjeta de la cuenta, descuenta del cupo
de la cuenta en esa moneda; pagar la facturación de esa moneda lo libera.

**Why this priority**: es la base del modelo correcto; sin ella, el cupo en dólares queda atado a un
plástico y cambiar la principal obliga a mover topes.

**Independent Test**: en una cuenta con cupo $2.000.000 y USD 3.000, titular y una adicional sin sub-tope,
registrar USD 1.000 con la adicional; verificar que el disponible en USD de la cuenta es 2.000 para ambas
tarjetas y que el cupo en pesos no cambió.

**Acceptance Scenarios**:

1. **Given** una cuenta con cupo USD 3.000, **When** una adicional sin sub-tope registra USD 1.000,
   **Then** el usado en USD de la cuenta es 1.000 y el disponible en USD es 2.000 para todas sus tarjetas.
2. **Given** usado USD 2.900 sobre cupo 3.000, **When** cualquier tarjeta intenta registrar USD 200,
   **Then** se rechaza por exceder el cupo en USD de la cuenta.
3. **Given** una cuenta sin cupo en USD, **When** se intenta registrar una compra en USD, **Then** se
   rechaza explicando que la cuenta no tiene cupo en esa moneda.
4. **Given** una facturación en USD pagada, **When** se revisa el cupo, **Then** lo pagado se liberó del
   usado en USD de la cuenta (igual que hoy en pesos).
5. **Given** la creación o edición de la cuenta, **When** el usuario ingresa el cupo en la moneda de la
   cuenta y, opcionalmente, en otras monedas habilitadas en su perfil, **Then** quedan guardados como cupos
   de la cuenta, cada uno con su usado inicial.

---

### User Story 2 - Sub-topes parciales en adicionales (Priority: P1)

El usuario le da una adicional a un familiar con un tope de $200.000 y USD 500. Esa tarjeta no puede pasar
de su sub-tope en cada moneda, y además todo lo que gasta descuenta del cupo de la cuenta. Una adicional
sin sub-tope en una moneda puede usar hasta el cupo de la cuenta en esa moneda.

**Why this priority**: va junto con la historia 1; es lo que diferencia una adicional de la titular.

**Independent Test**: adicional con sub-tope USD 500 en una cuenta con cupo USD 3.000; registrar USD 400
(acepta), luego USD 200 (rechaza por sub-tope); verificar que el usado en USD de la cuenta es 400.

**Acceptance Scenarios**:

1. **Given** una adicional con sub-tope USD 500, **When** acumula USD 400 y registra USD 200 más, **Then**
   se rechaza por exceder su sub-tope, aunque la cuenta tenga disponible.
2. **Given** una adicional con sub-tope USD 500 y la cuenta con USD 50 disponibles, **When** registra USD
   100, **Then** se rechaza por exceder el cupo de la cuenta.
3. **Given** una cuenta con cupo USD 3.000, **When** el usuario fija a una adicional un sub-tope de USD
   4.000, **Then** se rechaza: un sub-tope no puede superar el cupo de la cuenta en esa moneda.
4. **Given** una cuenta sin cupo en EUR, **When** el usuario fija a una adicional un sub-tope en EUR,
   **Then** se rechaza: no hay cupo de la cuenta en esa moneda.
5. **Given** la tarjeta titular, **When** el usuario edita su detalle, **Then** no se le ofrecen
   sub-topes: la titular usa el 100% del cupo de la cuenta.

---

### User Story 3 - Desactivar la principal eligiendo su reemplazo (Priority: P1)

El banco le envió al usuario una tarjeta titular nueva. Al desactivar la principal vieja, la aplicación le
pide, en el mismo paso, cuál queda como principal: una tarjeta de crédito activa que ya existe en la
cuenta, o una tarjeta nueva que ingresa ahí mismo (últimos 4 dígitos, vencimiento y, opcionalmente, red).
Al confirmar, la vieja queda desactivada y como adicional, la elegida (o la nueva) queda como principal
activa, y la cuenta sigue facturando como antes.

**Why this priority**: es el caso que hoy deja la cuenta inutilizable para facturar.

**Independent Test**: en una cuenta con una sola tarjeta (la principal), desactivarla creando una tarjeta
nueva como reemplazo; verificar que la nueva es principal y activa, que los cupos y usados de la cuenta en
cada moneda no cambiaron, que la vieja quedó desactivada y adicional, y que se puede generar la
facturación.

**Acceptance Scenarios**:

1. **Given** una cuenta con solo su principal activa, **When** el usuario la desactiva e ingresa una tarjeta
   nueva (últimos 4 dígitos y vencimiento), **Then** la nueva queda principal y activa, la anterior queda
   desactivada y adicional, y los cupos y usados de la cuenta en cada moneda son idénticos a los de antes.
2. **Given** una cuenta con principal y una adicional de crédito activa, **When** el usuario desactiva la
   principal eligiendo la adicional como reemplazo, **Then** la adicional pasa a principal (y pierde sus
   sub-topes) y la anterior queda desactivada y adicional.
3. **Given** una cuenta con principal activa, **When** se intenta desactivarla sin indicar reemplazo,
   **Then** la acción se rechaza con un mensaje que explica que debe elegirse una nueva principal, y nada
   cambia.
4. **Given** el reemplazo recién hecho, **When** el usuario genera y paga la facturación de la cuenta en
   cualquiera de sus monedas, **Then** funciona normalmente.
5. **Given** movimientos registrados con la principal anterior, **When** se completa el cambio, **Then**
   esos movimientos conservan la tarjeta con que se hicieron y siguen contando en el usado de la cuenta.

---

### User Story 4 - Marcar como principal sin desactivar nada (Priority: P2)

El usuario quiere que otra tarjeta de crédito activa de la cuenta sea la titular (por ejemplo, porque
registró primero una adicional por error). Desde el detalle de esa tarjeta elige "Marcar como principal",
confirma, y el cambio se aplica con las mismas reglas que en la historia 3, sin desactivar ninguna tarjeta.

**Why this priority**: reutiliza el mismo cambio; corrige errores de carga y repara cuentas cuya principal
ya estaba desactivada antes de esta funcionalidad.

**Independent Test**: en una cuenta con principal y adicional activas, marcar la adicional como principal;
verificar que ambas siguen activas, que los roles se intercambiaron y que los cupos no cambiaron.

**Acceptance Scenarios**:

1. **Given** una principal y una adicional de crédito activas, **When** el usuario marca la adicional como
   principal, **Then** la adicional pasa a principal sin sub-topes, la anterior pasa a adicional sin
   sub-topes, y ambas siguen activas.
2. **Given** una adicional desactivada, **When** el usuario mira su detalle, **Then** no se le ofrece
   "Marcar como principal".
3. **Given** la tarjeta que ya es principal, **When** el usuario mira su detalle, **Then** no se le ofrece
   "Marcar como principal".
4. **Given** una cuenta cuya principal quedó desactivada antes de esta funcionalidad, **When** el usuario
   abre la cuenta, **Then** ve un aviso de que la cuenta no tiene principal activa, con la forma de
   elegir una (existente o nueva).

---

### User Story 5 - Eliminar la principal con reemplazo (Priority: P3)

El usuario cargó por error una tarjeta titular que nunca usó y quiere borrarla. La aplicación le pide el
reemplazo de la misma forma que al desactivarla; al confirmar, la anterior se elimina y la elegida (o la
nueva) queda como principal. Una principal con movimientos o planes de cuotas no se elimina: se desactiva
(historia 3), que conserva su historia.

**Why this priority**: es menos frecuente que desactivar, pero sin esta regla eliminar seguiría dejando la
cuenta sin principal.

**Independent Test**: eliminar una principal sin movimientos eligiendo una adicional activa; verificar que
la cuenta queda con esa principal, con los cupos intactos, y que puede facturar.

**Acceptance Scenarios**:

1. **Given** una principal sin movimientos y una adicional de crédito activa, **When** el usuario elimina
   la principal eligiendo la adicional, **Then** la principal anterior deja de existir y la adicional es
   principal.
2. **Given** una cuenta con solo su principal, sin movimientos, **When** el usuario la elimina ingresando
   una tarjeta nueva, **Then** la nueva queda principal y activa.
3. **Given** una principal, **When** se intenta eliminarla sin reemplazo, **Then** se rechaza y nada cambia.
4. **Given** una principal con al menos un movimiento o un plan de cuotas, **When** el usuario intenta
   eliminarla, **Then** se rechaza con un mensaje que sugiere desactivarla, y nada cambia.

---

### Edge Cases

- **Reemplazo inválido**: el reemplazo no puede ser la misma tarjeta, una tarjeta de otra cuenta, una
  tarjeta que no sea de crédito, ni una tarjeta desactivada; cada caso se rechaza sin cambiar nada.
- **Tarjeta nueva inválida**: últimos 4 dígitos que no sean 4 dígitos o vencimiento inválido se rechazan
  igual que al agregar una tarjeta hoy.
- **Adicional con sub-topes elegida como principal**: pierde todos sus sub-topes; pasa a usar el 100% del
  cupo de la cuenta en cada moneda.
- **Lo usado por una tarjeta en una moneda** (incluida la principal anterior) sigue contando en el usado de
  la cuenta en esa moneda; el cambio de titular no lo altera.
- **Bajar el cupo de la cuenta en una moneda por debajo de un sub-tope** existente: se rechaza hasta bajar o
  quitar el sub-tope (mismo criterio que hoy en la moneda de la cuenta).
- **Quitar el cupo de la cuenta en una moneda** que tiene usado, facturaciones sin liquidar o sub-topes de
  adicionales: se rechaza.
- **Migración de topes de adicionales** que hoy son pozos independientes en otra moneda: se suman al cupo
  de la cuenta en esa moneda (se crea si no existía) y quedan como sub-topes (FR-008).
- **Facturaciones en otra moneda** pendientes, pagadas o con saldo arrastrado: siguen igual; sus pagos se
  liquidan contra el cupo de la cuenta en esa moneda, no contra un plástico.
- **Planes de cuotas, gastos fijos y plantillas** que apuntan a la principal anterior: conservan su
  tarjeta; las cuotas siguen facturándose en la cuenta.
- **Desactivar o eliminar una adicional**: no pide reemplazo (comportamiento actual sin cambios).
- **Eliminar una principal con historia**: si tiene movimientos o planes de cuotas, se rechaza (sus
  movimientos quedarían sin tarjeta); el camino es desactivarla. Los gastos fijos y plantillas que la
  nombren no impiden eliminarla.
- **Reactivar la principal anterior**: vuelve como adicional compartiendo el cupo, sin sub-topes; la
  principal no cambia.
- **Repetir la misma acción** (doble clic, reintento de red): el resultado final es el mismo que haberla
  hecho una vez; nunca se crean dos tarjetas nuevas por un mismo reemplazo.
- **Lo "usado por tarjeta"** que se muestra en cada plástico (en la moneda de la cuenta) sigue sumando
  exactamente el usado de la cuenta en esa moneda, antes y después del cambio.

## Requirements _(mandatory)_

### Functional Requirements

**Cupos de la cuenta**

- **FR-001**: Una cuenta de tarjeta de crédito DEBE tener un cupo en su propia moneda y PUEDE tener cupos en
  otras monedas; cada cupo pertenece a la cuenta y tiene límite, usado inicial, usado y disponible.
- **FR-002**: Toda compra o cargo en una moneda, hecho con cualquier tarjeta de la cuenta, DEBE descontar
  del cupo de la cuenta en esa moneda, y DEBE rechazarse si lo excede o si la cuenta no tiene cupo en esa
  moneda.
- **FR-003**: Pagar o prepagar una facturación en una moneda DEBE liberar el cupo de la cuenta en esa
  moneda, sin depender de ninguna tarjeta en particular.
- **FR-004**: La tarjeta principal NO DEBE tener sub-topes propios: usa el 100% del cupo de la cuenta en
  cada moneda.
- **FR-005**: Una tarjeta adicional PUEDE tener un sub-tope por moneda; cada sub-tope DEBE ser mayor que
  cero, no mayor que el cupo de la cuenta en esa moneda, y solo en monedas en que la cuenta tiene cupo.
- **FR-006**: Un cargo con una adicional en una moneda en que tiene sub-tope DEBE rechazarse si excede ese
  sub-tope, aunque la cuenta tenga disponible.
- **FR-007**: Los cupos en otras monedas DEBEN poder ingresarse y editarse desde la cuenta (al crearla y al
  editarla), entre las monedas habilitadas en el perfil del usuario.
- **FR-008**: Los datos existentes DEBEN pasar al modelo nuevo sin cambiar ningún disponible: los topes en
  otra moneda pasan a ser cupos de su cuenta: por cuenta y moneda, el cupo = límite de la principal en esa
  moneda (o 0) + suma de los topes de las adicionales en esa moneda, y su usado inicial = suma de los usados
  iniciales; los topes de las adicionales se conservan como sub-topes. Ningún tope queda inválido y ningún
  disponible baja.

**Tarjeta principal**

- **FR-009**: Una cuenta de tarjeta de crédito que tiene al menos una tarjeta de crédito DEBE tener
  exactamente una principal, y esa principal DEBE estar activa. El sistema DEBE rechazar toda acción
  que deje la cuenta sin principal o con la principal desactivada.
- **FR-010**: Desactivar la tarjeta principal DEBE exigir, en la misma acción, un reemplazo: una tarjeta
  de crédito activa existente de la misma cuenta, o los datos de una tarjeta nueva (últimos 4 dígitos y
  vencimiento obligatorios; red opcional).
- **FR-011**: Eliminar la tarjeta principal DEBE exigir un reemplazo con las mismas opciones que FR-010, y
  solo DEBE permitirse si la tarjeta no tiene movimientos ni planes de cuotas; si los tiene, el sistema
  DEBE rechazarlo y sugerir desactivarla.
- **FR-012**: Los usuarios DEBEN poder marcar como principal cualquier tarjeta de crédito adicional activa
  de la cuenta, sin desactivar ni eliminar ninguna tarjeta.
- **FR-013**: El cambio de principal (FR-010, FR-011, FR-012) DEBE aplicarse por completo o no aplicarse:
  nunca puede quedar un estado intermedio (dos principales, ninguna, o una tarjeta nueva creada sin el
  cambio).
- **FR-014**: El cambio de principal NO DEBE modificar ningún cupo de la cuenta (límite, usado inicial ni
  usado, en ninguna moneda).
- **FR-015**: La tarjeta que pasa a principal DEBE perder sus sub-topes; la principal anterior, si sigue
  existiendo, DEBE pasar a adicional sin sub-topes.
- **FR-016**: Los movimientos, planes de cuotas, gastos fijos y plantillas existentes DEBEN conservar la
  tarjeta que ya tenían.
- **FR-017**: Tras el cambio, la cuenta DEBE seguir pudiendo generar, pagar y traspasar facturaciones (en
  todas sus monedas) sin pasos adicionales.
- **FR-018**: Reactivar una tarjeta que fue principal DEBE dejarla como adicional; la principal no cambia.
- **FR-019**: Repetir una misma acción de cambio DEBE producir el mismo resultado que hacerla una vez, y
  nunca DEBE crear más de una tarjeta nueva por reemplazo.
- **FR-020**: La aplicación DEBE mostrar, al desactivar o eliminar la principal, la elección del reemplazo
  (tarjetas de crédito activas de la cuenta + opción "tarjeta nueva") y explicar que los cupos no cambian.
- **FR-021**: Una cuenta que ya tenga su principal desactivada (datos anteriores a esta funcionalidad) DEBE
  mostrar un aviso con la forma de elegir una principal activa, existente o nueva.
- **FR-022**: Cada rechazo (sin reemplazo, reemplazo inválido, tarjeta nueva inválida, cupo o sub-tope
  excedido, moneda sin cupo, sub-tope inválido) DEBE informarse con un mensaje propio en español e inglés.

### Key Entities

- **Cuenta de tarjeta de crédito**: dueña de los cupos y de las facturaciones; siempre tiene una principal
  activa si tiene tarjetas de crédito.
- **Cupo de la cuenta (por moneda)**: límite de la cuenta en una moneda, con usado inicial, usado y
  disponible; el de la moneda de la cuenta es obligatorio, los demás opcionales.
- **Tarjeta principal (titular)**: tarjeta de crédito con acceso al 100% de cada cupo de la cuenta; no
  tiene sub-topes.
- **Tarjeta adicional**: tarjeta de crédito de la misma cuenta que gasta del cupo común, con o sin sub-tope.
- **Sub-tope (por moneda)**: límite parcial de una adicional en una moneda, siempre dentro del cupo de la
  cuenta en esa moneda.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: El 100% de las cuentas de tarjeta de crédito con tarjetas de crédito tienen exactamente una
  principal activa después de cualquier acción sobre sus tarjetas.
- **SC-002**: Reemplazar el plástico titular (desactivar el viejo e ingresar el nuevo) se completa en una
  sola pantalla, en menos de 1 minuto.
- **SC-003**: Tras cualquier cambio de principal, el límite, usado y disponible de cada cupo de la cuenta
  coinciden al centavo con los valores previos.
- **SC-004**: Tras pasar los datos existentes al modelo nuevo, el disponible de cada cuenta en cada moneda
  coincide al centavo con el que se mostraba antes.
- **SC-005**: Tras un cambio de principal, generar y pagar la facturación de la cuenta funciona en el
  primer intento en el 100% de los casos.
- **SC-006**: Un reintento o doble clic de cualquier acción de cambio nunca produce dos tarjetas nuevas ni
  dos principales.

## Assumptions

- Desde 2026-08-15 solo las cuentas de tipo tarjeta de crédito tienen tarjetas de crédito, así que estas
  reglas aplican solo a ellas.
- No hay conversión entre monedas: cada cupo se controla en su propia moneda (mismo principio de hoy).
- La tarjeta nueva creada como reemplazo no pide límite: usa el 100% de los cupos de la cuenta; titular,
  virtual y adicional quedan con los valores por defecto y se editan después.
- Las monedas en que se puede abrir un cupo son las habilitadas en el perfil del usuario (moneda principal
  - monedas extra), igual que en el resto de los selectores de moneda.
- Desactivar o reactivar la cuenta entera no cambia; esta funcionalidad solo trata cupos y tarjetas.
- No hay reglas por emisor (cada banco puede manejar el reemplazo distinto; la app no lo modela).
- Depende de la rama `fix/inactive-cards`: una tarjeta desactivada ya no se ofrece para movimientos nuevos
  y la API rechaza registrarlos sobre ella.
