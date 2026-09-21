import { createServerClient } from '@/lib/supabase/server';
import type { Issue, IssueHistoryEntry } from '@/lib/types';

/**
 * Read-only data-access layer for `issues` and `issue_history`, used by
 * Server Components (board, issue detail, history views). Runs on the
 * per-request Supabase client (anon key + caller's session cookies), so
 * every query here is subject to RLS as the signed-in caller — not an
 * admin/service-role client.
 *
 * Critical invariant: none of these functions re-check that the caller is
 * a member of the relevant engagement. `listIssues`/`listHistoryForEngagement`
 * filter by `engagement_id`, and `getIssue` doesn't filter by engagement at
 * all — in every case, whether the row is actually visible to this caller
 * is entirely up to the RLS policies on `issues`/`issue_history`. A
 * non-member querying an id they can't see is expected to get `null`/an
 * empty array back from RLS, not from a check in this file.
 *
 * All mutations on these tables live in app/actions/issues.ts; this file is
 * queries only.
 */
export type IssueWithNames = Issue & { reporterName: string; assigneeName: string | null };

export async function listIssues(engagementId: string): Promise<IssueWithNames[]> {
  const supabase = createServerClient();
  // Two embedded relations off the same `profiles` table, disambiguated by
  // FK column (`reporter_id` vs `assignee_id`) since PostgREST can't infer
  // which FK to join on when a table has more than one relation to another.
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
    // full_name is optional on a profile (a user may never have set one);
    // fall back to email so the UI never has to render a blank name.
  ).map(({ reporter, assignee, ...issue }) => ({
    ...issue,
    reporterName: reporter.full_name ?? reporter.email,
    assigneeName: assignee ? assignee.full_name ?? assignee.email : null,
  }));
}

export async function getIssue(issueId: string): Promise<Issue | null> {
  const supabase = createServerClient();
  // Fetches by id alone — no engagement_id filter. Visibility across
  // engagements is enforced entirely by RLS on `issues` (see file header).
  const { data, error } = await supabase.from('issues').select('*').eq('id', issueId).maybeSingle();
  if (error) throw error;
  return data as Issue | null;
}

export async function listHistoryForEngagement(engagementId: string): Promise<IssueHistoryEntry[]> {
  const supabase = createServerClient();
  // `issue_history` has no `engagement_id` column of its own — it only
  // knows its `issue_id`. The `issues!inner(...)` embed pulls in the parent
  // issue as an INNER join (rather than the default left join) specifically
  // so `.eq('issues.engagement_id', ...)` can filter on it; a left join
  // would let history rows for other engagements' issues leak through with
  // a null `issues` relation instead of being excluded.
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
