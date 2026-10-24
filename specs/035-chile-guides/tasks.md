# Tasks: Guías de finanzas personales para Chile en mifik.cl

**Input**: Design documents from `specs/035-chile-guides/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/pages.md, quickstart.md

**Tests**: REQUIRED (Constitution IV): every test task is written and seen failing before its
implementation task.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [x] T001 Generalize per-language slugs in `apps/landing/src/lib/language.ts` with the SAME change branch `034-installment-simulator` made (so a later merge is trivial): `RATE_SLUGS` → `LOCALIZED_SLUGS`, add `LocalizedPage`, `isLocalizedPage`; add page `"guides"` to `PAGES` with slugs `{ es: "guias", en: "guides" }`; `slugOf`/`pagePath` read `LOCALIZED_SLUGS`; keep `RATE_PAGES`/`isRatePage`; update `src/pages/[lang]/[rate].astro` (iterate `RATE_PAGES` keys over `LOCALIZED_SLUGS`) and `ReactPage` in `src/domains/landing/pages/LandingPage.tsx` (`Exclude<Page, "privacyPolicy" | LocalizedPage>`). Write the `language.test.ts` cases first (`pagePath("es","guides")` = `/es/guias/`, en = `/en/guides/`)
- [x] T002 In `apps/landing/astro.config.mjs` rename `RATE_PAIRS` → `LOCALIZED_PAIRS` and add `{ es: "/es/guias/", en: "/en/guides/" }`
- [x] T003 [P] (Kept on purpose, analyze C1: avoids duplicating ~60 lines of CSS.) Extract the privacy policy's text style (`.legal` rules in `src/pages/[lang]/privacy-policy.astro`) into a shared global class `prose-fik` in `apps/landing/src/styles/global.css` (h2 with `scroll-margin-top`, p/li, strong, ul, a, table); the privacy policy uses `prose-fik`; verify its build output is unchanged except the class name
- [x] T004 [P] i18n skeleton in `apps/landing/src/i18n/es.json` and `en.json` (identical keys, no em/en dashes): `landing.meta.guides.{title,description}`, `landing.guides.{nav,title,lead,empty,published,reviewed,author,toc,sources,notice,backToIndex,cta.{title,body,action}}`; run the parity test

---

## Phase 2: Foundational (blocks every story)

- [x] T005 Write `apps/landing/src/domains/guides/lib/guides.test.ts` first: `validateGuides` rejects a repeated slug in one language, `reviewedAt` before `publishedAt` and a file whose language is not `es`/`en`, naming the file; accepts a valid set; `pairOf` finds the other language by key or returns null; `sortForIndex` orders by `reviewedAt` desc then title; `guidePath` builds `/es/guias/<slug>/` and `/en/guides/<slug>/`
- [x] T006 Implement `apps/landing/src/domains/guides/lib/guides.ts` (pure: `GuideEntry` type with key/lang from the entry id, `validateGuides`, `pairOf`, `sortForIndex`, `guidePath`, `AUTHOR = "Equipo fik"`) plus `loadGuides(lang)` wrapping `getCollection("guides")` + validation; make T005 pass
- [x] T007 Create `apps/landing/src/content.config.ts`: collection `guides`, loader `glob({ pattern: "*/{es,en}.md", base: "./src/content/guides" })`, schema (`astro/zod`): `title` non-empty, `description` 1–160, `slug` `^[a-z0-9]+(-[a-z0-9]+)*$`, `publishedAt`/`reviewedAt` `z.coerce.date()`, `sources` array ≥ 1 of `{ name, title, url: https }`
- [x] T008 Add an optional `paths?: Partial<Record<Language, string>>` prop to `apps/landing/src/layouts/PageLayout.astro`: when given, canonical = `paths[lang]` and one `hreflang` link per language present (plus x-default); without it, unchanged behaviour

**Checkpoint**: the collection validates and paths resolve; no page yet.

---

## Phase 3: User Story 1 - Leer una guía (Priority: P1) 🎯 MVP

**Goal**: the first guide, readable without JavaScript, answer first, example, TOC, sources, dates,
author, notice, "Cómo lo haces en fik" and CTA, in both languages.

**Independent Test**: open `/es/guias/fecha-de-cierre-tarjeta/` and `/en/guides/credit-card-statement-dates/` with JS off; everything is there.

- [x] T009 [P] [US1] Extend `apps/landing/test/build.test.ts` first (a `describe("guides (spec 035)")` block): both guide pages exist; `h1`; first paragraph after the meta line is non-empty; `<time datetime>` for published and reviewed; "Equipo fik"; a TOC `<nav>` whose links point to the `id` of every `h2`; a sources list with ≥ 1 `https` link; the general-information notice; a "Cómo lo haces en fik"/"How to do it in fik" section; CTA `[data-access-slot]` with `?acceso=registro` and `template[data-app-template]`; no `<script src>` of its own (only the layout's); no React runtime
- [x] T010 [P] [US1] Components in `apps/landing/src/domains/guides/components/`: `GuideMeta.astro` (published · reviewed · author, `<time>`, dates via `Intl` per language), `GuideToc.astro` (from `render()` headings depth 2), `GuideSources.astro` (name, title, link `rel="noopener"`), `GuideCta.astro` (slot + template like `SimulatorCta`, texts `landing.guides.cta.*`)
- [x] T011 [US1] Page `apps/landing/src/pages/[lang]/[guides]/[slug].astro`: FIRST confirm with a build that `[lang]/[guides]/…` and `[lang]/[rate].astro` (same-level dynamic routes) generate every page with no collision warning; then `getStaticPaths` from `loadGuides` for each language (param `guides` = `LOCALIZED_SLUGS.guides[lang]`); layout with `paths` = this guide and its pair; `h1` (`HERO_TITLE`), meta, TOC, `<article class="prose-fik">` body, sources, notice, CTA, back-to-index link
- [x] T012 [US1] Research and verify the sources (open each URL; R8): CMF statement page, SERNAC D.S. 44/2012 page, Diario Oficial new regulation (D.S. 75/2025, in force 2028-02-06), CMF NCG 537; write `apps/landing/src/content/guides/statement-dates/es.md`: answer-first paragraph (fecha de facturación/cierre vs fecha de pago/vencimiento), a worked example with "tu banco", realistic CLP amounts and dates (purchase before/after the close, which statement it lands on, due date), what changes if you pay the total vs the minimum (explained in words, no interest computed: the minimum-payment calculator is a separate, blocked task), where to find the real dates (the statement), the regulation note (D.S. 44 now, new decree from 2028), "## Cómo lo haces en fik" with text steps (generate each statement with the dates of the bank's statement, prepay the open period, pay), frontmatter per data-model; never a real institution's cycle
- [x] T013 [US1] Write `apps/landing/src/content/guides/statement-dates/en.md`: same structure, example and sources, adapted for foreigners in Chile (FR-004a: local terms with the Spanish name in parentheses the first time and one line explaining them), slug `credit-card-statement-dates`, "## How to do it in fik"
- [x] T014 [US1] Fill `landing.guides.*` copy in both catalogs; build with the fixture; make T009 pass

**Checkpoint**: the guide is readable in both languages (MVP).

---

## Phase 4: User Story 2 - Encontrar las guías (Priority: P2)

- [x] T015 [P] [US2] Extend the build test first: `/es/guias/` and `/en/guides/` list the guide (title link, description, "Revisado el …"); every page's footer links to the index of its language; the FAQ page links to it; the guide links back to the index; the guide's `hreflang` points to its pair
- [x] T016 [US2] Page `apps/landing/src/pages/[lang]/[guides]/index.astro`: `h1`, lead, list from `loadGuides(lang)` via `sortForIndex`, empty-state sentence (`landing.guides.empty`)
- [x] T017 [P] [US2] Footer link in `apps/landing/src/domains/landing/components/Footer.astro` (`{ page: "guides", key: "landing.guides.nav" }`) and a link to the index in `apps/landing/src/domains/landing/pages/FaqPage.tsx` (near the topic index, key `landing.faq.guidesLink` in both catalogs)
- [x] T018 [US2] Make T015 pass

---

## Phase 5: User Story 3 - Buscadores (Priority: P2)

- [x] T019 [P] [US3] Extend the build test first: guide `<title>`/description unique across the site per language; canonical; JSON-LD `Article` (headline, datePublished, dateModified, author name "Equipo fik", publisher, inLanguage) + `BreadcrumbList`; index JSON-LD `CollectionPage` + `BreadcrumbList`; sitemap has both indexes and both guides with each other as `xhtml:link` alternates
- [x] T020 [P] [US3] `apps/landing/src/domains/guides/lib/sitemapPairs.mjs` (+ `sitemapPairs.test.ts` first): reads `src/content/guides/*/{es,en}.md`, takes the `slug:` frontmatter line of each, returns `{ es, en }` path pairs for keys present in both languages (a one-language guide yields no pair)
- [x] T021 [US3] Use it in `apps/landing/astro.config.mjs` (`LOCALIZED_PAIRS` = fixed pairs + guide pairs); JSON-LD in the guide and index pages; make T019 pass

---

## Phase 6: User Story 4 - Publicar sin tocar el sitio (Priority: P3)

- [x] T022 [US4] Verify FR-014/FR-015 by hand and record it in quickstart (**done 2026-10-23**: all three behaved as described): add `src/content/guides/prueba/es.md` without `sources` → the build fails naming the file; with every field → it appears in the index and sitemap with no other change; repeated slug → fails; remove the test guide. (Automated coverage: T005 for the cross-guide rules; the schema itself is Astro's.)

---

## Phase 7: Polish & Cross-Cutting

- [x] T023 Lighthouse mobile locally (`astro preview`) on `/es/guias/` and the Spanish guide: performance ≥ 95, accessibility/best-practices/SEO 100 (best-practices may show only the local session probe), LCP ≤ 2 s; and SC-001: at a 360×640 phone viewport the guide's first paragraph (the answer) is visible without scrolling (if not, tighten the header spacing or move the meta line below the answer); record results in plan.md. **Done 2026-10-23**: index and both guides 100/100/96/100 (96 = the local session probe), LCP 1,5 s, CLS 0; at 360×640 (mobile emulation) the answer is visible without scrolling and the page is exactly 360 px wide (only the example table scrolls inside its box)
- [x] T024 Run `pnpm --filter @finance/landing test`, `typecheck` (`astro check`), `lint`, build + `test:build`, `pnpm format:check`, `pnpm check:boundaries`
- [ ] T025 Owner review of both guide texts (FR-017) before merging: present the rendered Spanish and English guide and apply corrections
- [x] T026 Memory sync: CLAUDE.md (apps/landing bullet: guides section, content collection, `LOCALIZED_SLUGS`, `PageLayout` `paths`, `prose-fik`; plan pointer → implementado with what was verified) and constitution (PATCH: public site gains a content collection; publishing a guide is content-only)

---

## Dependencies & Execution Order

- Setup (T001–T004) → Foundational (T005–T008) → US1 (MVP) → US2 → US3 → US4 → Polish.
- T012/T013 (content) can be written in parallel with T010/T011 (template).
- US2 and US3 only need the guide page from US1.
- T025 (owner review) gates the merge.

## Parallel Example: User Story 1

```text
T009 (build tests) ‖ T010 (components) ‖ T012 (Spanish text)
then T011 (page) → T013 (English text) → T014
```

## Implementation Strategy

MVP = Phases 1–3 (one readable guide in two languages). Then the index and links (US2), SEO
metadata and sitemap (US3), the publishing check (US4), polish, owner review, memory sync.
