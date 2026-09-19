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

### 3. Llave de acceso (Passkey / WebAuthn) — real desde specs/022, un solo camino queda fuera

Registro/login con passkey (con y sin escribir el email — discoverable/usernameless) está
implementado de punta a punta desde specs/022 (2026-09-18); ver `specs/022-passkey-login/` para el
diseño completo. **specs/025 (2026-09-19) cerró los otros dos gaps**: renombrar una llave ya
registrada (`PATCH /auth/me/passkeys/:id`, sin tocar `lastUsedAt`/`createdAt`) y la sugerencia
automática vía autocompletado del navegador (`navigator.credentials.get({mediation:"conditional"})`,
cableada al campo de email de login — feature-detectada con `PublicKeyCredential.
isConditionalMediationAvailable()`, así que en un navegador sin soporte no cambia nada; el botón
explícito sigue siendo el único camino garantizado). Ver `specs/025-passkey-management/` para el
diseño completo.

Lo que queda **explícitamente pendiente**:

- **Verificación de "attestation" del fabricante**: se acepta cualquier autenticador compatible con
  el estándar (`attestationType: "none"`), sin verificar contra un catálogo de fabricantes
  conocidos (MDS de la FIDO Alliance). Cualquier llave/biométrico que el navegador exponga vía
  WebAuthn funciona, sin lista blanca. Descartado explícitamente de specs/025 por ser una
  integración pesada (descargar/parsear/verificar el BLOB firmado de metadatos FIDO, decidir qué
  fabricantes permitir) de valor dudoso para una app de finanzas personales.

### 3b. Verificación en dos pasos — real desde specs/021 (2026-09-18), tres caminos quedan fuera

El switch "Verificación en dos pasos" **dejó de ser decorativo**: activa/desactiva MFA real vía
TOTP (app autenticadora), exige el segundo paso en cada login de una cuenta con MFA activo, y
soporta códigos de recuperación de un solo uso. Ver `specs/021-mfa-totp/` para el diseño completo.
Tres caminos quedaron **explícitamente fuera de alcance de esa iteración** (decisión del dueño del
producto, no un hueco técnico encontrado después):

- **Segundo factor por email o SMS**: solo TOTP por app autenticadora existe hoy. El backend no
  tiene proveedor de email/SMS transaccional integrado (mismo hueco que el punto 1 de esta
  sección) — agregarlo es la misma integración que ya falta ahí, más un tercer tipo de código en
  `verify-mfa-login.handler.ts`.
- **"Recordar este dispositivo"**: no existe un mecanismo para saltarse el segundo paso en logins
  futuros desde el mismo navegador. Cada login de una cuenta con MFA activo pide el código
  siempre, sin excepción. Implementarlo requeriría una cookie de dispositivo confiable de larga
  duración (separada de las de sesión) y una tabla que la valide.
- **Regenerar códigos de recuperación sin reactivar todo MFA**: hoy la única forma de obtener un
  set nuevo de códigos es desactivar MFA (reingresando la contraseña) y volver a activarlo desde
  cero — no hay un endpoint "solo regenerar códigos" que preserve el secreto TOTP vigente.

### 4. Sesiones y dispositivos — real desde specs/023 (2026-09-19), revocación por credencial cerrada por specs/024

Ya no es data de ejemplo. Cada login exitoso (password, con/sin MFA, o passkey) crea una fila
`Session` real, cuyo `id` viaja como claim `sid` en el access y el refresh token de ese login;
`JwtAuthGuard` verifica en cada request que esa sesión siga existiendo (revocación de inmediato, no
solo en el próximo refresh). `SecuritySection` lista las sesiones reales (`GET /auth/sessions`,
dispositivo/navegador derivado del User-Agent, país aproximado vía GeoLite2 si `GEOIP_DB_PATH` está
configurado) y "Cerrar"/"Cerrar todas" llaman de verdad a `DELETE /auth/sessions/:id`/
`POST /auth/sessions/revoke-others`. Cerrar una sesión estampa `closedAt` (se retiene 3 días, la
purga un cron diario) — ver la enmienda de `CLAUDE.md` que reemplazó el DELETE inmediato original.

**Cerrado por specs/024 (2026-09-19)**: cambiar la contraseña (`POST /auth/me/password`) o
desactivar la verificación en dos pasos (`POST /auth/me/mfa/disable`) ahora revocan automáticamente
todas las demás sesiones activas del usuario, dejando activa solo la que hizo el cambio — en la
MISMA transacción que el cambio de credencial (si la revocación falla, el cambio también se
revierte). La UI (`ChangePasswordDialog`/`DisableMfaModal`) advierte esto explícitamente ANTES de
confirmar, sin ningún aviso posterior. Ver `specs/024-revoke-sessions-on-change/` para el diseño
completo.

**Sigue pendiente, fuera de alcance de specs/024** (decisión explícita, no un hueco encontrado
después):

- **Correo/notificación avisando el cierre**: no existe ningún proveedor de envío de correo
  transaccional en el proyecto (ver la sección "Envío de correos transaccionales" de este mismo
  documento) — sin esa infraestructura, no hay dónde enganchar el aviso.
- **Notificación de "nuevo dispositivo"** al iniciar sesión — requiere la misma infraestructura de
  correo que el punto anterior.
- **Límite de sesiones simultáneas** y **revocación automática por comportamiento sospechoso** —
  ambas son decisiones de producto propias (qué límite, qué cuenta como sospechoso) que no se
  asumieron en specs/023 ni en specs/024 (ver `specs/023-real-sessions/spec.md`, sección
  Assumptions).

### 4b. Geolocalización de sesiones: migrar de MaxMind (local) a IPinfo (API) con caché

Hoy `GeoIpLookup` resuelve país/ciudad contra un archivo `.mmdb` local (GeoLite2-City de MaxMind,
`GEOIP_DB_PATH`) — funciona, pero el archivo hay que descargarlo/actualizarlo a mano y no lo trae el
repo (gitignoreado, cada dev/entorno se lo baja aparte). Migrar a la API de **IPinfo** (u otro
proveedor equivalente) resolvería eso a costa de depender de un servicio externo con cuota.

**Estrategia recomendada para no gastar cuota de más** (la cuota gratuita de IPinfo es 50.000
consultas/mes): agregar una capa de caché propia antes de golpear la API externa.

1. El usuario inicia sesión → el server ya captura su IP (esto no cambia).
2. **Consulta interna primero**: buscar en una tabla propia (ej. `ip_geolocation_cache`, o
   directamente reutilizar filas de `Session` ya resueltas) si esa IP exacta ya se vio antes.
   - **IP conocida** → usar la ciudad/país ya guardados. Consumo de API = 0.
   - **IP nueva** → recién ahí pegarle a la API de IPinfo, guardar el resultado en la tabla de caché
     para la próxima vez, y usarlo para esta sesión. Consumo de API = 1.
3. Con esa lógica, aunque la app crezca a cientos de miles de usuarios, la cuota gratuita alcanza
   por mucho tiempo — la mayoría de la gente inicia sesión siempre desde las mismas IPs (casa,
   trabajo).

**Para hacerlo real**: nueva tabla/dominio-tabla de caché IP→ubicación (con expiración razonable,
ya que una IP puede reasignarse con el tiempo — ej. TTL de 30-90 días), `GeoIpLookup` pasa a
consultar esa caché antes de llamar a IPinfo, y solo llama a la API externa en un cache-miss. La
capa pública (`lookup(ip): Promise<GeoLocation>`) no necesita cambiar — es un swap interno de
implementación, no del contrato que usa `SessionIssuer`. Mientras esto no se implemente, seguimos
con MaxMind local (sin llamadas de red, sin cuota, pero con el archivo a mantener a mano).

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

### 7. Personalización financiera — resuelto en specs/020 (2026-09-18)

La sección se redujo a los dos controles que aportan valor real, y ambos quedaron implementados de
verdad — no queda ningún placeholder aquí:

- **"Inicio del ciclo mensual" (`billingCycleStartDay`) y "Presupuesto mensual objetivo"
  (`monthlyBudgetTarget`/`budgetAlertThreshold`'s partner field) — eliminados por completo**: columna,
  campo de contrato, endpoint y UI. Nunca alimentaron ningún cálculo real y se descartó la idea, no
  solo la UI. `budgetAlertThreshold` en sí (sección Notificaciones, no "Personalización financiera")
  sigue existiendo sin efecto — ver el punto sobre Notificaciones más abajo.
- **"Redondeo para ahorro" — eliminado**: era 100% decorativo (estado local de React, ni se
  persistía).
- **"Monedas extra" (`extraCurrencies`) — implementado de verdad**: ahora acota el universo de
  monedas que ofrece cualquier selector de moneda de la app (crear/editar cuenta, tope de tarjeta en
  otra moneda, transacción, meta de ahorro, gasto recurrente, plan de cuotas, deuda) a
  `preferredCurrency + extraCurrencies` del usuario — colapsando a un valor estático (sin
  desplegable) cuando no hay monedas extra configuradas (`domains/reference/components/
CurrencyField.tsx` + `useAllowedCurrencies`). El backend bloquea con `CURRENCY_IN_USE` (409) quitar
  una moneda extra mientras algún registro del usuario la siga usando (8 puertos de solo lectura,
  uno por tabla con columna `currency`). Sigue **sin conversión de divisas en vivo** — nunca se
  muestra un monto convertido, solo se amplía qué monedas se pueden elegir.

### 8. "Ocultar saldos" — real, cobertura ampliada en specs/020 (2026-09-18)

Preferencia real y persistida (`User.hideBalances`); `MaskedAmount`
(`domains/profile/components/MaskedAmount.tsx`) enmascara el monto cuando está activo y ahora
soporta revelado temporal (clic/tap alterna, independiente por instancia). Cableado en:

- **Panel completo**: patrimonio neto y monto por moneda (`NetWorthCard.tsx`), flujo del mes
  (`MonthFlowCard.tsx`), tooltip de gasto por categoría (`CategoryDonut.tsx`), próximos pagos
  (`UpcomingPaymentsCard.tsx`).
- Tarjetas visuales de cuenta: saldo, cupo usado/límite (`AccountVisualCard.tsx`, usado en Panel/
  Wallet, y `AccountCard.tsx`, el componente distinto que usa la vista "Cuentas" — se pasó por alto
  en la primera pasada de specs/020 y se corrigió después).
- Vista "Cuentas": el resumen superior (patrimonio total, activos, deuda tarjetas —
  `AccountsSummary.tsx`) y el valor aproximado en moneda principal de cada tarjeta (`AccountCard.tsx`).
- Detalle de cuenta: saldo actual (`AccountDetailRoute.tsx`).
- **Ahorros completo**: total ahorrado, ritmo, faltante, ahorro libre (`SavingsTotalCard.tsx`), monto
  ahorrado/objetivo por meta (`SavingsGoalRow.tsx`, `SavingsGoalTable.tsx`), próximos vencimientos y
  mejor ritmo (`SavingsInsightsRail.tsx`), total por grupo (`SavingsGroupHeader.tsx`), línea de estado
  de una meta (`SavingsGoalStatusLine.tsx`).

**Deliberadamente NO cableado** (alcance acotado a propósito, no una omisión): Movimientos, Deudas,
Recurrentes, Cuotas/Facturación — esas vistas siempre muestran montos reales, sin importar el estado
del switch (un test de regresión basado en escaneo de código,
`MaskedAmount.scope.test.ts`, falla si algún archivo de esos 4 dominios llega a importar
`MaskedAmount`).

### 9. Verificación manual

Lo anterior (specs/008) fue verificado en su forma original — ver `specs/008-user-profile/` para el
detalle de spec/plan/tasks. La revisión de specs/020 se verificó con la suite automatizada completa
(unit/integration/e2e de `apps/api`, unit de `apps/web`, typecheck y `check:boundaries` en ambos
paquetes) — sin verificación visual en navegador real, ya que este entorno no cuenta con herramienta
de automatización de navegador.

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

## Envío de correos transaccionales (no implementado)

La app no envía ningún correo hoy — ni verificación de cuenta al registrarse, ni recuperación de
contraseña, ni alertas de seguridad (cambio de password, `deactivate`), ni el aviso de
`budgetAlertThreshold` (que ya existe como campo pero está inerte, ver sección de Perfil). No hay
proveedor configurado, no hay `EmailPort`, no hay endpoint de forgot-password.

**Plataforma elegida para el MVP: Resend** (evaluado 2026-09-11 contra SES, SendGrid, Brevo,
SendPulse). Motivo: 100% transaccional (sin ruido de marketing/newsletter, que no se necesita acá),
mejor DX de los evaluados, free tier de 3,000 correos/mes suficiente para esta etapa. AWS SES queda
descartado para el arranque por el modo sandbox (requiere pedir "production access" a AWS y
verificar dominio con más fricción) pero es la opción a reconsiderar si el volumen escala fuerte
(≈$0.10 por 1,000 correos, sin techo real) — decisión ya evaluada, no una que nadie vio.

**Diseño previsto, mismo patrón que `ObjectStoragePort`/S3**: un puerto `EmailPort` en
`infra/email/` con un adapter `ResendEmailAdapter` atrás; sin `RESEND_API_KEY`/`EMAIL_FROM`
configurados la feature queda inerte (mismo espíritu que `503 ATTACHMENTS_UNAVAILABLE`), para que
cambiar de proveedor a futuro (ej. migrar a SES por volumen, o agregar failover multi-proveedor) sea
solo un adapter nuevo, sin tocar el resto de la app.

**Casos de uso a cablear cuando se implemente** (ninguno empezado):

1. Verificación de cuenta al registrarse (engancha en `RegisterHandler`).
2. Recuperación de contraseña — requiere flujo nuevo: token de reset con expiración,
   `POST /auth/forgot-password` + `POST /auth/reset-password` (no existen hoy).
3. Alertas de seguridad sobre acciones ya existentes en `auth.controller.ts` (cambio de password,
   `deactivate`).

**Fuera de alcance del MVP, explícitamente diferido**: colas asíncronas (BullMQ/similar) para batch
de envío, rate limiting propio, failover multi-proveedor, tabla `email-log` para auditoría propia,
y volumen alto (100k+ usuarios activos) — todo eso solo se justifica si el volumen real lo exige;
ver conversación de referencia para el análisis completo de costos/límites por proveedor a esa
escala.

## Deuda de conformidad con la constitución v2.0.0 (identificadores, idempotencia, aislamiento)

Esta sección es distinta al resto del documento. Las demás registran **UI que parece funcionar y no
funciona**; ésta registra **principios que parecen vigentes y todavía no lo están**. La enmienda
**v2.0.0** (2026-09-02) agregó los principios VII (Idempotencia) y VIII (Identificadores), reescribió
§II y endureció dos normas de arquitectura — todo a partir de una auditoría de solo lectura, sin tocar
código. En ese momento el código **no cumplía ninguno de los siete puntos de abajo**. **specs/015
(2026-09-03) cerró el punto 4 completo** (§VII, idempotencia) y **cerró una de las seis FK del punto 3**
(`savingsGoalId`, §II). **specs/016 (2026-09-04) cerró los puntos 1 y 2 completos** (§VIII,
identificadores) **y, extendiendo su alcance por decisión del dueño del producto, cerró también el
punto 3 completo** (las cinco FK restantes, §II). **specs/017 (2026-09-04) cerró los puntos 5 y 6
completos** (firma del cursor y opacidad de la storage key) — queda solo el 7, sin spec propia (es
un gap declarado, no una violación). Quien lea la constitución sin leer esto va a asumir que sigue
todo pendiente. Cada uno necesita su propia spec; ninguno es un arreglo de una línea.

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

### 5. El cursor de paginación no está firmado (§ paginación keyset) — **cerrado por specs/017 (2026-09-04)**

Ya no hay ningún punto abierto acá. Antes de specs/017, `transaction/application/queries/
transaction-cursor.ts` era `base64url("<ISO8601>|<id>")` sin MAC, sin secreto, sin versión — un `atob`
devolvía la PK en claro y cualquiera podía forjar un cursor arbitrario (sólo movía la ventana de la
página, no el tenant, ya que la query sigue scopeada por `userId`, pero la constitución decía "opaque"
y el código no lo era). Ahora:

- `encodeCursor`/`decodeCursor` (mismo archivo) producen y verifican
  `base64url("<versión>|<ISO8601>|<id>") + "." + base64url(HMAC-SHA256(secreto, ese payload))` — la
  versión viaja DENTRO del payload firmado, así que un intento de downgrade también lo cubre el MAC.
  Verificación con `crypto.timingSafeEqual` (tiempo constante). Cualquier MAC que no calce, versión no
  reconocida, o cursor sin exactamente un `.` → `INVALID_CURSOR` (mismo error de dominio de siempre,
  esta feature amplía qué lo dispara).
- Secreto nuevo **`CURSOR_SIGNING_SECRET`** (`apps/api/.env.example`, mismo patrón "change-me-…" que
  `JWT_ACCESS_SECRET`), leído vía `infra/config/cursor.config.ts`'s `getCursorSigningSecret` —
  `ListTransactionsQueryHandler` lo resuelve una vez con `ConfigService.getOrThrow` (falla rápido en
  el boot si falta, igual que los secretos JWT).
- Los cursores en vuelo se invalidan al desplegar — aceptable, viven un scroll (Decision 4 de
  `specs/017`).

Detalle completo: `specs/017-opaque-identifiers/{spec,plan,research,data-model}.md`.

### 6. Las claves de object storage derivan de ids (§ uploads) — **cerrado por specs/017 (2026-09-04)**

Ya no hay ningún punto abierto acá tampoco. Antes de specs/017, `attachment-policy.ts:48-63`
construía `u/<userId>/t/<transactionId>/<attachmentId>-<slug>`, y esa clave viajaba **verbatim dentro
de la URL prefirmada** que se le entrega al navegador (`s3-object-storage.adapter.ts:45-49`, TTL
300s) — el `userId` llegaba a la barra de direcciones, al header `Referer` y a cualquier caché
intermedia; era el único camino por el que un `userId` salía de la app fuera del JWT. Ahora:

- `storageKeyFor()` (mismo archivo, ya sin parámetros) devuelve un `randomUUID()` (v4) plano — sin
  prefijo, sin segmentos de ruta, sin relación con `userId`/`transactionId`/`attachmentId`/nombre de
  archivo. **Deliberadamente UUID v4 y no `generateRowId()`** (UUID v7, el estándar de specs/016 para
  el resto de las filas): v7 embebe un timestamp de 48 bits que filtraría la hora de subida, y el
  objetivo acá es que la clave no revele nada extraíble, ni siquiera eso — un `storageKey` es una
  llave de bucket opaca, no el identificador de una fila.
- `fileName` sigue en su propia columna, nunca se leyó desde la storage key (verificado antes de
  escribir la spec: sólo `RemoveAttachmentHandler`/`ListAttachmentsHandler` leen `storageKey`, ambos
  como llave de lookup opaca).
- **Sin migración de objetos**: las filas `TransactionAttachment` ya existentes conservan la clave
  vieja (sigue resolviendo contra lo que haya en el bucket local); sólo las subidas NUEVAS obtienen el
  formato opaco. `specs/010-movement-transfers-attachments/data-model.md:34-35`, que ratificaba el
  formato derivado, queda contradicho por esta enmienda — anotado ahí también.

Detalle completo: `specs/017-opaque-identifiers/{spec,plan,research,data-model}.md`.

### 7. Sin política de versionado de API (gap declarado, no violación)

La constitución **no tiene** cláusula de versionado de API HTTP, deprecación ni breaking change de
contrato. El prefijo `/api/v1` es una convención de nombre sin nada detrás: nada dice qué puede cambiar
dentro de `v1`, qué obliga a un `v2`, ni por cuánto tiempo se sirve una forma vieja.

No es urgente y por eso se dejó fuera de la enmienda: hay **cero consumidores externos** (una sola SPA
contra un único origen CORS, sin OpenAPI publicado, sin app móvil, sin integraciones). Queda registrado
para que sea una decisión postergada y no una que nadie vio.

**Para hacerlo real**: escribir la cláusula ANTES de que exista el primer consumidor externo. Los puntos
1, 2 y 6 de esta sección (ya cerrados) fueron cambios de contrato/formato interno; si aparece un
consumidor externo, cualquier cambio equivalente en el futuro debe resolver esto primero.
