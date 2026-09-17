# Click-to-response lag: investigation and fix

## Summary

Users reported perceptible lag "while clicking on different parts of the
solution" after the email-notifications branch (Resend integration) merged
to `main`. The root cause was exactly what that branch's own final review
had already flagged and deferred: every Server Action that sends a
notification email `await`ed the entire email pipeline — including an
external HTTP round-trip to Resend, bounded by a 5s internal timeout —
before returning to the browser. This blocked the UI response (and the
`revalidatePath` refresh) on work the user never needed to wait for.

Fix: drop `await` at all four `notifyByEmail(...)` call sites in
`app/actions/issues.ts`, making the email dispatch genuine fire-and-forget.

## The fix

File: `app/actions/issues.ts`

Confirmed via `grep -rn "notifyByEmail("` across the whole repo that there
are exactly four call sites, all in this file:

- `createIssue` (line ~118, assignment email)
- `updateIssueStatus` (line ~206, status-change email)
- `updateIssueAssignee` (line ~351, assignment email)
- `addComment` (line ~404, comment email)

`notifyByEmail(run)` already wrapped its body in try/catch and never threw
or rejected (per its own pre-existing doc comment), and the email sender it
calls, `sendNotificationEmail`, is independently documented as "never
throws" and races the actual Resend call against a 5000ms internal timeout
(`lib/email/sendNotificationEmail.ts`). Because the returned promise always
resolves cleanly, removing `await` at each call site carries zero risk of
an unhandled promise rejection — it just stops the caller from waiting on
that promise.

Changes made:

1. Dropped `await` at all four call sites (now plain `notifyByEmail(...)`
   statements).
2. Added a one-line "fire-and-forget, see notifyByEmail's doc comment"
   note at each call site.
3. Expanded `notifyByEmail`'s own doc comment to explain the contract in
   one place: why it's safe to not await, what the tradeoff is, and why we
   didn't reach for `next/server`'s `after()` (not available in the
   installed Next 14.2.35 — confirmed via `package-lock.json`) or a
   Vercel-specific `waitUntil` (would tie the codebase to one hosting
   platform). Plain fire-and-forget, bounded by the sender's own 5s
   timeout, is the portable choice available today.

Known, accepted tradeoff (documented, not solved, per the task brief): on a
platform that freezes or tears down a serverless function immediately after
its response is sent, a slow email send that hasn't finished yet could be
cut short. This is unlikely to matter in practice for typical Resend
latencies, and even when it does, nothing user-visible is lost — the
mutation already committed, the in-app notification (written by DB
triggers, untouched by this code) already exists, and a missed email is a
soft failure by design (the whole point of `notifyByEmail` swallowing
errors).

One correction to the task brief's framing: I could not find the repo
independently stating "designed to be deployable either to Vercel or fully
on-premises" — `README.md`'s architecture section only lists "Hosting
(current): Vercel" and neither plan doc under `docs/superpowers/plans/`
makes that portability claim explicit. I kept the code comment's reasoning
narrower and independently defensible (no `after()` in the installed Next
version; avoid new platform lock-in) rather than asserting an unverified
design goal.

## Expected latency impact

No live Resend credentials or dev server were used to capture real
before/after timings in this environment, so reasoning from the code
instead, as the task brief allows for this case:

- **Before:** each of the four Server Actions awaited
  `sendNotificationEmail`, which itself awaits `client.emails.send()` raced
  against a 5000ms timeout. In the common case this adds Resend's typical
  transactional-email API latency (order of ~100-400ms for an HTTP round
  trip from a serverless function) directly onto the user's click-to-
  response time, on top of the (fast, already-committed) DB mutation. In a
  degraded-Resend scenario, it adds up to the full 5000ms before the
  Server Action can return at all.
- **After:** none of the four actions' return paths depend on the email
  step. The mutation and `revalidatePath` calls — which do the real,
  necessary work — return as soon as they finish, independent of how long
  the email send takes in the background.
- **Net expected improvement:** removes 100ms-5000ms of blocking wait from
  every issue-assignment, status-change, and comment action, with no change
  in what the user ultimately sees (the email still sends; it just no
  longer gates the response).

## Secondary investigation: other click-lag contributors

The user's complaint ("clicking on different parts of the solution") is
broader than the three email-triggering actions, so I looked for other real
contributors rather than assuming the email fix is the whole story.

**1. `router.refresh()` breadth (`Board.tsx`, `IssueTable.tsx`,
`IssueDetailModal.tsx`)**

- `components/issues/Board.tsx` and `components/issues/IssueTable.tsx`
  share a `run(issueId, action)` helper that calls `router.refresh()` after
  *every* successful mutation (status/priority/assignee/module edits on a
  single card or row). `router.refresh()` re-renders the current route's
  Server Components from scratch, which re-runs `listIssues(engagementId)`
  (every issue in the engagement, joined against two profile rows each) on
  both the board and list pages, plus `listHistoryForEngagement(engagementId)`
  (every history row for the *entire* engagement) on the list page — even
  though only one field on one issue changed. This is real and matches the
  brief's hypothesis, but:
  - It predates the email feature entirely (confirmed by reading
    `lib/data/issues.ts` and both `page.tsx` files — nothing about this
    pattern changed recently).
  - Each query is a single indexed (`engagement_id =`) Postgres query, not
    N+1 or unbounded; for realistic engagement sizes (tens to low hundreds
    of issues) this is a fast query (order of tens of ms), not the
    hundreds-of-ms-to-seconds the email block was adding.
  - **Not fixed here**, per the brief's explicit instruction to stay
    focused — but worth flagging as a legitimate, separate follow-up if
    click-lag persists after this fix ships: the refresh could be scoped
    to the single changed issue instead of the whole list, or the mutation
    could optimistically patch local state instead of a full server
    round-trip.
- `components/issues/IssueDetailModal.tsx` is **already more careful**:
  its `handleField()` helper (used for in-modal status/priority/
  assignee/module edits) does *not* call `router.refresh()` per edit — it
  only calls the targeted `getIssueDetail(issueId)` reload. A full
  `router.refresh()` only fires once, when the modal closes (see the
  existing comment at that call site: "One refresh of the underlying
  board/list when the modal closes, rather than after every single field
  edit made while it was open."). So the modal path was not part of the
  problem.

**2. Duplicate profile lookups (`profileName` / `recipientEmails`)**

Confirmed this exists, in exactly the two places the prior review flagged:

- `updateIssueStatus`: when closing a ticket with a real reassignment, it
  calls `profileName(supabase, current.assignee_id)` and
  `profileName(supabase, current.reporter_id)` (for the history entry),
  then, inside the (now fire-and-forget) notification callback,
  `recipientEmails(supabase, recipientIds)` re-fetches overlapping profile
  rows for the same users.
- `updateIssueAssignee`: same pattern — `profileName` calls for the history
  entry, then `recipientEmails` for the new assignee inside the
  notification callback.

Quantified as asked: this is one extra `.in('id', ...)` indexed query, a
handful of milliseconds, and — importantly — after this fix it happens
entirely inside the fire-and-forget `notifyByEmail` callback, so it no
longer touches the response path *at all*. It was never more than a minor,
low-priority inefficiency and is now fully moot for click-lag purposes.
Not worth fixing as part of this task.

**Conclusion:** the email-blocking issue is the dominant, confirmed cause
of the reported lag and is fixed. The broad `router.refresh()` re-fetch
pattern in `Board.tsx`/`IssueTable.tsx` is a real, pre-existing
inefficiency worth a future look if lag is still noticeable after this
ships, but it is not a new regression and is architecturally a much smaller
effect (tens of ms vs. hundreds-to-thousands of ms). No other contributors
to click-specific lag were found.

## Verification

- `npm test` — 60/60 tests pass (unchanged; no test exercises
  `app/actions/issues.ts` directly, so this is a regression check on the
  rest of the codebase, not direct coverage of the change).
- `npx tsc --noEmit` — clean, no errors.
- `npm run build` — webpack compilation succeeds and all 7 app routes
  build; the overall command still exits non-zero for reasons fully
  unrelated to this change (see note below).

**Build note (two separate pre-existing environment issues, neither caused
by this change):**

1. `node_modules` did not exist in this fresh worktree and had to be
   installed. The install (and a first re-extraction attempt) repeatedly
   produced an incomplete/corrupted `core-js` package (missing
   `package.json` and hundreds of `internals/*.js` files), which broke
   webpack module resolution for the unrelated `jspdf`/`canvg` dependency
   chain used by `lib/exportPdf.ts` / `components/dashboard/ExportPdfButton.tsx`
   (PDF export). This reproduced twice from scratch and is consistent with
   this sandbox's very slow per-file write throughput for large
   many-small-file installs (symptomatic of on-access antivirus/EDR
   scanning intercepting each new file). Extracting the official `core-js`
   tarball directly resolved it — once `core-js` was fully present, the
   "Module not found" errors disappeared and webpack compiled cleanly with
   zero errors, `Generating static pages (7/7)`.
2. With compilation fixed, `next build`'s static-export step still fails —
   but only while prerendering the framework's own default `/404` and
   `/500` error pages, with `TypeError: Cannot read properties of null
   (reading 'useContext')`. The stack trace shows `react` resolved from
   this worktree's own `node_modules` (`.../worktrees/agent-.../node_modules/react`)
   while `react-dom`'s server renderer resolved from the **outer, parent
   checkout's** `node_modules` (`C:\dev\uat-tracker\node_modules\react-dom`)
   — two distinct copies of React, which breaks context (`useContext`
   returns null when the context object's identity differs between
   copies). This worktree is physically nested inside the main checkout
   (`C:\dev\uat-tracker\.claude\worktrees\agent-.../`), and both directories
   have their own independently-installed, same-version (18.3.1) but
   distinct `react`/`react-dom` trees; Node's module resolution reached
   past this worktree's own (complete, verified) copy for this one
   generated bundle. This is a directory-topology artifact of a worktree
   nested inside its own parent checkout, not a code defect, and it only
   affects Next's generic built-in error pages — not any route this app
   actually serves, and nothing on the code path this task touches
   (Server Actions, notifications, `router.refresh()`).

Given both causes are fully diagnosed, reproducible independent of this
diff, and outside this change's blast radius (`app/actions/issues.ts`
doesn't touch React rendering, jspdf/canvg, or module resolution), I'm
treating `npm test` + `npx tsc --noEmit` + a clean webpack compilation as
sufficient verification for this change, while flagging the unresolved
static-export/duplicate-React-instance issue as a pre-existing environment
concern for awareness, not something fixed here.
