# Quickstart & Validation: Frontend Design System

How to verify the design system once implemented. Run the web app: `pnpm --filter @finance/web dev`.

## Validation scenarios

| #   | Scenario                               | Expected                                                                                   | Maps to        |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------ | -------------- |
| 1   | First load, no stored preference       | App renders in **dark** with no flash                                                      | SC-002, FR-003 |
| 2   | Toggle light / dark / system           | Whole UI re-themes instantly; reload keeps the choice                                      | SC-002         |
| 3   | "System" mode, change OS theme         | App follows the OS                                                                         | FR-003         |
| 4   | Scan components for color literals     | `grep -rE "#[0-9a-fA-F]{3,6}\|rgb\(" apps/web/src` finds **0** in components (tokens only) | SC-001, FR-004 |
| 5   | Contrast audit (both themes)           | All text/background pairs ≥ WCAG AA                                                        | SC-003, FR-008 |
| 6   | Keyboard tab through a screen          | Every interactive element shows a visible focus ring                                       | SC-008, FR-008 |
| 7   | Open each screen (auth + 8 domains)    | All use `PageHeader` + primitives; empty/loading/error states render                       | SC-004, SC-005 |
| 8   | Change `--radius` or primary token     | Whole app updates consistently                                                             | SC-006         |
| 9   | `pnpm --filter @finance/web test`      | Theme + primitive tests pass                                                               | FR-008         |
| 10  | `pnpm build` + `pnpm check:boundaries` | Build green; boundaries intact                                                             | —              |

## What "done" looks like

- One token source in `src/styles/index.css`; `ThemeProvider` + toggle wired; Inter + Lucide in use.
- `shared/ui` has the documented primitives/patterns; every route consumes them.
- A usage reference exists (docs) describing tokens, components, theming.

See [data-model.md](./data-model.md) for tokens and [contracts/component-api.md](./contracts/component-api.md)
for component conventions.
