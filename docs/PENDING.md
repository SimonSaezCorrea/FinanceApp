# Pendientes del proyecto

Registro vivo, de todo el proyecto (no de una feature en particular), de todo lo que se ve/funciona
parcialmente en la UI pero **no tiene una implementación real** detrás todavía — o que es real solo
parcialmente. Nada de esto es un bug: son decisiones explícitas de alcance para no bloquear una
feature completa detrás de subsistemas grandes (billing, open banking, WebAuthn, etc.) que requieren
su propia spec. Ver Principio V / "No silent placeholders" en `.specify/memory/constitution.md`.

Cuando una feature nueva agregue un placeholder o una cobertura parcial, se agrega una sección acá
(no un archivo nuevo) — este documento es el registro único para todo el proyecto.

## Perfil de usuario (specs/008) — `Perfil.dc.html`

### 1. Verificación real de datos (`AccountStatusSection` — "Estado de tu cuenta")

El anillo de completitud y los checks de "Correo", "Identidad (RUT)" y "Teléfono" reflejan **si el
dato está lleno**, no si fue verificado de verdad. No existe:

- Envío de email de confirmación (no hay proveedor SMTP integrado).
- Envío de SMS/OTP para verificar el teléfono (no hay proveedor tipo Twilio integrado).
- Verificación de identidad contra un registro real (SII/Registro Civil u homólogo).

**Para hacerlo real**: integrar un proveedor de email transaccional + uno de SMS, agregar
`emailVerifiedAt`/`phoneVerifiedAt` al modelo `User`, flujos de token de confirmación con expiración,
y (opcional) un proveedor de verificación de identidad de terceros.

### 2. Foto de perfil

El botón "Añadir" en el checklist de completitud está deshabilitado a propósito — el avatar sigue
siendo siempre iniciales generadas (`getInitials`), consistente con la Assumption original de
specs/008. No hay endpoint de subida de archivos ni almacenamiento de objetos (S3/Cloudinary
equivalente) integrado en el proyecto.

**Para hacerlo real**: elegir un proveedor de almacenamiento de objetos, agregar `User.avatarUrl`,
endpoint de subida con validación de tipo/tamaño, y servir la imagen en vez de las iniciales cuando
exista.

### 3. Llave de acceso (Passkey / WebAuthn)

Botón "Configurar" deshabilitado. La constitución fija la auth de este proyecto como "pure JWT
email+password" — agregar WebAuthn es un cambio de arquitectura de autenticación, no una extensión
menor, y requeriría su propia spec (registro de credenciales, `credentialId`/`publicKey` por usuario,
ceremonia de attestation/assertion en el navegador).

### 4. Sesiones y dispositivos

La lista de 3 dispositivos ("MacBook Pro", "iPhone 15", "Chrome · Windows") es **data de ejemplo fija**
en el componente (`SecuritySection.tsx`); los botones "Cerrar"/"Cerrar todas" solo quitan filas del
estado local de React — no revocan ninguna sesión real. Hoy la auth es JWT stateless (access+refresh
en cookies httpOnly), sin tabla de sesiones por dispositivo.

**Para hacerlo real**: se necesitaría una tabla `Session`/`RefreshToken` por dispositivo (user agent,
IP, últimas veces vista), y que `rotateFromRefresh`/`logout` operen sobre una sesión específica en vez
de un único par de cookies global.

### 5. Plan, uso y facturación

Toda la sección es un placeholder: los usos ("Cuentas 6/10", "Categorías personalizadas 8/15") son
números fijos de ejemplo (no reflejan límites reales — no existe ningún límite de plan hoy), el botón
"Ver Pro" y "Cambiar" (método de pago) y "Ver" (historial de facturas) están deshabilitados. No hay
integración de pagos (Stripe o similar), ni modelo de planes/suscripciones en la base de datos. El
badge "Plan personal" en el resto de la app ya era, desde antes de esta feature, un texto fijo sin
modelo de billing detrás.

**Para hacerlo real**: modelo `Plan`/`Subscription`, integración con un proveedor de pagos, límites
reales aplicados en los servicios de cada dominio (ej. rechazar creación de cuenta #11 en el plan
gratis), historial de facturas desde el proveedor de pagos.

### 6. Datos, conexiones y privacidad

- **Bancos vinculados**: "Banco Estado"/"Falabella CMR" son ejemplos fijos; los switches de
  sincronización son locales (no llaman a ningún banco). "Vincular otro banco" está deshabilitado. No
  hay integración de open banking (tipo Plaid/Belvo) — las cuentas de este app siempre se cargan
  manualmente.
- **Exportar movimientos** (CSV/Excel/PDF): botones deshabilitados. Es lo más tratable de esta sección
  a futuro (los datos ya existen vía `transactions`), pero no se implementó en esta pasada.
- **Respaldo automático mensual**: switch local, sin ningún job de respaldo real corriendo.

### 7. Personalización financiera — partes reales vs. placeholder

Persistido y real (columna `User`, editable, sin efecto de negocio adicional todavía):

- `billingCycleStartDay` (día de inicio del ciclo mensual) — **no está conectado** al cálculo de "mes
  actual" del Panel (`domains/dashboard`); ese cálculo sigue usando el mes calendario.
- `monthlyBudgetTarget` (presupuesto mensual objetivo) y `budgetAlertThreshold` (% de aviso, usado en
  el slider de Notificaciones) — no disparan ninguna alerta real (no hay sistema de notificaciones
  real, ver specs/008 FR-008 original).
- `extraCurrencies` (monedas extra a seguir, cualquier moneda de la lista de referencia — no solo
  CLP/USD/EUR) — selección persistida, con selector de agregar + chips de las ya elegidas (para no
  mostrar más de 100 monedas como botones sueltos), pero **sin conversión de divisas en vivo**: no se
  muestra ningún monto convertido, solo la preferencia de qué monedas seguir.

Local-only, no persistido (idéntico al patrón ya usado por el switch de 2FA):

- "Redondeo para ahorro" — no hay lógica de redondeo de transacciones ni de aporte automático a
  metas de ahorro.

### 8. "Ocultar saldos" — real pero con cobertura parcial

Es una preferencia real y persistida (`User.hideBalances`), con efecto real: `MaskedAmount` (nuevo
primitivo en `domains/profile/components/MaskedAmount.tsx`) enmascara el monto cuando está activo.
Cableado hoy en:

- Panel: patrimonio neto y montos de moneda secundaria (`NetWorthCard.tsx`).
- Tarjetas visuales de cuenta: saldo, cupo usado/límite (`AccountVisualCard.tsx`).

**No cableado todavía** (mismo patrón, solo falta aplicarlo): tablas de movimientos, KPIs de
Cuotas/Deudas/Ahorros/Inversiones, y cualquier otro monto mostrado fuera de esos dos componentes.
Extender la cobertura es mecánico — envolver el monto con `<MaskedAmount>` donde corresponda.

### 9. Verificación manual

Todo lo anterior fue verificado en su forma actual (visual fiel al diseño, sin llamadas de red falsas,
tests unitarios cubriendo el comportamiento real vs. el placeholder) — ver `specs/008-user-profile/`
para el detalle de spec/plan/tasks.

## Cuentas — facturación de crédito (períodos dinámicos + generación automática)

### 1. Fecha de pago de la facturación (`paymentDueDay`) — implementada (días hábiles y día del mes, independiente de la generación), 2026-08-29

`BillingSettings.paymentDueDay` dejó de ser una columna reservada: es la cuenta (según
`paymentDueCycleType`, días hábiles o día del mes) desde el cierre de un período en que vence su
pago — p.ej. BCI real: 22 de julio cierra → 10 días hábiles → 5 de agosto vence, y el mismo período
que cerró el 22 de julio genera el siguiente cierre 20 días hábiles después (20 de agosto), desde
donde corre el mismo reloj para su propio vencimiento. `BillingSettings.paymentDueCycleType`
(`BUSINESS_DAY` por defecto o `CALENDAR_DAY`) es **independiente** de `cycleType` (generación): un
emisor puede generar en un día fijo del mes y aun así deber el pago N días hábiles después, o
viceversa — no están acoplados. Se computa en `billing-settings/domain/billing-cycle.ts`'s
`paymentDueDate(closedAt, paymentDueDay, paymentDueCycleType)` (BUSINESS_DAY llama a
`addBusinessDays`; CALENDAR_DAY reutiliza el mismo "primer día-del-mes estrictamente posterior" que
`nextBoundaryAfter`, vía el helper compartido `nextCalendarDayAfter`) y se expone como
`CreditStatement.dueDate` (null mientras el período sigue OPEN, o si la cuenta no tiene
`paymentDueDay` configurado) — mostrado en `BillingSection` para cada período no liquidado. Editable
en `AccountForm`/`BillingSettingsModal`, cada uno con su propio Segmented días-hábiles/día-del-mes
independiente del de generación. **Sigue sin existir ninguna EJECUCIÓN de pago automático en esa
fecha** — `dueDate` es solo informativo (para que el usuario sepa cuándo pagar manualmente); ver el
punto 2 para lo que falta de verdad para `paymentMethod: AUTOMATIC`.

### 2. `paymentMethod: AUTOMATIC` — bloqueado en la UI, sin efecto funcional

`BillingSettings.paymentMethod` (`MANUAL` por defecto, o `AUTOMATIC`) vive en la tabla separada
`BillingSettings`. La opción "Automático" sigue **deshabilitada** en el control Segmented tanto en
`AccountForm` como en `BillingSettingsModal` (`shared/ui/segmented.tsx` soporta `disabled`/
`disabledReason` por opción) — el punto 1 (`paymentDueDay`) ya está resuelto, pero nada dispara
todavía un pago en esa fecha: la generación automática (cron, ver más abajo) solo CIERRA una
facturación, nunca la paga — pagar siempre requiere elegir manualmente una cuenta bancaria vía
`POST /accounts/:id/credit-statements/:statementId/pay`.

**Para hacerlo real**: habilitar la opción en el Segmented, y agregar lógica que, al llegar `dueDate`
(ya calculada, punto 1), pague automáticamente eligiendo alguna cuenta
por defecto para las facturaciones con `paymentMethod: AUTOMATIC`.

### 3. Generación automática de facturación — cron diario + botón manual

`BillingSettings.cycleType` (`BUSINESS_DAY`, el default para cuentas nuevas, o `CALENDAR_DAY`) decide
cómo se cuenta `billingCycleDay`: BUSINESS_DAY cuenta días hábiles chilenos (sin sábados, domingos ni
feriados legales, vía `date-holidays`) desde el cierre del período anterior — el comportamiento real
de la mayoría de los emisores (p.ej. BCI: 20 días hábiles); CALENDAR_DAY es el comportamiento
original (un día fijo del mes), conservado para cuentas ya configuradas así. Ambos calculan el mismo
boundary de cierre (`billing-settings/domain/billing-cycle.ts`'s `nextBoundaryAfter`), solo cambia
cómo se cuenta.

La generación cierra la facturación `OPEN` de una cuenta una vez que pasa su `billingCycleDay`,
sujeto a elegibilidad (cuenta y tarjeta activas, vía las `BillingEligibilityStrategy` de
`domains/accounts/domain/`; la lógica vive en
`domains/accounts/application/commands/generate-statements.handler.ts` desde la migración a DDD +
CQRS de specs/009 — el viejo `billing-generation.service.ts` ya no existe) y a que haya habido uso (si nunca se abrió una facturación, no hay nada que
cerrar). Dos disparadores comparten esta misma lógica:

- **Cron diario** (`src/infra/cron/billing-generation.cron.ts`, `@nestjs/schedule`,
  `EVERY_DAY_AT_3AM`) — recorre TODAS las cuentas de TODOS los usuarios con `billingCycleDay`
  configurado (`GenerateAllDueStatementsCommand`, `scope: "system"`).
- **Botón manual** "Generar facturación" en la pestaña Facturación (`POST
/accounts/:id/generate-statements`) — mismo código (`GenerateStatementsCommand`), por si el cron no ha
  corrido todavía o se quiere forzar antes de tiempo.

**Limitación conocida**: si el cron estuvo caído mucho tiempo (varios `billingCycleDay` vencidos sin
cerrar), no se retro-particiona en varios períodos — se cierra un solo boundary (el más reciente
vencido) con todo lo acumulado desde la última vez. No es un problema esperado en producción normal
(el cron corre a diario), solo si el proceso backend estuvo apagado por semanas.

### 4. Topes propios de tarjeta (`CardLimit.used`) — no migrados al modelo de facturación

El modelo de facturación (períodos, enlazado de movimientos, cierre, pago) solo cubre el **cupo
compartido de la cuenta** (`BankAccount.creditUsed`). El tope propio de una tarjeta adicional
(`CardLimit.used`, "tope propio" en vez de "cupo de la cuenta") **sigue siendo derivado** de los
movimientos (todo el tiempo, sin acotar por ciclo, sin períodos ni pagos) — no tiene su propia
facturación, botón de pago, ni registro `CreditStatement`.

**Para hacerlo real**: extender el mismo mecanismo (enlazado de movimientos + generación + pago) a
`CardLimit`, y agregar una pestaña de facturación por tarjeta en `CardDetailModal`.

**Consecuencia del punto 3 (días hábiles) sobre este límite conocido**: `currentCycleStart` —lo único
que sigue acotando `CardLimit.used` a una ventana de tiempo (el `since` de `sumsForCard`, ver
`create-transaction.handler.ts`/`update-transaction.handler.ts`/`add-card.handler.ts`/
`update-card.handler.ts`)— solo sabe reconstruir el inicio del ciclo actual para `cycleType:
CALENDAR_DAY` (un día fijo del mes es reconstruible desde `now`). Para `BUSINESS_DAY` no hay un
día fijo del que partir — el cierre depende de cuándo terminó el período anterior, algo que no vive
en `BillingSettings` — así que `currentCycleStart` devuelve `null` para esas cuentas y el tope propio
de la tarjeta deja de acotarse a un ciclo (vuelve a ser todo-el-tiempo, igual que antes de que
existiera esta ventana). No es una regresión del cupo COMPARTIDO de la cuenta (`creditUsed`, que ya
era un total persistido sin ventana de tiempo desde 2026-07-25) — solo del tope INDEPENDIENTE de una
tarjeta adicional con `CardLimit` propio en `BUSINESS_DAY`, un caso limitado dentro de un límite ya
documentado en este mismo punto.

### 4b. `Card.ownUsed` — la PRINCIPAL absorbe el residuo, las tarjetas siempre suman `creditUsed` (fix, 2026-08-23)

`ownUsed` (y `CardLimit.used`, misma consulta) sumaba TODO movimiento de la tarjeta desde siempre,
sin importar si la facturación que lo cobraba ya se había pagado — por eso el uso mostrado por
tarjeta podía superar por mucho el cupo usado de la cuenta (`creditUsed`), que sí se decrementa al
pagar. `sumsByCard` ahora excluye los movimientos cuya facturación ya tiene `paidAt` (esa deuda ya
salió del pool) y la **compra** de un plan de cuotas CREDIT (`installmentPlanId` seteado, que
contaría dos veces contra el seguimiento por cuota); `account-dto.mapper.ts` suma de vuelta el
`remainingAmount` de cada plan CREDIT de la tarjeta que lo tiene.

Ese primer intento seguía dejando huérfana cualquier deuda que no fuera "la tarjeta X gastó Y": el
arrastre de una facturación pagada en parte (`CreditStatement.carriedOverAmount`, una cifra del
PERÍODO, no de ninguna cuota — `InstallmentPayment.carriedOverAmount` de un plan CREDIT queda
siempre en `"0"` por diseño) y un cargo sin tarjeta (`financeCharge`, p. ej. intereses o comisión de
mantención — sin plástico por diseño, `CARD_NOT_ALLOWED` si se intenta). Ambos suben `creditUsed`
pero no tenían dónde aparecer entre las tarjetas — confirmado con datos reales el 2026-08-23 (una
diferencia exacta de 293.390 en la cuenta "Tarjeta CMR": 270.000 de arrastre + 23.390 de dos
movimientos sin tarjeta).

**Corregido para siempre, no documentado como límite**: la tarjeta PRINCIPAL de una cuenta
`CREDIT_CARD` no tiene ficha propia — su límite YA ES el límite de la cuenta (`creditLimit`/
`creditUsed`, nunca un `CardLimit` aparte). Su `ownUsed` ahora sigue la misma regla: es lo que sobra
del `creditUsed` de la cuenta una vez restado el `ownUsed` de cada tarjeta ADICIONAL
(`account-dto.mapper.ts`, `accountToDto`) — nunca su propia suma de movimientos. Como toda deuda de
la cuenta es "de alguna tarjeta adicional" o "de la principal" por definición, la suma de `ownUsed`
de todas las tarjetas de una cuenta **siempre** iguala `creditUsed`, sin excepción — el arrastre y
los cargos sin tarjeta caen automáticamente en la principal, que es justamente lo correcto: no
pertenecen a Camila ni a Sofía, y la cuenta y su tarjeta principal son, para efectos de cupo, la
misma cosa.

### 5. Creación de cuenta simplificada — `status`/`billingCycleDay`/`paymentMethod` solo post-creación

Desde esta pasada, `AccountCreateModal` ya no pide "Cuenta activa" (`status`), día de facturación
(`billingCycleDay`) ni método de pago (`paymentMethod`) — toda cuenta nueva se crea `ACTIVE`, sin
día de facturación configurado y en modalidad `MANUAL`. Estos tres campos siguen editables después
vía `AccountForm` (o el botón dedicado de activar/desactivar en `AccountDetailRoute`). No es un
placeholder — es una decisión de UX para simplificar el alta; no requiere ninguna implementación
adicional.

## Movimientos (Transacciones)

### 1. Plantillas de movimientos

No existe la posibilidad de crear, usar o editar una **plantilla de movimiento** reutilizable (cuenta,
categoría, descripción, tarjeta, etc. predefinidos para crear movimientos similares rápido — ej.
"Bencina", "Arriendo mensual"). Hoy la única "reutilización" es indirecta: el combobox de categoría en
`TransactionCreateModal` sugiere valores ya usados en el historial (`uniqueCategories`), pero no hay
modelo de plantilla ni acciones "Guardar como plantilla" / "Usar plantilla" en el formulario.

**Para hacerlo real**: modelo `TransactionTemplate` (userId, nombre, y los mismos campos opcionales de
una transacción salvo monto/fecha), endpoint CRUD, y en el formulario de creación un selector "Usar
plantilla" que prellene los campos más un botón "Guardar como plantilla".

### 2. Categorías personalizadas como entidad propia

Las categorías son **texto libre** (`Transaction.category: String?`), no un modelo propio: no existe
`Category` con id, ícono, color o presupuesto asociado. El combobox de categoría solo sugiere strings ya
usados por el propio usuario en sus transacciones (`uniqueCategories`) — no hay pantalla para crear,
renombrar, fusionar o eliminar categorías, y "renombrar" hoy implicaría editar transacción por
transacción (no hay operación en lote). Esto es distinto del placeholder "Categorías personalizadas
8/15" de Perfil → Plan y facturación (sección 5 más arriba), que es solo un número de ejemplo para un
límite de plan que no existe.

**Para hacerlo real**: modelo `Category` (userId, nombre, ícono, color, presupuesto opcional) con FK
opcional desde `Transaction` (migrando el string libre existente), pantalla de gestión
(crear/renombrar/fusionar/eliminar) y actualizar el combobox para listar categorías reales en vez de
strings derivados del historial.

## Movimientos — traspasos, comprobantes y paneles (specs/010)

### 3. Comprobantes sin almacenamiento configurado

Los adjuntos (`transaction-attachment`, dominio 22) guardan el archivo en un bucket S3-compatible
detrás de `ObjectStoragePort`. **Sin `S3_BUCKET` ni credenciales el `S3ObjectStorageAdapter` queda
inerte**: `isConfigured()` es `false` y subir, firmar URL o borrar responden `503
ATTACHMENTS_UNAVAILABLE` (el listado sigue funcionando y devuelve lo que haya en la tabla, así que el
panel nunca se rompe). Es la decisión explícita de la spec ("falla y ya", sin bandera de capacidad).

**En la UI el botón está bloqueado**: mientras no exista bucket, "Elegir archivo" se muestra
deshabilitado con el texto **"Próximamente"** (y su explicación como tooltip), porque ofrecer el
selector solo produciría un `503` que el usuario no puede resolver. El interruptor es la constante
`ATTACHMENT_UPLOAD_ENABLED` en `apps/web/src/domains/transactions/components/AttachmentsSection.tsx`:
ponerla en `true` reactiva la subida completa (el listado, la apertura por URL firmada y el borrado ya
están implementados y no dependen de ella). El backend está completo y probado de punta a punta.

**Para hacerlo real**: aprovisionar un bucket (AWS S3, MinIO, R2 o Backblaze), completar las seis
variables de `apps/api/.env.example` (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`). No hace falta ningún cambio de código.

**Limitación conocida asociada**: el borrado del OBJETO ocurre después de la transacción de base de
datos; si el bucket falla en ese momento el archivo queda huérfano y solo se registra en el log
(`orphaned object left in the bucket: <key>`). No existe todavía un job de limpieza que reconcilie
claves huérfanas contra la tabla.

### 4. Atributos de tarjeta puramente descriptivos

`CardAccount.isVirtual`, `isAdditional`, `cardholderName` y `network` se guardan, se editan en
`CardForm` y se muestran en `CardDetailPanel`, pero **ninguna regla de negocio depende de ellos**: una
tarjeta virtual no se comporta distinto de una física, una adicional no tiene tope propio ni
consolidación por titular, y la red no cambia ninguna validación. Son datos para que la persona
reconozca su tarjeta y para poder responder "¿quién gastó esto?" leyendo el movimiento.

**Para hacerlos reales**: agrupar el gasto por `cardholderName` en el panel y en los agregados
(hoy no existe ese corte), y usar `network` en la presentación de la tarjeta.

### 5. Un solo país en el catálogo (decisión de MVP, no un hueco)

Desde el 2026-08-15 el seed tiene **solo Chile** (58 instituciones) y **tres monedas** (CLP, USD,
CLF/UF) — ver `docs/MVP.md`. Antes había 6 países sembrados, pero cuatro devolvían cero
instituciones y Argentina estaba a medias, así que el selector de país ofrecía mercados vacíos.

**El modelo sigue siendo multi-país** y no se tocó: FK `Country`, filtro `GET /institutions?country=`,
`accountNumberFormat`/`isValidCbu`/`usesAccountAlias` con sus tests, e `InstitutionKind.PAYMENT_PROVIDER`
(la figura de las SEDPE colombianas, las EEDE peruanas y las EMPE paraguayas; hoy la usa Fintual
Prepago). Lo acotado es la data.

**Para volver a expandir**: `docs/CATALOGO_REGIONAL.md` conserva el catálogo argentino completo (9
bancos con su código de entidad BCRA + 4 PSP), los tipos de identificación por país, los enlaces
país↔moneda y las reglas de CBU/CVU/alias. Sembrar un país nuevo es leerlo del regulador
correspondiente, como se hizo con TPEEM/TCEEM/BCCOO (CMF).

### 5b. Los productos por institución están puestos por defecto, no verificados

`seedInstitutionAccountTypes` asigna los productos **por categoría** (banco ESTABLISHED → los cinco
productos retail; cooperativa → SAVINGS/SIGHT/CREDIT_CARD; emisor → PREPAID), no entidad por
entidad. El caso Fintual mostró que eso sobre-declara: tenía la licencia de prepago y **nunca emitió
tarjetas**, así que su fila pasó a `PAYMENT_PROVIDER` con la razón escrita en `notes` — una licencia
es un permiso, no un producto. Candidatos con el mismo síntoma, sin verificar todavía: **Fintoc**
(764, API de pagos B2B, no vende cuenta a personas — mismo caso que Pomelo), **Haulmer** (739) y
**SumUp Pay** (744) (prepago para comercios), **HSBC** (031), **Banco Internacional** (009) y **BTG
Pactual** (059) (banca corporativa/privada declarando los cinco productos retail), las cooperativas
chicas declarando `CREDIT_CARD`, y el `INVESTMENT` que se agregó a los 15 bancos por default de
categoría.

**Para hacerlo real**: verificar producto por producto contra los T&C de cada entidad y reemplazar
el default por una lista explícita, como ya se hace con `ISSUER_WITH_CREDIT`/`CREDIT_ONLY_CODES`.

### 6. `BankCategory` no filtra nada

`FinancialInstitution.category` (ESTABLISHED/FOREIGN_BRANCH/STATE) se guarda y se expone en el
contrato, pero **ningún endpoint filtra por ella y ningún componente la muestra**. Se conserva porque
es la taxonomía real del regulador chileno y porque agrupar el selector por ella (bancos /
sucursales extranjeras / emisores / cooperativas) es la mejora natural cuando el catálogo crezca.

### 7. Sin conversión de moneda

No existe ninguna tasa de cambio en el sistema. El patrimonio neto y los totales multi-moneda son
**sumas separadas por moneda**, nunca un único número convertido; los topes de tarjeta en otras
monedas tampoco se cruzan contra el cupo de la cuenta. Con dos países en el catálogo esto se nota más.

Consecuencia concreta en tarjetas: un emisor real opera con **un solo cupo** y convierte la compra en
moneda extranjera contra él. Aquí los topes por moneda son independientes, así que el disponible que
muestra la app no coincide con el del banco cuando hay compras en otra moneda. `CardDetailPanel` lo
advierte en vez de simular la conversión.

**Para hacerlo real**: una fuente de tasas (con su propia caché, como `EtfPriceCache`) y una decisión
de producto sobre qué tasa usar y con qué fecha — un patrimonio convertido con la tasa de hoy no es
comparable con el de ayer.

### 8. "Saldo tras el movimiento" con cobertura parcial

La fila **Saldo tras el movimiento** del panel de detalle se calcula en el cliente (no hay endpoint de
saldo histórico por movimiento) y **muestra "—"** — nunca un número aproximado — cuando no puede
sostenerse: si la cuenta no lleva saldo (`CREDIT_CARD`), si hay un filtro de fecha activo (un rango
recortado esconde movimientos posteriores que sí afectan el saldo), o si la lista mezcla cuentas (la
vista de Movimientos), donde los deltas de esta cuenta quedan detrás de filas de otras.

**Para hacerlo real**: un `runningBalance` por fila devuelto por el API (calculado en Postgres con una
ventana sobre `occurredAt`), que además sobreviviría a cualquier filtro.

### 9. Traspasos y agregados de terceros

La exclusión de traspasos de los agregados de ingreso/gasto está centralizada en el predicado
`EXCLUDE_TRANSFERS` (API, `transaction/application/queries/transaction-list-filter.ts`) y en
`excludeTransfers` (web, `domains/dashboard/lib/metrics.ts`). **Cualquier agregado nuevo de
ingreso/gasto debe aplicarlo**: al no cambiar el enum `TransactionType`, ninguna suma lo excluye por sí
sola.

## Inversiones

### 1. La vista de inversiones es una lista de solo lectura

`/investments` lista etiqueta y tipo de cada `Investment` y nada más: **sin montos, sin crear,
editar ni eliminar** (`InvestmentsRoute.tsx`, 36 líneas). El modelo detrás también está a medias —
`InvestmentKind` solo tiene `ETF` y `REMUNERATED_ACCOUNT`, no existe el depósito a plazo, el APV, el
fondo mutuo, las acciones ni la cuenta de ahorro para la vivienda — y **nada de lo invertido entra
al patrimonio neto**, que solo cuenta saldos de cuentas menos deuda.

**Diseño ya acordado, congelado en `specs/012-investment-tracking/spec.md`** (estado _Deferred_,
2026-08-15): la plata siempre vive en una cuenta, así que un depósito a plazo se abre con un
traspaso desde la cuenta de origen y se liquida devolviendo capital + el interés que el usuario lee
de su cartola (**la app nunca lo calcula**, igual que `financeCharge`); renovar es una sola acción
que no toca ninguna cuenta; una cuenta remunerada es una `BankAccount` con tasa declarada, no una
fila aparte; y el patrimonio separa lo verificado por movimientos de la línea **declarada por el
usuario** = Σ(valor declarado − capital aportado), que evita contar dos veces el mismo peso.

**Qué falta decidir antes de implementar** (por eso quedó diferida): si una cuenta de inversión
alberga un instrumento o varios — en Fintual el usuario ve UNA cuenta con varios fondos adentro — y
si esa cuenta la crea la app al registrar el instrumento o la elige el usuario.

### 2. Cotización en vivo de ETF

`EtfPriceCache` y la integración con Alpha Vantage (`ALPHA_VANTAGE_API_KEY`) siguen sin
implementarse. Mientras no existan, un ETF se valoriza por valor declarado como cualquier otro
instrumento — que es exactamente lo que asume la spec 012.

## Cuotas (specs/013, 014)

### 1. Pagar una facturación no valida saldo prepago ni sobregiro

Pagar una **cuota** valida la cuenta de origen con `MovementPolicy.assertWithinPrepaidBalance` y
`assertWithinOverdraft`: un cargo que dejaría una cuenta prepago en negativo, o que pasaría la línea
de sobregiro, se rechaza sin marcar la cuota. **Pagar una facturación de crédito
(`POST /accounts/:id/credit-statements/:id/pay`) no hace ninguna de las dos comprobaciones** — crea el
gasto y descuenta el saldo sin preguntar.

Son dos caminos que crean el mismo tipo de movimiento sobre el mismo tipo de cuenta y deberían validar
igual. No se unificó aquí para no cambiar el comportamiento de un dominio que esta feature no tocaba;
el arreglo es mover ambas guardas al pago de facturación, no relajarlas en el de cuotas.

**Spec 014 amplió el alcance de este hueco, sin cerrarlo**: ahora el mismo endpoint es también el
único camino por el que se liquida una cuota de un plan con tarjeta de crédito (`settleForStatementWithTx`
corre en la misma transacción cruzada de `PayCreditStatementHandler`), así que la falta de estas dos
comprobaciones alcanza igual a esas cuotas. Sigue pendiente la misma solución: mover las guardas al
pago de facturación.

### 2. La previsualización repite el paso de fechas del agregado

`schedulePreview` (web) llama a la MISMA `equalPrincipalSchedule` que el servidor —los montos no
pueden divergir—, pero el avance de fechas por frecuencia × intervalo está escrito dos veces: en
`InstallmentPlan.planCreation` y en `schedulePreview`. Son cuatro llamadas a `Date` y hoy no hay
paquete compartido donde vivan; la alternativa (pedirle el calendario al servidor en cada tecla) es
peor. Si el paso de fechas se complica (feriados, fin de mes), promoverlo a `@finance/money` antes de
tocarlo.

### 3. El plan no recuerda su tasa de interés

`aprPerPeriod` se usa al CREAR el plan (define el calendario y el cargo financiero) y no se guarda.
Editar un plan no puede mostrarla ni recalcular nada con ella, que es coherente con que el calendario
sea inmutable, pero significa que el interés de un plan ya creado sólo se deduce comparando la suma de
sus cuotas con su principal.

## Deuda de conformidad con la constitución v2.0.0 (identificadores, idempotencia, aislamiento)

Esta sección es distinta al resto del documento. Las demás registran **UI que parece funcionar y no
funciona**; ésta registra **principios que parecen vigentes y todavía no lo están**. La enmienda
**v2.0.0** (2026-09-02) agregó los principios VII (Idempotencia) y VIII (Identificadores), reescribió
§II y endureció dos normas de arquitectura — todo a partir de una auditoría de solo lectura, sin tocar
código. En ese momento el código **no cumplía ninguno de los siete puntos de abajo**. **specs/015
(2026-09-03) cerró el punto 4 completo** (§VII, idempotencia) y **cerró una de las seis FK del punto 3**
(`savingsGoalId`, §II). **specs/016 (2026-09-04) cerró los puntos 1 y 2 completos** (§VIII,
identificadores) **y, extendiendo su alcance por decisión del dueño del producto, cerró también el
punto 3 completo** (las cinco FK restantes, §II) — quedan 5, 6 y 7, todos sin spec propia. Quien lea
la constitución sin leer esto va a asumir que sigue todo pendiente. Cada uno necesita su propia
spec; ninguno es un arreglo de una línea.

Referencia completa con `file:line`: el Sync Impact Report de 2026-09-02 al tope de
`.specify/memory/constitution.md`.

### 1. Dos formatos de identificador en la misma columna (§VIII) — **cerrado por specs/016 (2026-09-04)**

Ya no hay ningún punto abierto acá. Antes de specs/016, las 24 tablas declaraban
`id String @id @default(cuid())` mientras 5 sitios de runtime acuñaban ids con `randomUUID()` (uuid v4)
— dos formatos en la misma columna, justo lo que §VIII prohíbe. Ahora:

- Las 24 tablas usan `@default(uuid(7))` — Prisma 7 lo genera en el cliente, sin depender de una
  función nativa de Postgres (funciona igual en el `postgres:16-alpine` de CI/dev).
- Los 5 sitios (`pay-credit-statement.handler.ts`, `pay-installment.handler.ts`,
  `create-installment-plan.handler.ts`, `create-transfer.handler.ts`, `upload-attachment.handler.ts`)
  pasaron a un helper compartido nuevo, `apps/api/src/infra/id/generate-row-id.ts` (paquete `uuid`,
  `v7()`) — necesario porque esos 5 casos necesitan el valor ANTES del insert (una referencia cruzada
  en la misma transacción, o un valor no-PK como `transferGroupId`), así que un default de schema solo
  no alcanza.
- Sin migración de datos (no hay producción): `pnpm db:reset` regeneró el dev con el formato unificado.

Detalle completo: `specs/016-unified-row-ids/{spec,plan,research,data-model}.md`.

### 2. Ningún parámetro de ruta valida formato (§VIII) — **cerrado por specs/016 (2026-09-04)**

Ya no hay ningún punto abierto acá tampoco. Antes de specs/016, los 13 schemas de path params y los
~62 campos id del contrato eran `z.string()`/`z.string().min(1)` pelados — cero validación de formato
en todo `packages/contracts/src`. Ahora:

- Un schema zod compartido nuevo, **`rowId`** (`packages/contracts/src/common/row-id.ts`,
  `z.uuidv7()` — estricto a la versión 7, un UUID v4 bien formado también se rechaza), reemplaza el
  `z.string()` pelado en los 13 archivos de path-params y en los ~62 campos id del contrato.
- `ZodValidationPipe`/`ZodParamsPipe` ganan un chequeo de `meta({errorCode})` (vía el helper
  `zod-issue-meta.ts`, que camina el schema hasta el nodo que falló — soporta campos anidados y
  elementos de array) para mapear cualquier falla de `rowId` a un único código compartido
  **`INVALID_ID_FORMAT`** (con `field`), sin tocar el resto de su comportamiento — un id malformado se
  rechaza en `400` antes de tocar la base de datos.
- **El orden de declaración de rutas (`GET /transactions/summary`/`transfers/:groupId` antes de
  `:id`) sigue siendo necesario** — Nest resuelve el ruteo por orden de declaración antes de que corra
  cualquier validación de formato, así que esto no es un "arreglo" de esa fragilidad, solo una segunda
  capa de defensa independiente (research.md Decision 5 de specs/016 lo documenta explícitamente para
  que nadie intente removerlo creyendo que ya no hace falta).
- `specs/009/quickstart.md`'s SC-007 se reescribió para verificar el comportamiento real (antes se
  cumplía solo trivialmente, porque nada validaba nada).
- Deliberadamente fuera de alcance: verificar OWNERSHIP de una FK (eso es el punto 3 más abajo) — esto
  valida solo forma, no que el id sea del usuario.

Detalle completo: `specs/016-unified-row-ids/{spec,plan,research,data-model}.md`.

### 3. Seis FK del cuerpo se persistían sin verificar propiedad (§II) — **cerrado por specs/015 + specs/016 (2026-09-04)**

Ya no hay ningún punto abierto acá. La fila creada siempre llevó el `userId` del caller, así que
**nunca hubo lectura cross-tenant** — el hueco era que un id ajeno bien formado se aceptaba igual y
se escribía en una columna FK, sin comprobar que fuera del usuario. Las seis rutas originales:

- `POST /savings/entries` — `savingsGoalId`. **Cerrado por specs/015** (2026-09-03): verificación
  contra el puerto de `savings-goal` en `create-savings-entry.handler.ts`/`update-savings-entry.handler.ts`.
- `POST /import/transactions` — `bankAccountId` por fila. **Cerrado por specs/016** (2026-09-04):
  `import-transactions.handler.ts` deduplica los ids referenciados y verifica cada uno con el
  `BankAccountLookupPort` nuevo antes de `handle()`.
- `POST|PATCH /investments` y `POST|PATCH /recurring` — `bankAccountId`. **Cerrado por specs/016**:
  mismo `BankAccountLookupPort`, inyectado en los 4 handlers de create/update.
- `POST|PATCH /installments` — `paymentAccountId`. **Cerrado por specs/016**: reutiliza el
  `BankAccountRepositoryPort.findById` que estos handlers ya inyectaban (por el flujo de pago), sin
  agregar un puerto nuevo.
- `POST /installments` (y su `PATCH`) — `cardId`, el peor caso: `kindForCard` devuelve `null` tanto
  para "no vino tarjeta" como para "tarjeta ajena". **Cerrado por specs/016**: la conflación se
  resolvía distinguiendo los dos casos antes de aplicar la regla de negocio — `input.cardId &&
!cardKind` ahora lanza `CardNotFoundError` en vez de persistir el id ajeno en silencio.
  `kindForCard` en sí ya escopeaba por `userId` (`prisma-card-account.repository.ts:98`); el bug
  vivía enteramente en los dos handlers, no en el puerto.

`POST /wallet` (`add-wallet-item.handler.ts:47-50`, `accountOwned`/`cardOwned`) y `POST /transactions`
(`movement-policy.ts:116,119`, `CardAccountMismatchError`) **ya validaban correctamente antes de esta
auditoría** — eran el patrón a espejar, no violaciones; verificado leyendo ambos handlers antes de
escribir specs/016, no asumido de la auditoría original.

Puerto nuevo: `BankAccountLookupPort.accountOwned(userId, accountId)`
(`bank-account/domain/ports/bank-account-lookup.port.ts`), mismo patrón liviano que
`CountryLookupPort`/`FinancialInstitutionLookupPort` — una lectura acotada de una tabla que el
dominio consumidor no es dueño, en vez de importar el puerto completo. Detalle completo:
`specs/016-unified-row-ids/{spec,plan,research,data-model}.md` (User Story 4, agregada 2026-09-04
por decisión explícita del dueño del producto — extiende specs/016 en vez de abrir spec propia).

### 4. Escrituras sin protección contra reintento (§VII) — **cerrado por specs/015 (2026-09-03)**

Ya no hay ningún punto abierto aquí para las diez rutas que mueven dinero. Antes de specs/015 no existía
`Idempotency-Key` en el repo — cero header, cero tabla de dedupe, cero store de hash — y sólo lo grande
estaba cubierto por máquinas de estado y unique constraints (pago de facturación, wallet). Ahora:

- `POST /transactions`, `POST /transactions/transfers`, `POST /installments`,
  `POST /installments/:id/payments/:seq/pay`, `POST /accounts/:id/credit-statements/:id/pay`,
  `POST /debts/:id/settle`, `POST /debts/:id/unsettle`, `POST /debts/:id/payments`,
  `DELETE /debts/:id/payments`, `POST /savings/entries` — las diez exigen `Idempotency-Key` y responden
  vía `BaseIdempotentCommandHandler` (forma (c) del principio VII: identidad de request del cliente +
  tabla nueva `idempotency-record` con `@@unique([userId, key])`).
- `POST /debts/:id/settle` ya no re-estampa `settledAt` en cada llamada (`DebtAlreadySettledError`
  nuevo) y `register-payment`/`undo-payment` cierran su doble-clic con el mismo mecanismo, más
  `findOneForUpdateWithTx` para la carrera de concurrencia genuina (probado: 6 peticiones simultáneas →
  avanza exactamente 6, no menos).
- **Import y adjuntos quedaron deliberadamente fuera de alcance**, verificado por la auditoría de
  specs/015 antes de escribir la spec, no olvidado: `POST /import/transactions` no tiene NINGÚN
  llamador — la ruta web es un placeholder, cero peticiones reales — y no aplica delta de saldo ni cupo,
  así que no cargaba el riesgo que esta feature necesitaba cerrar; queda para cuando exista un cliente
  real. La subida de adjuntos sigue con `attachmentId` aleatorio en el `storageKey` (por diseño, para que
  dos archivos homónimos convivan) y no forma parte de este mecanismo.
- **Límite conocido y aceptado, no arreglado**: recargar la página a mitad de un envío pierde la clave en
  memoria (`useIdempotencyKey`) — el reenvío es un intento genuinamente nuevo y puede duplicar. Evitarlo
  exige persistir borradores, spec aparte.

Detalle completo: `specs/015-idempotent-money-writes/{spec,plan,research,data-model}.md`.

### 5. El cursor de paginación no está firmado (§ paginación keyset)

`transaction/application/queries/transaction-cursor.ts` es `base64url("<ISO8601>|<id>")` sin MAC, sin
secreto, sin versión. Un `atob` devuelve la PK en claro y cualquiera puede forjar un cursor arbitrario.
Forjarlo sólo mueve la ventana de la página, no el tenant (la query sigue scopeada por `userId`), así que
el impacto hoy es acotado — pero la constitución decía "opaque" y el código no lo era, y por eso la
enmienda reemplazó la palabra por un requisito verificable.

**Para hacerlo real**: HMAC sobre el payload con un secreto de entorno + un id de versión en el propio
cursor; `INVALID_CURSOR` cuando el MAC no valida. Los cursores en vuelo se invalidan al desplegar, que es
aceptable (viven un scroll).

### 6. Las claves de object storage derivan de ids (§ uploads)

`attachment-policy.ts:48-63` construye `u/<userId>/t/<transactionId>/<attachmentId>-<slug>`, y esa clave
viaja **verbatim dentro de la URL prefirmada** que se le entrega al navegador
(`s3-object-storage.adapter.ts:45-49`, TTL 300s). O sea que el `userId` llega a la barra de direcciones,
al header `Referer` y a cualquier caché intermedia. **Es el único camino por el que un `userId` sale de
la app fuera del JWT** — el `storageKey` nunca se mapea a un DTO, egresa dentro del string de la URL.

Complicación propia: la clave es **durable en S3**. Cambiar el formato no es sólo cambiar la función,
es decidir qué pasa con los objetos ya escritos.

**Para hacerlo real**: clave opaca sin relación con ningún id (un random propio guardado en
`storageKey`, que ya es `@unique`), y para lo existente o una migración de objetos o una función de
lectura que acepte los dos formatos por un tiempo. El formato viejo está ratificado en
`specs/010-movement-transfers-attachments/data-model.md:34-35`, así que esa spec queda contradicha por
la enmienda y hay que anotarlo ahí también.

### 7. Sin política de versionado de API (gap declarado, no violación)

La constitución **no tiene** cláusula de versionado de API HTTP, deprecación ni breaking change de
contrato. El prefijo `/api/v1` es una convención de nombre sin nada detrás: nada dice qué puede cambiar
dentro de `v1`, qué obliga a un `v2`, ni por cuánto tiempo se sirve una forma vieja.

No es urgente y por eso se dejó fuera de la enmienda: hay **cero consumidores externos** (una sola SPA
contra un único origen CORS, sin OpenAPI publicado, sin app móvil, sin integraciones). Queda registrado
para que sea una decisión postergada y no una que nadie vio.

**Para hacerlo real**: escribir la cláusula ANTES de que exista el primer consumidor externo. Los puntos
1, 2 y 6 de esta sección son cambios de contrato, así que si aparece un consumidor primero, hay que
resolver esto antes que ellos.
