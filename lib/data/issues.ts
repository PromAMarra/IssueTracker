import { createServerClient } from '@/lib/supabase/server';
import type { Issue, IssueHistoryEntry } from '@/lib/types';

export type IssueWithNames = Issue & { reporterName: string; assigneeName: string | null };

export async function listIssues(engagementId: string): Promise<IssueWithNames[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issues')
    .select(
      '*, reporter:profiles!reporter_id(full_name, email), assignee:profiles!assignee_id(full_name, email)',
    )
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (
    data as unknown as (Issue & {
      reporter: { full_name: string | null; email: string };
      assignee: { full_name: string | null; email: string } | null;
    })[]
  ).map(({ reporter, assignee, ...issue }) => ({
    ...issue,
    reporterName: reporter.full_name ?? reporter.email,
    assigneeName: assignee ? assignee.full_name ?? assignee.email : null,
  }));
}

export async function getIssue(issueId: string): Promise<Issue | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('issues').select('*').eq('id', issueId).maybeSingle();
  if (error) throw error;
  return data as Issue | null;
}

export async function listHistoryForEngagement(engagementId: string): Promise<IssueHistoryEntry[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issue_history')
    .select('id, issue_id, field, from_value, to_value, changed_by, changed_at, issues!inner(engagement_id)')
    .eq('issues.engagement_id', engagementId);
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      issue_id: string;
      field: string;
      from_value: string | null;
      to_value: string;
      changed_by: string;
      changed_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    issue_id: row.issue_id,
    field: row.field,
    from_value: row.from_value,
    to_value: row.to_value,
    changed_by: row.changed_by,
    changed_at: row.changed_at,
  }));
}
