# Phase 0 Research: Frontend Design System

Decisions resolved with the maintainer (delegated). No open `NEEDS CLARIFICATION`.

## D1 — Theming mechanism

- **Decision:** CSS-variable tokens swapped by a `data-theme` attribute on `<html>`. **Dark is the
  default** (`:root`), **light** under `[data-theme="light"]`. A small `ThemeProvider` holds the mode
  (`dark|light|system`), resolves `system` from `matchMedia('(prefers-color-scheme: dark)')`, writes
  `data-theme`, and persists to `localStorage`. A tiny inline script in `index.html` applies the
  stored/resolved theme **before first paint** (no flash).
- **Rationale:** components stay theme-agnostic (use token classes only); one swap re-themes the app;
  works in a Vite SPA without Next coupling.
- **Alternatives:** Tailwind `dark:` variants (duplicates every color in markup); `next-themes`
  (Next-oriented, unnecessary dependency).

## D2 — Font

- **Decision:** **Inter** (variable), self-hosted via `@fontsource-variable/inter`.
- **Rationale:** highly legible for dense numeric/data UIs, neutral and professional; self-hosting
  avoids an external request and layout shift. Warmth comes from color/spacing/radius, not the face.
- **Alternatives:** system font stack (less control/consistency); multiple families (inconsistent).

## D3 — Icons

- **Decision:** **Lucide** (`lucide-react`).
- **Rationale:** consistent stroke style, large set, tree-shakeable per-icon imports.
- **Alternatives:** icon fonts (worse a11y/tree-shaking); mixed sources (inconsistent).

## D4 — Color system (teal brand)

- **Decision:** distinguish **brand** (fixed identity, `#07575B`) from **primary** (theme-adaptive
  interactive color): dark primary `#66A5AD`, light primary `#07575B`. Tokens stored as HSL channels
  (compatible with the current Tailwind `hsl(var(--x))` setup).
- **Approx HSL anchors:** brand `#07575B ≈ 184 86% 19%`; dark primary `#66A5AD ≈ 187 28% 54%`.
- **Palette (final values tuned for AA during implement):**
  - **Dark (`:root`, default):** background `192 30% 8%`, card `192 24% 12%`, foreground `190 14% 92%`,
    muted `195 18% 18%`, muted-foreground `190 12% 66%`, border `195 16% 22%`, primary `187 28% 54%`,
    primary-foreground `192 45% 10%`, ring `187 34% 60%`.
  - **Light (`[data-theme="light"]`):** background `0 0% 100%`, card `0 0% 100%`, foreground `192 40% 12%`,
    muted `190 30% 96%`, muted-foreground `195 12% 40%`, border `190 24% 88%`, primary `184 86% 19%`,
    primary-foreground `0 0% 100%`, ring `184 60% 30%`.
  - **Semantic (both themes, tuned):** success (green ~152), warning (amber ~38), danger (red ~0),
    info (blue ~200), each with a readable `-foreground`.
  - **Brand (fixed, both themes):** `--brand: 184 86% 19%` for logo/identity accents.
- **Rationale:** teal identity preserved; `#07575B` fails contrast on dark surfaces, so the **primary
  role** lightens to `#66A5AD` on dark while brand stays fixed — this is the brand-vs-primary split.
- **Verification:** every text/background pair checked for WCAG AA (≥4.5 normal, ≥3 large) in both
  themes during implementation; values adjusted if any pair falls short.

## D5 — Tooling / structure

- **Decision:** keep **Tailwind 3** + tokens; ship app-local UI under `apps/web/src/shared/ui` and
  theme under `apps/web/src/theme`. No new `packages/ui` (only `apps/web` consumes it).
- **Rationale:** minimal moving parts; boundaries unaffected; consistent with the monorepo norms.

## D6 — Tables / data presentation

- **Decision:** add a reusable **Table** primitive for tabular domains; numeric cells right-aligned,
  `tabular-nums`. Advanced data-grid features (sort/filter/pagination) **deferred**.
- **Rationale:** covers the immediate need (transactions, lists) without over-building.
