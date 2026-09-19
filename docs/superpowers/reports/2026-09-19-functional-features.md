# Prometeia Issue Tracker — Functional Features

This document describes everything the solution currently does, verified
directly against the source code (not just the high-level README) as of
commit `cc4685e`. Where the actual behavior has a nuance worth knowing —
something a quick look at the UI wouldn't tell you — it's called out inline.

## Contents

1. [Accounts & authentication](#1-accounts--authentication)
2. [Engagements (projects)](#2-engagements-projects)
3. [Roles & permissions](#3-roles--permissions)
4. [Ticket lifecycle & workflow](#4-ticket-lifecycle--workflow)
5. [Creating a ticket](#5-creating-a-ticket)
6. [Working with tickets — Board, List, and detail view](#6-working-with-tickets--board-list-and-detail-view)
7. [Comments & attachments](#7-comments--attachments)
8. [Notifications](#8-notifications)
9. [Audit history](#9-audit-history)
10. [Dashboard & KPIs](#10-dashboard--kpis)
11. [Settings & configuration](#11-settings--configuration)
12. [Navigation](#12-navigation)
13. [Things worth knowing](#13-things-worth-knowing)

---

## 1. Accounts & authentication

- **Sign up** with email + password. New accounts start as regular (non-Prometeia)
  users, and Supabase's standard email-confirmation step applies before login
  works.
- **Log in** with email + password.
- Every account is either **Prometeia** or **not** — a single flag
  (`is_prometeia`) is the only account-level role. There's no separate "Bank"
  or "SIT" account type; that distinction is made per-project (see §3).
- **Promoting an account to Prometeia** is deliberately not something the app
  itself can do. It requires running a SQL statement directly in the Supabase
  dashboard against the account's email. This isn't just a documented
  convention — the database actively reverts any attempt to change
  `is_prometeia` that comes from within the running app, so self-promotion
  through the product is structurally impossible, not just discouraged.

## 2. Engagements (projects)

An **engagement** is one bank client's testing project — the container for
everything else (tickets, comments, history, team rosters). A user only ever
sees the engagement(s) they've been added to; this isolation is enforced by
the database itself, not just hidden in the interface.

- **Creating an engagement** (Prometeia only) sets: engagement name, bank
  name, a ticket ID prefix (e.g. `ESUP-12`; auto-generated from the bank name
  if left blank, and changing it later only affects tickets created
  afterward), the list of modules issues can be filed against, the list of
  test case packages, per-priority SLA targets (days to close), and SIT/UAT
  testing date windows (used by the dashboard's daily-defects trend).
- **Switching engagements** is a dropdown in the header; Prometeia users also
  get a "+ New engagement…" option there.
- **SIT is now optional per engagement.** A checkbox — "This engagement has a
  SIT phase" — controls whether the engagement has a dedicated SIT team at
  all. Turning it off removes SIT from that engagement's settings page, the
  dashboard's SIT tab and chart, and the list view's org filter. It's purely
  a display/availability toggle: it doesn't retroactively remove SIT members
  who were already added, or re-tag tickets that were already reported by
  SIT — those keep showing up in totals, just not in SIT-specific views.
- **Bank logo** is uploaded per engagement and shown in the header alongside
  the Prometeia logo whenever that engagement is open.

## 3. Roles & permissions

There are three functional roles, but only Prometeia is a true account-level
role — Bank and SIT are both "not Prometeia," distinguished only by which
roster a person was added to within a specific engagement.

| Role | Can | Cannot |
|---|---|---|
| **Prometeia** | Everything: create/configure engagements, manage all three rosters, change any ticket's status/priority/module/assignee, see every ticket in every state | — |
| **Bank** | Report tickets, comment, attach files (subject to the turn rule below) | Change status/priority/module/assignee — these controls simply aren't shown to them |
| **SIT** | Same rights as Bank, but tracked as a separate reporting source so SIT-found vs. bank-found defects can be compared | Same restrictions as Bank |

**Whose turn it is.** A newer rule governs *who can currently add a comment or
attachment* to a given ticket, based on its status:

- While a ticket is **Backlog** or **Ongoing**, it's "with Prometeia" —
  Prometeia can comment/attach; Bank/SIT can only view.
- While a ticket is **Ready for Test**, **Closed**, or **Rejected**, it's
  "with Bank/SIT" — they can comment/attach; Prometeia can only view.

Either side can always see the full ticket and its full history, regardless
of whose turn it is — this only affects *posting*, never reading. It also
only affects comments and attachments, never who can change status, priority,
module, or assignee — those stay Prometeia-only on every status, so
Prometeia never loses the ability to move a ticket forward.

One deliberate exception: a reporter filing a brand-new ticket can still
attach supporting files right away (e.g. a screenshot of the bug), even
though a fresh ticket starts in Backlog — Prometeia's turn. That window
closes permanently the moment anyone comments or Prometeia makes any change
to the ticket.

**Team rosters** (Prometeia, Bank, SIT) are managed by adding a person's
email — the account has to already exist, and has to match the role being
granted (you can't add a Prometeia account to the Bank roster or vice versa).
Rosters are currently add-only through the app; there's no button to remove
someone once added.

## 4. Ticket lifecycle & workflow

Every ticket has: title, description, priority, an optional module and linked
test case package/step, priority, status, who reported it, who it's assigned
to, and which organization (Prometeia/Bank/SIT) reported it.

**Status** is one of five values: **Backlog, Ongoing, Ready for Test, Closed,
Rejected**. Prometeia can move a ticket to any of the five at any time — there
isn't a rigid pipeline that has to be followed in order. What *does* happen
automatically, based on which status is chosen:

- Moving a ticket to **Ready for Test, Closed, or Rejected** automatically
  reassigns it to whoever originally reported it, so it's immediately clear
  who needs to act next — verify the fix, run the test, or review the
  rejection.
- Moving a ticket **away from Closed** back into an active status is tracked
  explicitly as a **reopen**. Reopens feed a dashboard metric (the reopen
  rate) that surfaces tickets marked fixed prematurely.
- Editing conflicts are caught, not silently lost: if two people change the
  same ticket within moments of each other, the second save fails with a
  clear "this ticket changed since you loaded it, please refresh" message
  rather than quietly overwriting the first change.

## 5. Creating a ticket

A ticket is filed with: title, description, priority, module, an optional
linked test case package and step, an optional initial assignee (any
Prometeia team member on the engagement), and optional file attachments.

Reporting is now a deliberate action rather than a form sitting open on the
board at all times — an **"Open a ticket" button** opens the full form in a
focused overlay, closing itself automatically once the ticket is filed.

Test case package and test case step are set once, at filing time, and can't
be edited afterward by anyone, including Prometeia — they're meant to capture
what the reporter was actually doing when they hit the problem.

## 6. Working with tickets — Board, List, and detail view

The same data is available in three complementary forms:

**Board** — a five-column Kanban view, one column per status, each with a
live count. Within each column, tickets are sorted by priority (Critical
first, then High, Medium, Low) so the most urgent work is always at the top.
Prometeia can edit status, priority, and assignee directly from the card;
everyone else sees a read-only status badge and assignee name.

**List** — a sortable, filterable table (by status, priority, module,
assignee, and reporting org) with the same inline-editing rights as the
Board, plus a one-click **Export to Excel**. Each row also shows how long the
ticket has spent in each status and how many times it's been reopened from
Ready for Test.

**Ticket detail** — opened from either view, this shows the full description,
test case info, the same field controls as the Board, and four sections that
now open collapsed so the header and key fields aren't pushed below the fold:
**Attachments**, **Comments**, **Time in status**, and **History**. When it
isn't your turn to post (see §3), the comment box and its attachment control
are disabled with a short explanation of when they'll reopen.

## 7. Comments & attachments

Comments are threaded, newest-first, and visually distinguished by whether
the author is from Prometeia or not. Files can be attached either directly to
a comment or (only at filing time, by the reporter) to the ticket itself;
every attachment is served through a short-lived signed link rather than a
permanently public URL, and access is additionally checked against
engagement membership at the storage layer. Both comments and attachments
follow the turn rule described in §3.

## 8. Notifications

**In-app**: a bell in the header shows an unread count (checked roughly every
30 seconds) and a panel listing recent notifications, with mark-all-read and
delete controls. You're notified when a ticket is assigned to you, when
someone comments on a ticket you reported or are assigned to, and when a
ticket you're connected to changes status. Clicking a notification takes you
straight to that ticket.

**Email**: the same three events also send an email (to the reporter and/or
assignee as relevant) with a direct link back to the ticket. Email is
optional infrastructure — if it isn't configured, everything else keeps
working exactly the same, just without the email copy.

## 9. Audit history

Every change to a ticket's status, priority, module, or assignee is logged
with who made the change and when, visible in the ticket's History section
and used to power the dashboard's time-in-status and reopen-rate metrics.

## 10. Dashboard & KPIs

A per-engagement analytics view, optionally scoped to "All," "SIT," or "UAT"
(the SIT tab only appears if the engagement has SIT enabled — see §2):

- Headline tiles: total issues, open, closed, and reopen rate.
- A daily-defects trend over the engagement's configured testing window.
- Status and priority distribution charts.
- **Time to close vs. SLA** by priority, with a breach count.
- **Time in status** by priority — how long tickets actually sit in each
  column, on average.
- **Throughput** (opened vs. closed per week) over the last 8 weeks.
- **Aging report** — every ticket still open, oldest first, flagged if it's
  breached its SLA target.
- Volume by module and by reporting organization (Bank/SIT/Prometeia).
- One-click export of the whole dashboard to **PDF**, and its underlying data
  to a multi-sheet **Excel** workbook.

## 11. Settings & configuration

Prometeia-only. Covers everything described in §2 (engagement details, SLA
targets, testing windows, the SIT-phase checkbox), the bank's logo, and the
three team rosters (Prometeia/SIT/Bank — SIT's section only appears when the
engagement has SIT enabled). The Prometeia logo shown in the header is a
platform-wide setting, not per-engagement — changing it from any one
engagement's settings changes it everywhere.

## 12. Navigation

A collapsible dark sidebar (Board / List / Dashboard / Settings, with
Settings hidden for non-Prometeia users) that can be shrunk to an icon-only
rail via a hamburger toggle — the collapsed/expanded preference is remembered
per browser. A header carries the engagement picker, both logos, the
notification bell, and sign-out; a breadcrumb line shows the current section.

---

## 13. Things worth knowing

A few behaviors that aren't obvious from using the product day-to-day, but
are worth being aware of:

- **The turn-based posting rule only governs comments and attachments** — it
  never restricts who can change a ticket's status, priority, module, or
  assignee. Those four fields stay Prometeia-only on every status, so
  Prometeia can always move a ticket forward even while it's technically
  "Bank/SIT's turn" to comment.
- **Turning off SIT for an engagement is a display change, not a data
  change.** Existing SIT members and SIT-reported tickets aren't affected —
  they just stop appearing in SIT-specific filters and charts.
- **Comment styling only distinguishes Prometeia from everyone else** — a SIT
  member's comment looks identical to a Bank member's comment, even though
  reported tickets do track the three-way distinction.
- **Time-in-status is shown slightly differently in two places**: the List
  view's per-row columns include Closed and Rejected time; the ticket detail
  modal's version deliberately shows only Backlog/Ongoing/Ready for Test.
- **Export is Excel only** — there's no CSV export anywhere in the product.
- **Team rosters are add-only** through the app today; removing a member
  requires direct database access.
