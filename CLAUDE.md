# CLAUDE.md — project instructions for Claude Code

## What this is

A working prototype of an AI-native coin marketplace. Collectors enter their
collections and the app turns set gaps into structured want lists. Wants are
routed to the dealers most likely to have the coin, including coins they never
listed. Dealer inventory items carry standing pricing rules ("item agents") that
reprice on spot and comps. Collectors and dealers exchange offers, including
parallel offers with first-acceptance-wins clearing.

Full product spec: `SPEC.md`. Read it before starting any session and re-read
the relevant section before each feature.

## Who you're working with

The founder is a professional coin dealer and is not an engineer. Therefore:

- Explain what you changed and why in plain English, two or three sentences,
  every time. Skip jargon unless you define it.
- One feature at a time. Finish it, run it, show it working, then move on.
- Never leave the app in a broken state at the end of a session. If something
  is half-done, stash it behind a flag or revert it.
- When you need a decision (naming, a rule's edge case, which series to add),
  ask in one sentence with a recommended default. Don't ask about technical
  choices; make them and mention them.
- The founder knows the coin domain far better than you. When a rule about
  coins, grades, dealers, or pricing seems off, ask rather than assume.

## Stack (do not change without asking)

- Next.js (App Router, TypeScript), Tailwind, shadcn/ui
- Supabase: Postgres, Auth (magic link email), Row Level Security
- Vercel for hosting; `main` auto-deploys
- Resend for transactional email (request notifications)
- Vercel Cron for the repricing job
- No payments provider. Checkout is simulated. See SPEC.md "Real vs. simulated".

## Conventions

- Database schema lives in `supabase/migrations/`. Every schema change is a
  new migration file; never edit an old one.
- Seed data lives in `supabase/seed/`. The coin catalog and set templates are
  seed data and must be re-runnable.
- Business logic (routing, pricing rules, offer clearing) lives in
  `lib/domain/` as pure functions with unit tests. UI calls those functions;
  it never re-implements them.
- Every pricing-rule evaluation and every routing decision writes an
  `agent_events` row explaining what it did and why. This is a product
  feature, not logging.
- Money is stored as integer cents. Grades are stored as Sheldon integers
  (1–70) plus an optional designation string (e.g. "PL", "DMPL", "RD", "FB").
- Keep `README.md` current with: how to run locally, how to seed, how to deploy.

## Commands

- `npm run dev` — local dev server
- `npm run db:reset` — reset local Supabase and re-run migrations + seed
- `npm run test` — unit tests for `lib/domain/`
- `npm run lint`

## Session discipline

Work follows the session plan in `SPEC.md` §10. At the start of a session,
state which session you're on and its acceptance criteria. At the end, confirm
each criterion is met or say plainly which isn't and why.
