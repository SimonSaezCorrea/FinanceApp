# Handoff: vista Recurrentes (FinanceApp)

## Overview
Vista `Recurrentes` de FinanceApp: gastos e ingresos que se repiten (arriendo, suscripciones,
seguros). Muestra el total comprometido al mes, un desglose por categoría, las series agrupadas
por periodicidad, un grupo separado para las pausadas, y tres overlays: detalle de la serie con
historial de ocurrencias, formulario nuevo/editar, y modal de pausa/reactivación con fecha.

Repo destino: `SimonSaezCorrea/FinanceApp`, rama `main`, subárbol `apps/web`.
Archivos existentes que se reemplazan/actualizan:
`src/domains/recurring/routes/RecurringRoute.tsx`, componentes en
`src/domains/recurring/components/`, overlays en `src/shared/ui/overlay/{side-panel,chrome,form-surface}.tsx`.

## About the Design Files
`FinanceApp.dc.html` (incluido) es una **referencia de diseño en HTML**: prototipo interactivo
del app completo, no código de producción. No copiar el HTML: **recrear** la vista en
React + TypeScript + Tailwind con los primitivos de `src/shared/ui/*` y los tokens de
`src/styles/index.css`.

Abrir el prototipo y elegir "Recurrentes" en el sidebar. El modo móvil (420×880) se activa con
el toggle de vista móvil del prototipo.

## Fidelity
**Alta fidelidad.** Medidas, colores, tipografía y copy son finales. Reproducir 1:1.

## Screens / Views

### 1. Recurrentes (ruta `/recurrentes`)
Contenedor: `flex flex-col gap-6` (24px).

**a) Encabezado** — `flex items-start justify-between gap-4`; en móvil pasa a columna.
- h1 "Recurrentes": 24px / line-height 32px / weight 600 / letter-spacing −0.025em.
- Subtítulo 14px muted, `margin-top: 4px`:
  `"{nActivos} activos · {nPausados} pausado(s) · {total} al mes"`.
- Botón "Nuevo recurrente": alto 40px, padding 0 16px, radio 7.6px, `bg-accent` /
  `text-accent-foreground`, 14px/500, icono lucide `plus` 16px, gap 8px.

**b) Tarjeta de total** — `border rounded-[9.6px] bg-card p-[22px_24px] flex flex-wrap items-center justify-between gap-6`.
- Izquierda (`flex-col gap-1`): label "Comprometido al mes" 12px muted; monto **38px/600**,
  letter-spacing −0.03em, `tabular-nums`.
- Derecha (`flex-1 min-w-[280px] flex-col gap-2`):
  - Barra apilada por categoría: alto 10px, `rounded-full`, fondo `--track`, segmentos con
    `width: {share}%` y color rotativo.
  - Leyenda `flex flex-wrap gap-4`, 12px muted: cuadrito 8×8 `rounded-[2px]` del color +
    `"{categoría} {monto}"`.
- Máximo **4 categorías**, ordenadas por monto mensual descendente.
- Paleta de categorías, en orden: `--primary`, `--info`, `--warning`, `--accent`, `--success`.

**c) Franja de generación automática** — `flex items-center justify-between gap-4 border rounded-[9.6px] bg-card p-[12px_18px]`,
13px muted; en móvil pasa a columna.
- Izquierda: icono `zap` 15px en `text-success` + "Los movimientos se generan automáticamente en cada vencimiento."
- Derecha: `"Último movimiento generado: {label} · {fecha}"` (se oculta si no hay ninguno).

**d) Grupos por periodicidad** — un bloque `flex flex-col gap-2` por frecuencia con items,
en orden fijo **Diarios → Semanales → Mensuales → Anuales**, y al final **Pausados**.
- Cabecera del grupo: `flex items-baseline justify-between gap-4`.
  Título 13px/600 uppercase letter-spacing .06em muted; meta 13px muted:
  `"{n} activo(s) · {suma} al mes"`, o `"{n} · no genera movimientos"` en Pausados.
- Card del grupo: `overflow-hidden border rounded-[9.6px] bg-card`, shadow `0 1px 2px rgba(0,0,0,.28)`.
  El grupo Pausados va con `opacity: 0.55`.
- **Fila** (`flex items-center gap-[14px] p-[12px_16px]`, borde inferior 1px, `cursor-pointer`;
  borde izquierdo 2px: `--warning` si está vencida y activa, transparente si no):
  - Chip 32px circular `bg-[--chip] text-muted-foreground` con el icono lucide de la serie.
  - Bloque central (`flex-1 min-w-0`): nombre 15px/500 truncado; meta 12px truncada, color
    `--warning` si vencida y activa, muted si no:
    - activa: `"{fecha sin año} · {nota} · {cuenta}"` — p. ej. "3 sep · en 2 días · Cta. Corriente"
    - vencida: `"Venció {fecha sin año} · sin movimiento"`
    - pausada: `"{Periodicidad} · pausado desde {fecha}"` (o solo "pausado")
  - Monto: ancho fijo 104px, alineado a la derecha, 15px/500 `tabular-nums`.
  - Acciones (3 icon-buttons 30×30, radio 7.6px, transparentes, `stopPropagation`):
    `pause`/`play` ("Pausar"/"Reactivar" → abre el modal de pausa), `pencil` ("Editar recurrente"),
    `trash-2` en `text-destructive` ("Eliminar recurrente" → diálogo de confirmación).
    **Ocultas en móvil**; la fila completa abre el detalle.
- En móvil las filas usan `gap: 10px`, `padding: 12px 14px` y el monto pierde el ancho fijo.

### 2. Panel: Detalle del recurrente
Overlay `rgba(0,0,0,.55)` + `backdrop-filter: blur(8px)`; panel derecho
`width: min(680px, 100vw)`, `bg-card`, borde izquierdo 1px, shadow `-24px 0 60px rgba(0,0,0,.45)`.
- Encabezado: eyebrow 11px/600 uppercase letter-spacing .1em `text-brand`, botón cerrar (`x`).
- Título = nombre; subtítulo = `"{Periodicidad}[ · cada {n} {unidad}] · {categoría}"`.
- Badge de estado: "Activo" (`success/0.15` sobre `text-success`) o "Pausado"
  (`bg-muted`, texto muted).
- Tres stats: **Monto** (valor nominal), **Al mes** (normalizado), y **Próxima** —o
  **Pausado desde** si está pausada, en muted.
- Filas de detalle (label muted / valor): Categoría · Periodicidad · Cuenta asociada ·
  Primera ocurrencia · Generación ("Automática en cada vencimiento" o
  "Suspendida desde {fecha}") · Notas ("Sin notas" si vacío).
- Historial de ocurrencias: hasta **4** movimientos ya generados, del más reciente hacia atrás
  según `freq`/`interval`. Cada uno: fecha, nota `"Movimiento generado automáticamente · {cuenta}"`,
  monto y badge "Generado" (`success/0.15`). El más reciente lleva fondo `success/0.05`.
  Si no hay historial, mostrar el estado vacío en lugar de la lista.
- Footer `flex items-center justify-between gap-3`, borde superior: "Eliminar" a la izquierda
  (borde `--input`, texto `--destructive`, alto 44px); a la derecha "Pausar"/"Reactivar"
  (secundario) y "Editar" (`accent/0.85`, 15px/600, alto 44px).

### 3. Panel: Nuevo / Editar recurrente
Mismo shell. Formulario tipo hoja, sin cajas de input: cada campo es una fila con
`border-top` 1px, `margin-top 16px`, `padding-top 16px`, label 15px izquierda / valor 15px/600 derecha.
- Eyebrow: "Nuevo recurrente" / "Editar recurrente".
- Nombre: input sin borde 28px/600, placeholder "Nombre del recurrente".
- Monto: input 32px/600 tabular (ancho 260px) + sufijo "CLP" 14px muted, `margin-top: 14px`.
- Categoría: input alineado a la derecha (ancho 210px), placeholder "Elegir categoría".
- Periodicidad: fila clickeable que **cicla** Diaria → Semanal → Mensual → Anual, con `chevron-down`.
- Repetir cada: stepper 28×28 (`minus`/`plus`, borde `--input`, radio 7.6px), mínimo 1,
  con la unidad en singular/plural según la periodicidad.
- Primera ocurrencia (fecha; default "1 oct 2026") y Cuenta asociada (default "Cta. Corriente").
- Estado: toggle Activo / Pausado — "Activo" en `--success`, "Pausado" en muted.
- Nota inferior: caja `border rounded-[9.6px] bg-background p-[14px_16px]`, 13px muted:
  - activo: `"Se generará un movimiento automáticamente cada {intervalo/unidad}, sin confirmación manual."`
  - pausado: "Pausado: no se generarán movimientos hasta reactivarlo."
- Footer: "Crear" / "Guardar cambios" + Cancelar.

### 4. Modal: Pausar / Reactivar
Modal centrado (no panel lateral): overlay `rgba(0,0,0,.6)` + blur 8px; caja
`width: min(440px, calc(100vw - 32px))`, radio 14px, `bg-card`, shadow `0 30px 80px rgba(0,0,0,.5)`.
- Icono 36px circular `warning/0.15` sobre `text-warning` con `pause`.
- Título 19px/600: `Pausar «{nombre}»` / `Reactivar «{nombre}»` (comillas angulares).
- Cuerpo 14px/20px muted:
  - pausar: "Dejará de generar movimientos automáticos. Los movimientos ya generados no se modifican."
  - reactivar: "Volverá a generar movimientos automáticamente desde la fecha que indiques."
- Fila con `border-top`: label "Pausar desde" / "Reactivar desde" + `<input type="date">`
  alto 36px, borde `--input`, radio 7.6px.
- Hint 12px muted:
  - pausar: "Si dejaste de pagarlo antes, ajusta la fecha: no se generarán movimientos posteriores a ese día."
  - reactivar: "Si reactivaste antes, ajusta la fecha para recuperar las ocurrencias intermedias."
- Acciones alineadas a la derecha: Cancelar (borde `--input`) + confirmación alto 40px, radio 9.6px,
  14px/600 — "Pausar" en `bg-warning`/`text-warning-foreground`, "Reactivar" en
  `accent/0.85`/`text-accent-foreground`.
- Al confirmar: toast `"{nombre} pausado"` / `"{nombre} reactivado"`.

## Interactions & Behavior
- Fila → panel de detalle. Los icon-buttons hacen `stopPropagation`.
- Pausar/reactivar **nunca** es inmediato: siempre pasa por el modal con fecha.
  Pausar guarda la fecha efectiva; reactivar la borra.
- Eliminar → diálogo de confirmación con el nombre; nunca borra directo.
- Los pausados no cuentan en el total mensual, ni en el desglose, ni en los grupos por periodicidad.
- Grupos vacíos no se renderizan; "Pausados" solo aparece si hay alguno.
- Transiciones: color/fondo 150ms. Overlays con blur 8px.
- Responsive: bajo el breakpoint móvil se ocultan las acciones de fila, encabezados en columna,
  filas más compactas.
- Toasts: "{nombre} pausado", "{nombre} reactivado", "Recurrente creado", "Recurrente actualizado".

## State Management
```ts
panel: { kind: "recur" | "recurForm" | "recurEdit"; id?: string } | null
pauseTarget: { id: string; resume: boolean } | null
pauseDate: string | null                       // ISO yyyy-mm-dd, default "2026-09-01"
recurringPaused: Record<string, boolean>       // override del flag paused
recurringPausedAt: Record<string, string>      // fecha ISO efectiva de pausa
// formulario (null = heredar de la serie editada o default)
recurFreq: Freq | null; recurInterval: number | null; recurActive: boolean | null
```

Modelo y fórmulas (exactas del prototipo):
```ts
type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

type Recurring = {
  id: string; label: string; cat: string; icon: string;
  freq: Freq; interval: number; amount: number;
  next: string; nextNote: string; account: string;
  anchor?: string; lastGen?: string; pausedSince?: string;
  overdue?: boolean; paused?: boolean; notes: string;
};

// factor de normalización a mensual
const PER_MONTH: Record<Freq, number> =
  { DAILY: 30.417, WEEKLY: 4.333, MONTHLY: 1, YEARLY: 1 / 12 };

const monthly = (r: Recurring) => Math.round(r.amount * PER_MONTH[r.freq]);
const monthlyTotal = active.reduce((n, r) => n + monthly(r), 0);
const share = (catSum: number) => monthlyTotal ? Math.round((catSum / monthlyTotal) * 100) : 0;
```
Etiquetas: grupos `{DAILY:"Diarios", WEEKLY:"Semanales", MONTHLY:"Mensuales", YEARLY:"Anuales"}`;
singular en filas y formulario `{DAILY:"Diaria/Diario", WEEKLY:"Semanal", MONTHLY:"Mensual", YEARLY:"Anual"}`;
unidades `día(s) · semana(s) · mes/meses · año(s)`.
Formato CLP: miles con punto, sin decimales, prefijo `$` (`$620.000`). Todos los montos con `tabular-nums`.

Datos de ejemplo (fixtures útiles):
```ts
[
  { id:"r1", label:"Arriendo depto",    cat:"Arriendo",      icon:"home",     freq:"MONTHLY", interval:1, amount:620000, next:"3 sep 2026",  nextNote:"en 2 días",   account:"Cta. Corriente", lastGen:"3 ago 2026",  notes:"Transferencia al propietario los primeros días del mes." },
  { id:"r3", label:"VTR internet",      cat:"Internet",      icon:"wifi",     freq:"MONTHLY", interval:1, amount:32990,  next:"2 oct 2026",  nextNote:"en 31 días",  account:"Cta. Corriente", lastGen:"2 sep 2026",  notes:"" },
  { id:"r2", label:"Netflix",           cat:"Suscripciones", icon:"tv",       freq:"MONTHLY", interval:1, amount:9900,   next:"8 sep 2026",  nextNote:"en 7 días",   account:"Cta. Vista",     lastGen:"8 ago 2026",  notes:"" },
  { id:"r5", label:"Gimnasio",          cat:"Salud",         icon:"dumbbell", freq:"MONTHLY", interval:1, amount:29990,  next:"Pausado",     nextNote:"pausado",     account:"Cta. Vista",     anchor:"5 feb 2026", pausedSince:"1 jul 2026", paused:true, overdue:false, notes:"" },
  { id:"r4", label:"Seguro automotriz", cat:"Seguros",       icon:"shield",   freq:"YEARLY",  interval:1, amount:289000, next:"14 ene 2027", nextNote:"en 4 meses",  account:"Cta. Corriente", lastGen:"14 ene 2026", notes:"Póliza anual, se paga de una vez." },
]
```

## Design Tokens
Usar los tokens HSL de `src/styles/index.css` — no hardcodear hex.

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
| `--info` | ver `index.css` | ver `index.css` |
| `--warning` | ver `index.css` | ver `index.css` |
| `--success` | 153 44% 49% | 152 42% 38% |
| `--destructive` | 0 58% 71% | 0 62% 50% |
| `--brand` | 183 86% 19% | 184 52% 33% |
| `--track` | 195 26% 18% | 192 20% 89% |
| `--muted` | 195 26% 18% | 190 30% 96% |
| `--chip` | ver `index.css` | ver `index.css` |

Radios: 7.6px (botones, icon-buttons, inputs pequeños), 9.6px (cards, paneles, botones de footer),
14px (modal), `9999px` (chips, barras), 2px (cuadritos de leyenda).
Tipografía: **Geist**; escala usada 11 / 12 / 13 / 14 / 15 / 19 / 24 / 28 / 32 / 38px.
Espaciado: múltiplos de 4 — gaps 2 / 4 / 8 / 10 / 12 / 14 / 16 / 24; padding de card 22px 24px,
franja 12px 18px, filas 12px 16px (móvil 12px 14px), panel 20px 24px.
Sombras: card `0 1px 2px rgba(0,0,0,.28)`; panel `-24px 0 60px rgba(0,0,0,.45)`;
modal `0 30px 80px rgba(0,0,0,.5)`.

## Assets
Solo iconos **Lucide** (ya en el repo): `plus`, `zap`, `pause`, `play`, `pencil`, `trash-2`,
`chevron-down`, `minus`, `x`, y los de categoría `home`, `wifi`, `tv`, `dumbbell`, `shield`.
Sin imágenes ni logos.

## Files
- `FinanceApp.dc.html` — prototipo completo e interactivo (vista Recurrentes + detalle, formulario y modal de pausa).
- `support.js` — runtime del prototipo; necesario para abrirlo.
- `PROMPT.md` — prompt listo para pegar en Claude Code.
