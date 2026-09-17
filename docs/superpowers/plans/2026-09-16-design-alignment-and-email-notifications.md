# Plan: DESIGN.md alignment + Outlook email notifications

**Spec:** `C:\Users\marraa\.claude\DESIGN.md` (Prometeia design system — colors, typography, elevation, radius, components)

## Context

Two independent epics requested together:

1. Bring the front-end's actual colors/fonts/elevation/radius in line with `DESIGN.md`. A full audit already exists (see "Audit findings" below) — this plan turns it into concrete tasks.
2. In addition to the existing in-app notification bell, send a real email (via Resend) for the same three events: issue assigned, comment added, status changed.

## Global Constraints

- Do not rename existing Tailwind color tokens that are already correct (`brand-teal`, `brand-orange`, `brand-gray-light`) — only correct wrong hex values and add missing tokens.
- Every color hex value used in code must come from a Tailwind token (`bg-primary`, `text-ink`, etc.) — never a new inline hex.
- `RESEND_API_KEY` must be read from `process.env` only, never hardcoded. Email-sending code must live in Node.js-runtime code (Server Actions / `lib/`), never in `middleware.ts` (Edge runtime — cannot use the `resend` SDK, same constraint as `lib/supabase/fetchWithRetryNode.ts` documented elsewhere in this codebase).
- A failure to send an email must never fail or roll back the underlying mutation (creating the issue, posting the comment, changing status) — wrap each send in try/catch, log, and continue. The in-app notification is the reliable path; email is best-effort.
- Every task must end with `npm test` passing and `npx tsc --noEmit` clean.
- No new inline `style={{...}}` — Tailwind classes only, consistent with the rest of the codebase.

## Audit findings (source of truth for Task 1-5)

Current `tailwind.config.ts` vs `DESIGN.md`:

| Token | Current | Should be | Fix |
|---|---|---|---|
| `brand-blue` | `#0026FF` | `#0025FF` | correct hex |
| `brand-green` | `#00DC78` | `#00DB78` | correct hex |
| `brand-red` | `#FF0D21` | `#FF0D20` | correct hex |
| `ink` | `#12213F` | `#000D4C` | correct hex (spec's headline/ink color) |
| `surface` | `#F5F7FB` | `#FFFFFF` (canvas) | body background should be pure white per spec ("anchor pages on white"), not a gray-blue tint |
| *(missing)* | — | `primary-active` `#001CC4` | add |
| *(missing)* | — | `primary-soft` `#E5E9FF` | add (focus rings, selected rows) |
| *(missing)* | — | `hairline` `#D9DDE3` | add (replaces `border-ink-soft/30` and `shadow-sm`) |
| *(missing)* | — | `body` `#3A4160` | add (running text — currently conflated with `ink`/`ink-soft`) |

Font: app loads **IBM Plex Sans / IBM Plex Mono** (Google Fonts). Spec requires **Arial** (corporate face, needs no web-font load) as primary, **Inter** as the screen substitute, **JetBrains Mono / Consolas** for code.

Primary buttons (Sign in, Create account, Report issue, Send comment) fill with `bg-brand-navy`. Spec: electric blue is the action color; navy is reserved for headline text and dark surfaces. This is backwards and is the single most visible deviation.

Elevation: app uses `shadow-sm` broadly on cards/tables/board columns. Spec: depth is "color-block and rule-line first, shadow last" — cards get a 1px hairline border; shadow is reserved for rare floating elements (none currently exist in this app).

Radius: most buttons/inputs use Tailwind's bare `rounded` (4px). Spec wants buttons/inputs at 6px (`rounded-md`).

## Task 1: Correct color tokens and add missing ones

Files: `tailwind.config.ts`

In the `colors` block:
- Change `'brand-blue': '#0026FF'` → `'#0025FF'`
- Change `'brand-green': '#00DC78'` → `'#00DB78'`
- Change `'brand-red': '#FF0D21'` → `'#FF0D20'`
- Change `ink: '#12213F'` → `'#000D4C'`
- Add `'primary-active': '#001CC4'`
- Add `'primary-soft': '#E5E9FF'`
- Add `hairline: '#D9DDE3'`
- Add `body: '#3A4160'`
- Change `surface: '#F5F7FB'` → `'#FFFFFF'`

Do not touch `brand-navy`, `brand-navy-2`, `brand-teal`, `brand-orange`, `brand-gray`, `brand-gray-light`, `ink-soft` — leave as-is.

Also update `app/globals.css`: change `body { background-color: #f5f7fb; color: #12213f; }` to `background-color: #ffffff; color: #000D4C;` (or reference the updated tokens' literal values — this file is plain CSS, not Tailwind classes, so literal hex here is correct and expected).

Verify: `npx tsc --noEmit` (no type errors from the config change), `npm test` (unaffected, but must still pass), `npm run build` (Tailwind must compile the new tokens without error).

## Task 2: Swap typeface to Arial/Inter + JetBrains Mono

Files: `app/layout.tsx`, `tailwind.config.ts`

In `app/layout.tsx`:
- Replace the IBM Plex Google Fonts `<link>` (currently loading `IBM+Plex+Mono` and `IBM+Plex+Sans`) with one loading `Inter` (weights 400 and 700 are sufficient — the design system only uses those two weights) and `JetBrains+Mono` (weight 400).
- Keep the two `<link rel="preconnect">` tags as-is (same Google Fonts hosts).

In `tailwind.config.ts`:
- Change `fontFamily.sans` to `['Arial', '"Inter"', 'Helvetica', 'system-ui', 'sans-serif']` (Arial first — it needs no web-font load and is the declared corporate face; Inter is the loaded substitute for browsers/OSes without a good Arial rendering).
- Change `fontFamily.mono` to `['"JetBrains Mono"', 'Consolas', 'ui-monospace', 'monospace']`.

Verify: run the app locally (`npm run dev`), load `/login`, confirm in DevTools' Network tab that `Inter` and `JetBrains Mono` load (not IBM Plex), and confirm no console errors about the font. `npm test` must still pass (no test depends on font family).

## Task 3: Flip primary buttons to electric blue; correct button typography weight

Files: `app/login/page.tsx`, `app/signup/page.tsx`, `components/issues/NewIssueForm.tsx`, `components/issues/IssueDetailModal.tsx`

Every button currently styled as a **filled navy button with white text** (the pattern `bg-brand-navy ... text-white hover:bg-brand-navy-2`) is a primary CTA per its role (Sign in, Create account, Report issue, Send comment) and must become an **electric-blue** button per spec:
- `bg-brand-navy` → `bg-primary`
- `hover:bg-brand-navy-2` → `hover:bg-primary-active`
- `font-medium` → `font-bold` (spec: button typography is weight 700, not 500)

Do this for every occurrence of that exact pattern in the four files above. Do NOT change any button that is not filled-navy-with-white-text (e.g., secondary/outline buttons, text links) — those are out of scope for this task.

Grep command to find every occurrence before editing, and to confirm zero remain after: `grep -rn "bg-brand-navy" app components` (a match remaining after this task is complete means either it was missed, or it is a legitimate non-button navy usage — call out any such case in your report rather than silently leaving it).

Verify: `npm test`, `npx tsc --noEmit`, and a visual check — start the dev server, screenshot the login page and the "Report issue" form, confirm the primary button is now electric blue, not navy.

## Task 4: Replace shadow elevation with hairline borders

Files: `components/issues/Board.tsx`, `components/issues/IssueTable.tsx`, `components/issues/NewIssueForm.tsx`, `components/issues/IssueDetailModal.tsx`, and any other file under `components/` or `app/` using `shadow-sm` on a card/table/container (grep for `shadow-sm` across `app/` and `components/` to find all occurrences — there may be more than the four files named here).

Per spec, cards/tables get a 1px hairline border instead of a drop shadow. For each `shadow-sm` found on what is a card, table wrapper, or board-column card:
- Remove `shadow-sm`.
- Add `border border-hairline` (using the new token from Task 1 — this task depends on Task 1 being complete first).

Exception: if any `shadow-sm` is on a genuinely floating/overlay element (a dropdown menu, a modal that already has its own backdrop — check `IssueDetailModal`'s outer modal container, which may be a legitimate floating-panel case per spec's "rare — dropdowns, floating panels" exception), leave the shadow in place and note which element(s) you kept as an exception and why in your task report.

Verify: `npm test`, `npx tsc --noEmit`, visual check of the Board and List views (screenshot) confirming cards now show a thin gray border instead of a shadow.

## Task 5: Correct button/input border radius to 6px

Files: same four files as Task 3, plus `components/issues/IssueTable.tsx` and any other file with form inputs/buttons using bare `rounded` (grep for ` rounded ` and ` rounded"` — bare, not `rounded-md`/`rounded-lg`/`rounded-full`/`rounded-pill` — on `<input>`, `<select>`, `<textarea>`, and `<button>` elements specifically; do not change `rounded` on non-form elements like avatar circles or badges, which is out of scope).

Change bare `rounded` → `rounded-md` on every matching input/select/textarea/button. Tailwind's default `rounded-md` is 6px, matching spec exactly — no config change needed for this token.

Verify: `npm test`, `npx tsc --noEmit`.

## Task 6: Resend email integration — client and template

Files (new): `lib/email/resend.ts`, `lib/email/sendNotificationEmail.ts`
Files (modified): `package.json` (add `resend` dependency), `.env.local.example` (add `RESEND_API_KEY=` and `NOTIFICATION_FROM_EMAIL=` placeholders)

- `npm install resend` (do not use a different email SDK).
- `lib/email/resend.ts`: a small module exporting a lazily-constructed `Resend` client, reading `process.env.RESEND_API_KEY`. If the env var is unset, export a flag/function so callers can skip sending rather than throwing (local dev without an API key must not crash the app).
- `lib/email/sendNotificationEmail.ts`: exports `async function sendNotificationEmail({ to, subject, body }: { to: string; subject: string; body: string })`. Sends a simple plain-text (or minimal HTML) email via the Resend client from `process.env.NOTIFICATION_FROM_EMAIL`. Wraps the send in try/catch, logs a warning on failure (`console.warn`), and never throws — callers must be able to fire-and-forget this without affecting their own error handling. If `RESEND_API_KEY` is unset, log a one-line debug message and return immediately (no-op) rather than attempting a send.

This task has no UI and no existing behavior to change — it is new, additive code. Write a unit test (`lib/email/sendNotificationEmail.test.ts`) using Vitest that mocks the Resend client and verifies: (a) it calls send with the right `to`/`subject`/`from`, (b) it does not throw when the mocked send rejects, (c) it no-ops without calling send when `RESEND_API_KEY` is unset.

Verify: `npm test` (including the new test file), `npx tsc --noEmit`.

## Task 7: Wire email sending into the three notification events

Files: `app/actions/issues.ts` (all three call sites: assignment on creation, `updateIssueStatus`'s assignment/status-change history, `addComment`), `app/actions/notifications.ts` (read-only, likely unaffected — confirm)

This task depends on Task 6.

The in-app `notifications` table rows are written by **database triggers**, not by the Server Actions directly (this codebase's existing architecture) — so the Server Actions cannot simply "read the row it just inserted." Instead, for each of the three events, the Server Action already has (or can fetch with one extra query) everything needed to also send an email immediately after the underlying mutation succeeds:

1. **Issue assigned** (`createIssue` when `assigneeId` is set, and `updateIssueAssignee`): after the insert/update succeeds, if there is an assignee, fetch that user's email from `profiles` and call `sendNotificationEmail` with a subject like `[<engagement key_prefix>] Ticket <key> assigned to you` and a body containing the ticket title and a link (construct the link from `NEXT_PUBLIC_SITE_URL` env var if one exists in this codebase — check `lib/` and `.env.local.example` for an existing convention first; if none exists, add `NEXT_PUBLIC_SITE_URL` to `.env.local.example` and fall back to a relative path if unset).
2. **Comment added** (`addComment`): after the insert succeeds, fetch the issue's reporter and assignee (whoever is not the comment's author) and email them: `New comment on <key>`.
3. **Status changed** (`updateIssueStatus`): after the update succeeds, email the ticket's reporter (this is also the point where the ticket is reassigned back to the reporter on close, per existing logic already in this function — read it before editing) with `<key> status changed to <status>`.

Do not duplicate the DB trigger's notification logic — the trigger still runs and still creates the in-app notification row exactly as it does today. This task ONLY adds an email send alongside it, in the Server Action, using data the Server Action already has or can cheaply fetch.

Each email send must be wrapped so a failure cannot fail the Server Action (see Global Constraints) — `sendNotificationEmail` already swallows its own errors per Task 6's contract, but double-check the call site doesn't `await` it in a way that would propagate a rejection (e.g., fire it without blocking the response if that fits the existing code style, or `await` it since it never throws — either is fine, but confirm it never throws before deciding).

Add or extend tests in `app/actions/issues.test.ts` if one exists (check first — if not, this task does not need to create a full Server Action test suite from scratch; a unit test around the email-sending helper call is Task 6's job, not this one's). If no such test file exists, skip adding one for this task rather than inventing test infrastructure the rest of the codebase doesn't have — note this in your report.

Verify: `npm test`, `npx tsc --noEmit`, and a manual smoke test if a working local Supabase session is available (report BLOCKED with details if not — do not skip verification silently).

## Notes for the controller (not for implementers)

- Tasks 1-5 are the DESIGN.md epic; 6-7 are the email epic. They touch disjoint files except Task 4/5 both touch the same four component files as Task 3 — dispatch in order 1→2→3→4→5→6→7 to avoid merge conflicts within the branch (each task builds on the previous one's commits, same worktree, sequential dispatch — no parallel implementers).
- Task 3 must complete before Task 4 (Task 4's report references "the primary button is now electric blue" as a sanity check, and both touch the same files).
- `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL` real values are not required to complete Tasks 6-7 — the code must work correctly in their absence (no-op) per the Global Constraints. The user will supply real values via environment variables (local `.env.local` and Vercel) after this plan is merged.
