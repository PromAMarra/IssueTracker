# Concurrency & performance review — ~10 concurrent users

## A note on methodology, up front

This is **not** the output of a live load-testing tool (k6, Artillery, autocannon,
etc.) hitting a running instance. This sandbox has no live Supabase project
credentials and no running dev server, so no traffic was ever actually generated
against a real database. If a literal stress test with real latency/throughput
numbers is needed, it has to be run against a real (staging) Supabase project and
deployed instance — happy to help set that up separately.

What follows is a **static code and architecture review**, specifically scoped to
"what breaks or degrades once ~10 people use this at the same time," produced by
three independent reviewers (backend/database, frontend/client, concurrent-write
data integrity) each reading the actual source and Supabase migrations directly,
followed by an adversarial verification pass on every finding before it's listed
here. Every claim below is grounded in specific files/lines that were re-checked
against the live repository, not assumed from general Next.js/Postgres knowledge.

## Scope

Prometeia Issue Tracker — Next.js 14.2.35 App Router, TypeScript, Supabase
(Postgres + Auth + Storage + RLS), Server Actions as the sole mutation path.

## Findings

### Fixed in this pass

**1. No optimistic-concurrency check on any issue mutation (data-integrity bug, not just a perf issue)**

`updateIssueStatus`, `updateIssuePriority`, `updateIssueAssignee`, and
`updateIssueModule` each read a row, computed a patch in JS, then did a blind
`UPDATE ... WHERE id = issueId` with no check that the row hadn't changed since
the read. Two people editing the same ticket within a short window — e.g. one
closing a ticket (which auto-hands it back to the reporter) while another
reassigns it to someone else — could silently lose an update with no error to
either user, and could corrupt the `issue_history` audit trail with a
`from_value` that was never actually true at write time (a real
"closed → reopened" transition getting logged as an ordinary forward move),
which quietly skews the dashboard's time-in-status and reopen-rate numbers.

**Fix:** each mutation now conditions its `UPDATE` on the exact field(s) it read
(`.eq('status', current.status)`, plus `.eq('assignee_id', current.assignee_id)`
when closing; `.eq('priority', ...)`; `.eq('assignee_id', ...)`; `.eq('module',
...)` — using `.is(col, null)` instead of `.eq(col, null)` when the current value
is null), and treats zero rows affected as a genuine conflict, surfacing
`"This ticket changed since you loaded it. Please refresh and try again."`
instead of a silent, wrong success.

**2. Every single-field edit re-fetched the entire engagement**

`Board.tsx`/`IssueTable.tsx` called `router.refresh()` after every
status/priority/assignee/module edit, and — as three review rounds
progressively uncovered — Next.js's own Server Actions runtime was *also*
independently forcing the same full-engagement `listIssues()` +
`listHistoryForEngagement()` re-render inside the action's own response
whenever `revalidatePath()` was called during it, regardless of the client-side
refresh. Confirmed by reading Next 14.2.35's actual compiled runtime source
(`pathWasRevalidated` / `skipFlight` in `next/dist/server/...`), not assumed
from documentation.

**Fix, in the order it was actually found and corrected (kept here rather than
smoothed over, since each round caught a real gap the previous one missed):**
- Round 1: had the four mutations return the fresh row + new history rows;
  `Board.tsx`/`IssueTable.tsx` now patch just the one changed issue into local
  state instead of calling `router.refresh()`, with a tab-focus-triggered
  refresh added back as the mechanism for picking up other users' changes.
- Round 2 (review caught this didn't fully work): removed the leftover
  `revalidatePath('/board')`/`revalidatePath('/list')` calls, which were still
  forcing the same-response full re-render independent of the client change.
- Round 3 (review caught *this* didn't fully work either): the
  `pathWasRevalidated` flag is a single unscoped boolean for the whole action
  invocation, not tied to which path string was passed — a surviving
  `revalidatePath('/dashboard')` call in three of the four mutations still
  triggered the same full re-render of whichever route (board or list) was
  actually open. Removed those too. All four mutations now call zero
  `revalidatePath()`.

**Known, accepted residual (Minor, not fixed):** a Supabase auth-token-refresh
cookie write during one of these actions can independently set the same
`pathWasRevalidated` flag via Next's cookie-mutation adapter, unrelated to
`revalidatePath`. This is infrequent (tied to JWT refresh timing, not per-edit)
and considered out of scope for this pass.

### Found, not fixed in this pass (flagged for a future round)

| Finding | Severity | Why deferred |
|---|---|---|
| Notification emails have no throttling and silently drop on a Resend rate-limit response | Important | In-app notifications are unaffected (written by DB triggers); only the email channel is at risk. |
| `NotificationBell`'s 30s poll has no cross-tab/user coordination, and nothing else refreshes a viewer's board — a viewer can work off an arbitrarily stale snapshot until their own next edit or tab-focus event | Important | Real fix is a Supabase Realtime subscription; a larger, separate change. |
| Fixed, unjittered retry backoff (`fetchWithRetryNode`) could synchronize into a retry storm during a load spike | Important | Forward-looking; not yet observed as a real bottleneck at this scale. |
| Missing partial index for the unread-notification-count query | Minor | Cheap to fix later; negligible at current data volumes. |
| `DailyDefectsChart` ships the full raw issue array (incl. description text) to the client and re-aggregates data the server already computed | Minor | Bandwidth/CPU hygiene, not a real bottleneck at 10 users. |
| A reassignment race can trigger one duplicate "assigned to you" email | Minor | Cosmetic — no data impact. |
| A status-change email can occasionally describe an already-stale status if a second change lands before the email sends | Important (cosmetic) | DB and history stay correct; only the email's wording can be stale. |

### Checked and confirmed to be non-issues

- `profiles` RLS policy's `engagement_members` self-join per row — real query
  shape, but this app's own rosters are small by design (README's own example:
  "2-3 modules, 2 team members"), so the cost is sub-millisecond regardless of
  concurrency.
- `profileName()`/`recipientEmails()` re-fetching overlapping profile rows
  within one mutation — a few extra ms per action, doesn't scale with
  concurrent user count (already a known, previously-deferred Minor item).
- No memoization/virtualization on `Board`/`IssueTable` — a real client-side
  cost, but paid once per the acting user's own edit; doesn't multiply with
  how many *other* people are concurrently active.
- Notification table read/write "races" — checked in detail; confirmed to be
  harmless UI staleness only, no data-loss or cross-user leakage risk.

## Verification performed

- `npx tsc --noEmit` — clean, at every commit in this pass.
- `npx vitest run` — 60/60 passing, at every commit in this pass.
- `npm run build` — clean production build, all 7 routes, at every commit.
- Each fix was independently code-reviewed (fresh context, adversarial) before
  merging, including three full re-review rounds on the `revalidatePath` fix
  specifically, each one re-verified against Next.js's actual installed
  runtime source rather than trusted from a commit message.
- **Not performed:** an actual live load test (concurrent HTTP traffic against
  a running instance, real latency/throughput/error-rate numbers). See the
  methodology note at the top.

## Commits

- `7c31270` — optimistic-concurrency guards + local-state patch (round 1)
- `971dcb6` — remove `/board`,`/list` revalidatePath (round 2)
- `8874bdb` — remove remaining `/dashboard` revalidatePath (round 3, closes the gap)
