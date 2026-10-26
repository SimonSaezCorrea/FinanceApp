# Tasks: Novedades — registro de cambios de cada despliegue (038)

**Input**: plan.md, spec.md, research.md, data-model.md, contracts/

## Phase 1: Setup

- [x] T001 Create the source package `packages/release-notes/` (`package.json` `@finance/release-notes`, `tsconfig.json` with `vite/client` types, `eslint.config.mjs`, `vitest.config.ts`) mirroring `packages/i18n`
- [x] T002 Add root scripts `release-notes:check` / `release-notes:pending` in `package.json` and run `pnpm install` so the workspace links the package

## Phase 2: Foundational

- [x] T003 [P] Tests for the parser (frontmatter subset, body groups, inline tokens, every error names the file) in `packages/release-notes/test/parse.test.ts`
- [x] T004 Implement `parseRelease(path, raw)` + `tokenizeInline` + types + zod checks in `packages/release-notes/src/parse.ts`
- [x] T005 Implement `buildCatalog(files)` (pairs es/en, requires both, `commits` only in es, newest first) and the eager glob `releases()` in `packages/release-notes/src/catalog.ts`; export from `src/index.ts`
- [x] T006 [P] Implement the lazy glob (`releaseIds()`, `latestReleaseId()`, `loadReleases(lang)`) in `packages/release-notes/src/lazy.ts`
- [x] T007 Write the first release `packages/release-notes/releases/2026-10-26-guias-chile/{es,en}.md` covering every feat/fix of `8af6853d..acae5486`
- [x] T008 [P] Catalog test over the real files (all valid, both languages) in `packages/release-notes/test/catalog.test.ts`
- [x] T009 [P] Shared i18n keys `releaseNotes.kinds.*` (es/en) in `packages/i18n/src/{es,en}.json`

## Phase 3: User Story 1 — Novedades en el sitio público (P1)

**Independent test**: build the landing; `/es/novedades/` and `/en/whats-new/` list the 2026-10-26 entry, paired, in sitemap, footer and llms.txt.

- [x] T010 [US1] Add page `releaseNotes` with `LOCALIZED_SLUGS` `novedades`/`whats-new` in `apps/landing/src/lib/language.ts` and the pair in `apps/landing/astro.config.mjs`
- [x] T011 [P] [US1] Inline tokens → HTML (escaped, `brandHtml` on text) in `apps/landing/src/domains/releases/lib/render.ts` with test `render.test.ts`
- [x] T012 [US1] Page `apps/landing/src/pages/[lang]/[releaseNotes]/index.astro` (h1, lead, one `<article id>` per release with date, title, summary, groups; "registro desde" note; JSON-LD CollectionPage + Breadcrumb)
- [x] T013 [US1] Landing i18n `landing.releaseNotes.*`, `landing.meta.releaseNotes.*`, `landing.footer.releaseNotes` in `apps/landing/src/i18n/{es,en}.json` (no dashes)
- [x] T014 [US1] Footer link in the fik column `apps/landing/src/domains/landing/components/Footer.astro` and `LISTED` in `apps/landing/src/domains/llms/lib/build.ts`
- [x] T015 [US1] Build tests (both pages, canonical/hreflang, sitemap pair, footer, llms.txt, no React) in `apps/landing/test/build.test.ts`; update the language unit test if it lists pages

## Phase 4: User Story 3 — Publicar sin olvidar registrar (P1)

**Independent test**: temp git repo: uncovered feat fails naming it; covered passes; only chore/docs passes; the real range `8af6853d..acae5486` passes.

- [x] T016 [P] [US3] Tests with a temporary git repo (uncovered feat fails naming it; covered by an abbreviated hash passes; `feat(scope)!:` and `fix:` count; only chore/docs/merges pass) in `packages/release-notes/test/check.test.ts`
- [x] T017 [US3] Implement `packages/release-notes/scripts/check.mjs` (exported `isUserFacing`, `readCovered`, `uncovered`, `formatReport`; CLI `--range/--pending/--root`)
- [x] T018 [US3] Run it from `.husky/pre-push` when a ref goes to `main` (range `origin/main..<sha>`)
- [x] T019 [US3] Job `release-notes` in `.github/workflows/ci.yml` on push to `main` (no `needs: gate`, `fetch-depth: 0`, range `before..sha`, skip on zero/unknown `before`)

## Phase 5: User Story 2 — Novedades en la app con punto (P2)

**Independent test**: account without seen → dot; opening `/whats-new` marks seen and the dot goes; another login sees no dot.

- [x] T020 [US2] Migration `apps/api/prisma/migrations/20261026000000_release_notes_seen/migration.sql` + `releaseNotesSeenId String?` in `apps/api/prisma/schema.prisma`; `prisma generate`
- [x] T021 [US2] Contract: `releaseIdSchema`, `markReleaseNotesSeenRequestSchema`, `CurrentUser.releaseNotesSeenId` (optional nullable) in `packages/contracts/src/auth/index.ts`
- [x] T022 [US2] Aggregate `markReleaseNotesSeen(id)` + prop + `toContract`, repo mapping in `apps/api/src/domains/user/domain/user.aggregate.ts` and `infrastructure/prisma-user.repository.ts`; unit test in `apps/api/test/unit/domains/user/domain/user.aggregate.spec.ts`
- [x] T023 [US2] `MarkReleaseNotesSeenCommand`/handler in `apps/api/src/domains/user/application/commands/`, registered in `user.module.ts`, route `POST me/release-notes/seen` in `presentation/auth.controller.ts`
- [x] T024 [US2] E2E `apps/api/test/e2e/domains/user/release-notes.http.spec.ts` (null → marks, never goes back, cross-login, 400, 401)
- [x] T025 [US2] Client `authApi.markReleaseNotesSeen` in `packages/client/src/authApi.ts`
- [x] T026 [US2] Web domain `apps/web/src/domains/release-notes/`: `lib/unseen.ts` (+test), `hooks/useReleaseNotes.ts`, `components/ReleaseItem.tsx`, `routes/ReleaseNotesRoute.tsx` (+test: lists, marks seen once; a failed mark is ignored and the list still shows)
- [x] T027 [US2] Route `/whats-new` in `apps/web/src/app/router.tsx` + `lazyPages.ts`; access + dot in `apps/web/src/app/AppLayout.tsx` (open sidebar, rail, phone sheet + "Más" dot); new test `apps/web/src/app/AppLayout.test.tsx` (dot with/without seen)
- [x] T028 [US2] Shared i18n `nav.whatsNew`, `releaseNotes.*` (title, lead, since, unseen, empty) in `packages/i18n/src/{es,en}.json`

## Phase 6: Polish

- [x] T029 Release entry for this feature's own commits `packages/release-notes/releases/<date>-novedades/{es,en}.md` (after the feature commits exist)
- [x] T030 Scoped tests, typecheck, lint, `check:boundaries`, `prettier --check`; `test:integration:local` for the user e2e

## Dependencies

Setup → Foundational → US1, US3 (independent) → US2 (needs the package from Phase 2) → Polish.
Parallel: T003/T006/T008/T009; T011 with T010; T016 with US1.

## Implementation Strategy

MVP = Phase 2 + US1 + US3 (the record and its guarantee); US2 adds the app access.
