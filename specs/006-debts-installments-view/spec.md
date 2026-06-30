# Feature Specification: Rediseño de Vistas Cuotas y Deudas

**Feature Branch**: `006-debts-installments-view`

**Created**: 2026-06-29

**Status**: Draft

---

## Overview

El usuario necesita dos pantallas rediseñadas — **Deudas** y **Cuotas** — que coincidan con el handoff de diseño (secciones 7 y 6 respectivamente) y que queden en rutas y nav items separados, como corresponde a conceptos de negocio distintos.

**Deudas**: gestión de dinero que el usuario le debe a otras personas o que le deben a él. Novedad: una deuda ahora puede pagarse en cuotas (el modelo se extiende con tres campos opcionales). Una deuda de cuotas = 1 es el caso de pago único.

**Cuotas**: gestión de planes de cuotas comerciales (compras a crédito pagadas en parcialidades). El modelo `InstallmentPlan` + `InstallmentPayment` ya existe; solo se rediseña la vista.

Ambas vistas son independientes entre sí y se implementan en el mismo ciclo por afinidad de dominio.

---

## User Scenarios & Testing

### User Story 1 — Ver y operar deudas (P1)

El usuario abre la vista **Deudas** y ve un resumen de cuánto le deben y cuánto debe (KPIs por moneda), con tarjetas de cada deuda agrupadas en dos columnas.

**Por qué P1**: núcleo de la vista Deudas; sin ella el resto carece de contexto.

**Independent Test**: Con al menos dos deudas seeded (una `OWED_TO_YOU`, una `YOU_OWE`) → ambas aparecen en su columna correcta y los KPIs suman correctamente.

**Acceptance Scenarios**:

1. **Given** el usuario tiene deudas activas, **When** navega a Deudas, **Then** ve KPI strip con "Te deben" / "Debes" / "Balance neto" y dos columnas con tarjetas por dirección.
2. **Given** una deuda tiene `totalInstallments > 1`, **When** se renderiza la tarjeta, **Then** muestra barra de progreso "N/M pagadas · $X restante".
3. **Given** una deuda tiene `totalInstallments = 1`, **When** se renderiza la tarjeta, **Then** muestra monto total y vencimiento (si existe), sin barra de progreso.
4. **Given** no hay deudas, **When** carga la vista, **Then** muestra estado vacío con mensaje de invitación y botón "Nueva deuda".

---

### User Story 2 — Crear una nueva deuda con configuración de cuotas (P2)

El usuario registra una deuda nueva — simple o en cuotas — a través de un modal.

**Por qué P2**: sin creación no hay datos; precede a las acciones de pago.

**Independent Test**: Clic "Nueva deuda" → completar campos mínimos → guardar → deuda aparece en lista sin recargar.

**Acceptance Scenarios**:

1. **Given** el usuario hace clic en "Nueva deuda", **When** completa dirección, contraparte, monto, moneda y confirma, **Then** la deuda aparece en la columna correcta.
2. **Given** el usuario activa cuotas e ingresa 6 cuotas, **When** guarda, **Then** la tarjeta muestra "0/6 pagadas".
3. **Given** el formulario está incompleto (falta contraparte o monto), **When** intenta guardar, **Then** el botón está deshabilitado.

---

### User Story 3 — Registrar pago / marcar deuda saldada (P3)

El usuario marca una cuota pagada o liquida una deuda de pago único.

**Por qué P3**: el ciclo de vida de una deuda requiere actualizar el progreso de pagos.

**Independent Test**: Deuda con `totalInstallments=3, paidInstallments=1` → clic "Registrar pago" → tarjeta muestra "2/3 pagadas".

**Acceptance Scenarios**:

1. **Given** una deuda con `totalInstallments = 1`, **When** clic "Marcar pagada", **Then** la deuda desaparece de la lista activa y los KPIs actualizan.
2. **Given** una deuda con cuotas pendientes, **When** clic "Registrar pago", **Then** `paidInstallments` incrementa en 1, la barra avanza y el monto restante recalcula.
3. **Given** una deuda cuyo último pago acaba de registrarse (`paidInstallments = totalInstallments`), **Then** se marca automáticamente como saldada (`settledAt` ≠ null) y desaparece de la lista activa.

---

### User Story 4 — Ver planes de cuotas comerciales (P4)

El usuario abre la vista **Cuotas** y ve sus planes activos con tarjetas y un calendario de pagos seleccionable.

**Por qué P4**: vista independiente para planes de cuotas comerciales (concepto distinto al de deudas).

**Independent Test**: Con al menos un `InstallmentPlan` seeded → aparece como tarjeta; al seleccionarlo → calendario de pagos visible.

**Acceptance Scenarios**:

1. **Given** hay planes activos, **When** el usuario navega a Cuotas, **Then** cada plan muestra: título, N cuotas, total, progreso (n/total pagadas), cuota mensual, chip "Próximo: fecha".
2. **Given** el usuario selecciona un plan, **When** se muestra el calendario, **Then** aparece tabla con columnas: #, Fecha, Monto, Estado (Pagada / Próxima / Pendiente).
3. **Given** no hay planes, **When** carga la vista, **Then** muestra estado vacío con botón "Nuevo plan".

---

### User Story 5 — Crear un nuevo plan de cuotas (P5)

El usuario crea un plan de cuotas comercial a través de un modal.

**Por qué P5**: completa el ciclo CRUD de la vista Cuotas.

**Independent Test**: Clic "Nuevo plan" → completar título, cuotas, monto total, fecha inicio → guardar → plan aparece con calendario generado.

**Acceptance Scenarios**:

1. **Given** el usuario completa los campos requeridos y confirma, **Then** el plan aparece con su calendario de 12 pagos con fechas mensuales correctas.
2. **Given** algún `InstallmentPayment.paidAt` está marcado, **When** se muestra el calendario, **Then** ese pago aparece como "Pagada".

---

### Edge Cases

- Número de cuotas ≤ 0 en formulario de deuda → validación impide guardar.
- `installmentAmount` mayor que `principal` → se guarda tal cual (puede reflejar recargos); no es error de negocio.
- Deudas en múltiples monedas → KPIs separados por moneda; sin conversión implícita.
- "Registrar pago" cuando `paidInstallments = totalInstallments` → botón no aparece o está deshabilitado.
- API error en cualquier vista → `<ErrorState>` con opción de reintentar.
- El plan de cuotas tiene 0 pagos registrados como pagados → progreso muestra "0/N pagadas", estado "Próxima" solo en el primer pago.

---

## Functional Requirements

### Vista Deudas (`/debts`)

- **FR-010**: KPI strip: "Te deben" (suma `OWED_TO_YOU` no saldadas), "Debes" (suma `YOU_OWE` no saldadas), "Balance neto". Si hay múltiples monedas, grupos separados.
- **FR-011**: Dos columnas de tarjetas: "Te deben" y "Debes".
- **FR-012**: Tarjeta de deuda: avatar con inicial del contraparte, nombre, monto total, moneda, vencimiento (si existe).
- **FR-013**: Si `totalInstallments > 1`: barra de progreso "N/M pagadas · $X restante". El monto restante = `(totalInstallments - paidInstallments) × installmentAmount`; si `installmentAmount` es null, se usa `principal / totalInstallments`.
- **FR-014**: Botón "Marcar pagada" solo para deudas con `totalInstallments = 1` y no saldadas.
- **FR-015**: Botón "Registrar pago" solo para deudas con `totalInstallments > 1` y `paidInstallments < totalInstallments`.
- **FR-016**: Cuando "Registrar pago" lleva `paidInstallments` al valor de `totalInstallments`, el sistema marca automáticamente `settledAt = now()`.
- **FR-017**: Deudas con `settledAt ≠ null` no aparecen en la lista (ocultas por defecto; no hay toggle de historial en este scope).
- **FR-018**: Botón "Nueva deuda" → abre modal.
- **FR-019**: Loading / empty / error states con `<shared/ui/states>`.

### Modal Nueva Deuda

- **FR-020**: Campos: dirección (Te deben / Debes), contraparte (texto), monto, moneda, fecha apertura, vencimiento (opcional), número de cuotas (entero ≥ 1, default 1), monto por cuota (opcional, visible solo si cuotas > 1), notas (opcional).
- **FR-021**: Al guardar: toast de confirmación, cierre del modal, lista refresca.

### Vista Cuotas (`/installments`)

- **FR-030**: Tarjetas de plan: título, número de cuotas, total, progreso (pagadas/total), cuota mensual estimada (`totalPrincipal / installmentCount`), chip "Próximo: fecha" (siguiente `InstallmentPayment` no pagado).
- **FR-031**: Al seleccionar un plan, muestra debajo (accordion o sección expandible) el calendario de pagos: tabla con #, Fecha, Monto, Estado (Pagada / Próxima / Pendiente).
- **FR-032**: Solo el próximo pago pendiente tiene estado "Próxima"; el resto no pagados son "Pendiente".
- **FR-033**: Botón "Nuevo plan" → abre modal de creación.
- **FR-034**: Loading / empty / error states con `<shared/ui/states>`.

### Modal Nuevo Plan

- **FR-040**: Campos: título, número de cuotas, monto total, fecha inicio, moneda, notas (opcional).
- **FR-041**: Al guardar, se generan automáticamente los `InstallmentPayment` con fechas mensuales desde la fecha inicio.

### Transversal

- **FR-050**: i18n completo: todas las cadenas en `es.json` y `en.json` con claves idénticas.
- **FR-051**: Tokens de diseño únicamente; sin colores hardcodeados.

---

## Success Criteria

- **SC-001**: El usuario registra una deuda con 6 cuotas, marca 3 como pagadas y ve "3/6 pagadas · $X restante" — en la misma sesión sin recargar.
- **SC-002**: Los KPI totales de Deudas actualizan en < 1 segundo tras registrar un pago.
- **SC-003**: Ambas vistas cargan en menos de 2 segundos en conexión normal.
- **SC-004**: El flujo "Nueva deuda" (con cuotas) se completa en menos de 60 segundos con datos reales.
- **SC-005**: Deudas en CLP y USD aparecen en grupos separados en el KPI strip; sin conversión implícita.
- **SC-006**: Al crear un plan de 12 cuotas, el calendario muestra exactamente 12 filas con fechas mensuales correctas.

---

## Key Entities

| Entidad              | Campo               | Tipo               | Regla                                                               |
| -------------------- | ------------------- | ------------------ | ------------------------------------------------------------------- |
| `Debt`               | `totalInstallments` | Int, default 1     | ≥ 1                                                                 |
| `Debt`               | `paidInstallments`  | Int, default 0     | 0 ≤ paidInstallments ≤ totalInstallments                            |
| `Debt`               | `installmentAmount` | Decimal?, nullable | Si null → calcular como `principal / totalInstallments` en frontend |
| `InstallmentPlan`    | (sin cambios)       | —                  | Ya existe                                                           |
| `InstallmentPayment` | (sin cambios)       | —                  | Ya existe                                                           |

---

## Assumptions

- Las rutas `/debts` e `/installments` permanecen separadas; el nav sidebar mantiene dos ítems independientes.
- "Registrar pago" incrementa `paidInstallments` en 1 y no genera un `Transaction` en movimientos (mejora futura).
- El calendario de pagos de `InstallmentPlan` es solo lectura en este scope (no se pueden marcar cuotas individuales como pagadas desde aquí).
- El modal de Nuevo Plan puede reutilizar lógica existente si hay modal previo; si no, se crea desde cero (decisión en plan).
- Las tarjetas de plan en la vista Cuotas muestran solo planes activos (sin `settledAt` o equivalente en `InstallmentPlan`).

---

## Clarifications

### Session 2026-06-29

- Q: ¿Vista única con tabs o vistas separadas? → A: Vistas separadas — `/debts` e `/installments` con nav items independientes.
- Q: ¿Auto-settle al registrar último pago de deuda? → A: Sí — cuando `paidInstallments = totalInstallments`, `settledAt` se setea automáticamente en el backend.
- Q: ¿El calendario de cuotas de InstallmentPlan permite marcar pagos? → A: No en este scope; solo lectura.
