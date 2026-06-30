# FinanceApp — Design System

> Spanish version: [../spanish/DESIGN_SYSTEM.md](../spanish/DESIGN_SYSTEM.md)
> Spec: [specs/002-frontend-design-system/](../../specs/002-frontend-design-system/)

The visual language of `apps/web`: one token source, themeable, with reusable primitives. Built on
Tailwind CSS. **No component hardcodes a color or size — everything reads tokens.**

## Tokens (single source of truth)

Defined as CSS variables in `apps/web/src/styles/index.css`. The whole theme swaps via the
`data-theme` attribute on `<html>`: **dark is the default (`:root`)**, light under
`[data-theme="light"]`.

- **Color roles** (Tailwind classes): `background`/`foreground`, `card`/`card-foreground`,
  `muted`/`muted-foreground`, `primary`/`primary-foreground`, `secondary`, `border`/`input`/`ring`,
  semantic `success`/`warning`/`destructive`/`info` (+ `-foreground`), and `brand` (fixed identity).
- **Brand vs primary:** `brand` = fixed teal `#07575B` (logo/identity, same in both themes).
  `primary` = theme-adaptive interactive color (`#66A5AD` on dark for legibility, `#07575B` on light).
- **Scales:** typography (Inter; `xs`–`3xl`, weights 400–700), spacing (Tailwind 4px scale),
  `--radius` (0.6rem; `rounded-lg/md/sm`), shadows (`sm/md/lg`), z-index (`dropdown`→`toast`),
  breakpoints (Tailwind defaults; sidebar collapses < `md`).

Use the token classes — e.g. `bg-background`, `text-muted-foreground`, `border-border`,
`bg-primary text-primary-foreground`, `text-brand`. Never `#hex`/`rgb()` in components.

## Theming

- `ThemeProvider` (`src/theme/`) holds `mode ∈ {dark, light, system}`, resolves `system` from the OS,
  writes `data-theme`, and persists to `localStorage` (`finance.theme`).
- An inline script in `index.html` applies the resolved theme **before first paint** (no flash).
- `useTheme()` → `{ mode, resolved, setMode }`. The `ThemeToggle` primitive switches modes.
- Components never read the theme; they read tokens, which the provider swaps.

## Components & patterns (`src/shared/ui`)

| Component                                    | Purpose                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Button`                                     | actions — `variant: primary\|secondary\|outline\|ghost\|destructive`, `size: sm\|md\|lg` |
| `Input`, `Label`, `Field`                    | form controls; `Field` = label + control + error                                         |
| `Card` (+ `Header/Title/Content`)            | raised surfaces                                                                          |
| `Badge`                                      | status pills — `variant: neutral\|success\|warning\|danger\|info`                        |
| `Table` (+ `THead/TR/TH/TD`)                 | tabular data; numeric cells right-aligned + `tabular-nums`                               |
| `PageHeader`                                 | screen title + actions slot                                                              |
| `EmptyState` / `LoadingState` / `ErrorState` | standard data states (Lucide icons)                                                      |
| `ThemeToggle`                                | dark · light · system switch                                                             |

Conventions: accept `className` (merged via `cn`), forward native props, expose variants as string
unions, semantic HTML, visible `focus-visible:ring-2 ring-ring`, icon-only buttons need `aria-label`.
Icons come from **Lucide** (`lucide-react`).

## Layout

`app/AppLayout.tsx` is the authed shell: sidebar nav (Lucide icons, collapses below `md` with a
mobile header) + theme toggle + user/logout. Each route renders a `PageHeader` then content built
from primitives, with `LoadingState`/`ErrorState`/`EmptyState` for data screens.

## Accessibility

Text/background pairs meet WCAG AA in both themes; every interactive element shows a visible focus
ring; components are keyboard-operable; icon-only controls are labeled.

## Adding UI

1. Compose from `shared/ui` primitives using token classes only.
2. New screen → `PageHeader` + primitives + the data-state components.
3. Need a new visual value? Add a **token**, don't hardcode. Run `pnpm --filter @finance/web build`
   and confirm no `#hex`/`rgb()` slipped into components.
