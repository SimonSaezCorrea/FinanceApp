# Handoff: vista Ahorros (FinanceApp)

## Overview
Vista `Ahorros` de FinanceApp: metas de ahorro con progreso, proyección de llegada según ritmo,
total ahorrado con desglose por meta, un bloque de "ahorro libre" (aportes sin meta), metas
cerradas colapsables, y cuatro overlays laterales: detalle de la meta, nueva/editar meta,
registrar aporte y cerrar meta con destino del monto.

Repo destino: `SimonSaezCorrea/FinanceApp`, rama `main`, subárbol `apps/web`.
Archivos existentes que se reemplazan/actualizan:
`src/domains/savings/routes/SavingsRoute.tsx`, componentes en `src/domains/savings/components/`,
overlays en `src/shared/ui/overlay/{side-panel,chrome,form-surface}.tsx`.

## About the Design Files
`FinanceApp.dc.html` (incluido) es una **referencia de diseño en HTML**: prototipo interactivo
del app completo, no código de producción. No copiar el HTML: **recrear** la vista en
React + TypeScript + Tailwind con los primitivos de `src/shared/ui/*` y los tokens de
`src/styles/index.css`.

Abrir el prototipo y elegir "Ahorros" en el sidebar. El modo móvil (420×880) se activa con el
toggle de vista móvil del prototipo.

## Fidelity
**Alta fidelidad.** Medidas, colores, tipografía y copy son finales. Reproducir 1:1.

## Screens / Views

### 1. Ahorros (ruta `/ahorros`)
Contenedor: `flex flex-col gap-6` (24px).

**a) Encabezado** — `flex items-start justify-between gap-4`; en móvil pasa a columna.
- h1 "Ahorros": 24px / line-height 32px / weight 600 / letter-spacing −0.025em.
- Subtítulo 14px muted, `margin-top: 4px`: `"{n} metas abiertas · {monto} por reunir"`
  (singular "1 meta abierta").
- Dos botones, gap 8px:
  - "Aporte libre" — secundario: alto 40px, padding 0 14px, borde `--input`, radio 7.6px,
    14px/500, icono `plus` 14px. Abre el panel de aporte sin meta.
  - "Nueva meta" — primario: alto 40px, padding 0 16px, `bg-accent`/`text-accent-foreground`,
    radio 7.6px, 14px/500, icono `plus` 16px.

**b) Tarjeta de total** — `border rounded-[9.6px] bg-card p-[22px_24px] flex flex-col gap-4`.
- Bloque superior `flex flex-wrap items-end justify-between gap-6`:
  - Izquierda (`flex-col gap-1`): label "Ahorrado" 12px muted; monto **38px/600**,
    letter-spacing −0.03em, `tabular-nums`; nota 12px muted
    `"{n} metas abiertas · incluye ahorro libre[ · {monto} en metas cerradas, fuera de este total]"`.
  - Derecha: tres stats (`flex flex-wrap gap-8`, cada uno `flex-col gap-[3px]`), label 12px muted
    y valor 17px/600 `tabular-nums`: **Este mes** (en `text-success`), **Ritmo** (`"{monto}/mes"`),
    **Falta por reunir**.
- Barra apilada por meta: alto 10px, `rounded-full`, fondo `--track`, un segmento por meta abierta
  con su `color` y `width: {share}%`, más un segmento final "Ahorro libre" en `--track`.
- Leyenda `flex flex-wrap gap-4`, 12px muted: cuadrito 8×8 `rounded-[2px]` + `"{meta} {monto}"`.

**c) Grupos de metas** — un bloque `flex flex-col gap-2` por grupo, en orden fijo
**En curso → Fuera de plazo → Cumplidas**; los grupos vacíos no se renderizan.
- Cabecera: título 13px/600 uppercase letter-spacing .06em muted; meta 13px muted
  `"{n} metas · {monto} acumulados"` (singular "1 meta").
- Card: `overflow-hidden border rounded-[9.6px] bg-card`, shadow `0 1px 2px rgba(0,0,0,.28)`.
  "Cumplidas" va con `opacity: .72`.
- **Fila de meta** (`flex items-center gap-[14px] p-[14px_16px]`, borde inferior 1px,
  `cursor-pointer`, borde izquierdo 2px del color de acento):
  - Chip 34px circular `bg-[--chip] text-muted-foreground` con el icono lucide de la meta.
  - Centro (`flex-1 min-w-0 flex-col gap-[6px]`):
    - Fila `items-baseline justify-between gap-3`: título 15px/500 truncado + porcentaje
      12px muted `tabular-nums`.
    - Barra de progreso: alto 6px `rounded-full` fondo `--track`, relleno del color de la meta
      a `min(100, saved/target)`.
    - Línea de estado 12px / line-height 1.4 con icono lucide 12px (`margin-top: 2px`),
      `text-wrap: pretty` — ver "Estados de meta" abajo.
  - Montos: ancho fijo **128px**, alineado a la derecha — ahorrado 15px/600 `tabular-nums` y
    `"de {objetivo}"` 11px muted `tabular-nums`.
  - Acciones (icon-buttons 30×30, radio 7.6px, transparentes, `stopPropagation`):
    `plus-circle` ("Registrar aporte"), `pencil` ("Editar meta"), y **solo si la meta está
    cumplida o vencida** `archive` ("Cerrar meta cumplida") / `circle-x` ("Cerrar meta sin cumplir").
    Ocultas en móvil; la fila completa abre el detalle.

**d) Metas cerradas** (solo si hay alguna)
- Franja `flex items-center justify-between gap-4 border rounded-[9.6px] bg-card p-[12px_18px]`,
  13px muted (columna en móvil): icono `archive` 15px +
  `"{n} metas cerradas · {monto} ahorrados en total — no cuentan en el total ni en el ritmo, sí en tu historial."`
  A la derecha un botón de texto 13px/500 en `--primary` con chevron que colapsa/expande la lista.
- Lista expandida: card `border rounded-[9.6px] bg-card` con `opacity: .72`; filas
  `flex items-center gap-[14px] p-[12px_16px]`, chip 32px, título 15px/500 con
  `line-through` (color `--muted-foreground`), meta 12px muted
  `"Cerrada el {fecha} · {destino}"`, monto 15px/500 `tabular-nums` + `"{pct}% de {objetivo}"`
  11px muted, y botón "Reabrir" (borde `--input`, radio 7.6px, padding 6px 10px, 12px muted)
  → toast `"{meta} reabierta"`.

**e) Ahorro libre**
- Cabecera de grupo: "AHORRO LIBRE" + `"{n} aportes sin meta"` (singular "1 aporte sin meta").
- Card **con borde discontinuo** (`1px dashed --border`), radio 9.6px, `bg-card`,
  `p-[18px_20px]`, `flex-col gap-[14px]`:
  - Fila superior `items-end justify-between gap-4` (columna en móvil): label "Sin meta asignada"
    12px muted + total 24px/600 `tabular-nums`; a la derecha botón "Aporte libre"
    (alto 34px, padding 0 12px, borde `--input`, radio 7.6px, 13px/500, icono `plus` 14px).
  - Lista de aportes: filas `justify-between` con `border-top` 1px y `padding: 10px 0` —
    nota 14px (o "Sin nota") + fecha 12px muted; monto `"+{monto}"` 14px/500
    `tabular-nums` en `text-success`.

### 2. Panel: Detalle de la meta
Overlay `rgba(0,0,0,.55)` + `backdrop-filter: blur(8px)`; panel derecho **`width: min(560px, 100vw)`**,
`bg-card`, borde izquierdo 1px, shadow `-24px 0 60px rgba(0,0,0,.45)`.
- Encabezado: eyebrow 11px/600 uppercase letter-spacing .1em `text-brand` "Meta de ahorro" +
  botón cerrar (`x` 20px).
- Identidad: chip 44px circular + título 22px/600 (letter-spacing −0.02em) y la línea de estado
  13px con su icono y color (misma lógica que la fila).
- Progreso: barra 10px `rounded-full` + tres stats (`justify-between`) label 12px muted /
  valor 16px/600 `tabular-nums`: **Ahorrado** (foreground), **Objetivo** (muted),
  **Falta** (`--success` si está cumplida, foreground si no).
- Filas de detalle (`border-top` 1px, `padding: 12px 0`, label 14px muted / valor 14px/500):
  Plazo (`deadline` o "Sin fecha límite") · Ritmo actual (`"{monto}/mes"`) ·
  Proyección (`"Llegas en {mes año}"` o "Sin proyección") · Moneda ("CLP").
- Historial de aportes: título 13px/600 uppercase; filas `border-top` 1px `padding: 10px 0`
  con nota + fecha y monto `"+{monto}"` en `text-success`. Si no hay:
  "Aún no hay aportes registrados para esta meta." (14px muted).
- Footer `justify-end gap-3`, borde superior, `padding: 16px 24px`, botones alto 44px radio 9.6px:
  a la izquierda (`margin-right: auto`, solo si cumplida o vencida) "Cerrar meta cumplida" /
  "Cerrar meta sin cumplir" con icono `archive`; luego "Editar meta" (secundario,
  `bg-background` + borde `--input`) y "Registrar aporte" (`accent/0.85`, 15px/600).

### 3. Panel: Nueva / Editar meta
Mismo shell (560px). Formulario tipo hoja: campos como filas con `border-top` 1px,
`margin-top 16px`, `padding-top 16px`, label 15px izquierda / valor 15px/600 derecha.
- Eyebrow: "Nueva meta" / "Editar meta".
- Título: input sin borde 28px/600, letter-spacing −0.02em, placeholder "Título de la meta".
- Monto: input 32px/600 `tabular-nums` (ancho 260px) + sufijo "CLP" 14px muted;
  debajo "Monto objetivo" 13px muted.
- "Con fecha límite": switch 40×24 `rounded-full`, borde `--input`, fondo `--muted`,
  perilla 16px `bg-background` con borde; alineación `flex-start`/`flex-end` según estado.
- Si el switch está activo aparece "Fecha límite" (valor + `chevron-down`).
- "Moneda": CLP + `chevron-down`.
- Nota: `<textarea rows="2">` placeholder "Nota (opcional)", borde `--input`, radio 9.6px,
  `bg-background`, padding 10px 12px.
- Nota al pie 13px/1.5 muted:
  - con plazo: "Con plazo definido puedes ver si tu ritmo alcanza para llegar a tiempo."
  - sin plazo: "Sin plazo la meta avanza a tu ritmo, sin avisos de retraso."
- Footer: Cancelar + "Crear meta" / "Guardar cambios" (`accent/0.85`).
  Toast: "Meta creada" / "Meta actualizada".

### 4. Panel: Registrar aporte
Mismo shell, `z-index` por encima del detalle (overlay 1400 / panel 1500).
- Eyebrow "Registrar aporte".
- Título 28px/600: `Aporte a «{meta}»` (comillas angulares) o "Aporte sin meta".
- Monto: "+" 30px/600 en `text-success` + input 32px/600 `tabular-nums` (ancho 240px) +
  "CLP" 14px muted a la derecha.
- Destino: chips `rounded-full` borde `--border`, padding 6px 12px, 13px; el activo con
  `bg-[--chip]`, texto foreground y weight 600. Primera opción "Ahorro libre (sin meta)",
  luego una por meta abierta.
- Fecha del aporte: `<input type="date">` (default 2026-09-01), alto ~34px, borde `--input`, radio 7.6px.
- Cuenta de origen: "Cuenta Corriente" + `chevron-down`.
- Nota: input de texto placeholder "Nota (opcional)", borde `--input`, radio 9.6px.
- Nota al pie 13px muted:
  - con meta: "Suma al progreso de la meta y queda como movimiento de traspaso."
  - sin meta: "Queda registrado como ahorro libre; puedes asignarlo a una meta después."
- Footer: Cancelar + "Registrar aporte" → toast "Aporte registrado".

### 5. Panel: Cerrar meta
Mismo shell y z-index alto (1400 / 1500).
- Eyebrow: "Cerrar meta cumplida" / "Cerrar meta sin cumplir".
- Título 26px/600: `Cerrar «{meta}»`; resumen 14px/1.55 muted:
  - cumplida: "Reuniste el 100% del objetivo. Al cerrarla deja de aparecer en las metas abiertas y en el ritmo mensual."
  - sin cumplir: variante equivalente para meta incompleta (ver prototipo).
- Caja "Monto acumulado": `border rounded-[9.6px] p-[14px_16px]`, label 13px muted +
  monto 22px/600 `tabular-nums`.
- "DESTINO DEL MONTO" (13px/600 uppercase) — tres tarjetas seleccionables a ancho completo
  (`border rounded-[9.6px] p-[12px_14px]`, chip 30px, label 15px/500, ayuda 13px/1.45 muted);
  la activa lleva borde `--accent` y fondo `--chip`:
  - **Retirar a una cuenta** (`banknote`) — default cuando la meta está cumplida.
  - **Pasar a ahorro libre** (`piggy-bank`) — default cuando no está cumplida.
  - **Traspasar a otra meta** (`arrow-right-left`) — "Los aportes se reasignan a la meta que elijas."
- Si el destino es "traspasar": fila extra "Meta de destino" con selector.
- "Fecha de cierre": `<input type="date">` (default 2026-09-01).
- Nota al pie: "Los aportes ya registrados no se borran: siguen en tu historial y en el total ahorrado del año."
- Footer: Cancelar + "Cerrar meta". Al confirmar, la meta pasa al bloque de cerradas con
  `"Cerrada el {fecha} · {destino}"` (Retirado a Cuenta Corriente / Pasado a ahorro libre /
  Traspasado a otra meta) y se cierra el panel de detalle.

## Interactions & Behavior
- Fila de meta → panel de detalle; los icon-buttons hacen `stopPropagation`.
- Cerrar meta **solo** está disponible si la meta está cumplida o vencida, y siempre pasa por el
  panel de cierre con destino y fecha; nunca es una acción inmediata.
- Las metas cerradas no cuentan en el total ahorrado, ni en el ritmo, ni en "falta por reunir";
  sí se conservan sus aportes en el historial. "Reabrir" las devuelve a su grupo.
- El ahorro libre entra en el total ahorrado y en la barra apilada, pero no tiene objetivo ni ritmo.
- Grupos vacíos no se renderizan.
- Transiciones: color/fondo 150ms. Overlays con blur 8px.
- Responsive: bajo el breakpoint móvil se ocultan las acciones de fila, los encabezados y las
  filas ancho-completo pasan a columna, y los montos pierden el ancho fijo.
- Toasts: "Aporte registrado", "Meta creada", "Meta actualizada", "{meta} reabierta",
  "{meta} cerrada".

## State Management
```ts
panel: { kind: "savGoal" | "savForm" | "savEdit"; id?: string } | null
savEntryOpen: boolean
savEntryGoal: string            // "" = ahorro libre
savCloseId: string | null
savCloseDest: "withdraw" | "free" | "move" | null   // null = default según cumplimiento
savClosedMap: Record<string, { date: string; dest: string }>
savShowClosed: boolean
savDeadline: boolean | null     // null = heredar de la meta editada
```

Modelo y fórmulas (exactas del prototipo):
```ts
type Goal = {
  id: string; title: string;
  target: number; saved: number; pace: number;      // pace = aporte mensual
  deadline: string | null; deadlineMonths: number | null;  // negativo = vencida
  icon: string; color: string;                      // color = token hsl(var(--…))
};
type Entry = { id: string; goal: string | null; amount: number; date: string; note: string };

const pct  = (g: Goal) => Math.min(100, Math.round((g.saved / g.target) * 100));
const left = (g: Goal) => Math.max(0, g.target - g.saved);

// proyección: meses restantes al ritmo actual, desde sep 2026 (índice 8)
const eta = (g: Goal) => {
  if (!g.pace) return null;
  const m = Math.ceil(left(g) / g.pace);
  const i = 8 + m;
  return { months: m, label: \`\${MONTHS[i % 12]} \${2026 + Math.floor(i / 12)}\` };
};

const complete = g.saved >= g.target;
const overdue  = !complete && g.deadlineMonths != null && g.deadlineMonths < 0;
const short    = !complete && !overdue && eta && g.deadlineMonths != null
                 && eta.months > g.deadlineMonths;           // no llega a tiempo
// aporte mensual necesario para llegar al plazo, redondeado a 10.000
const needed = g.deadlineMonths > 0 ? Math.ceil(left(g) / g.deadlineMonths / 10000) * 10000 : 0;

const totalSaved = openAndDoneGoals.reduce((n, g) => n + g.saved, 0) + freeTotal;
const missing    = openGoals.reduce((n, g) => n + left(g), 0);
const pace       = openGoals.reduce((n, g) => n + g.pace, 0);
```

**Estados de meta** (línea de estado, icono y color de acento/barra):
| Estado | Copy | Color | Icono |
| --- | --- | --- | --- |
| Cumplida | `Meta cumplida · {objetivo}` | `--success` | `circle-check` |
| Vencida | `Venció el {plazo} · faltan {monto}` | `--destructive` | `clock-alert` |
| No llega a tiempo | `A este ritmo llegas en {mes}, después de {plazo} · sube a {monto}/mes` | `--warning` | `trending-down` |
| En ritmo | `A este ritmo llegas en {mes} · plazo {plazo}` (o `· sin plazo`) | muted | `trending-up` |
| Sin aportes | `Sin aportes registrados` | muted | — |

Agrupación: `live` = incompletas y no vencidas → "En curso"; `late` = incompletas y vencidas →
"Fuera de plazo"; `done` = `saved >= target` → "Cumplidas". `openGoals = live + late`.

Formato CLP: miles con punto, sin decimales, prefijo `$`. Todos los montos con `tabular-nums`.

Datos de ejemplo (fixtures útiles):
```ts
const savings = [
  { id:"s1", title:"Pie departamento",   target:15000000, saved:6300000, pace:300000, deadline:"dic 2027",   deadlineMonths:15, icon:"home",            color:"hsl(var(--brand))" },
  { id:"s2", title:"Fondo de emergencia",target:3500000,  saved:2450000, pace:150000, deadline:null,         deadlineMonths:null, icon:"shield",        color:"hsl(var(--success))" },
  { id:"s3", title:"Viaje a Japón",      target:2800000,  saved:2050000, pace:250000, deadline:"15 nov 2026",deadlineMonths:2,  icon:"plane",           color:"hsl(var(--accent))" },
  { id:"s4", title:"Notebook nuevo",     target:1200000,  saved:480000,  pace:60000,  deadline:"15 ago 2026",deadlineMonths:-1, icon:"laptop",          color:"hsl(var(--warning))" },
  { id:"s5", title:"Curso de inglés",    target:600000,   saved:600000,  pace:100000, deadline:"30 jun 2026",deadlineMonths:-2, icon:"graduation-cap",  color:"hsl(var(--muted-foreground))" },
];
// s5 arranca cerrada: { s5: { date: "2 jul 2026", dest: "Retirado a Cuenta Corriente" } }

const savingsEntries = [
  { id:"e1", goal:"s1",  amount:300000, date:"28 ago 2026", note:"Traspaso mensual" },
  { id:"e2", goal:"s3",  amount:250000, date:"26 ago 2026", note:"Aporte pasajes" },
  { id:"e3", goal:null,  amount:120000, date:"22 ago 2026", note:"Vuelto proyecto freelance" },
  { id:"e4", goal:"s2",  amount:150000, date:"20 ago 2026", note:"" },
  { id:"e5", goal:"s1",  amount:300000, date:"28 jul 2026", note:"Traspaso mensual" },
  { id:"e6", goal:"s3",  amount:250000, date:"26 jul 2026", note:"" },
  { id:"e7", goal:null,  amount:80000,  date:"18 jul 2026", note:"Redondeos del mes" },
  { id:"e8", goal:"s4",  amount:60000,  date:"15 jul 2026", note:"" },
  { id:"e9", goal:"s2",  amount:150000, date:"20 jun 2026", note:"" },
  { id:"e10",goal:null,  amount:140000, date:"9 jun 2026",  note:"Venta bicicleta" },
];
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
| `--success` | 153 44% 49% | 152 42% 38% |
| `--warning` | ver `index.css` | ver `index.css` |
| `--destructive` | 0 58% 71% | 0 62% 50% |
| `--brand` | 183 86% 19% | 184 52% 33% |
| `--track` | 195 26% 18% | 192 20% 89% |
| `--muted` | 195 26% 18% | 190 30% 96% |
| `--chip` | ver `index.css` | ver `index.css` |

Radios: 7.6px (botones, icon-buttons, inputs date), 9.6px (cards, paneles, botones de footer,
tarjetas de destino), `9999px` (chips, barras, switch), 2px (cuadritos de leyenda).
Tipografía: **Geist**; escala usada 11 / 12 / 13 / 14 / 15 / 16 / 17 / 22 / 24 / 26 / 28 / 30 / 32 / 38px.
Espaciado: múltiplos de 4 — gaps 2 / 3 / 6 / 8 / 10 / 12 / 14 / 16 / 24 / 32; padding de card
22px 24px, ahorro libre 18px 20px, franja 12px 18px, filas de meta 14px 16px,
filas cerradas 12px 16px, paneles 20px 24px, footer 16px 24px.
Sombras: card `0 1px 2px rgba(0,0,0,.28)`; panel `-24px 0 60px rgba(0,0,0,.45)`.
Z-index: overlay/panel de detalle y formulario 1200/1300; aporte y cierre 1400/1500.

## Assets
Solo iconos **Lucide** (ya en el repo): `plus`, `plus-circle`, `pencil`, `archive`, `circle-x`,
`circle-check`, `clock-alert`, `trending-up`, `trending-down`, `chevron-down`, `x`,
`banknote`, `piggy-bank`, `arrow-right-left`, y los de meta `home`, `shield`, `plane`,
`laptop`, `graduation-cap`. Sin imágenes ni logos.

## Files
- `FinanceApp.dc.html` — prototipo completo e interactivo (vista Ahorros + los cuatro paneles).
- `support.js` — runtime del prototipo; necesario para abrirlo.
- `PROMPT.md` — prompt listo para pegar en Claude Code.
