import { createServerClient } from '@/lib/supabase/server';
import type { Issue } from '@/lib/types';

export async function listIssues(engagementId: string): Promise<Issue[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issues')
    .select('*')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Issue[];
}

export async function getIssue(issueId: string): Promise<Issue | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('issues').select('*').eq('id', issueId).maybeSingle();
  if (error) throw error;
  return data as Issue | null;
}
