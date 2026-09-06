'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';
import type { Priority, Status } from '@/lib/types';

export type CreateIssueInput = {
  engagementId: string;
  title: string;
  description: string;
  priority: Priority;
  module: string | null;
};

export async function createIssue(input: CreateIssueInput): Promise<string> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');

  const supabase = createServerClient();
  const { data: keyData, error: keyError } = await supabase.rpc('next_issue_key', {
    p_engagement_id: input.engagementId,
  });
  if (keyError) throw keyError;

  const { data, error } = await supabase
    .from('issues')
    .insert({
      engagement_id: input.engagementId,
      key: keyData as string,
      title: input.title,
      description: input.description,
      priority: input.priority,
      module: input.module,
      org: session.profile.is_prometeia ? 'prometeia' : 'bank',
      reporter_id: session.id,
    })
    .select('id')
    .single();
  if (error) throw error;
  revalidatePath(`/${input.engagementId}/board`);
  revalidatePath(`/${input.engagementId}/list`);
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

  const isReopen = current.status === 'closed' && newStatus === 'ongoing';
  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'closed') patch.closed_at = new Date().toISOString();
  if (isReopen) patch.closed_at = null;

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
