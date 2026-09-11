# Bydd

An AI-native marketplace for coin collectors and dealers. Collectors track their
sets, turn set gaps into structured want lists, and receive offers; dealers
manage inventory with standing pricing rules ("item agents") that reprice on
spot and comps. Full product spec: [SPEC.md](SPEC.md). Build plan:
[SESSIONS.md](SESSIONS.md). Conventions for contributors: [CLAUDE.md](CLAUDE.md).

**Status:** Session 0 (skeleton) — magic-link auth, a `profiles` table with
collector/dealer/admin flags, a Collector/Dealer role switcher, and deployment.

## Stack

- Next.js 16 (App Router, TypeScript), Tailwind CSS v4, shadcn/ui
- Supabase — Postgres, Auth (magic link), Row Level Security
- Vercel hosting; every push to `main` auto-deploys
- (Coming later: Resend for email, Vercel Cron for the repricing job)

## Prerequisites

- Node.js 20+ and npm
- A Supabase project
- A Vercel account with this repo connected (for deploys)

## Environment variables

Create `.env.local` in the project root (it is git-ignored):

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-publishable-or-anon-key>
```

Find both in the Supabase dashboard under **Settings → API**. Use the
**publishable** key (older projects call it the **anon/public** key). Never put
the **secret** / `service_role` key in the client env or in git.

## Run locally

```
npm install
npm run dev
```

Open http://localhost:3000. You'll be redirected to `/login`; enter your email,
click the magic link **in the same browser**, and you'll land on the dashboard.

## Database & seed

- Schema migrations live in `supabase/migrations/`. Session 0 adds `profiles`
  (collector/dealer/admin flags), Row Level Security, and a trigger that
  auto-creates a profile row when a user signs up.
- To apply a migration to your Supabase project, paste the migration SQL into
  the Supabase **SQL Editor** and run it.
- The Supabase CLI workflow — `npm run db:reset` to re-run migrations plus seed
  data locally — and the coin catalog / set-template seed data are set up in
  **Session 1**.

## Auth configuration

In Supabase → **Authentication → URL Configuration**:

- **Site URL**: your production URL (e.g. `https://bydd2.vercel.app`)
- **Redirect URLs**: add both
  - `http://localhost:3000/**`
  - `https://<your-production-domain>/**`

## Deploy

- Hosted on Vercel. Every push to `main` triggers a production deploy.
  Production URL: https://bydd2.vercel.app
- Set the same two environment variables in the Vercel project
  (**Settings → Environment Variables**) for Production (and Preview).

## Scripts

- `npm run dev` — local dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run lint` — lint
- `npm run db:reset` — reset local DB, run migrations + seed (available from Session 1)
