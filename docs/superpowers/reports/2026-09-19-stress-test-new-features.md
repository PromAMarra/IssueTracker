# Stress-test review — today's six-feature batch

## A note on methodology, up front

Same caveat as the [2026-09-18 concurrency & performance review](2026-09-18-concurrency-performance-review.md):
this is **not** a live load test. This sandbox has no Supabase project credentials
and no running dev server, so no real HTTP traffic, latency numbers, or
throughput figures were ever generated against an actual database. If a literal
stress test — real concurrent connections, real timing — is wanted, it needs to
run against a real (ideally staging) Supabase project and a deployed instance;
happy to help set that up separately.

What follows is a **static review** of the six features shipped today
(turn-based comment/attachment locking, an assignee-hand-back bug fix, widening
auto-hand-back to two more statuses, the "Open a ticket" modal, priority-based
board sorting, and the SIT-optional toggle), specifically for anything that
degrades or breaks under concurrent use, plus confirmation that yesterday's
fixes are still intact. Every claim is grounded in the actual current source,
re-read for this pass, not assumed from the commit messages.

## Scope

The six features merged today, on top of the codebase reviewed in the
2026-09-18 report: `8fd6795`, `a7e75a6`, `7dbe97a`, `4d345e7`, `6b00f1a`,
`f8b804a`, `cc4685e`.

## Findings

### New query cost — checked against existing indexes, no new index needed

The turn-based lock (`lib/issueAccess.ts`, wired into `addComment` and
`uploadAttachment` in `app/actions/issues.ts:517-524` and `:706-728`) adds one
`select('status, reporter_id')` by primary key before every comment/attachment
write — negligible, hits the primary key index. The reporter-filing exemption
in `uploadAttachment` (`issues.ts:717-728`) adds two `count`-only queries
(`issue_comments`/`issue_history` filtered by `issue_id`), but only on the path
where the turn-lock would otherwise block — i.e. only for a reporter posting
outside their own turn, not on every request. Both tables already have an
`(issue_id, ...)` index from `0010_perf_indexes.sql`, so neither query scans.
The SIT-toggle's new check in `addMemberByEmail` (`app/actions/engagements.ts`)
adds one more by-primary-key `select` — an admin-only, low-frequency action.
None of this changes the app's risk profile at the ~10-concurrent-user scale
the previous report was scoped to.

### Minor, not fixed — a time-of-check-to-time-of-use gap in the turn-lock

`addComment`/`uploadAttachment` read the issue's `status` and then, in a
separate step, insert the comment/attachment — there's no guard tying the
insert to the status still being what was just read. If Prometeia changes a
ticket's status in the split second between a Bank/SIT user's turn-lock check
passing and their insert landing, the comment can land a moment into the
"wrong side's" window. This differs from the mutations reviewed yesterday
(`updateIssueStatus` etc.) in one important way: those write a *row*, so a
stale read could silently overwrite a concurrent change — real data
corruption, which is why they got an optimistic-concurrency guard. A comment
or attachment is an *append*, not an overwrite — nothing is lost or
corrupted, worst case is a single message existing a few hundred milliseconds
outside its intended turn window. Given the practical timing (a human typing
a comment and a Prometeia user changing status within the same instant is a
rare coincidence) and the low severity (cosmetic — the message itself is
still fully attributed and visible to everyone), this is deferred rather than
fixed, same disposition as similar Minor items in the previous report.

### Confirmed still intact

- The optimistic-concurrency guards on `updateIssueStatus` fixed yesterday
  (`.eq('status', current.status)` etc.) are unchanged by today's widening of
  the hand-back logic — the guard now also covers `ready_for_test` and
  `rejected`, using the exact same pattern, not a new one (`issues.ts`,
  `isHandBack` branch). No new race introduced.
- No `revalidatePath()` calls were reintroduced by any of today's changes —
  confirmed by re-grepping `app/actions/issues.ts` and `app/actions/
  engagements.ts` after all six merges. The full-engagement-refetch-per-edit
  issue fixed yesterday stays fixed.

### Found, not in scope for this pass

- Ticket-detail data (`getIssueDetail`) still fetches comments, history, and
  attachments in full on modal open regardless of whether their sections are
  expanded — collapsing them by default (today's change) reduces initial DOM
  size but not the fetch itself. Worth a lazy-fetch-on-expand pass if any
  ticket ever accumulates enough comments/history for this to matter; not
  worth it at today's realistic data volumes.
- Board's priority sort (`Board.tsx`) is an in-memory `Array.prototype.sort`
  per column on every render — O(n log n) over however many tickets are in
  that status, entirely client-side, no server round-trip. Not a concern at
  realistic per-engagement ticket counts.

## Verification performed

- `npx tsc --noEmit`, `npm test`, `npm run build` — all clean, at every one of
  today's six merge points (85/85 tests passing at each, after each
  worktree's stray copy was cleaned up so the count wasn't double-reported).
- Each feature was reviewed (either self-reviewed against its own brief, or —
  for the SIT-optional change — read back against its diff) before merging.
- **Not performed:** an actual live load test. See the methodology note above.

## Commits

- `8fd6795` / `a7e75a6` — turn-based comment/attachment lock + the reporter-filing exemption fix
- `7dbe97a` — ticket-detail sections collapsed by default
- `4d345e7` — auto hand-back widened to `ready_for_test`/`rejected`
- `6b00f1a` — board sorted by priority within each column
- `f8b804a` — "Open a ticket" button/modal
- `cc4685e` — SIT made optional per engagement, IVS branding removed
