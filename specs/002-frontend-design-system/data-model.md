# Phase 1 Token Model: Frontend Design System

The "data model" of a design system is its **token model**: named values + how themes map them.
Tokens are CSS variables; components reference them via Tailwind classes (`bg-background`,
`text-muted-foreground`, `rounded-lg`, etc.). No component hardcodes a value.

## Color roles (semantic slots)

| Role | Tailwind class | Meaning |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------- | --------------------- | -------------- | --------------- |
| `background` / `foreground` | `bg-background` / `text-foreground` | page base + body text |
| `card` / `card-foreground` | `bg-card` / `text-card-foreground` | raised surfaces |
| `muted` / `muted-foreground` | `bg-muted` / `text-muted-foreground` | subtle backgrounds + secondary text |
| `primary` / `primary-foreground` | `bg-primary` / `text-primary-foreground` | main interactive (theme-adaptive teal) |
| `secondary` / `secondary-foreground` | … | secondary actions |
| `border` / `input` / `ring` | `border-border` / `ring-ring` | outlines + focus ring |
| `success                             | warning                                  | danger                                      | info`(+`-foreground`) | `bg-success` … | semantic status |
| `brand` (fixed) | `text-brand` | identity accent (logo); same in both themes |

Each role is one CSS variable per theme; switching `data-theme` swaps the set. `brand` is identical
across themes; `primary` differs (dark `#66A5AD`, light `#07575B`).

## Non-color scales

- **Typography:** family Inter; scale `xs 12 / sm 14 / base 16 / lg 18 / xl 20 / 2xl 24 / 3xl 30`;
  weights 400/500/600/700; line-heights tuned per size. Numeric/tabular cells use `tabular-nums`.
- **Spacing:** Tailwind's 4px base scale (1=4px … 6=24px …); page rhythm uses a consistent set
  (section gap, card padding, list row padding).
- **Radius:** `--radius` base `0.6rem`; `lg/md/sm` derived (rounded, comfortable).
- **Borders:** 1px default; color from `border` role.
- **Elevation/shadow:** `sm` (cards), `md` (popovers/menus), `lg` (modals) — subtle in dark.
- **Z-index:** named layers — base `0`, dropdown `1000`, sticky `1100`, overlay `1200`, modal `1300`,
  toast `1400`.
- **Breakpoints:** Tailwind defaults (`sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1400`); sidebar
  collapses below `md`.

## Theme mapping

- `:root` → **dark** token values (default).
- `[data-theme="light"]` → light token values.
- Resolution: mode `system` → read OS preference → set `data-theme` accordingly; `dark`/`light` →
  set explicitly. Persisted in `localStorage` key `finance.theme`.

## State tokens (interactive)

Each interactive component defines hover/active/focus/disabled using opacity or the ring token
(e.g. `hover:bg-primary/90`, `focus-visible:ring-2 ring-ring`, `disabled:opacity-50`) — never new
hardcoded colors.

See [contracts/component-api.md](./contracts/component-api.md) for how components consume these.
