# Feature Specification: Personalización financiera del perfil

**Feature Branch**: `020-profile-financial-settings`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "Rediseño de la sección 'Personalización financiera' del perfil: eliminar 'Inicio del ciclo mensual', 'Presupuesto mensual objetivo' y 'Redondeo para ahorro' (nunca aportaron valor real); implementar de verdad 'Monedas extra' (acota el universo de monedas ofrecido en cualquier selector de moneda de la app a moneda principal + extras, y colapsa el selector a un valor estático cuando no hay extras) e implementar de verdad 'Ocultar saldos' (enmascara montos solo en Panel, saldo de cuenta y Ahorros, revelable temporalmente al interactuar)."

## Clarifications

### Session 2026-09-18

- Q: Un usuario quita de "monedas extra" una moneda que todavía está en uso por algún registro existente (cuenta, tope de tarjeta) — ¿qué pasa con esos registros? → A: Bloquear la eliminación en origen: el sistema impide quitar una moneda extra mientras esté en uso por algún registro del usuario; solo se pueden quitar monedas que ya no tienen ningún registro asociado.
- Q: ¿Cómo funciona exactamente "revelar temporalmente" un monto enmascarado? → A: Clic/tap alterna el estado de ese monto (tipo switch, independiente por cada monto), quedando revelado hasta la próxima interacción sobre el mismo monto o hasta salir de la vista; varios montos pueden estar revelados a la vez, cada uno de forma independiente.
- Q: En la vista Ahorros, ¿qué cifras exactas se enmascaran junto con el monto ahorrado (objetivo de la meta, ritmo de ahorro, faltante)? → A: Todas las cifras de dinero de la vista se enmascaran por igual (ahorrado, objetivo, ritmo, faltante), sin distinción entre saldo real y cifras de planificación.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Limitar el universo de monedas en los selectores (Priority: P1)

Un usuario que solo opera en pesos chilenos no quiere ver un listado de monedas irrelevantes cada vez que crea una cuenta o define un tope de tarjeta. Desde su perfil, agrega monedas extra (por ejemplo USD) solo si de verdad las necesita. A partir de ese momento, cualquier selector de moneda de la app le ofrece únicamente su moneda principal más esas monedas extra — nunca el catálogo completo del MVP.

**Why this priority**: Es el cambio de mayor alcance transversal (toca múltiples formularios en toda la app) y el que más valor de uso entrega: reduce fricción en cada punto donde hoy se elige moneda de un catálogo irrelevante para la mayoría de los usuarios.

**Independent Test**: Con un usuario que tiene solo su moneda principal configurada, abrir el formulario de creación de cuenta y verificar que el campo de moneda es un valor fijo (no despliega opciones). Agregar una moneda extra desde el perfil, volver a abrir el formulario y verificar que ahora es un selector real limitado a las dos monedas.

**Acceptance Scenarios**:

1. **Given** un usuario con solo su moneda principal configurada (sin monedas extra), **When** abre cualquier formulario que antes ofrecía elegir moneda (crear/editar cuenta, definir tope de tarjeta en otra moneda, etc.), **Then** el campo de moneda se muestra como un valor fijo/estático, sin comportamiento de selector desplegable.
2. **Given** un usuario que agrega una moneda extra desde su perfil, **When** vuelve a abrir cualquiera de esos formularios, **Then** el campo de moneda se comporta como un selector real, y las únicas opciones disponibles son su moneda principal y sus monedas extra (nunca el catálogo completo de monedas del MVP).
3. **Given** un usuario con dos o más monedas extra agregadas, **When** quita del perfil una que ningún registro suyo (cuenta, tope de tarjeta, u otro) está usando actualmente, **Then** la eliminación se completa y esa moneda deja de aparecer como opción en los selectores de moneda de la app.
4. **Given** un usuario con una moneda extra que sí está en uso por al menos un registro suyo, **When** intenta quitarla desde su perfil, **Then** el sistema rechaza la eliminación e indica que esa moneda sigue en uso, y la moneda permanece disponible en los selectores hasta que deje de estar en uso.

---

### User Story 2 - Ocultar y revelar saldos en puntos acotados de la app (Priority: P2)

Un usuario que a veces comparte pantalla o usa la app en un lugar público quiere poder ocultar sus montos de dinero en las vistas donde importa más la privacidad visual (Panel, saldo de cuenta, Ahorros), sin perder la posibilidad de consultarlos cuando de verdad los necesita, y sin que el resto de la app (Movimientos, Deudas, etc.) se vea afectado — esas vistas ya requieren ver el detalle de cada movimiento para ser útiles.

**Why this priority**: Valor real pero de alcance más acotado que la Historia 1; depende de un componente que ya existe parcialmente, así que es una extensión de cobertura y de interacción, no una construcción desde cero.

**Independent Test**: Activar "Ocultar saldos" en el perfil, navegar al Panel/dashboard y verificar que los montos de dinero aparecen enmascarados; hacer clic/tap sobre un monto y verificar que se revela temporalmente; navegar a Movimientos y verificar que los montos se muestran normalmente sin enmascarar.

**Acceptance Scenarios**:

1. **Given** un usuario con "Ocultar saldos" activo, **When** visualiza el Panel/dashboard, **Then** el patrimonio neto y los montos de dinero de esa vista aparecen enmascarados por defecto.
2. **Given** un usuario con "Ocultar saldos" activo, **When** visualiza el detalle de una cuenta bancaria o su tarjeta visual, **Then** el saldo de esa cuenta aparece enmascarado por defecto.
3. **Given** un usuario con "Ocultar saldos" activo, **When** visualiza la vista de Ahorros, **Then** toda cifra de dinero de esa vista (monto ahorrado, objetivo de cada meta, ritmo de ahorro, faltante) aparece enmascarada por defecto, sin distinción entre saldo real y cifras de planificación.
4. **Given** un monto enmascarado en cualquiera de los tres puntos anteriores, **When** el usuario interactúa con él (clic en desktop, tap en móvil), **Then** el valor real se revela temporalmente, y vuelve a enmascararse al terminar esa interacción.
5. **Given** un usuario con "Ocultar saldos" activo, **When** visualiza Movimientos, Deudas, Recurrentes o Cuotas/Facturación, **Then** los montos de dinero en esas vistas se muestran siempre en su valor real, sin enmascarar y sin ofrecer una interacción de revelar (no aplica).
6. **Given** un usuario con "Ocultar saldos" desactivado, **When** visualiza cualquier vista de la app, **Then** todos los montos se muestran en su valor real, igual que hoy.

---

### User Story 3 - Perfil sin controles decorativos (Priority: P3)

Un usuario que entra a "Personalización financiera" en su perfil ya no encuentra los controles "Inicio del ciclo mensual", "Presupuesto mensual objetivo" ni "Redondeo para ahorro", que nunca tuvieron efecto real en la app (dos se guardaban pero no alimentaban ningún cálculo, y uno ni siquiera se guardaba). La sección queda más corta y honesta sobre lo que realmente controla.

**Why this priority**: Es una limpieza de deuda —remueve superficie de confusión— pero no habilita ninguna capacidad nueva, así que tiene menor prioridad relativa que las dos historias anteriores aunque sea sencilla de completar.

**Independent Test**: Abrir la sección "Personalización financiera" del perfil y verificar que únicamente aparecen los controles de "Monedas extra" y "Ocultar saldos".

**Acceptance Scenarios**:

1. **Given** un usuario en la sección "Personalización financiera" de su perfil, **When** la visualiza, **Then** no encuentra los controles "Inicio del ciclo mensual", "Presupuesto mensual objetivo" ni "Redondeo para ahorro".
2. **Given** un usuario que antes tenía un valor guardado para "Inicio del ciclo mensual" o "Presupuesto mensual objetivo", **When** la funcionalidad se retira, **Then** ese dato deja de existir en el sistema (no queda accesible ni editable desde ningún lugar de la app).

---

### Edge Cases

- ¿Qué pasa si un usuario no tiene ninguna moneda extra y tampoco ha elegido explícitamente una moneda principal (dato legado o cuenta recién creada)? → Debe existir siempre una moneda principal válida (ya es un campo obligatorio del perfil hoy); el caso "cero monedas totales" no puede ocurrir.
- ¿Qué pasa si el usuario intenta agregar como moneda extra la misma que ya es su moneda principal? → Debe evitarse el duplicado; ya existe este resguardo en el comportamiento actual del selector de monedas extra.
- ¿Qué pasa con un registro (cuenta, tope de tarjeta) que ya está guardado en una moneda que el usuario nunca marcó como principal ni como extra (por ejemplo, dato de antes de esta feature)? → La visualización de datos existentes no se ve afectada; la restricción del universo de monedas aplica solo a la selección de una moneda NUEVA en un formulario, nunca oculta ni transforma datos ya guardados. Este caso solo puede originarse en datos previos a esta feature, ya que a partir de ahora no es posible quitar una moneda extra que esté en uso.
- ¿Qué pasa si un usuario intenta quitar su moneda extra desde un formulario donde también la está seleccionando para un registro nuevo (aún no guardado)? → No aplica: el registro nuevo todavía no existe, así que esa moneda no cuenta como "en uso" hasta que el registro se guarda; la eliminación de la moneda extra solo se bloquea por registros ya persistidos.
- ¿Qué pasa si el usuario cambia su moneda principal? → Ese flujo ya existe hoy y no cambia; el universo de selección se recalcula automáticamente con la nueva moneda principal + las monedas extra vigentes.
- ¿Qué pasa con un monto enmascarado si el usuario navega fuera de la vista mientras lo tenía revelado? → Al volver a entrar a esa vista, el monto debe mostrarse enmascarado de nuevo (la revelación es efímera, nunca se recuerda entre visitas).
- ¿Qué pasa si "Ocultar saldos" está activo y el usuario revela un monto en el Panel — afecta eso a la misma cifra mostrada en el saldo de cuenta o en Ahorros? → No; cada monto se revela de forma independiente, la interacción es local a ese elemento, no un interruptor global de sesión.
- ¿Qué pasa si un usuario quita una moneda extra justo cuando, en otra pestaña o dispositivo, crea al mismo tiempo un registro nuevo en esa misma moneda? → Riesgo aceptado conscientemente: es una ventana de carrera muy angosta (dos acciones simultáneas en sesiones distintas) sobre una preferencia de conveniencia, no sobre un movimiento de dinero — el mismo estándar de bloqueo con lock exclusivo que la app ya aplica en flujos que sí mueven saldo real (p. ej. pagos de deuda) no se considera necesario aquí. En el peor caso, ese registro queda en una moneda que ya no está en `extraCurrencies`, situación ya cubierta por el edge case anterior (dato existente en una moneda fuera del universo vigente): se sigue visualizando correctamente, solo deja de ofrecerse para selección nueva.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE eliminar por completo la capacidad de "Inicio del ciclo mensual" del perfil del usuario: el control deja de mostrarse en la UI, el dato deja de poder guardarse o leerse, y ningún dato histórico queda accesible desde ninguna parte de la app.
- **FR-002**: El sistema DEBE eliminar por completo la capacidad de "Presupuesto mensual objetivo" del perfil del usuario, en los mismos términos que FR-001.
- **FR-003**: El sistema DEBE eliminar por completo la capacidad de "Redondeo para ahorro" del perfil del usuario, en los mismos términos que FR-001 (no persistía datos, así que solo aplica la remoción de UI y de cualquier resto de código asociado).
- **FR-004**: El sistema DEBE permitir que un usuario mantenga, agregue y quite monedas extra desde su perfil, sobre la funcionalidad de guardado que ya existe hoy.
- **FR-004a**: El sistema DEBE impedir que un usuario quite una moneda extra mientras esté en uso por al menos un registro suyo (cuenta, tope de tarjeta u otro dato con moneda propia), informando que la moneda sigue en uso; solo puede quitarse una moneda extra que ningún registro del usuario esté usando en ese momento.
- **FR-005**: El sistema DEBE ofrecer, en cualquier selector de moneda de la aplicación (incluyendo, sin limitarse a, creación/edición de cuenta bancaria y definición de tope de tarjeta en otra moneda), únicamente el conjunto formado por la moneda principal del usuario logueado más sus monedas extra — nunca el catálogo completo de monedas soportadas por la app.
- **FR-006**: El sistema DEBE mostrar un selector de moneda como un valor fijo/estático (sin comportamiento de desplegable) cuando el usuario no tiene ninguna moneda extra configurada, ya que en ese caso solo existe una opción posible.
- **FR-007**: El sistema DEBE mostrar un selector de moneda con comportamiento real de selección (desplegable, con las opciones acotadas según FR-005) en cuanto el usuario tiene al menos una moneda extra configurada.
- **FR-008**: El sistema DEBE seguir mostrando correctamente cualquier dato ya guardado en una moneda que no forme parte del universo moneda-principal-más-extras vigente del usuario (esta restricción aplica solo a la selección de una moneda nueva, nunca a la visualización de datos existentes).
- **FR-009**: El sistema DEBE permitir a un usuario activar y desactivar "Ocultar saldos" desde su perfil, sobre la funcionalidad de guardado que ya existe hoy.
- **FR-010**: El sistema DEBE enmascarar los montos de dinero en el Panel/dashboard (incluyendo el patrimonio neto) cuando "Ocultar saldos" está activo.
- **FR-011**: El sistema DEBE enmascarar el saldo de una cuenta bancaria, tanto en su vista de detalle como en su representación de tarjeta visual, cuando "Ocultar saldos" está activo.
- **FR-012**: El sistema DEBE enmascarar, en la vista de Ahorros, toda cifra de dinero cuando "Ocultar saldos" está activo — incluyendo el monto ahorrado, el monto objetivo de cada meta, el ritmo de ahorro y lo que falta por ahorrar, sin distinguir entre saldo real y cifras de planificación.
- **FR-013**: El sistema DEBE permitir revelar temporalmente el valor real de un monto enmascarado mediante un clic/tap sobre ese monto, que alterna (tipo switch) entre enmascarado y revelado; el estado revelado se mantiene hasta la próxima interacción sobre ese mismo monto o hasta que el usuario sale de la vista. El estado de revelado es independiente por cada monto: el usuario puede tener varios montos revelados a la vez sin que revelar uno afecte a los demás.
- **FR-014**: El sistema NO DEBE enmascarar montos de dinero en Movimientos, Deudas, Recurrentes, Cuotas/Facturación, ni en ninguna otra vista fuera de Panel, saldo de cuenta y Ahorros, sin importar el estado de "Ocultar saldos".
- **FR-015**: El sistema DEBE mostrar todos los montos de dinero en su valor real, en todas las vistas, cuando "Ocultar saldos" está desactivado.

### Key Entities _(include if feature involves data)_

- **Perfil del usuario**: conserva su moneda principal, su lista de monedas extra y su preferencia de ocultar saldos; deja de tener cualquier noción de inicio de ciclo mensual, presupuesto objetivo o redondeo para ahorro.
- **Selector de moneda**: un punto de elección de moneda en cualquier formulario de la app; su universo de opciones pasa a depender de las monedas configuradas por el usuario logueado (principal + extras) en vez del catálogo completo de monedas soportadas.
- **Monto enmascarable**: una cifra de dinero mostrada en Panel, saldo de cuenta o Ahorros; tiene dos estados de visualización (enmascarado / revelado) controlados por la preferencia del usuario y por una interacción momentánea de revelado.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: El 100% de los selectores de moneda que eligen la moneda de un registro NUEVO (cuenta, tope de tarjeta, transacción, meta de ahorro, gasto recurrente, plan de cuotas, deuda) respeta el universo moneda-principal-más-extras del usuario logueado. Quedan fuera de este criterio, por diseño y no por omisión: el selector donde el usuario elige su propia moneda PRINCIPAL (acotarlo por sus monedas extra sería circular — la principal es la base de ese universo, no un miembro más de él), y el selector donde el usuario elige qué moneda AGREGAR como extra (debe seguir ofreciendo el catálogo completo, ya que su propósito es justamente ampliar el universo, no quedar limitado por él).
- **SC-002**: Un usuario sin monedas extra ve el campo de moneda como un valor fijo en el 100% de los formularios donde antes existía un selector de moneda.
- **SC-003**: Un usuario puede revelar cualquier monto enmascarado del Panel, del saldo de una cuenta o de Ahorros en una sola interacción (un clic o un tap), sin pasos adicionales.
- **SC-004**: El 100% de los montos mostrados en Movimientos, Deudas, Recurrentes y Cuotas/Facturación permanecen sin enmascarar, independientemente del estado de "Ocultar saldos".
- **SC-005**: La sección "Personalización financiera" del perfil ya no ofrece ningún control cuyo cambio de valor no tenga efecto observable en la aplicación.

## Assumptions

- La moneda principal (`preferredCurrency`) del usuario sigue siendo un campo obligatorio y ya validado por la app; esta feature no cambia cómo se elige ni se guarda.
- El catálogo de monedas soportadas por el MVP (hoy CLP, USD y CLF) no cambia con esta feature; lo que cambia es qué subconjunto de ese catálogo se ofrece a cada usuario según su configuración personal.
- No existe ni se introduce conversión de tipo de cambio entre monedas; agregar una moneda extra únicamente amplía qué monedas se pueden elegir en un formulario, nunca convierte un monto de una moneda a otra.
- "Revelar temporalmente" un monto se interpreta como una interacción sin memoria persistente entre visitas: cada vez que el usuario vuelve a ver una vista, los montos elegibles aparecen enmascarados de nuevo si la preferencia sigue activa.
- Los datos que hoy existen para "Inicio del ciclo mensual" y "Presupuesto mensual objetivo" no tienen ningún consumidor en la app (confirmado en la auditoría previa a esta spec) y por lo tanto pueden eliminarse sin coordinar una migración de datos hacia otra funcionalidad.
- Esta feature no introduce ninguna moneda nueva al catálogo del MVP ni extiende el enmascarado de saldos a vistas fuera de las tres mencionadas (Panel, saldo de cuenta, Ahorros); ambas cosas quedan explícitamente fuera de alcance.
