'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';
import { sendNotificationEmail } from '@/lib/email/sendNotificationEmail';
import {
  commentAddedEmail,
  commentEmailRecipientIds,
  issueAssignedEmail,
  statusChangedEmail,
  statusChangedEmailRecipientIds,
  statusEmailLabel,
  type IssueEmailContext,
} from '@/lib/email/issueEmails';
import { canPostOnIssue, turnLockedMessage } from '@/lib/issueAccess';
import { listTestCaseStepOptions } from './testPackages';
import type { Issue, Org, Priority, Status } from '@/lib/types';

export type CreateIssueInput = {
  engagementId: string;
  title: string;
  description: string;
  priority: Priority;
  module: string | null;
  testCasePackage: string | null;
  testCaseStep: string;
  assigneeId: string | null;
};

export async function createIssue(input: CreateIssueInput): Promise<string> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');

  const title = input.title.trim();
  const description = input.description.trim();
  const testCaseStep = input.testCaseStep.trim();
  if (!title || title.length > 200) throw new Error('Title must be 1-200 characters.');
  if (!description || description.length > 5000) {
    throw new Error('Description must be 1-5000 characters.');
  }
  if (testCaseStep.length > 2000) throw new Error('Test case step must be at most 2000 characters.');

  const supabase = createServerClient();

  const { data: engagement, error: engagementError } = await supabase
    .from('engagements')
    .select('modules, test_case_packages, test_cases_enabled')
    .eq('id', input.engagementId)
    .single();
  if (engagementError) throw engagementError;
  const module = input.module && engagement.modules.includes(input.module) ? input.module : null;

  let testCasePackage: string | null = null;
  if (input.testCasePackage) {
    if (engagement.test_cases_enabled) {
      const stepOptions = await listTestCaseStepOptions(input.engagementId);
      if (stepOptions.some((option) => option.stepName === input.testCasePackage)) {
        testCasePackage = input.testCasePackage;
      }
    } else if (engagement.test_case_packages.includes(input.testCasePackage)) {
      testCasePackage = input.testCasePackage;
    }
  }

  let org: Org = session.profile.is_prometeia ? 'prometeia' : 'bank';
  if (!session.profile.is_prometeia) {
    const { data: reporterMembership, error: membershipError } = await supabase
      .from('engagement_members')
      .select('phase')
      .eq('engagement_id', input.engagementId)
      .eq('user_id', session.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (reporterMembership?.phase === 'sit') org = 'sit';
  }

  let assigneeId: string | null = null;
  if (input.assigneeId) {
    const { data: assigneeMember, error: assigneeError } = await supabase
      .from('engagement_members')
      .select('user_id, profiles!inner(is_prometeia)')
      .eq('engagement_id', input.engagementId)
      .eq('user_id', input.assigneeId)
      .eq('profiles.is_prometeia', true)
      .maybeSingle();
    if (assigneeError) throw assigneeError;
    assigneeId = assigneeMember ? assigneeMember.user_id : null;
  }

  const { data: keyData, error: keyError } = await supabase.rpc('next_issue_key', {
    p_engagement_id: input.engagementId,
  });
  if (keyError) throw keyError;

  const { data, error } = await supabase
    .from('issues')
    .insert({
      engagement_id: input.engagementId,
      key: keyData as string,
      title,
      description,
      priority: input.priority,
      module,
      test_case_package: testCasePackage,
      test_case_step: testCaseStep || null,
      org,
      reporter_id: session.id,
      assignee_id: assigneeId,
    })
    .select('id')
    .single();
  if (error) throw error;
  const issueId = data.id as string;
  revalidatePath(`/${input.engagementId}/board`);
  revalidatePath(`/${input.engagementId}/list`);
  revalidatePath(`/${input.engagementId}/dashboard`);

  // Same condition as the `issues_notify_assigned` trigger: a real assignee.
  // Assigning a ticket to yourself does email you, matching the trigger since
  // migration 0014 dropped its `<> auth.uid()` self-action clause. The const
  // is not redundant: `assigneeId` is a `let`, so its narrowing would not
  // survive into the callback below.
  const notifyAssigneeId = assigneeId;
  if (notifyAssigneeId) {
    // Fire-and-forget: see notifyByEmail's doc comment for why this must
    // not be awaited.
    notifyByEmail(() =>
      emailIssueAssigned(
        supabase,
        { issueId, engagementId: input.engagementId, key: keyData as string, title },
        notifyAssigneeId,
      ),
    );
  }
  return issueId;
}

async function requireProm() {
  const session = await getSessionUser();
  if (!session || !session.profile.is_prometeia) throw new Error('Not authorized');
  return session;
}

export type IssueFieldsPatch = {
  status: Status;
  priority: Priority;
  module: string | null;
  assignee_id: string | null;
  assigneeName: string | null;
  closed_at: string | null;
  updated_at: string;
};

export type HistoryPatchEntry = {
  id: string;
  issue_id: string;
  field: string;
  from_value: string | null;
  to_value: string;
  changed_by: string;
  changed_at: string;
};

export type MutationResult = {
  patch: IssueFieldsPatch;
  newHistory: HistoryPatchEntry[];
};

// Selected after every field mutation so the caller can patch its local copy
// of the issue directly instead of asking Board/IssueTable to re-fetch the
// whole engagement's issue list.
const ISSUE_PATCH_SELECT =
  'status, priority, module, assignee_id, closed_at, updated_at, assignee:profiles!assignee_id(full_name, email)';

function toIssueFieldsPatch(row: unknown): IssueFieldsPatch {
  // Supabase's query-builder types this embedded `assignee:profiles!...`
  // select as an array by default (no generated Database types in this
  // project to tell it the relationship is many-to-one) even though a
  // single row's foreign key can only ever join one profile — the same
  // `as unknown as ...` cast pattern used throughout lib/data/issues.ts.
  const { assignee, ...rest } = row as {
    status: Status;
    priority: Priority;
    module: string | null;
    assignee_id: string | null;
    closed_at: string | null;
    updated_at: string;
    assignee: { full_name: string | null; email: string } | null;
  };
  return { ...rest, assigneeName: assignee ? assignee.full_name ?? assignee.email : null };
}

const CONFLICT_MESSAGE = 'This ticket changed since you loaded it. Please refresh and try again.';

async function recordHistory(
  supabase: ReturnType<typeof createServerClient>,
  issueId: string,
  field: string,
  fromValue: string | null,
  toValue: string,
  changedBy: string,
): Promise<HistoryPatchEntry> {
  const { data, error } = await supabase
    .from('issue_history')
    .insert({ issue_id: issueId, field, from_value: fromValue, to_value: toValue, changed_by: changedBy })
    .select('id, issue_id, field, from_value, to_value, changed_by, changed_at')
    .single();
  if (error) throw error;
  return data as HistoryPatchEntry;
}

export async function updateIssueStatus(issueId: string, newStatus: Status): Promise<MutationResult> {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('status, engagement_id, reporter_id, assignee_id, key, title')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  const isReopen =
    current.status === 'closed' &&
    (newStatus === 'ongoing' || newStatus === 'backlog' || newStatus === 'ready_for_test');
  const isClosing = newStatus === 'closed';
  // Hand-back applies whenever the ticket is leaving Prometeia's hands and
  // landing back with Bank/SIT to act on: closing it for the reporter to
  // verify, sending it to test, or rejecting it outright. Backlog/ongoing
  // stay with Prometeia, so they're excluded.
  const isHandBack = newStatus === 'closed' || newStatus === 'ready_for_test' || newStatus === 'rejected';
  const patch: Record<string, unknown> = {
    status: newStatus,
    closed_at: isClosing ? new Date().toISOString() : null,
  };
  // Hand the ticket straight back to whoever reported it, so it's clear who
  // needs to act next — the same "back to reporter" move Prometeia could
  // already do manually, just automatic now.
  if (isHandBack) patch.assignee_id = current.reporter_id;

  // Optimistic-concurrency guard: only commit if status (and, on hand-back,
  // assignee_id) still match what we just read. Otherwise someone else's
  // concurrent edit landed in between — e.g. one person closing a ticket
  // while another reassigns it — and blindly writing here would silently
  // discard their change and log a history row against a from-value that's
  // no longer true. Fail loudly instead of corrupting the audit trail.
  let query = supabase.from('issues').update(patch).eq('id', issueId).eq('status', current.status);
  if (isHandBack) {
    query =
      current.assignee_id === null
        ? query.is('assignee_id', null)
        : query.eq('assignee_id', current.assignee_id);
  }
  const { data: updated, error } = await query.select(ISSUE_PATCH_SELECT).maybeSingle();
  if (error) throw error;
  if (!updated) throw new Error(CONFLICT_MESSAGE);

  const newHistory: HistoryPatchEntry[] = [
    await recordHistory(supabase, issueId, 'status', current.status, isReopen ? 'reopened' : newStatus, session.id),
  ];

  if (isHandBack && current.assignee_id !== current.reporter_id) {
    const [fromName, toName] = await Promise.all([
      profileName(supabase, current.assignee_id),
      profileName(supabase, current.reporter_id),
    ]);
    newHistory.push(await recordHistory(supabase, issueId, 'assignee', fromName, toName, session.id));
  }

  // Deliberately calling NO revalidatePath at all here (not even /dashboard):
  // Next 14's `pathWasRevalidated` flag that gates a Server Action's
  // same-response full re-render is a single, un-scoped boolean for the
  // whole invocation — ANY revalidatePath call during this action, for ANY
  // path, forces that embed of whichever route (/board or /list) actually
  // called it, re-running listIssues/listHistoryForEngagement for the whole
  // engagement regardless of client-side router.refresh(). A single
  // /dashboard call here was tried and shown (by review) to still trigger
  // this for /board and /list. All three routes already render dynamically
  // (createServerClient() calls cookies()), so there's no real server cache
  // being protected by calling this at all; the caller's own local
  // optimistic patch (see Board.tsx/IssueTable.tsx) handles the immediate
  // UI update, and their visibility-triggered router.refresh() (which always
  // fetches fresh data on a dynamic route, Router Cache or not) is what
  // keeps them eventually consistent. Dashboard can show up to its default
  // client Router Cache staleness window of data lag if visited right after
  // a quick edit elsewhere — an accepted, bounded tradeoff, not a bug.

  // Email the reporter and, for a non-closing change, the assignee — only on
  // a real status change (the `notify_status_changed` trigger's
  // `is distinct from` guard: re-dropping a card in the column it already
  // sits in must not mail anyone), via `statusChangedEmailRecipientIds`,
  // which mirrors both of that trigger's insert blocks.
  // The hand-back above also flips assignee_id to the reporter before this
  // ever runs, so `new.assignee_id === new.reporter_id` by the time the
  // trigger (and this) evaluate the assignee branch — pass `null` rather
  // than the pre-update assignee, or the old assignee would be incorrectly
  // re-notified. This also deliberately avoids a second "assigned to you"
  // email on hand-back: the status email already tells the reporter the
  // ticket is theirs to act on.
  const reporterId = current.reporter_id as string;
  if (newStatus !== current.status) {
    const label = statusEmailLabel(newStatus, isReopen);
    // Fire-and-forget: see notifyByEmail's doc comment for why this must
    // not be awaited.
    notifyByEmail(async () => {
      const recipientIds = statusChangedEmailRecipientIds({
        reporterId,
        assigneeId: isHandBack ? null : current.assignee_id,
        actorId: session.id,
      });
      const recipients = await recipientEmails(supabase, recipientIds);
      if (recipients.length === 0) return;
      const { subject, body } = statusChangedEmail(
        {
          issueId,
          engagementId: current.engagement_id,
          key: current.key,
          title: current.title,
        },
        label,
      );
      await Promise.all(
        recipients.map((to) => sendNotificationEmail({ to, subject, body })),
      );
    });
  }

  return { patch: toIssueFieldsPatch(updated), newHistory };
}

// The one status change a Bank/SIT (non-Prometeia) member is allowed to make
// (see requireProm() above, which gates every other mutation in this file):
// while a ticket is 'rejected', they may send it back to Prometeia rather
// than leaving a rejection they disagree with stuck. The RLS policy and
// trigger in 0019_dispute_rejection.sql enforce the same narrowing at the DB
// layer — this check is defense in depth, not the real gate.
export async function disputeRejection(issueId: string): Promise<MutationResult> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  if (session.profile.is_prometeia) throw new Error('Not authorized');

  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('status, engagement_id, reporter_id, assignee_id, key, title')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;
  if (current.status !== 'rejected') {
    throw new Error('This ticket is no longer rejected.');
  }

  const newStatus: Status = 'ongoing';
  // Optimistic-concurrency guard — see updateIssueStatus for why.
  const { data: updated, error } = await supabase
    .from('issues')
    .update({ status: newStatus })
    .eq('id', issueId)
    .eq('status', 'rejected')
    .select(ISSUE_PATCH_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new Error(CONFLICT_MESSAGE);

  const newHistory: HistoryPatchEntry[] = [
    await recordHistory(supabase, issueId, 'status', 'rejected', newStatus, session.id),
  ];

  const reporterId = current.reporter_id as string;
  const label = statusEmailLabel(newStatus, false);
  // Fire-and-forget: see notifyByEmail's doc comment for why this must not
  // be awaited.
  notifyByEmail(async () => {
    const recipientIds = statusChangedEmailRecipientIds({
      reporterId,
      assigneeId: current.assignee_id,
      actorId: session.id,
    });
    const recipients = await recipientEmails(supabase, recipientIds);
    if (recipients.length === 0) return;
    const { subject, body } = statusChangedEmail(
      { issueId, engagementId: current.engagement_id, key: current.key, title: current.title },
      label,
    );
    await Promise.all(recipients.map((to) => sendNotificationEmail({ to, subject, body })));
  });

  return { patch: toIssueFieldsPatch(updated), newHistory };
}

export async function updateIssuePriority(issueId: string, newPriority: Priority): Promise<MutationResult> {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('priority, engagement_id')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  // Optimistic-concurrency guard — see updateIssueStatus for why.
  const { data: updated, error } = await supabase
    .from('issues')
    .update({ priority: newPriority })
    .eq('id', issueId)
    .eq('priority', current.priority)
    .select(ISSUE_PATCH_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new Error(CONFLICT_MESSAGE);

  const newHistory = [await recordHistory(supabase, issueId, 'priority', current.priority, newPriority, session.id)];
  // See updateIssueStatus for why this deliberately calls no revalidatePath
  // at all (not even for /dashboard).
  return { patch: toIssueFieldsPatch(updated), newHistory };
}

async function profileName(
  supabase: ReturnType<typeof createServerClient>,
  userId: string | null,
): Promise<string> {
  if (!userId) return 'Unassigned';
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? data.full_name ?? data.email : 'Unassigned';
}

// --- Notification emails ----------------------------------------------------
// The in-app `notifications` rows for these same three events are written by
// the DB triggers in migrations 0008/0009 (redefined in 0014) and are
// untouched here. This only adds the email that goes out alongside them,
// always after the underlying mutation has already committed.

/**
 * Runs post-mutation notification work without letting it reach the caller.
 * The mutation is already committed by the time this runs, so neither the
 * extra profile lookups (which can throw) nor the send itself may turn a
 * successful mutation into an error for the user.
 *
 * Every call site fires this WITHOUT `await`, on purpose: this function
 * always resolves cleanly (it catches everything below, and
 * `sendNotificationEmail` never throws either — see its own doc comment and
 * its internal 5s timeout), so there is zero risk of an unhandled promise
 * rejection. Awaiting it would only make the user's click sit through an
 * external Resend HTTP round-trip (typically hundreds of ms, up to the 5s
 * timeout) before the Server Action can return and `revalidatePath` the UI.
 * Do not add `await` back at a call site — that would reintroduce exactly
 * the click-to-response lag this was written to avoid.
 *
 * We don't reach for `next/server`'s `after()` here — it isn't available in
 * the installed Next 14.2.35 — or a Vercel-specific `waitUntil`, which would
 * tie this codebase to one hosting platform. Plain fire-and-forget, bounded
 * by the internal 5s send timeout, is the portable choice; the honest
 * tradeoff is that a platform which freezes/tears down a function right
 * after its response is sent could in rare cases cut off a send that hadn't
 * finished yet — acceptable here since a dropped notification email never
 * loses data (the in-app notification and the underlying mutation are
 * unaffected).
 */
async function notifyByEmail(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.warn('[issues] notification email dispatch failed:', err);
  }
}

async function recipientEmails(
  supabase: ReturnType<typeof createServerClient>,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase.from('profiles').select('email').in('id', userIds);
  if (error) throw error;
  return ((data ?? []) as { email: string | null }[])
    .map((row) => row.email)
    .filter((email): email is string => Boolean(email));
}

async function emailIssueAssigned(
  supabase: ReturnType<typeof createServerClient>,
  ctx: IssueEmailContext,
  assigneeId: string,
): Promise<void> {
  const [to] = await recipientEmails(supabase, [assigneeId]);
  if (!to) return;
  const { subject, body } = issueAssignedEmail(ctx);
  await sendNotificationEmail({ to, subject, body });
}

export async function updateIssueAssignee(issueId: string, newAssigneeId: string | null): Promise<MutationResult> {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('assignee_id, engagement_id, key, title')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  // Optimistic-concurrency guard — see updateIssueStatus for why. This also
  // closes the other half of the close-vs-reassign race: if someone else's
  // status-close already flipped assignee_id (e.g. handing it back to the
  // reporter) since we read it, this update won't match and we surface a
  // conflict instead of silently overwriting their change.
  let query = supabase.from('issues').update({ assignee_id: newAssigneeId }).eq('id', issueId);
  query =
    current.assignee_id === null ? query.is('assignee_id', null) : query.eq('assignee_id', current.assignee_id);
  const { data: updated, error } = await query.select(ISSUE_PATCH_SELECT).maybeSingle();
  if (error) throw error;
  if (!updated) throw new Error(CONFLICT_MESSAGE);

  const [fromName, toName] = await Promise.all([
    profileName(supabase, current.assignee_id),
    profileName(supabase, newAssigneeId),
  ]);
  const newHistory = [await recordHistory(supabase, issueId, 'assignee', fromName, toName, session.id)];
  // See updateIssueStatus for why this deliberately calls no revalidatePath
  // at all (this function never revalidated /dashboard either, even before).

  // Same condition as the `issues_notify_assigned` trigger: a real assignee
  // (un-assigning emails nobody) that actually changed. The trigger's
  // `is distinct from old.assignee_id` real-change guard is mirrored here;
  // its `<> auth.uid()` self-action clause is gone as of migration 0014, so
  // assigning a ticket to yourself now emails you.
  const notifyAssigneeId =
    newAssigneeId && newAssigneeId !== current.assignee_id ? newAssigneeId : null;
  if (notifyAssigneeId) {
    // Fire-and-forget: see notifyByEmail's doc comment for why this must
    // not be awaited.
    notifyByEmail(() =>
      emailIssueAssigned(
        supabase,
        {
          issueId,
          engagementId: current.engagement_id,
          key: current.key,
          title: current.title,
        },
        notifyAssigneeId,
      ),
    );
  }

  return { patch: toIssueFieldsPatch(updated), newHistory };
}

export async function updateIssueModule(issueId: string, newModule: string | null): Promise<MutationResult> {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('module, engagement_id')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  // Optimistic-concurrency guard — see updateIssueStatus for why.
  let query = supabase.from('issues').update({ module: newModule }).eq('id', issueId);
  query = current.module === null ? query.is('module', null) : query.eq('module', current.module);
  const { data: updated, error } = await query.select(ISSUE_PATCH_SELECT).maybeSingle();
  if (error) throw error;
  if (!updated) throw new Error(CONFLICT_MESSAGE);

  const newHistory = [
    await recordHistory(supabase, issueId, 'module', current.module, newModule ?? 'None', session.id),
  ];
  // See updateIssueStatus for why this deliberately calls no revalidatePath
  // at all (not even for /dashboard).
  return { patch: toIssueFieldsPatch(updated), newHistory };
}

export async function addComment(issueId: string, body: string): Promise<string> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const trimmedBody = body.trim();
  if (!trimmedBody || trimmedBody.length > 4000) {
    throw new Error('Comment must be 1-4000 characters.');
  }
  const supabase = createServerClient();

  const { data: issueForAccess, error: issueForAccessError } = await supabase
    .from('issues')
    .select('status')
    .eq('id', issueId)
    .single();
  if (issueForAccessError) throw issueForAccessError;
  const issueStatus = issueForAccess.status as Status;
  if (!canPostOnIssue(issueStatus, session.profile.is_prometeia)) {
    throw new Error(turnLockedMessage(issueStatus));
  }

  const { data, error } = await supabase
    .from('issue_comments')
    .insert({ issue_id: issueId, author_id: session.id, body: trimmedBody })
    .select('id')
    .single();
  if (error) throw error;
  const commentId = data.id as string;

  // Everyone on the ticket, the author included — the same set the
  // `comments_notify_participants` trigger notifies in-app.
  // Fire-and-forget: see notifyByEmail's doc comment for why this must not
  // be awaited.
  notifyByEmail(async () => {
    const { data: issue, error: issueError } = await supabase
      .from('issues')
      .select('engagement_id, key, title, reporter_id, assignee_id')
      .eq('id', issueId)
      .maybeSingle();
    if (issueError) throw issueError;
    if (!issue) return;

    const recipients = await recipientEmails(
      supabase,
      commentEmailRecipientIds({
        reporterId: issue.reporter_id as string,
        assigneeId: (issue.assignee_id as string | null) ?? null,
        authorId: session.id,
      }),
    );
    if (recipients.length === 0) return;

    const { subject, body: emailBody } = commentAddedEmail(
      {
        issueId,
        engagementId: issue.engagement_id,
        key: issue.key,
        title: issue.title,
      },
      session.profile.full_name ?? session.email,
    );
    await Promise.all(
      recipients.map((to) => sendNotificationEmail({ to, subject, body: emailBody })),
    );
  });

  return commentId;
}

export type CommentRow = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorIsProm: boolean;
  attachments: AttachmentRow[];
};

export async function listComments(issueId: string): Promise<CommentRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issue_comments')
    .select('id, body, created_at, profiles(full_name, email, is_prometeia)')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      body: string;
      created_at: string;
      profiles: { full_name: string | null; email: string; is_prometeia: boolean };
    }[]
  ).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorName: row.profiles.full_name ?? row.profiles.email,
    authorIsProm: row.profiles.is_prometeia,
    attachments: [],
  }));
}

export type HistoryRow = {
  id: string;
  field: string;
  fromValue: string | null;
  toValue: string;
  changedAt: string;
  changedByName: string;
};

export async function listHistory(issueId: string): Promise<HistoryRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issue_history')
    .select('id, field, from_value, to_value, changed_at, profiles(full_name, email)')
    .eq('issue_id', issueId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      field: string;
      from_value: string | null;
      to_value: string;
      changed_at: string;
      profiles: { full_name: string | null; email: string };
    }[]
  ).map((row) => ({
    id: row.id,
    field: row.field,
    fromValue: row.from_value,
    toValue: row.to_value,
    changedAt: row.changed_at,
    changedByName: row.profiles.full_name ?? row.profiles.email,
  }));
}

export type AttachmentRow = {
  id: string;
  fileName: string;
  url: string;
  uploadedByName: string;
  uploadedAt: string;
  commentId: string | null;
};

export async function listAttachments(issueId: string): Promise<AttachmentRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issue_attachments')
    .select('id, storage_path, file_name, uploaded_at, comment_id, profiles(full_name, email)')
    .eq('issue_id', issueId)
    .order('uploaded_at', { ascending: true });
  if (error) throw error;

  const rows = data as unknown as {
    id: string;
    storage_path: string;
    file_name: string;
    uploaded_at: string;
    comment_id: string | null;
    profiles: { full_name: string | null; email: string };
  }[];
  if (rows.length === 0) return [];

  const { data: signedUrls, error: signError } = await supabase.storage
    .from('issue-attachments')
    .createSignedUrls(
      rows.map((r) => r.storage_path),
      3600,
    );
  if (signError) throw signError;
  const urlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl ?? '']));

  return rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    url: urlByPath.get(row.storage_path) ?? '',
    uploadedByName: row.profiles.full_name ?? row.profiles.email,
    uploadedAt: row.uploaded_at,
    commentId: row.comment_id,
  }));
}

export async function uploadAttachment(
  issueId: string,
  engagementId: string,
  formData: FormData,
  commentId?: string,
) {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided');

  const supabase = createServerClient();

  const { data: issueForAccess, error: issueForAccessError } = await supabase
    .from('issues')
    .select('status, reporter_id')
    .eq('id', issueId)
    .single();
  if (issueForAccessError) throw issueForAccessError;
  const issueStatus = issueForAccess.status as Status;
  if (!canPostOnIssue(issueStatus, session.profile.is_prometeia)) {
    // Exception: NewIssueForm calls this right after createIssue so a
    // reporter can attach screenshots while filing — that happens while
    // status is still 'backlog', which is otherwise Prometeia's turn. Only
    // exempt the reporter while the ticket is still untouched by anyone (no
    // comments, no history yet), so the window closes the moment a real
    // conversation starts rather than staying open indefinitely.
    const [commentsRes, historyRes] = await Promise.all([
      supabase.from('issue_comments').select('id', { count: 'exact', head: true }).eq('issue_id', issueId),
      supabase.from('issue_history').select('id', { count: 'exact', head: true }).eq('issue_id', issueId),
    ]);
    if (commentsRes.error) throw commentsRes.error;
    if (historyRes.error) throw historyRes.error;
    const stillUntouched =
      session.id === issueForAccess.reporter_id && (commentsRes.count ?? 0) === 0 && (historyRes.count ?? 0) === 0;
    if (!stillUntouched) throw new Error(turnLockedMessage(issueStatus));
  }

  const safeExt = (file.name.split('.').pop() ?? 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
  const path = `${engagementId}/${issueId}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;
  const { error: uploadError } = await supabase.storage.from('issue-attachments').upload(path, file);
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('issue_attachments').insert({
    issue_id: issueId,
    storage_path: path,
    file_name: file.name,
    uploaded_by: session.id,
    comment_id: commentId ?? null,
  });
  if (error) throw error;
}

export type IssueDetail = {
  issue: Issue;
  reporterName: string;
  assigneeName: string | null;
  comments: CommentRow[];
  history: HistoryRow[];
  attachments: AttachmentRow[];
};

export async function getIssueDetail(issueId: string): Promise<IssueDetail> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issues')
    .select(
      '*, reporter:profiles!reporter_id(full_name, email), assignee:profiles!assignee_id(full_name, email)',
    )
    .eq('id', issueId)
    .single();
  if (error) throw error;
  const { reporter, assignee, ...issue } = data as unknown as Issue & {
    reporter: { full_name: string | null; email: string };
    assignee: { full_name: string | null; email: string } | null;
  };
  const [rawComments, history, allAttachments] = await Promise.all([
    listComments(issueId),
    listHistory(issueId),
    listAttachments(issueId),
  ]);
  const comments = rawComments.map((comment) => ({
    ...comment,
    attachments: allAttachments.filter((a) => a.commentId === comment.id),
  }));
  const attachments = allAttachments.filter((a) => a.commentId === null);
  return {
    issue: issue as Issue,
    reporterName: reporter.full_name ?? reporter.email,
    assigneeName: assignee ? assignee.full_name ?? assignee.email : null,
    comments,
    history,
    attachments,
  };
}
