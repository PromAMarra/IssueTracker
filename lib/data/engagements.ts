import { createServerClient } from '@/lib/supabase/server';
import type { SlaDays } from '@/lib/types';

export type EngagementSummary = { id: string; name: string; bank_name: string };

export type Engagement = EngagementSummary & {
  bank_logo_url: string | null;
  key_prefix: string;
  modules: string[];
  test_case_packages: string[];
  sla_days: SlaDays;
};

export async function listAccessibleEngagements(): Promise<EngagementSummary[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('engagements')
    .select('id, name, bank_name')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getEngagement(id: string): Promise<Engagement | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('engagements')
    .select('id, name, bank_name, bank_logo_url, key_prefix, modules, test_case_packages, sla_days')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type TeamMember = { id: string; name: string };

// The Prometeia roster for this engagement (used to populate the assignee
// picker). Any engagement member — bank or Prometeia — can read this; only
// Prometeia can manage the roster itself (see app/actions/engagements.ts).
export async function listPrometeiaTeam(engagementId: string): Promise<TeamMember[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('engagement_members')
    .select('user_id, profiles!inner(full_name, email, is_prometeia)')
    .eq('engagement_id', engagementId)
    .eq('profiles.is_prometeia', true);
  if (error) throw error;
  return (
    data as unknown as { user_id: string; profiles: { full_name: string | null; email: string } }[]
  ).map((row) => ({ id: row.user_id, name: row.profiles.full_name ?? row.profiles.email }));
}
