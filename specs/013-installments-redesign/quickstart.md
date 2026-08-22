# Phase 1 — Quickstart: validar la vista Cuotas

**Feature**: [spec.md](./spec.md) | **Contract**: [contracts/installments.md](./contracts/installments.md)

Guía para comprobar que la feature funciona de punta a punta. No contiene implementación.

## Prerrequisitos

```bash
pnpm install
pnpm --filter @finance/api exec prisma generate
docker compose up -d            # Postgres, sólo si no está arriba
pnpm db:push                    # añade las 5 columnas nuevas (no hay carpeta de migraciones)
pnpm db:seed                    # datos de desarrollo, incluidos los casos de abajo
pnpm dev                        # API + web
```

Login de desarrollo: `test@finance.local` / `demo1234`. La vista está en `/installments`.

El seed debe dejar preparados, como mínimo:

- un plan **con tarjeta de crédito** (no genera movimiento al pagar),
- un plan **con cuenta de pago** y alguna cuota pagada con gasto real,
- un plan con un **pago corto** que ya arrastró faltante a la cuota siguiente,
- un plan **completado** (para el filtro Pagados),
- un plan con **cuota vencida** (para el indicador en alerta).

## Verificación automatizada

```bash
# Aritmética del arrastre, estado del plan, invariantes del agregado. Sin base de datos.
pnpm --filter @finance/api test:unit -- installment

# Atomicidad: pago y deshacer contra una base real, incluido el rollback.
pnpm --filter @finance/api test:integration -- installment

# Flujo HTTP completo por el controlador.
pnpm --filter @finance/api test:e2e -- installment

# Vista, previsualización y paridad es/en.
pnpm --filter @finance/web test -- installments
pnpm --filter @finance/web test -- i18n

# Puertas del repo
pnpm typecheck && pnpm check:boundaries
```

## Escenarios manuales

Cada uno cita el criterio de la spec que demuestra.

### 1. La lista responde sin abrir nada — SC-001, SC-002

Abrir `/installments`. Debe haber **una fila por plan** (no una por cuota). Contrastar los cuatro
indicadores con las filas: cuota de este mes, pendiente total, próxima cuota y planes activos. El
plan completado no cuenta como activo. Con planes en dos monedas, cada moneda se totaliza aparte.

### 2. El detalle no mueve la lista — SC-009

Desplazar la lista hacia abajo, abrir un plan, cerrarlo. La lista debe quedar **en la misma posición
y el mismo orden**, sin recargar. El panel entra desde la derecha; nunca es un modal centrado.

### 3. La previsualización dice la verdad — SC-003

Crear un plan con un monto que **no** divida exacto (p. ej. 499.000 en 12 cuotas). Anotar el monto
por cuota, la última cuota ajustada y las dos fechas que muestra la previsualización. Guardar, abrir
el detalle y comparar **cuota por cuota**. Deben coincidir hasta el último peso.

### 4. Pagar mueve plata de verdad — SC-004

En un plan con cuenta de pago, anotar el saldo de esa cuenta. Pagar la siguiente cuota sin cambiar
nada. Verificar: la cuota queda pagada; en Movimientos de esa cuenta aparece un gasto por ese monto
y esa fecha; el saldo bajó exactamente ese importe. Deshacer y comprobar que **las tres cosas** se
revierten.

### 5. El arrastre — SC-006

En una cuota de 41.583, pagar 30.000. Comprobar: la cuota queda saldada por 30.000; la **siguiente
cuota impaga** muestra 11.583 de arrastre, por separado de su monto programado; ninguna otra cuota
cambió de monto ni de fecha; el total adeudado del plan es el mismo que antes del pago. Deshacer y
verificar que el arrastre desaparece.

Repetir pagando **de más** (50.000): la siguiente cuota debe reducirse en 8.417.

### 6. La última cuota no tiene a dónde arrastrar — FR-023

Pagar de menos la **última** cuota impaga. Debe quedar parcialmente pagada, seguir siendo pagable
por el remanente, y el plan seguir contando como activo.

### 7. La tarjeta de crédito no se paga dos veces — SC-005

En el plan con tarjeta de crédito: el detalle explica por qué no se genera movimiento; pagar una
cuota **no** abre formulario de cuenta; tras pagar, ninguna cuenta cambió de saldo y no hay
movimiento nuevo. Editar ese plan no ofrece cuenta de pago.

### 8. Editar muestra lo inmutable — FR-048

Abrir la edición de un plan con cuotas pagadas. Monto total, número de cuotas y fecha de primera
cuota deben **verse** con sus valores, en sólo lectura, con la razón y la salida (eliminar y
recrear). Cambiar el título y guardar no debe alterar el calendario ni los pagos.

### 9. Cambiar la cuenta de pago no reescribe el pasado — SC-007

En un plan con pagos ya registrados, cambiar la cuenta de pago. Ningún gasto existente cambia de
cuenta ni de monto; ningún saldo se mueve. Sólo el **siguiente** formulario de pago viene prellenado
con la cuenta nueva.

### 10. Mismo ícono en Cuotas y Movimientos — SC-011

Poner a un plan una categoría que también use algún movimiento. Ambos deben mostrar el **mismo**
ícono. Poner una categoría inventada: ícono neutro, nunca uno equivocado.

### 11. Moneda distinta — FR-029

Plan en USD, cuenta de pago en CLP. El formulario muestra el monto adeudado en USD y pide **por
separado** el monto en CLP, sin proponer conversión. Tras confirmar, el gasto queda en CLP y lo
abonado a la cuota es la cifra en USD.

### 12. Los tres formatos — SC-008

Recorrer ver → abrir → pagar → crear → editar a **1440**, **834** y **390** px. En 390 el detalle, el
crear y el editar ocupan la pantalla completa con la acción principal fijada al pie. En ningún ancho
debe haber desplazamiento horizontal. Probar además a 1280 con la barra lateral expandida y
colapsada: la lista debe decidir su forma por su **propio** ancho, no por el de la ventana.

### 13. Rechazos — FR-026, INV-C2, INV-C3

Pagar desde una cuenta prepago sin saldo suficiente: se rechaza con motivo claro y la cuota **no**
queda marcada. Pagar cero: rechazado. Confirmar dos veces rápido el mismo pago: **un solo** gasto.
