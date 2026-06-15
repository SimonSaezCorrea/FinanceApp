# FinanceApp — Sistema de Diseño

> Versión en inglés: [../english/DESIGN_SYSTEM.md](../english/DESIGN_SYSTEM.md)
> Spec: [specs/002-frontend-design-system/](../../specs/002-frontend-design-system/)

El lenguaje visual de `apps/web`: una fuente única de tokens, con temas y primitivos reutilizables.
Construido sobre Tailwind CSS. **Ningún componente hardcodea color ni tamaño — todo lee tokens.**

## Tokens (fuente única de verdad)

Definidos como variables CSS en `apps/web/src/styles/index.css`. El tema completo se intercambia con
el atributo `data-theme` en `<html>`: **oscuro es el por defecto (`:root`)**, claro bajo
`[data-theme="light"]`.

- **Roles de color** (clases Tailwind): `background`/`foreground`, `card`/`card-foreground`,
  `muted`/`muted-foreground`, `primary`/`primary-foreground`, `secondary`, `border`/`input`/`ring`,
  semánticos `success`/`warning`/`destructive`/`info` (+ `-foreground`), y `brand` (identidad fija).
- **Brand vs primary:** `brand` = teal fijo `#07575B` (logo/identidad, igual en ambos temas).
  `primary` = color interactivo adaptable (`#66A5AD` en oscuro por legibilidad, `#07575B` en claro).
- **Escalas:** tipografía (Inter; `xs`–`3xl`, pesos 400–700), espaciado (escala 4px de Tailwind),
  `--radius` (0.6rem; `rounded-lg/md/sm`), sombras (`sm/md/lg`), z-index (`dropdown`→`toast`),
  breakpoints (Tailwind; el sidebar colapsa < `md`).

Usa las clases de token — p. ej. `bg-background`, `text-muted-foreground`, `border-border`,
`bg-primary text-primary-foreground`, `text-brand`. Nunca `#hex`/`rgb()` en componentes.

## Theming

- `ThemeProvider` (`src/theme/`) mantiene `mode ∈ {dark, light, system}`, resuelve `system` desde el
  SO, escribe `data-theme` y persiste en `localStorage` (`finance.theme`).
- Un script inline en `index.html` aplica el tema resuelto **antes del primer render** (sin flash).
- `useTheme()` → `{ mode, resolved, setMode }`. El primitivo `ThemeToggle` cambia de modo.
- Los componentes nunca leen el tema; leen tokens, que el provider intercambia.

## Componentes y patrones (`src/shared/ui`)

| Componente | Propósito |
|------------|-----------|
| `Button` | acciones — `variant: primary\|secondary\|outline\|ghost\|destructive`, `size: sm\|md\|lg` |
| `Input`, `Label`, `Field` | controles de formulario; `Field` = label + control + error |
| `Card` (+ `Header/Title/Content`) | superficies elevadas |
| `Badge` | etiquetas de estado — `variant: neutral\|success\|warning\|danger\|info` |
| `Table` (+ `THead/TR/TH/TD`) | datos tabulares; celdas numéricas a la derecha + `tabular-nums` |
| `PageHeader` | título de pantalla + slot de acciones |
| `EmptyState` / `LoadingState` / `ErrorState` | estados de datos estándar (iconos Lucide) |
| `ThemeToggle` | interruptor oscuro · claro · sistema |

Convenciones: aceptar `className` (mezclado con `cn`), reenviar props nativas, variantes como uniones
de strings, HTML semántico, `focus-visible:ring-2 ring-ring` visible, botones de solo-icono con
`aria-label`. Los iconos vienen de **Lucide** (`lucide-react`).

## Layout

`app/AppLayout.tsx` es el shell autenticado: nav lateral (iconos Lucide, colapsa bajo `md` con header
móvil) + toggle de tema + usuario/logout. Cada ruta renderiza un `PageHeader` y luego contenido
construido con primitivos, usando `LoadingState`/`ErrorState`/`EmptyState` en pantallas de datos.

## Accesibilidad

Los pares texto/fondo cumplen WCAG AA en ambos temas; cada elemento interactivo muestra anillo de
foco visible; los componentes son operables por teclado; los controles de solo-icono están etiquetados.

## Agregar UI

1. Componer desde los primitivos de `shared/ui` usando solo clases de token.
2. Pantalla nueva → `PageHeader` + primitivos + los componentes de estado de datos.
3. ¿Necesitas un valor visual nuevo? Agrega un **token**, no lo hardcodees. Corre
   `pnpm --filter @finance/web build` y confirma que no se coló `#hex`/`rgb()` en componentes.
