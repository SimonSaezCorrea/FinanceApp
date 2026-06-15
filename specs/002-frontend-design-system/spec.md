# Feature Specification: Frontend Design System

**Feature Branch**: `002-frontend-design-system`

**Created**: 2026-06-14

**Status**: Draft

**Input**: User description: "Establish a cohesive design system for the FinanceApp frontend (apps/web): designs, colors, typography, formats, spacing, components and structure — all coupled to one source of truth for visual and logical correlation across the app."

## Overview

This effort defines a **design system** for `apps/web`: one documented, tokenized visual language so
every screen looks and behaves consistently and scales without drift. Audience is twofold — **end
users** (a coherent, legible, trustworthy-yet-friendly experience) and **developers** (a single
source of tokens + reusable components so building UI is fast and consistent).

**Agreed direction:** fintech-professional *and* friendly/approachable; **teal** brand
(`#07575B`); **dark theme as the default** (primary `#66A5AD`), plus **light** (primary `#07575B`)
and **follow-system**, with a persisted user toggle; **comfortable** density, **rounded** corners.

This cycle delivers the **spec + plan** (design decisions, token model, component inventory,
adoption rules). Implementation is phased later.

## Clarifications

### Session 2026-06-14 (resolved by maintainer delegation; folded into scope)

- Q: Font family? → A: **Inter** (variable, self-hosted) — clean, neutral, excellent for numeric/data UIs; warmth comes from color/spacing, not the typeface.
- Q: Icon set? → A: **Lucide** (consistent stroke icons, large set, tree-shakeable).
- Q: Theme mechanism? → A: CSS-variable tokens swapped by a `data-theme` attribute on the document root; **dark is `:root` (default)**, light via `[data-theme="light"]`; a theme provider persists the choice (local storage) and resolves "system" from the OS preference; an inline pre-paint script prevents flash.
- Q: Tables / data grids? → A: a reusable **Table** primitive is in scope for tabular domains; advanced data-grid features (sort, filter, pagination) are **deferred** — lists use the card-list pattern for now.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One coherent visual language across the app (Priority: P1)

As a user moving between screens (login, dashboard, accounts, transactions, …), the colors,
spacing, typography, and components feel like one product — nothing looks out of place.

**Why this priority**: coherence is the whole point; inconsistency erodes trust in a finance app.

**Independent Test**: review every existing screen against the system; each uses the same tokens,
type scale, spacing rhythm, and shared components — no ad-hoc colors or one-off styles.

**Acceptance Scenarios**:

1. **Given** any two screens, **When** compared, **Then** they share the same color roles, spacing
   scale, radius, and component styles.
2. **Given** a new screen built with the system's primitives, **When** rendered, **Then** it matches
   the rest with no extra styling decisions.

---

### User Story 2 - Theme switching (dark default, light, system) (Priority: P1)

A user can switch between dark (default), light, and follow-system; the choice persists across
reloads and applies instantly to the whole app.

**Why this priority**: explicitly requested; dark-default is a core direction decision.

**Independent Test**: toggle each mode → the entire UI re-themes instantly with no unstyled flash;
reload → the chosen mode is remembered; "system" tracks the OS preference.

**Acceptance Scenarios**:

1. **Given** the app on first load, **When** no preference is stored, **Then** it renders in **dark**.
2. **Given** the user selects light/dark/system, **When** they reload, **Then** the selection is retained.
3. **Given** "system" is selected, **When** the OS theme changes, **Then** the app follows it.

---

### User Story 3 - Single source of truth for design tokens (Priority: P1)

All visual values (color, typography, spacing, radius, borders, elevation, z-index, breakpoints)
come from one token source; components reference tokens, never hardcoded values.

**Why this priority**: the tokens are what make the system coherent and scalable; without one
source, drift is guaranteed.

**Independent Test**: changing a token (e.g. primary hue or base radius) updates the whole app
consistently; a scan finds zero hardcoded colors/sizes in components.

**Acceptance Scenarios**:

1. **Given** a token change, **When** the app reloads, **Then** every component reflects it.
2. **Given** the component code, **When** scanned, **Then** there are no hardcoded color hex/rgb values.

---

### User Story 4 - Consistent component & pattern library (Priority: P2)

Developers compose screens from a documented set of primitives (button + variants, input/field,
card, …) and patterns (page header, list/table, form, app shell, and empty/loading/error states).

**Why this priority**: reusable components are how consistency is enforced in practice and how the
app scales without re-deciding styles each time.

**Independent Test**: each documented component has defined variants/states; every existing screen
is rebuilt from these without bespoke markup.

**Acceptance Scenarios**:

1. **Given** the library, **When** a developer needs a button/field/card/list/form, **Then** a
   documented component exists with the needed variants and states.
2. **Given** a data screen, **When** it has no data / is loading / errors, **Then** it uses the
   standard empty/loading/error patterns.

---

### User Story 5 - Accessible by default (Priority: P2)

The system meets accessibility baselines: text contrast passes WCAG AA in both themes, focus is
always visible, and components are keyboard-operable.

**Why this priority**: accessibility is a quality bar and a trust factor; baking it into tokens and
components prevents per-screen regressions.

**Independent Test**: audit text/background pairs in light and dark for AA; tab through key screens
and confirm visible focus and operability.

**Acceptance Scenarios**:

1. **Given** any theme, **When** text is measured against its background, **Then** contrast ≥ WCAG AA.
2. **Given** keyboard navigation, **When** focus moves, **Then** the focused element is clearly indicated.

---

### Edge Cases

- **Theme flash:** the initial paint must already be the resolved theme (no light→dark flicker).
- **Brand on dark:** the fixed brand `#07575B` is too dark on dark surfaces → dark uses `#66A5AD`
  for the primary role; the system must distinguish "brand" (fixed identity) from "primary"
  (theme-adaptive interactive color).
- **Long content / small screens:** layout, lists, and the app shell must remain coherent from
  mobile to desktop.
- **Semantic colors in both themes:** success/warning/danger/info must stay legible and meet AA in
  light and dark.
- **Money/number formatting:** numeric/tabular data must align and read consistently (a presentation
  concern of the system, distinct from money precision which the API/contracts own).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Define a **single source of truth for design tokens** covering color, typography
  (family, scale, weights, line-heights), spacing scale, radius, borders, elevation/shadow,
  z-index, and breakpoints.
- **FR-002**: Distinguish **brand** (fixed `#07575B`) from **primary** (theme-adaptive: `#66A5AD`
  on dark, `#07575B` on light) and define the full neutral/surface/text/border and semantic
  (success/warning/danger/info) palettes plus interactive states (hover/active/focus/disabled).
- **FR-003**: Support **three theme modes — dark (default), light, follow-system** — with a user
  toggle whose choice **persists** across reloads and applies app-wide instantly, with no
  unstyled/flash-of-wrong-theme on first paint.
- **FR-004**: Every component MUST read tokens; **no hardcoded colors or magic sizes** in component
  code.
- **FR-005**: Provide a **component library**: primitives (button + variants, input/field, card,
  and the minimum set the screens need) each with defined variants and states.
- **FR-006**: Provide standard **patterns**: page header, list/table, form layout, navigation/app
  shell, and **empty / loading / error** states — consistent across domains.
- **FR-007**: Define **layout & structure conventions**: app shell, page container, spacing rhythm,
  responsive behavior (mobile → desktop), and iconography usage.
- **FR-008**: Meet **accessibility baselines**: text contrast ≥ WCAG AA in both themes, always-visible
  focus indicators, keyboard operability for interactive components.
- **FR-009**: Define **consistency/adoption rules** so every existing screen (auth + the 8 domains +
  layout) is (re)built from the system's tokens, primitives, and patterns.
- **FR-010**: Produce a **usage reference** documenting the tokens, components, patterns, and theming
  so future UI is built consistently.
- **FR-011**: Define numeric/tabular **formatting presentation** conventions (alignment, emphasis)
  for money and figures, without changing how money values are computed or transported.
- **FR-012**: This cycle is **spec + plan only** — no implementation; exact token values, font
  choice, and tooling are decided in the plan.

### Key Entities *(design-system elements)*

- **Design token**: a named visual value (e.g. color role, spacing step) — the atomic unit; one source.
- **Theme**: a coherent set of token values (dark / light); "system" resolves to one of them.
- **Color role**: semantic slot (background, surface/card, foreground/text, muted, border, primary,
  brand, success/warning/danger/info) mapped per theme.
- **Component**: a reusable UI element (button, input, card, …) with variants and states, built from tokens.
- **Pattern**: a composed layout recipe (page header, list, form, app shell, empty/loading/error).
- **Usage reference**: the document describing tokens, components, patterns, and theming rules.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of components read from the token source; **0 hardcoded color values** in
  component code (verifiable by scan).
- **SC-002**: All three theme modes work; the chosen mode **persists** across reloads; first paint
  shows the resolved theme with **no flash**.
- **SC-003**: 100% of text/background color pairs meet **WCAG AA** in both light and dark.
- **SC-004**: 100% of existing screens (auth + 8 domains + layout) are built from the system's
  primitives/patterns — **no bespoke one-off styles**.
- **SC-005**: Every documented component defines its variants and the empty/loading/error states
  where applicable.
- **SC-006**: Changing one token (e.g. primary hue or base radius) propagates consistently across
  the whole app with no per-screen edits.
- **SC-007**: A developer can build a new screen using only the documented system, making **no new
  color/spacing decisions**, in a short time (target: a basic list screen in under ~30 min).
- **SC-008**: Keyboard users get a visible focus indicator on 100% of interactive elements.
- **SC-009**: The deliverables exist and are approved: design decisions, token model, component/
  pattern inventory, adoption rules, and a usage reference.

## Assumptions

- Builds on the existing frontend styling foundation (utility CSS + CSS-variable tokens + a few
  shared primitives + the app shell); this effort formalizes, completes, and unifies it.
- "Users" covers both end users (visual experience) and developers (the consumers of the system).
- Brand color is **teal `#07575B`** (fixed); dark is the **default** theme with primary `#66A5AD`;
  light uses primary `#07575B`. The remaining palette is derived in the plan to satisfy AA.
- Density is **comfortable**, corners **rounded** (current base radius ~0.6rem as a starting point).
- Exact token values, the type scale, font family, icon set, and tooling are **plan-level** decisions.
- es/en i18n parity and money precision/transport rules are owned elsewhere (i18n catalogs / API
  contracts) and are unchanged by this effort.
- Scope is `apps/web`; no backend or product-feature changes.
