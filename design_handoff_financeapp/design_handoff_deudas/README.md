# Handoff: vista Deudas (FinanceApp)

## Overview
Vista `Deudas` de FinanceApp: deudas persona-a-persona (te deben / debes), con
resumen de balance neto, filtros, tabla en desktop, lista en móvil y tres paneles
laterales (detalle, registrar abono, nueva/editar deuda).

Repo destino: `SimonSaezCorrea/FinanceApp`, rama `main`, subárbol `apps/web`.
Archivos existentes que se reemplazan/actualizan:
`src/domains/debts/routes/DebtsRoute.tsx`, `src/domains/debts/components/{DebtKpiStrip,DebtTable}.tsx`,
paneles en `src/shared/ui/overlay/{side-panel,chrome,form-surface}.tsx`.

## About the Design Files
`FinanceApp.dc.html` (incluido) es una **referencia de diseño en HTML**: un prototipo
interactivo del app completo, no código de producción. No copiar el HTML: **recrear**
la vista en React + TypeScript + Tailwind usando los primitivos ya existentes en
`src/shared/ui/*` y los tokens de `src/styles/index.css`.

Abrir el prototipo, ir a "Deudas" en el sidebar. Para ver el modo móvil (420×880),
usar el toggle de vista móvil del prototipo.

## Fidelity
**Alta fidelidad.** Colores, tipografía, espaciado y copy son finales y salieron de
los tokens del propio repo. Reproducir 1:1 con los componentes existentes.

## Screens / Views

### 1. Deudas (ruta `/deudas`)
Contenedor: `flex flex-col gap-6` (24px).

**a) Encabezado** — `flex items-start justify-between gap-4`, `mb-6`; en móvil pasa a columna.
- h1 "Deudas": 24px / line-height 32px / weight 600 / letter-spacing −0.025em.
- Subtítulo 14px `text-muted-foreground`: `"{n} deudas activas · {m} personas"` (m = personas únicas).
- Botón "Nueva deuda": alto 40px, padding 0 16px, radio 7.6px, `bg-accent`/`text-accent-foreground`,
  14px/500, icono lucide `plus` 16px, gap 8px. Abre el panel de formulario.

**b) Tarjeta de resumen** — `border border-border rounded-[9.6px] bg-card p-[22px_24px] flex flex-col gap-4`.
- Fila `flex items-end justify-between gap-6` con tres bloques (gap 3px):
  - "Debes" — label 12px muted; monto 22px/600, tabular-nums, `text-destructive`.
  - "Balance neto" (centrado) — monto 15px/600, verde si ≥ 0, rojo si < 0, con signo "−" (U+2212).
  - "Te deben" (derecha) — monto 22px/600, `text-success`.
- Barra apilada: alto 10px, `rounded-full`, fondo `--track`; segmento rojo = share de lo que debes,
  segmento verde = 100 − share.
- Pie `flex items-center justify-between gap-4` (columna en móvil): nota 12px muted
  `"{share}% de lo que circula es deuda tuya"`; chip `rounded-full bg-destructive/15 text-destructive`
  padding 3px 10px, 12px/500, icono `clock-alert` 12px, texto `"{monto} vencidos"`.

**c) Barra de filtros** — `flex flex-wrap items-center justify-between gap-3`.
- Segmented control: contenedor `border border-border rounded-[7.6px] bg-card p-[2px]`;
  botones radio 5.6px, padding 6px 12px, 14px. Activo: `bg-primary text-primary-foreground` weight 500;
  inactivo: transparente, `text-muted-foreground` weight 400.
  Opciones: Todas · Te deben · Debes · Vencidas.
- `<select>` 14px, radio 7.6px, `bg-card`, borde `--border`: Activas / Pagadas / Todas.
- Derecha: "Por vencimiento", 14px muted.

**d) Tabla (≥1280px / desktop)** — card `rounded-[9.6px] border bg-card overflow-hidden`,
shadow `0 1px 2px rgba(0,0,0,.28)`, scroll horizontal interno. Fuente 14px.
- `thead`: `bg-muted/50 text-muted-foreground`, celdas padding 8px 16px, weight 500,
  borde inferior 1px. Columnas: Persona · Avance · Tipo · Pendiente (derecha) · Vence · (acciones).
- `tbody tr`: borde inferior 1px, `cursor-pointer`, celdas padding 12px 16px. Fila vencida:
  fondo `destructive/0.05`.
  - **Persona**: avatar 32px circular con iniciales (máx 2), 12px/600,
    fondo `{tone}/0.2`, texto `{tone}`; nombre 14px/500; concepto 12px muted.
  - **Avance**: barra 96×6px `rounded-full` fondo `--track`, relleno `--primary` a `paid/count`;
    etiqueta 12px muted tabular: `"{paid}/{count}"`, o "Pagada" / "0/1" en pago único.
  - **Tipo**: badge `rounded-full` padding 2px 10px, 12px/500, fondo `{tone}/0.15`, texto `{tone}`;
    "Te deben" o "Debes".
  - **Pendiente**: monto 14px/500 tabular en `{tone}`, con "+" si te deben y "−" si debes;
    debajo 12px muted `"de {monto total}"`.
  - **Vence**: fecha (roja si vencida, muted si no) + nota 12px muted (`"en 11 días"`, `"hace 12 días"`, `"Sin plazo definido"`).
  - **Acciones**: tres icon-buttons 32×32, radio 7.6px, transparentes, `stopPropagation`:
    `plus-circle` ("Registrar abono", si count > 1) o `circle-check` ("Marcar como pagada");
    `pencil` ("Editar deuda"); `trash-2` en `text-destructive` ("Eliminar deuda" → diálogo de confirmación).

**e) Lista (móvil)** — card `rounded-[9.6px] border bg-card`, filas
`flex items-center gap-3 p-[12px_14px]`, borde inferior 1px y **borde izquierdo 2px** en `{tone}`.
Avatar 32px + nombre 15px/600 + meta 12px muted (`"{concepto} · {paid}/{count} cuotas"` o
`"{concepto} · Te deben|Debes"`), a la derecha monto 15px/500 en `{tone}` y nota de vencimiento 11px.
Toda la fila abre el detalle.

**f) Vacío** — `border rounded-[9.6px] bg-card p-[40px_24px] text-center flex flex-col items-center gap-2`:
icono `hand-coins` 22px muted, "No hay deudas con este filtro." (16px/500),
"Cambia el filtro o registra una nueva deuda." (14px muted).

### 2. Panel: Detalle de la deuda
Overlay `rgba(0,0,0,.55)` + `backdrop-filter: blur(8px)`; panel derecho
`width: min(680px, 100vw)`, `bg-card`, borde izquierdo 1px, columna flex.
- Eyebrow 11px/600 uppercase letter-spacing .1em `text-brand`: "Detalle de la deuda". Botón cerrar (X).
- Título = persona; descripción = `"{concepto} · Te deben|Debes"`.
- Filas de detalle (label muted / valor): Tipo, Monto total, Abonado, Pendiente,
  Cuotas (`"{paid} de {count}"` o "Pago único"), Vence (`"{fecha} · {nota}"`), Nota.
- Calendario de pagos: una fila por cuota con `"Abono i de n"` (o "Pago único"), fecha,
  monto `total/count` y badge de estado — Pagado (`success/0.15`), Próximo (`accent/0.15`),
  Pendiente (`bg-muted`, texto muted).
- Footer: primario "Registrar abono" (count > 1) o "Marcar como pagada" → abre el panel de abono;
  secundario "Editar" → panel de edición.

### 3. Panel: Registrar abono
Mismo shell. Muestra persona, `"Abono {paid+1} de {count} · {concepto}"` (o `"Pago único · {concepto}"`),
monto de la cuota, vencimiento (rojo si vencida), selector de cuenta de pago
(Cuenta Corriente Banco de Chile · Cuenta Vista BancoEstado · Prepago Mach · Efectivo),
y previsualización del avance después del abono (`"{paid+1}/{count}"`, % y pendiente restante).
Confirmar → toast "Abono registrado" / "Deuda marcada como pagada".

### 4. Panel: Nueva / Editar deuda
Formulario tipo hoja, sin cajas de input: campos como filas separadas por `border-top` 1px,
`margin-top 16px`, `padding-top 16px`, label 15px a la izquierda y valor 15px/600 a la derecha.
- Eyebrow: "Nueva deuda" / "Editar deuda".
- Concepto: input sin borde, 28px/600, placeholder "Concepto".
- Monto: input 32px/600 tabular (ancho 260px) + sufijo "CLP" 14px muted.
- Tipo (toggle al hacer click): "Me deben" ⇄ "Yo debo", con chevron.
- Persona: label dinámico "¿Quién te debe?" / "¿A quién le debes?"; input alineado a la derecha, placeholder "Nombre".
- Cuotas: stepper 28×28 (`minus` / `plus`, borde `--input`, radio 7.6px), mínimo 1.
- Primer vencimiento: fecha (dd/mm/aaaa), default 12/09/2026.
- Si cuotas > 1 aparecen: Periodicidad (ciclo Semanal → Quincenal → Mensual → Anual) y
  "Repetir cada {n} {unidad}" con stepper, unidad en singular/plural
  (semana(s), quincena(s), mes/meses, año(s)).
- Nota inferior: caja `border rounded-[9.6px] bg-background p-[14px_16px]`, icono
  `calendar-clock` 16px, texto 13px muted explicando la generación del calendario.
- Footer: "Crear" / "Guardar cambios" + Cancelar.

## Interactions & Behavior
- Fila (tabla o lista) → panel de detalle. Los icon-buttons no propagan el click.
- Filtro segmentado: estado local `debtDir` ∈ ALL | OWED_TO_YOU | YOU_OWE | OVERDUE.
  OVERDUE filtra por `overdue`, los otros por `dir`.
- Eliminar → diálogo de confirmación con el nombre de la persona; nunca borra directo.
- Transiciones: color/fondo 150ms; ancho del sidebar 300ms ease-in-out. Overlay con blur 8px.
- Responsive: `≥1280px` tabla; bajo eso lista móvil, encabezados en columna y sin aside de detalle.
- Acciones de éxito muestran toast: "Abono registrado", "Deuda marcada como pagada",
  "Deuda actualizada", "Deuda creada".

## State Management
Estado de la vista:
```ts
debtDir: "ALL" | "OWED_TO_YOU" | "YOU_OWE" | "OVERDUE"   // filtro
panel: { kind: "debt" | "debtPay" | "debtForm" | "debtEdit"; id?: string } | null
payAccount: string | null
confirm: { kind: "debt"; title: string } | null
// formulario (null = heredar de la deuda editada o default)
debtFormDir, debtFormPerson, debtFormCount, debtFormFreq, debtFormEvery
```

Modelo y fórmulas (exactas del prototipo):
```ts
type Debt = {
  id: string; person: string; concept: string;
  dir: "OWED_TO_YOU" | "YOU_OWE";
  amount: number; paid: number; count: number;      // paid = cuotas abonadas
  due: string; dueNote: string; overdue: boolean; note: string;
};

const left = (d: Debt) => Math.round(d.amount * (1 - d.paid / d.count));  // pendiente
const youOwe  = debts.filter(d => d.dir === "YOU_OWE").reduce((n, d) => n + left(d), 0);
const owedYou = debts.filter(d => d.dir === "OWED_TO_YOU").reduce((n, d) => n + left(d), 0);
const net = owedYou - youOwe;
const oweShare = youOwe + owedYou ? Math.round((youOwe / (youOwe + owedYou)) * 100) : 0;
const overdueSum = debts.filter(d => d.overdue).reduce((n, d) => n + left(d), 0);
const pct = Math.round((d.paid / d.count) * 100);
const tone = d.dir === "OWED_TO_YOU" ? "success" : "destructive";
```
Formato CLP: separador de miles con punto, sin decimales, prefijo `$` (`$120.000`).
Signo negativo tipográfico `−` (U+2212), no guion. Todos los montos con `tabular-nums`.

Datos de ejemplo usados en el prototipo (útiles como fixtures):
```ts
[
  { id:"d1", person:"Camila Rojas",  concept:"Cumpleaños compartido", dir:"OWED_TO_YOU", amount:45000,  paid:0, count:1, due:"12 sep 2026", dueNote:"en 11 días",         overdue:false, note:"Regalo compartido; acordado por transferencia." },
  { id:"d2", person:"Diego Fuentes", concept:"Arriendo cabaña",       dir:"OWED_TO_YOU", amount:120000, paid:1, count:3, due:"30 sep 2026", dueNote:"en 29 días",         overdue:false, note:"Se paga en tres partes iguales." },
  { id:"d3", person:"Mamá",          concept:"Préstamo notebook",     dir:"YOU_OWE",     amount:300000, paid:2, count:6, due:"20 ago 2026", dueNote:"hace 12 días",       overdue:true,  note:"Sin interés. Abono mensual." },
  { id:"d4", person:"Javier Soto",   concept:"Entradas concierto",    dir:"YOU_OWE",     amount:58000,  paid:0, count:1, due:"Sin fecha",   dueNote:"Sin plazo definido", overdue:false, note:"Pendiente de acordar fecha." },
]
```

## Design Tokens
Usar los tokens HSL ya definidos en `src/styles/index.css` — no hardcodear hex.
Los relevantes para esta vista (tema oscuro / claro):

| Token | Oscuro | Claro |
| --- | --- | --- |
| `--card` | 190 38% 9% | 0 0% 100% |
| `--background` | 194 37% 7% | 195 22% 96% |
| `--foreground` | 180 16% 92% | 191 21% 10% |
| `--muted-foreground` | 185 11% 59% | 191 13% 42% |
| `--border` | 192 25% 16% | 190 22% 84% |
| `--input` | 192 24% 21% | 190 22% 80% |
| `--primary` | 187 30% 54% | 184 52% 33% |
| `--accent` | 27 87% 67% | 12 76% 58% |
| `--success` | 153 44% 49% | 152 42% 38% |
| `--destructive` | 0 58% 71% | 0 62% 50% |
| `--brand` | 183 86% 19% | 184 52% 33% |
| `--track` | 195 26% 18% | 192 20% 89% |
| `--muted` | 195 26% 18% | 190 30% 96% |

Radios: 7.6px (botones, chips de filtro, icon-buttons), 9.6px (cards, paneles), 5.6px
(botón interno del segmented), `9999px` (avatares, badges, barras).
Tipografía: **Geist**; escala usada 11 / 12 / 13 / 14 / 15 / 16 / 22 / 24 / 28 / 32px.
Espaciado: múltiplos de 4 — gaps 3 / 4 / 8 / 12 / 16 / 24, padding de card 22px 24px,
celdas 12px 16px, filas móviles 12px 14px.
Sombras: card `0 1px 2px rgba(0,0,0,.28)`; panel lateral `-24px 0 60px rgba(0,0,0,.45)`.

## Assets
Solo iconos **Lucide** (ya en el repo): `plus`, `clock-alert`, `plus-circle`, `circle-check`,
`pencil`, `trash-2`, `hand-coins`, `chevron-down`, `minus`, `calendar-clock`, `x`.
Sin imágenes ni logos.

## Files
- `FinanceApp.dc.html` — prototipo completo, interactivo (vista Deudas + los tres paneles).
- `support.js` — runtime del prototipo; necesario para abrirlo.
- `PROMPT.md` — prompt listo para pegar en Claude Code.
