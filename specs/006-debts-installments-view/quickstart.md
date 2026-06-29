# Quickstart: Validación de Cuotas y Deudas

## Prerrequisitos

```bash
pnpm dev          # API en :3000, web en :5173
pnpm db:seed      # opcional: datos de ejemplo
```

## Validación — Vista Deudas

### 1. Ver deudas y KPIs

1. Inicia sesión con `demo@finance.local / demo1234`
2. Navega a "Deudas" en el sidebar
3. **Esperado**: KPI strip con "Te deben" / "Debes" / "Balance neto"
4. **Esperado**: Dos columnas de tarjetas separadas por dirección

### 2. Crear deuda simple (1 cuota)

1. Clic "Nueva deuda"
2. Dirección: "Debes", Contraparte: "Ana García", Monto: 50000, Moneda: CLP
3. Cuotas: 1 (default)
4. Confirmar
5. **Esperado**: Toast "Deuda creada", tarjeta aparece en columna "Debes" con botón "Marcar pagada"
6. **Esperado**: KPI "Debes" incrementa en $50.000

### 3. Crear deuda con cuotas

1. Clic "Nueva deuda"
2. Dirección: "Te deben", Contraparte: "Luis M.", Monto: 180000, Moneda: CLP
3. Cuotas: 6, Monto por cuota: 30000
4. Confirmar
5. **Esperado**: Tarjeta en "Te deben" con barra "0/6 pagadas · $180.000 restante"

### 4. Registrar pago de cuota

1. En la tarjeta anterior, clic "Registrar pago"
2. **Esperado**: Barra muestra "1/6 pagadas · $150.000 restante"
3. Registrar 5 pagos más
4. **Esperado**: Al registrar el 6.° pago, la tarjeta desaparece de la lista (deuda saldada)

### 5. Marcar deuda simple como pagada

1. En la tarjeta de "Debes" (Ana García), clic "Marcar pagada"
2. **Esperado**: Tarjeta desaparece, KPI "Debes" actualiza

---

## Validación — Vista Cuotas

### 6. Ver planes de cuotas

1. Navega a "Cuotas" en el sidebar
2. **Esperado**: Tarjetas de planes con título, progreso, cuota mensual y chip de próximo vencimiento

### 7. Expandir calendario de pagos

1. Clic en una tarjeta de plan
2. **Esperado**: Tabla de pagos con columnas #, Fecha, Monto, Estado
3. **Esperado**: Solo el próximo pago pendiente tiene estado "Próxima"; los demás sin pagar son "Pendiente"

### 8. Crear un nuevo plan

1. Clic "Nuevo plan"
2. Título: "Laptop Samsung", Cuotas: 12, Total: 960000, Moneda: CLP, Fecha inicio: hoy
3. Confirmar
4. **Esperado**: Plan aparece con 12 cuotas, primera cuota como "Próxima"

---

## Checks de calidad

```bash
pnpm --filter @finance/contracts typecheck   # contratos tipados
pnpm --filter @finance/web typecheck         # sin errores TS
pnpm --filter @finance/api typecheck         # backend limpio
pnpm check:boundaries                        # sin violaciones de deps
pnpm test --filter @finance/web             # tests pasan
```
