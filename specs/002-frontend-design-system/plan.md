# Implementation Plan: Frontend Design System

**Branch**: `002-frontend-design-system` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-frontend-design-system/spec.md`

## Summary

Formalize a tokenized design system for `apps/web` on top of the existing Tailwind foundation:
one **CSS-variable token source** (color/type/space/radius/elevation/z/breakpoints), a **teal** brand,
**dark-as-default** theming with light + system (persisted, no flash) via a `data-theme` attribute,
a completed **component + pattern library** (primitives, app shell, page header, list/table, form,
empty/loading/error), **Inter** type + **Lucide** icons, **WCAG AA** baked into tokens, and adoption
across all screens. Delivers spec + plan now; implementation is phased.

## Technical Context

**Language/Version**: TypeScript 5 / React 18 (Vite SPA, `apps/web`).

**Primary Dependencies**: Tailwind CSS 3 (already present), `tailwindcss-animate`, `clsx` +
`tailwind-merge` (`cn`), **`lucide-react`** (icons), **`@fontsource-variable/inter`** (self-hosted
font). No `next-themes` — a small custom `ThemeProvider` (Vite/SPA-appropriate).

**Storage**: theme preference in `localStorage` (`finance.theme` = `dark|light|system`).

**Testing**: Vitest + Testing Library (theme toggle, token presence, primitive variants render).

**Target Platform**: modern browsers; responsive mobile → desktop.

**Project Type**: frontend design system within the monorepo `apps/web`.

**Performance Goals**: no theme flash on first paint; font self-hosted (no external request).

**Constraints**: 0 hardcoded colors in components; AA contrast in both themes; tokens are the only
styling source; `pnpm check:boundaries` stays green (web remains HTTP-only, no backend imports).

**Scale/Scope**: tokens + ~8–10 primitives/patterns + app shell + restyle of auth + 8 domains.

## Constitution Check

_GATE: pass before Phase 0; re-check after design._

| Principle              | Impact                                                                           | Verdict       |
| ---------------------- | -------------------------------------------------------------------------------- | ------------- |
| I. Money Precision     | Adds numeric/tabular **presentation** only; computation/transport unchanged      | ✅ Unaffected |
| II. Per-User Isolation | UI-only; no data access change                                                   | ✅ Unaffected |
| III. i18n Parity       | New UI strings (theme labels) added to es+en                                     | ✅ Honored    |
| IV. Test-First         | Vitest tests for theme + primitives                                              | ✅ Honored    |
| V. SDD & Living Memory | This is the SDD artifact; CLAUDE.md gains a design-system note on approval       | ✅ Honored    |
| Architecture norms     | Stays domain-first; shared UI in `apps/web/src/shared/ui`; boundaries unaffected | ✅ Honored    |

New deps (`lucide-react`, `@fontsource-variable/inter`) + a styling convention → CLAUDE.md update at
memory-sync (no constitution bump; frontend convention, not a principle change).

## Project Structure

### Documentation (this feature)

```text
specs/002-frontend-design-system/
├── plan.md            # this file
├── research.md        # decisions (font, icons, theming, palette)
├── data-model.md      # the token model (roles, scales) + theme mapping
├── quickstart.md      # how to validate (themes, contrast, primitives)
├── contracts/
│   └── component-api.md   # component/prop conventions (the "UI contract")
├── checklists/requirements.md
└── tasks.md           # Phase 2 (/speckit-tasks)
```

### Source Code (target within `apps/web/src`)

```text
apps/web/src/
├── styles/index.css         # @tailwind layers + tokens (:root = dark, [data-theme=light])
├── theme/
│   ├── ThemeProvider.tsx    # mode state (dark|light|system) + resolve + persist
│   ├── useTheme.ts          # hook
│   └── theme-script.ts      # inline pre-paint snippet (no flash), referenced from index.html
├── shared/
│   ├── lib/cn.ts            # (exists)
│   └── ui/                  # primitives, all token-driven
│       ├── button.tsx  input.tsx  card.tsx     # (exist; extend variants/states)
│       ├── label.tsx   field.tsx               # form field wrapper (label + control + error)
│       ├── badge.tsx   table.tsx               # status badge; table primitive
│       ├── theme-toggle.tsx                     # dark/light/system switch
│       ├── page-header.tsx                      # title + actions slot
│       └── states.tsx                          # EmptyState / LoadingState / ErrorState
├── app/
│   ├── AppLayout.tsx        # shell (sidebar + topbar w/ theme toggle) — extend
│   └── providers.tsx        # wrap with ThemeProvider — extend
└── domains/<domain>/routes  # restyle to page-header + card/table + states
```

**Structure Decision**: design-system code lives in `apps/web/src/{styles,theme,shared/ui}`; domain
routes consume it. No new package — only `apps/web` uses it. Tokens stay CSS variables so theming is
a pure variable swap (no `dark:` variants in component classes).

## Phase notes

- **Phase 0 research.md**: font (Inter), icons (Lucide), theme mechanism (data-theme + provider +
  no-flash script), and the derived teal palette with AA notes.
- **Phase 1**: `data-model.md` = the token model (color roles per theme, type/space/radius/elevation
  scales); `contracts/component-api.md` = prop/variant conventions every primitive follows;
  `quickstart.md` = validation steps.

## Complexity Tracking

| Decision                                            | Why                                                           | Rejected alternative                                          |
| --------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Custom ThemeProvider (not next-themes)              | SPA/Vite; tiny scope; avoids Next coupling                    | next-themes is Next-oriented, extra dep                       |
| CSS-variable tokens (not Tailwind `dark:` variants) | One swap re-themes everything; components stay theme-agnostic | `dark:` duplicates every color in markup                      |
| Inter + Lucide                                      | Proven, legible, tree-shakeable, self-hostable                | Icon font / multiple type families add weight + inconsistency |
| App-local UI (no `packages/ui`)                     | Only `apps/web` consumes it; keeps boundaries simple          | A shared UI package adds indirection with no second consumer  |
