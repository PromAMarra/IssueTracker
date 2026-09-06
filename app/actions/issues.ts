'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';
import type { Issue, Priority, Status } from '@/lib/types';

export type CreateIssueInput = {
  engagementId: string;
  title: string;
  description: string;
  priority: Priority;
  module: string | null;
  testCasePackage: string | null;
  testCaseStep: string;
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
    .select('modules, test_case_packages')
    .eq('id', input.engagementId)
    .single();
  if (engagementError) throw engagementError;
  const module = input.module && engagement.modules.includes(input.module) ? input.module : null;
  const testCasePackage =
    input.testCasePackage && engagement.test_case_packages.includes(input.testCasePackage)
      ? input.testCasePackage
      : null;

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
      org: session.profile.is_prometeia ? 'prometeia' : 'bank',
      reporter_id: session.id,
    })
    .select('id')
    .single();
  if (error) throw error;
  revalidatePath(`/${input.engagementId}/board`);
  revalidatePath(`/${input.engagementId}/list`);
  revalidatePath(`/${input.engagementId}/dashboard`);
  return data.id as string;
}

async function requireProm() {
  const session = await getSessionUser();
  if (!session || !session.profile.is_prometeia) throw new Error('Not authorized');
  return session;
}

async function recordHistory(
  supabase: ReturnType<typeof createServerClient>,
  issueId: string,
  field: string,
  fromValue: string | null,
  toValue: string,
  changedBy: string,
) {
  const { error } = await supabase
    .from('issue_history')
    .insert({ issue_id: issueId, field, from_value: fromValue, to_value: toValue, changed_by: changedBy });
  if (error) throw error;
}

export async function updateIssueStatus(issueId: string, newStatus: Status) {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('status, engagement_id')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  const isReopen =
    current.status === 'closed' &&
    (newStatus === 'ongoing' || newStatus === 'backlog' || newStatus === 'ready_for_test');
  const patch: Record<string, unknown> = {
    status: newStatus,
    closed_at: newStatus === 'closed' ? new Date().toISOString() : null,
  };

  const { error } = await supabase.from('issues').update(patch).eq('id', issueId);
  if (error) throw error;

  await recordHistory(supabase, issueId, 'status', current.status, isReopen ? 'reopened' : newStatus, session.id);

  revalidatePath(`/${current.engagement_id}/board`);
  revalidatePath(`/${current.engagement_id}/list`);
  revalidatePath(`/${current.engagement_id}/dashboard`);
}

export async function updateIssuePriority(issueId: string, newPriority: Priority) {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('priority, engagement_id')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('issues').update({ priority: newPriority }).eq('id', issueId);
  if (error) throw error;
  await recordHistory(supabase, issueId, 'priority', current.priority, newPriority, session.id);
  revalidatePath(`/${current.engagement_id}/board`);
  revalidatePath(`/${current.engagement_id}/list`);
  revalidatePath(`/${current.engagement_id}/dashboard`);
}

export async function updateIssueAssignee(issueId: string, newAssignee: string | null) {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('assignee, engagement_id')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('issues').update({ assignee: newAssignee }).eq('id', issueId);
  if (error) throw error;
  await recordHistory(supabase, issueId, 'assignee', current.assignee, newAssignee ?? 'Unassigned', session.id);
  revalidatePath(`/${current.engagement_id}/board`);
  revalidatePath(`/${current.engagement_id}/list`);
}

export async function updateIssueModule(issueId: string, newModule: string | null) {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('module, engagement_id')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('issues').update({ module: newModule }).eq('id', issueId);
  if (error) throw error;
  await recordHistory(supabase, issueId, 'module', current.module, newModule ?? 'None', session.id);
  revalidatePath(`/${current.engagement_id}/board`);
  revalidatePath(`/${current.engagement_id}/list`);
  revalidatePath(`/${current.engagement_id}/dashboard`);
}

export async function addComment(issueId: string, body: string) {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const trimmedBody = body.trim();
  if (!trimmedBody || trimmedBody.length > 4000) {
    throw new Error('Comment must be 1-4000 characters.');
  }
  const supabase = createServerClient();
  const { error } = await supabase
    .from('issue_comments')
    .insert({ issue_id: issueId, author_id: session.id, body: trimmedBody });
  if (error) throw error;
}

export type CommentRow = { id: string; body: string; createdAt: string; authorName: string };

export async function listComments(issueId: string): Promise<CommentRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issue_comments')
    .select('id, body, created_at, profiles(full_name, email)')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as unknown as { id: string; body: string; created_at: string; profiles: { full_name: string | null; email: string } }[]).map(
    (row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      authorName: row.profiles.full_name ?? row.profiles.email,
    }),
  );
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

export type AttachmentRow = { id: string; fileName: string; url: string; uploadedByName: string; uploadedAt: string };

export async function listAttachments(issueId: string): Promise<AttachmentRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issue_attachments')
    .select('id, storage_path, file_name, uploaded_at, profiles(full_name, email)')
    .eq('issue_id', issueId)
    .order('uploaded_at', { ascending: true });
  if (error) throw error;

  const rows = data as unknown as {
    id: string;
    storage_path: string;
    file_name: string;
    uploaded_at: string;
    profiles: { full_name: string | null; email: string };
  }[];

  return Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await supabase.storage
        .from('issue-attachments')
        .createSignedUrl(row.storage_path, 3600);
      return {
        id: row.id,
        fileName: row.file_name,
        url: signed?.signedUrl ?? '',
        uploadedByName: row.profiles.full_name ?? row.profiles.email,
        uploadedAt: row.uploaded_at,
      };
    }),
  );
}

export async function uploadAttachment(issueId: string, engagementId: string, formData: FormData) {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided');

  const supabase = createServerClient();
  const safeExt = (file.name.split('.').pop() ?? 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
  const path = `${engagementId}/${issueId}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;
  const { error: uploadError } = await supabase.storage.from('issue-attachments').upload(path, file);
  if (uploadError) throw uploadError;

  const { error } = await supabase
    .from('issue_attachments')
    .insert({ issue_id: issueId, storage_path: path, file_name: file.name, uploaded_by: session.id });
  if (error) throw error;
}

export type IssueDetail = {
  issue: Issue;
  comments: CommentRow[];
  history: HistoryRow[];
  attachments: AttachmentRow[];
};

export async function getIssueDetail(issueId: string): Promise<IssueDetail> {
  const supabase = createServerClient();
  const { data: issue, error } = await supabase.from('issues').select('*').eq('id', issueId).single();
  if (error) throw error;
  const [comments, history, attachments] = await Promise.all([
    listComments(issueId),
    listHistory(issueId),
    listAttachments(issueId),
  ]);
  return { issue: issue as Issue, comments, history, attachments };
}
