# Implementation Plan: Guías de finanzas personales para Chile en mifik.cl

**Branch**: `035-chile-guides` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/035-chile-guides/spec.md`

## Summary

A public "Guías" section on the static site: an index per language (`/es/guias/`, `/en/guides/`) and
guide pages with a localized slug, built from an Astro content collection — one folder per guide,
one Markdown file per language, frontmatter validated at build (title, description, slug, dates,
sources). Each guide renders its answer-first body, a table of contents from its `h2`s, sources,
dates, "Equipo fik", the general-information notice and the sign-up / "Ir a la app" CTA, with
`Article` + `BreadcrumbList` JSON-LD, its language pair and a sitemap entry. No JavaScript of its own,
no API, no new dependency. First guide: "Fecha de cierre y fecha de pago de la tarjeta de crédito"
(es + en, generic issuer, official sources). Research R1–R9.

## Technical Context

**Language/Version**: TypeScript, Node 22 (Astro 7.3.5).

**Primary Dependencies**: existing only: Astro 7 (content collections, `astro/zod`, `render`),
`@astrojs/sitemap`, `@finance/i18n`. No new dependency.

**Storage**: Markdown files in `apps/landing/src/content/guides/`.

**Testing**: Vitest unit (`validateGuides`, pairing, order, sitemap pair reader) + `test:build` over
`dist/`; Lighthouse mobile locally.

**Target Platform**: Cloudflare Pages (static).

**Project Type**: web monorepo, `apps/landing` only.

**Performance Goals**: Lighthouse mobile performance ≥ 95, the rest 100, LCP ≤ 2 s (SC-002).

**Constraints**: readable without JavaScript; es/en parity for UI strings; no em/en dashes in
`landing.*`; guides never attribute a cycle/rate to a real institution (FR-004).

**Scale/Scope**: 2 index pages + 2 guide pages now; designed for ~10 guides.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                                    | Status                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Money precision                                           | N/A: amounts in a guide are text, not computed.                                                                                                   |
| II. Per-user isolation                                       | N/A: no endpoint, no user data.                                                                                                                   |
| III. i18n parity                                             | PASS: UI strings in `landing.guides.*` of both catalogs (parity test); guide BODIES are content per language, paired by key, not catalog strings. |
| IV. Test-first                                               | PASS: `validateGuides` tests and build tests written before the pages.                                                                            |
| V. SDD & living memory                                       | PASS: this cycle; CLAUDE.md + constitution at close.                                                                                              |
| VI. DDD/CQRS                                                 | N/A: no backend.                                                                                                                                  |
| VII. Idempotency                                             | N/A: no write endpoint.                                                                                                                           |
| VIII. Identifiers                                            | N/A: no entity rows; a guide's `key` is a content identifier, not a row id.                                                                       |
| Public site: static, no React on arrival, approved libraries | PASS: Astro pages, no script, content collections are core Astro.                                                                                 |

**Data gates:** no new entity, no write endpoint, no body-supplied FK. Post-design: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/035-chile-guides/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/pages.md
└── tasks.md
```

### Source Code

```text
apps/landing/
├── astro.config.mjs                         # RATE_PAIRS → LOCALIZED_PAIRS + guide pairs read from content
├── src/
│   ├── content.config.ts                    # NEW: `guides` collection (glob + zod schema)
│   ├── content/guides/statement-dates/
│   │   ├── es.md                            # NEW: first guide, Spanish
│   │   └── en.md                            # NEW: first guide, English (for foreigners in Chile)
│   ├── lib/language.ts (+ test)             # page "guides"; RATE_SLUGS → LOCALIZED_SLUGS (same change as branch 034)
│   ├── layouts/PageLayout.astro             # optional `paths` prop (canonical/hreflang per existing language)
│   ├── styles/global.css                    # shared `prose-fik` text style (extracted from privacy-policy)
│   ├── pages/[lang]/privacy-policy.astro    # uses `prose-fik`
│   ├── pages/[lang]/[guides]/index.astro    # NEW: index
│   ├── pages/[lang]/[guides]/[slug].astro   # NEW: guide
│   ├── domains/guides/
│   │   ├── lib/guides.ts (+ guides.test.ts) # validateGuides, loadGuides, pair, order
│   │   ├── lib/sitemapPairs.mjs (+ test)    # reads slug pairs from content for astro.config
│   │   └── components/{GuideMeta,GuideToc,GuideSources,GuideCta}.astro
│   ├── domains/landing/components/Footer.astro   # + Guías link
│   ├── domains/landing/pages/FaqPage.tsx        # + link to Guías
│   └── i18n/{es,en}.json                        # landing.guides.*, landing.meta.guides.*
└── test/build.test.ts                       # + guides
```

**Structure Decision**: a new frontend domain `guides` in `apps/landing`, content in Astro's content
folder, mirroring how `domains/rates` owns its pages' components and libs.

## Complexity Tracking

None.
