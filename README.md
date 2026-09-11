# Prometeia Issue Tracker

A UAT/SIT issue tracker for Prometeia and its bank clients: report issues, track
them through a status workflow, and monitor KPIs on a BI dashboard. See
`docs/superpowers/specs/2026-09-05-uat-tracker-design.md` for the full design.

## One-time setup

### 1. Create a Supabase project

1. Go to https://supabase.com, create a free account, then "New project".
2. Once it's provisioned, go to **Project Settings → API**. Copy the **Project URL**
   and the **anon public** key. (You do not need the **service_role** key anywhere —
   it bypasses Row Level Security, the app's entire access-control boundary, and
   nothing in this codebase uses it.)
3. Copy `.env.local.example` to `.env.local` and fill in the two values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<your project URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
   ```

### 2. Run the database migrations

In the Supabase dashboard, go to **SQL Editor → New query**, and run these three
files in order (paste each file's contents, click Run):

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_storage.sql`

### 3. Install dependencies and run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/login`.

### 4. Create the first Prometeia admin account

1. Go to `/signup`, create an account with your real Prometeia email.
2. By default Supabase requires email confirmation — check your inbox for the
   confirmation link (Supabase's default project sends real email, no extra setup
   needed for testing). Click it, then sign in at `/login`.
3. Every new account starts as a bank-tier user (`is_prometeia = false`) — nobody
   has admin rights yet on a fresh database. Promote yourself: in the Supabase
   dashboard, go to **SQL Editor** and run, substituting your email:
   ```sql
   update public.profiles set is_prometeia = true where email = 'you@prometeia.com';
   ```
4. Reload the app. You should land on `/new-engagement` (no engagements exist
   yet) and see the Prometeia logo and green "Create engagement" button.

### 5. Deploy to Vercel

1. Push this repository to a GitHub repo (already done —
   https://github.com/PromAMarra/IssueTracker, branch `master`).
2. Go to https://vercel.com, create a free account, "Add New Project", import the
   GitHub repo.
3. In the project's **Environment Variables** settings, add
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
   `.env.local`. Do not add `SUPABASE_SERVICE_ROLE_KEY` here or anywhere else —
   it isn't used by the app (it bypasses Row Level Security) and should never be
   deployed.
4. Deploy. Vercel gives you a URL like `https://uat-tracker-yourname.vercel.app`.
5. Back in Supabase, go to **Authentication → URL Configuration** and set **Site
   URL** to that Vercel URL, so email confirmation links point at the deployed
   app instead of `localhost`.

## Adding a bank to an engagement

1. As a Prometeia user, create an engagement (bank name, modules, team members,
   SLA days) from the engagement picker's "+ New engagement…" option.
2. Send the bank contact the deployed URL and ask them to sign up at `/signup`
   with their own email.
3. Once they have an account, go to the engagement's **Settings** page and add
   their email under "Bank members". They now see that engagement (and only that
   one) next time they log in.

## Smoke test checklist

Run through this once, end to end, after deploying:

- [ ] Sign up as a Prometeia user, promote via SQL, confirm you land on
      `/new-engagement`.
- [ ] Create an engagement with 2-3 modules, 2 team members, and default SLA
      days.
- [ ] Sign up a second account (a different email/browser profile) — confirm it
      has no engagements ("No engagement yet" screen).
- [ ] As the Prometeia user, add the second account's email as a bank member in
      Settings. Confirm the second account now sees the engagement.
- [ ] As the bank account, report 2-3 issues with different priorities and
      modules. Confirm the bank account cannot see any status/priority/assignee
      edit controls on the board or in the issue detail modal.
- [ ] As the Prometeia user, move one issue through Backlog → Ongoing → Ready for
      Test → Closed, assigning it to a team member along the way. Confirm each
      change appears in the issue's History log.
- [ ] Reopen the closed issue (set its status back to Ongoing). Confirm the
      History log shows a "reopened" entry and the Dashboard's reopen rate
      updates.
- [ ] Attach a real file to an issue as the bank account; confirm the Prometeia
      account can open it from the issue detail modal.
- [ ] Add a comment as each account; confirm both appear in the thread with the
      right author name.
- [ ] Open the Dashboard: confirm stat tiles, status/priority charts,
      time-to-close vs. SLA, throughput, module/org volume, and the aging report
      all reflect the seeded issues correctly.
- [ ] Create a second engagement for a different bank, add a third account as
      that bank's member, and confirm the third account cannot see the first
      bank's engagement in its picker or by guessing the URL.
