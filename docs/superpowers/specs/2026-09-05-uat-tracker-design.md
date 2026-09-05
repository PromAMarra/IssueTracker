# UAT Issue Tracker — Design (v2: real web app)

## Purpose
Replace the Excel-based UAT issue log shared between Prometeia and bank clients with a
lightweight web platform: report issues, track them through a status workflow, and
monitor KPIs (time-to-close, backlog, reopen rate) via BI charts.

## Why v2
The original design targeted a Claude Artifact for zero-setup hosting. That was
abandoned after reading the `db` capability's actual contract: an artifact using
shared data is organization-internal by platform rule — bank employees, outside
Prometeia's Claude organization, could never open it. A real web app is required for
cross-company access.

## Platform
- **Frontend:** Next.js (App Router, React), Tailwind for styling.
- **Backend:** Supabase — managed Postgres, authentication, file storage, row-level
  security. Free tier. Nothing to administer as a server or database.
- **Hosting:** Vercel, free tier. The user creates both accounts and connects them
  (account creation and credential entry are not things I can do on their behalf);
  deployment steps are documented at handoff.
- **Auth:** Email + password (Supabase Auth). Open self-signup; access to any given
  engagement's data is separate from having an account (see Roles).

## Roles & access model
- `profiles.is_prometeia` (boolean, default false) marks Prometeia staff, who see and
  manage every engagement.
- Bank users see only engagements they're an explicit member of
  (`engagement_members`), added by a Prometeia admin via Settings by email lookup —
  no invite-email system; the bank user signs up themselves first, then gets added.
- **Prometeia:** full control — create/edit engagements, change status/priority/
  assignee, edit settings (modules, SLA days, team list, bank logo), manage members.
- **Bank:** create issues, comment, view board/list/dashboard. Cannot change status,
  priority, assignee, or settings.
- First Prometeia admin account is promoted manually in Supabase directly (one-time,
  documented in deployment steps) since no one has `is_prometeia = true` yet on a
  fresh database.

## Data model (Postgres via Supabase)
- `profiles` (mirrors `auth.users`): `id`, `email`, `full_name`, `is_prometeia`.
- `engagements`: `id`, `name`, `bank_name`, `bank_logo_url` (Supabase Storage),
  `modules` (text[]), `team_members` (text[], assignee options), `sla_days`
  (jsonb: Critical/High/Medium/Low → integer), `next_issue_seq`, `created_at`.
- `engagement_members`: `engagement_id`, `user_id` — bank users' access grants.
- `issues`: `id`, `engagement_id`, `key` (e.g. `BANK-12`), `title`, `description`,
  `status`, `priority`, `module`, `org` (`prometeia`/`bank`), `reporter_id`,
  `assignee` (text, from engagement's team list), `created_at`, `closed_at`.
- `issue_comments`: `id`, `issue_id`, `author_id`, `body`, `created_at`.
- `issue_history`: `id`, `issue_id`, `field`, `from_value`, `to_value`, `changed_at`,
  `changed_by`. Every status/priority/assignee/module change is appended here.
- `issue_attachments`: `id`, `issue_id`, `storage_path`, `file_name`, `uploaded_by`,
  `uploaded_at`. Files live in a Supabase Storage bucket; real uploads (drag-and-drop
  or file picker), not link-pasting.
- Row-level security enforces the roles above at the database layer, not just in the
  UI.

## Workflow
Statuses: **Backlog → Ongoing → Ready for Test → Closed**, plus **Rejected**
(terminal, not-a-bug/won't-fix). **Reopened is an action, not a resting column:**
reopening a Closed issue moves it back to Ongoing and appends a "reopened" history
row (feeds the reopen-rate KPI). Priorities: Critical/High/Medium/Low, each with a
configurable SLA (target days-to-close) per engagement.

## Views
1. **Engagement picker** (header) — Prometeia users switch between all engagements or
   create a new one; bank users see only their own (typically exactly one).
2. **Board** — Kanban columns per status.
3. **List** — sortable/filterable table (status, priority, module, assignee, org).
4. **Issue detail** — description, real file attachments, comments thread, full
   history log, inline edit (Prometeia only) of status/priority/assignee/module,
   reopen/close actions.
5. **New issue form** — title, description, priority, module (from engagement's
   configured list), optional attachment upload. Org and reporter are implicit from
   the logged-in account.
6. **Settings** (Prometeia only) — module list, team/assignee list, SLA days per
   priority, engagement name/bank name, bank logo upload, member management (add a
   bank user by email).
7. **BI Dashboard** — status distribution, priority distribution, time-to-close
   (actual vs. SLA target per priority, breach flagging), throughput trend (opened vs.
   closed per week), aging report for open issues (days open, breaches highlighted),
   volume by module, volume by org (bank-raised vs. Prometeia-raised), reopen rate.

## Branding
Prometeia's real palette and logo (fetched from prometeia.com: navy `#000D4C`,
bright green `#33E578`, blue `#0026FF`) are the platform's fixed visual identity.
Each engagement's bank logo is a real uploaded file (Supabase Storage), shown beside
the Prometeia logo in the header. Typography: IBM Plex Sans (UI/headings) paired with
IBM Plex Mono for ticket keys, timestamps, and tabular figures.

## Out of scope for v1 (explicitly deferred, not forgotten)
- Email notifications on status change/assignment (would need a transactional email
  provider; not requested).
- Invite-by-email for bank members (self-signup + manual add instead).
- Anything beyond the two roles (no per-engagement admin sub-roles).

## Verification plan
Run the app locally, exercise: sign-up as a Prometeia user (manually promoted),
create an engagement with modules/team/SLAs, sign up as a bank user and get added as
a member, create issues from both roles, confirm role restrictions hold (bank cannot
change status), attach a real file, comment, exercise the full status lifecycle
including reopen, confirm the board/list update, confirm dashboard charts reflect
seeded data correctly (status/priority mix, time-to-close vs. SLA, throughput, aging,
reopen rate), and confirm a second bank's member cannot see the first bank's
engagement (RLS isolation).
