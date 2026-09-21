import { cache } from 'react';
import { createServerClient } from '@/lib/supabase/server';
import type { SlaDays } from '@/lib/types';

/**
 * Read-only data-access layer for `engagements` and their membership
 * rosters (`engagement_members`). These functions are called directly from
 * Server Components (engagement layout, dashboard, settings) and Server
 * Actions using the per-request Supabase client (anon key + caller's
 * session cookies) — there is no service-role/admin client anywhere here.
 *
 * Critical invariant: several queries below (listAccessibleEngagements,
 * getEngagement) apply NO membership filter in application code — they
 * simply select from `engagements` with no `.eq('member', ...)` clause.
 * They rely entirely on Postgres Row-Level Security policies to scope the
 * result set to engagements the caller actually belongs to. If those RLS
 * policies are ever loosened or misconfigured, these functions will start
 * returning other clients' engagements with no JS-level check to catch it.
 *
 * All mutations on these tables live in app/actions/engagements.ts; this
 * file is queries only.
 */
export type EngagementSummary = { id: string; name: string; bank_name: string };

export type Engagement = EngagementSummary & {
  bank_logo_url: string | null;
  key_prefix: string;
  modules: string[];
  test_case_packages: string[];
  sla_days: SlaDays;
  sit_start_date: string | null;
  sit_end_date: string | null;
  uat_start_date: string | null;
  uat_end_date: string | null;
  sit_expected: boolean;
  test_cases_enabled: boolean;
};

// These are each called once from an engagement's layout and again from the
// page rendered inside it; cache() dedupes that to one query per request.
export const listAccessibleEngagements = cache(async (): Promise<EngagementSummary[]> => {
  const supabase = createServerClient();
  // No `.eq(...)` membership filter here on purpose — RLS on `engagements`
  // is what scopes this to the caller's engagements. See the file header.
  const { data, error } = await supabase
    .from('engagements')
    .select('id, name, bank_name')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
});

export const getEngagement = cache(async (id: string): Promise<Engagement | null> => {
  const supabase = createServerClient();
  // Same pattern as listAccessibleEngagements: fetching by id alone with no
  // membership check — a non-member querying an id they don't belong to is
  // expected to get `null` back from RLS, not from a check in this function.
  const { data, error } = await supabase
    .from('engagements')
    .select(
      'id, name, bank_name, bank_logo_url, key_prefix, modules, test_case_packages, sla_days, sit_start_date, sit_end_date, uat_start_date, uat_end_date, sit_expected, test_cases_enabled',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export type TeamMember = { id: string; name: string };

// The Prometeia roster for this engagement (used to populate the assignee
// picker). Any engagement member — bank or Prometeia — can read this; only
// Prometeia can manage the roster itself (see app/actions/engagements.ts).
export const listPrometeiaTeam = cache(async (engagementId: string): Promise<TeamMember[]> => {
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
});

export type PhaseTeamMember = TeamMember & { phase: 'sit' | 'uat' };

// The Bank/SIT roster with each member's phase — used to populate the
// execution-owner picker (Settings, Prometeia-only there) and to resolve an
// owner id to a name/phase for the workload view (Dashboard, any member).
// Same any-member-can-read pattern as listPrometeiaTeam.
export const listBankSitTeam = cache(async (engagementId: string): Promise<PhaseTeamMember[]> => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('engagement_members')
    .select('user_id, phase, profiles!inner(full_name, email, is_prometeia)')
    .eq('engagement_id', engagementId)
    .eq('profiles.is_prometeia', false);
  if (error) throw error;
  return (
    data as unknown as {
      user_id: string;
      phase: 'sit' | 'uat';
      profiles: { full_name: string | null; email: string };
    }[]
  ).map((row) => ({ id: row.user_id, name: row.profiles.full_name ?? row.profiles.email, phase: row.phase }));
});

// This engagement member's own phase, if they're non-Prometeia — determines
// which of a step's two result columns (sit_result/uat_result) they may
// edit. Null for Prometeia members or anyone with no phase on record.
export const getOwnPhase = cache(async (engagementId: string, userId: string): Promise<'sit' | 'uat' | null> => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('engagement_members')
    .select('phase')
    .eq('engagement_id', engagementId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.phase as 'sit' | 'uat' | undefined) ?? null;
});
