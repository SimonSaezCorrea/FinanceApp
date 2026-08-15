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

### 1. Fecha de pago de la facturación (`paymentDueDay`)

No existe ningún campo funcional ni lógica para "cuándo corresponde pagar" la facturación (distinto
de `billingCycleDay`, que ahora sí es real: dispara el CIERRE de la facturación abierta, ver más
abajo — pero no define ninguna fecha de vencimiento para el pago en sí). El formato del dato sigue
sin definirse (¿día fijo del mes? ¿offset desde el cierre?) — por eso se **bloqueó la opción
`AUTOMATIC`** en la UI: no tiene sentido dejar elegir "pago automático" sin saber todavía a qué
fecha se engancharía. `BillingSettings.paymentDueDay` existe como columna nullable en el schema
(reservada para cuando esto se defina), pero ninguna UI la escribe ni la muestra todavía — la opción
"Automático" es un botón `disabled` de verdad (atributo nativo, sin ningún manejador de click), no
reacciona de ninguna forma al clickearla.

### 2. `paymentMethod: AUTOMATIC` — bloqueado en la UI, sin efecto funcional

`BillingSettings.paymentMethod` (`MANUAL` por defecto, o `AUTOMATIC`) vive en la tabla separada
`BillingSettings`. La opción "Automático" está **deshabilitada** en el control Segmented tanto en
`AccountForm` como en `BillingSettingsModal` (`shared/ui/segmented.tsx` soporta `disabled`/
`disabledReason` por opción) — no se puede seleccionar hasta que el punto 1 se resuelva. Aun si se
forzara por API, no dispara ningún pago automático: la generación automática (cron, ver más abajo)
solo CIERRA una facturación, nunca la paga — pagar siempre requiere elegir manualmente una cuenta
bancaria vía `POST /accounts/:id/credit-statements/:statementId/pay`.

**Para hacerlo real**: definir el formato de `paymentDueDay` (punto 1), habilitar la opción en el
Segmented, y agregar lógica que, al llegar esa fecha, pague automáticamente eligiendo alguna cuenta
por defecto para las facturaciones con `paymentMethod: AUTOMATIC`.

### 3. Generación automática de facturación — cron diario + botón manual

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

### 4. "Saldo tras el movimiento" con cobertura parcial

La fila **Saldo tras el movimiento** del panel de detalle se calcula en el cliente (no hay endpoint de
saldo histórico por movimiento) y **muestra "—"** — nunca un número aproximado — cuando no puede
sostenerse: si la cuenta no lleva saldo (`CREDIT_LINE`), si hay un filtro de fecha activo (un rango
recortado esconde movimientos posteriores que sí afectan el saldo), o si la lista mezcla cuentas (la
vista de Movimientos), donde los deltas de esta cuenta quedan detrás de filas de otras.

**Para hacerlo real**: un `runningBalance` por fila devuelto por el API (calculado en Postgres con una
ventana sobre `occurredAt`), que además sobreviviría a cualquier filtro.

### 5. Traspasos y agregados de terceros

La exclusión de traspasos de los agregados de ingreso/gasto está centralizada en el predicado
`EXCLUDE_TRANSFERS` (API, `transaction/application/queries/transaction-list-filter.ts`) y en
`excludeTransfers` (web, `domains/dashboard/lib/metrics.ts`). **Cualquier agregado nuevo de
ingreso/gasto debe aplicarlo**: al no cambiar el enum `TransactionType`, ninguna suma lo excluye por sí
sola.
