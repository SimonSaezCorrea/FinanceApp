# Component API Conventions (UI contract)

Every primitive in `apps/web/src/shared/ui` follows these rules so the library stays predictable.

## General rules

- **Token-only styling:** components use Tailwind classes mapped to tokens; **no hex/rgb literals**.
- **Class merge:** accept a `className` prop, merged last via `cn()` so callers can extend safely.
- **Forward native props:** spread the underlying element's props (`...props`); type with the proper
  `HTMLAttributes`. Forward refs where a parent needs the node.
- **Variants/sizes:** expose as string-union props with a default; map via a lookup object.
- **Accessibility:** real semantic elements; visible `focus-visible:ring-2 ring-ring`; icon-only
  controls require an `aria-label`.

## Primitives & their contracts

| Component                                    | Key props                                                                                  | Notes                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `Button`                                     | `variant: primary\|secondary\|outline\|ghost\|destructive`, `size: sm\|md\|lg`, `disabled` | default `primary`/`md`                                          |
| `Input`                                      | native input props                                                                         | token border/ring; error styling via `aria-invalid`             |
| `Label`                                      | `htmlFor`                                                                                  | pairs with a control                                            |
| `Field`                                      | `label`, `error?`, `htmlFor`                                                               | composes Label + control slot + error text (`text-destructive`) |
| `Card` (+ `Header/Title/Content`)            | `className`                                                                                | raised `bg-card` surface                                        |
| `Badge`                                      | `variant: neutral\|success\|warning\|danger\|info`                                         | status pills (semantic tokens)                                  |
| `Table` (+ `THead/TR/TH/TD`)                 | `className`                                                                                | numeric cells `text-right tabular-nums`                         |
| `PageHeader`                                 | `title`, `actions?`                                                                        | consistent screen heading + action slot                         |
| `EmptyState` / `LoadingState` / `ErrorState` | `title`/`message`/`icon?`                                                                  | standard data-state patterns                                    |
| `ThemeToggle`                                | —                                                                                          | cycles/sets dark·light·system via `useTheme`                    |

## Theming contract

- `ThemeProvider` wraps the app (inside providers), exposes `useTheme(): { mode, resolved, setMode }`.
- Components never read the theme directly — they read **tokens**, which the provider swaps.
- `mode ∈ {dark, light, system}`; `resolved ∈ {dark, light}`; persisted in `localStorage`.

## Adoption contract (screens)

- Each route renders a `PageHeader` + content built from primitives.
- Data screens use `LoadingState` while fetching, `ErrorState` on failure, `EmptyState` when empty.
- Lists use `Card` + list rows or `Table`; money via `@finance/money` `formatMoney`, right-aligned.
