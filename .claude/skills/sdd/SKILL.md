---
name: sdd
description: >
  End-to-end Spec-Driven Development (SDD) orchestrator for this repo, built on
  GitHub Spec Kit. Drives the full lifecycle command by command — constitution →
  specify → clarify → plan → checklist → tasks → analyze → implement — crafting
  the /speckit-specify prompt with the user, stopping at review gates, and asking
  whenever something is unknown instead of guessing. Use when the user wants to
  build a feature "the SDD way", says "spec kit", "speckit", "SDD", "spec-driven",
  "arranquemos una spec", "nueva feature con specify", or asks to run the spec
  workflow from idea to implementation.
metadata:
  type: workflow
  author: simon
user-invocable: true
disable-model-invocation: false
---

# SDD end-to-end orchestrator

You drive a complete Spec-Driven Development cycle for this project using the
installed **Spec Kit** skills. You are the conductor: you sequence the phases,
craft prompts, hold review gates, and keep project memory in sync. The user
talks to you; you invoke each `/speckit-*` skill at the right time.

The installed Spec Kit skills (invoke each via the Skill tool, in this order of the lifecycle):

| Phase | Skill                   | Purpose                                  | Required?                            |
| ----- | ----------------------- | ---------------------------------------- | ------------------------------------ |
| 0     | `/speckit-constitution` | Establish/update project principles      | First run, or when principles change |
| 1     | `/speckit-specify`      | Create the feature spec from a NL prompt | Always                               |
| 2     | `/speckit-clarify`      | Structured Q&A to de-risk ambiguity      | Strongly recommended                 |
| 3     | `/speckit-plan`         | Technical implementation plan            | Always                               |
| 4     | `/speckit-checklist`    | Quality checklist for the spec/plan      | Optional                             |
| 5     | `/speckit-tasks`        | Break plan into actionable tasks         | Always                               |
| 6     | `/speckit-analyze`      | Cross-artifact consistency report        | Strongly recommended                 |
| 7     | `/speckit-implement`    | Execute the tasks                        | Always                               |

## Golden rules (never violate)

1. **Ask, never assume.** If anything needed for the current phase is unknown or
   ambiguous, STOP and ask the user concrete questions before proceeding. Do not
   invent requirements, tech choices, scope, or acceptance criteria. Prefer the
   `AskUserQuestion` tool for discrete choices.
2. **One phase at a time, with review gates.** After `specify`, after `plan`, and
   after `tasks`/`analyze`, PAUSE and show the user what was produced. Get explicit
   approval ("approve" / "sigue" / "ok") before moving to the next phase. On
   rejection, iterate on the current phase — do not advance.
3. **Keep project memory in sync (NON-NEGOTIABLE).** The constitution
   (`.specify/memory/constitution.md`) and `CLAUDE.md` are living documents. On
   **any relevant change** — new architectural decision, new dependency, new
   convention, new principle, changed data model, new env var, new command — you
   MUST update BOTH files in the same session. See "Memory sync" below. Remind the
   user of this rule at the start and enforce it at the end of every cycle.
4. **Never skip the spec.** No jumping straight to `implement`. The artifacts must
   exist and be approved in order.
5. **Surface, don't hide, failures.** If a `/speckit-*` skill errors or produces
   incomplete output, report it verbatim and stop; do not paper over it.

## Preflight (run before phase 0, every time)

1. Confirm `.specify/` exists (templates, scripts, `memory/constitution.md`). If
   missing, tell the user Spec Kit isn't installed and stop — installation is:
   `uvx --from git+https://github.com/github/spec-kit.git specify init --here --integration claude --script ps --force`.
2. Read `.specify/memory/constitution.md`. If it still contains template
   placeholders (`[PROJECT_NAME]`, `[PRINCIPLE_1_NAME]`, etc.), the constitution
   has NOT been ratified → phase 0 is required this cycle.
3. Confirm git working tree state with the user if there are uncommitted changes
   that could collide with a new feature branch (Spec Kit's `specify` creates a
   numbered feature branch + `specs/NNN-*/` dir via its scripts).
4. State the plan to the user: which phases will run, and remind them of Golden
   Rule 3 (constitution + CLAUDE.md stay in sync).

## Phase 0 — Constitution (`/speckit-constitution`)

Run when placeholders remain or the user wants to change principles.

- Before invoking, gather the principles WITH the user. Ask about: testing policy
  (e.g. TDD or not), quality gates, tech-stack constraints, security/compliance
  rules, performance standards, review process. Don't fill placeholders yourself.
- For THIS repo, seed the discussion from what's already true (see CLAUDE.md):
  Next.js 14 App Router, Prisma/Postgres, NextAuth v5 (JWT), next-intl (es/en
  parity), money via `decimal.js`/`Prisma.Decimal`, per-user data isolation by
  `session.user.id`. Propose these as candidate principles, let the user confirm/edit.
- Invoke `/speckit-constitution` with the agreed content.
- Gate: show the resulting constitution; get approval.

## Phase 1 — Specify (`/speckit-specify`)

This is where you **craft the prompt** with the user.

1. Elicit the feature intent. Ask, as needed: What problem? Who is the user? What's
   in scope / explicitly out of scope? What does "done" look like (acceptance
   criteria)? Any UI, data, or integration touchpoints? Use `AskUserQuestion` for
   choices.
2. Draft a clear, self-contained specify prompt (the "what" and "why", NOT the
   "how" — no tech details; those belong in `plan`). Show the draft to the user and
   refine until they approve the prompt text.
3. Invoke `/speckit-specify "<approved prompt>"`.
4. Gate: review the generated `spec.md`. Check it captures intent, has testable
   acceptance criteria, and marks unknowns. Get approval before clarify/plan.

## Phase 2 — Clarify (`/speckit-clarify`)

- Invoke `/speckit-clarify`. It asks structured questions; relay them to the user,
  collect answers, and let the skill fold them back into the spec.
- If the spec already has zero ambiguity and the user opts out, you may skip — but
  recommend it for anything non-trivial.

## Phase 3 — Plan (`/speckit-plan`)

- Invoke `/speckit-plan`. This produces the technical plan (architecture, data
  model, contracts) honoring the constitution.
- If the plan requires a decision the user hasn't made (library choice, schema
  shape), STOP and ask. Don't let the skill guess silently.
- Gate: review the plan; get approval. If the plan introduces a new dependency,
  convention, or data-model change, flag it now for the Memory-sync step.

## Phase 4 — Checklist (`/speckit-checklist`, optional)

- Offer to run `/speckit-checklist` to validate requirement completeness/clarity.
  Run it if the user wants extra confidence on larger features.

## Phase 5 — Tasks (`/speckit-tasks`)

- Invoke `/speckit-tasks` to generate `tasks.md` (ordered, actionable units).
- Review with the user that task granularity and ordering make sense.

## Phase 6 — Analyze (`/speckit-analyze`, strongly recommended)

- Invoke `/speckit-analyze` for a cross-artifact consistency report (spec ↔ plan ↔
  tasks ↔ constitution). Resolve every inconsistency it finds BEFORE implementing.
- Gate: this is the final gate before implementation. Get explicit go-ahead.

## Phase 7 — Implement (`/speckit-implement`)

- Invoke `/speckit-implement` to execute the tasks.
- After it runs: verify the app builds/typechecks (`pnpm exec tsc --noEmit`,
  `pnpm run lint`, `pnpm build` as appropriate). Report results honestly.
- Then run Memory sync (below). The cycle is NOT done until memory is synced.

## Memory sync (run after constitution changes and after implement — always)

For any relevant change introduced this cycle, update BOTH:

1. **`.specify/memory/constitution.md`** — if a new durable principle, constraint,
   or governance rule emerged, add/amend it and bump the version + "Last Amended"
   date. Keep it principle-level, not task-level.
2. **`CLAUDE.md`** — update the architecture/commands/conventions sections with any
   new dependency, command, env var, data-model change, routing/auth change, or
   convention. This is what future Claude instances read first.
3. Optionally add a one-line entry to the persistent memory index if the change is
   a long-lived project fact.

Tell the user explicitly what you updated in each file (or state "no memory
changes needed" if truly nothing durable changed).

## Resuming mid-cycle

If artifacts already exist under `specs/NNN-*/`, detect the furthest completed
phase (spec.md → plan.md → tasks.md) and resume from the next phase rather than
restarting. Confirm with the user before resuming.

## Interaction style

Be concise. At each phase: say what you're about to run, run it, summarize the
output, then either ask a question or request approval for the gate. Match the
user's language (Spanish here).
