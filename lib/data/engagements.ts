import { createServerClient } from '@/lib/supabase/server';
import type { SlaDays } from '@/lib/types';

export type EngagementSummary = { id: string; name: string; bank_name: string };

export type Engagement = EngagementSummary & {
  bank_logo_url: string | null;
  key_prefix: string;
  modules: string[];
  team_members: string[];
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
    .select('id, name, bank_name, bank_logo_url, key_prefix, modules, team_members, sla_days')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
