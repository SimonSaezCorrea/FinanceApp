# Tasks: Frontend Design System

**Feature**: specs/002-frontend-design-system | **Plan**: [plan.md](./plan.md)

Scope: `apps/web`. Tokens-first, theme-aware, token-driven primitives, then adoption across screens.
`[P]` = parallelizable. TDD where it adds value (theme + key primitives).

---

## Phase 1: Setup

- [x] T001 Add deps to `apps/web`: `lucide-react`, `@fontsource-variable/inter`
- [x] T002 [P] Extend `apps/web/tailwind.config.ts`: Inter font family, semantic colors (success/warning/danger/info + brand), z-index scale, shadow scale
- [x] T003 [P] Import `@fontsource-variable/inter` in `apps/web/src/main.tsx`

## Phase 2: Foundational (token source + theming infra) 🎯 blocks everything

- [x] T004 Define the full token set in `apps/web/src/styles/index.css`: `:root` = **dark** (default), `[data-theme="light"]` = light; all color roles + semantic + `--brand` (fixed) + radius/shadow; map `body`/`*` to tokens
- [x] T005 [P] Add `apps/web/src/theme/theme-script.ts` (pre-paint snippet) and reference it inline in `apps/web/index.html` (reads `localStorage.finance.theme`, resolves system, sets `data-theme` before paint)
- [x] T006 [P] Add `apps/web/src/theme/ThemeProvider.tsx` + `useTheme.ts` (mode dark|light|system, resolve system via matchMedia, persist to `localStorage`, set `data-theme`)
- [x] T007 [US2] Write Vitest test `apps/web/src/theme/ThemeProvider.test.tsx` (default dark; setMode persists + updates `data-theme`; system follows matchMedia) — TDD, before wiring
- [x] T008 Wire `ThemeProvider` into `apps/web/src/app/providers.tsx`

**Checkpoint**: tokens swap by `data-theme`; theme state works; no flash.

## Phase 3: US4 — Component & pattern library (P2)

- [x] T009 [P] [US4] Extend `apps/web/src/shared/ui/button.tsx` (variants primary/secondary/outline/ghost/destructive; sizes sm/md/lg) + test
- [x] T010 [P] [US4] Extend `input.tsx`; add `label.tsx` + `field.tsx` (label+control+error via `aria-invalid`)
- [x] T011 [P] [US4] Add `badge.tsx` (semantic variants) + `table.tsx` (THead/TR/TH/TD, numeric right-aligned `tabular-nums`)
- [x] T012 [P] [US4] Add `page-header.tsx` (title + actions slot)
- [x] T013 [P] [US4] Add `states.tsx` — `EmptyState` / `LoadingState` / `ErrorState` (Lucide icons)
- [x] T014 [P] [US4] Add `theme-toggle.tsx` (dark·light·system via `useTheme`, Lucide icons, `aria-label`) + test
- [x] T015 [US4] Component render test `apps/web/src/shared/ui/ui.test.tsx` (each primitive + variants render)

## Phase 4: US2 — Theme switching wired in UI (P1)

- [x] T016 [US2] Add `ThemeToggle` to `apps/web/src/app/AppLayout.tsx` topbar; add `auth.theme*` i18n keys (es/en)
- [ ] T017 [US2] Verify persistence + system mode manually per quickstart scenarios 1–3

## Phase 5: US1 — Adoption across all screens (P1)

- [x] T018 [US1] Rework `AppLayout.tsx` shell (sidebar + topbar, responsive: collapses < md), Lucide nav icons, brand accent
- [x] T019 [P] [US1] Auth screens (`LoginRoute`, `RegisterRoute`) use `Field`/`Input`/`Button`/`Card`
- [x] T020 [P] [US1] `DashboardPage` uses `PageHeader` + cards
- [x] T021 [P] [US1] accounts/transactions/installments/debts/savings/investments/import routes use `PageHeader` + `Card`/`Table` + `EmptyState`/`LoadingState`/`ErrorState`
- [x] T022 [US1] Replace remaining inline `style={{…}}` and ad-hoc colors with tokens/primitives across `apps/web/src`

## Phase 6: US5 — Accessibility (P2)

- [x] T023 [P] [US5] Ensure visible `focus-visible:ring` on all interactive primitives
- [ ] T024 [US5] Contrast audit of all text/background pairs in light + dark; tune token values to meet WCAG AA
- [ ] T025 [P] [US5] Keyboard pass on key screens (tab order, icon-button `aria-label`s)

## Phase 7: US3 — Single-source verification (P1)

- [x] T026 [US3] Grep `apps/web/src` for color literals (`#hex`, `rgb(`) in components → 0 (tokens only); fix any leftovers
- [x] T027 [US3] Confirm changing one token (primary / `--radius`) propagates app-wide

## Phase 8: Polish & docs

- [x] T028 [P] Write the usage reference: `docs/english/DESIGN_SYSTEM.md` + `docs/spanish/DESIGN_SYSTEM.md` (tokens, components, theming) + index links
- [x] T029 Update `CLAUDE.md` conventions (design tokens, theming, `shared/ui`, Lucide/Inter) — memory sync
- [x] T030 Verify: `pnpm --filter @finance/web typecheck && test && build` + `pnpm check:boundaries` all green

---

## Dependencies & order

- Setup → Foundational (tokens + theme infra) block all UI work.
- US4 (components) before US1 (adoption uses them). US2 toggle after ThemeProvider.
- US5 (a11y) + US3 (verification) after adoption. Polish last.

## Parallel opportunities

- T002/T003; T005/T006; most US4 primitives (T009–T014); adoption routes T019/T020/T021.

## MVP

Foundational (tokens + theme) + US2 (toggle) + US4 (primitives) + US1 (adoption) = a coherent,
themeable app. US5/US3/docs harden and document it.

**Totals**: 30 tasks.
