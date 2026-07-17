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
