'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';
import { keyPrefixFromBankName, sanitizeKeyPrefix } from '@/lib/keys';
import type { SlaDays } from '@/lib/types';

/**
 * Server Actions for engagement (bank/client workspace) administration.
 *
 * Responsibilities:
 * - Create and update `engagements` rows (the top-level "one per bank/client"
 *   entity, e.g. "ADCB — UAT - ADCB") and their SLA/testing-period settings.
 * - Upload a per-engagement bank logo to the `bank-logos` Storage bucket.
 * - Manage `engagement_members`: add an already-registered user to an
 *   engagement with a role (prometeia / bank / sit), and list the current
 *   roster for a given role.
 *
 * How it fits in: this is the sole mutation path for engagement-level admin
 * screens (the engagement creation wizard and the Settings page). Every
 * exported function here is invoked directly from a Client Component via
 * Next.js Server Actions (`'use server'` above).
 *
 * Security model, shared by every file in app/actions: `requireProm()` below
 * is a JS-level, early-rejection check only (a friendlier error, one fewer
 * round trip). It is NOT the real authorization boundary — Postgres Row-
 * Level Security is. The mutations here run through the same ANON-key +
 * session-cookie client (`createServerClient()`) as any other request, so
 * the matching RLS policies (`engagements_insert_prometeia`,
 * `engagements_update_prometeia`, `members_insert_prometeia` — all in
 * supabase/migrations/0002_rls.sql) independently re-require
 * `is_prometeia_user()` at the database layer. Even if this file's checks
 * were ever removed or bypassed, the database itself still refuses the
 * write.
 *
 * Critical gotcha: `engagement_members.phase` is a DB-level enum of only
 * ('sit' | 'uat') — there is no 'bank' phase value. The UI-facing "Bank"
 * role is stored as phase = 'uat' (see `roleToPhase` below); read that
 * function's comment before touching any role/phase mapping.
 */

export type EngagementInput = {
  name: string;
  bankName: string;
  keyPrefix: string;
  modules: string[];
  testCasePackages: string[];
  slaDays: SlaDays;
  sitStartDate: string | null;
  sitEndDate: string | null;
  uatStartDate: string | null;
  uatEndDate: string | null;
  sitExpected: boolean;
  testCasesEnabled: boolean;
};

// JS-level gate only — see the file header. The real boundary is RLS
// (`is_prometeia_user()`), enforced independently by Postgres for every
// insert/update this file performs.
async function requireProm() {
  const session = await getSessionUser();
  if (!session || !session.profile.is_prometeia) throw new Error('Not authorized');
  return session;
}

// UI-facing sanity check only — there is no matching DB constraint, so a bad
// date range is caught here before it reaches Postgres rather than being
// rejected by it.
function validatePeriods(input: EngagementInput) {
  if (input.sitStartDate && input.sitEndDate && input.sitStartDate > input.sitEndDate) {
    throw new Error('SIT start date must be on or before the SIT end date.');
  }
  if (input.uatStartDate && input.uatEndDate && input.uatStartDate > input.uatEndDate) {
    throw new Error('UAT start date must be on or before the UAT end date.');
  }
}

export async function createEngagement(input: EngagementInput): Promise<string> {
  const session = await requireProm();
  validatePeriods(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('engagements')
    .insert({
      name: input.name,
      bank_name: input.bankName,
      // A Prometeia admin may type a custom prefix (e.g. "ESUP"); leaving it
      // blank falls back to one auto-derived from the bank name. Either way
      // the result is an uppercase, alnum-only string that `next_issue_key()`
      // (supabase/migrations/0001_schema.sql) can safely concatenate with a
      // running sequence number to form a ticket key.
      key_prefix: input.keyPrefix.trim() ? sanitizeKeyPrefix(input.keyPrefix) : keyPrefixFromBankName(input.bankName),
      modules: input.modules,
      test_case_packages: input.testCasePackages,
      sla_days: input.slaDays,
      sit_start_date: input.sitStartDate,
      sit_end_date: input.sitEndDate,
      uat_start_date: input.uatStartDate,
      uat_end_date: input.uatEndDate,
      sit_expected: input.sitExpected,
      test_cases_enabled: input.testCasesEnabled,
      created_by: session.id,
    })
    .select('id')
    .single();
  if (error) throw error;
  revalidatePath('/');
  return data.id as string;
}

export async function updateEngagementSettings(engagementId: string, input: EngagementInput) {
  await requireProm();
  validatePeriods(input);
  const supabase = createServerClient();
  const { error } = await supabase
    .from('engagements')
    .update({
      name: input.name,
      bank_name: input.bankName,
      key_prefix: sanitizeKeyPrefix(input.keyPrefix),
      modules: input.modules,
      test_case_packages: input.testCasePackages,
      sla_days: input.slaDays,
      sit_start_date: input.sitStartDate,
      sit_end_date: input.sitEndDate,
      uat_start_date: input.uatStartDate,
      uat_end_date: input.uatEndDate,
      sit_expected: input.sitExpected,
      test_cases_enabled: input.testCasesEnabled,
    })
    .eq('id', engagementId);
  if (error) throw error;
  revalidatePath(`/${engagementId}/settings`);
  revalidatePath(`/${engagementId}/dashboard`);
}

export async function uploadBankLogo(engagementId: string, formData: FormData) {
  await requireProm();
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided');

  const supabase = createServerClient();
  const extension = file.name.split('.').pop() ?? 'png';
  const path = `${engagementId}/logo-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('bank-logos')
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from('bank-logos').getPublicUrl(path);
  const { error } = await supabase
    .from('engagements')
    .update({ bank_logo_url: publicUrlData.publicUrl })
    .eq('id', engagementId);
  if (error) throw error;
  revalidatePath(`/${engagementId}/settings`);
}

export type MemberRole = 'bank' | 'sit' | 'prometeia';

// `engagement_members.phase` only allows 'sit' or 'uat' at the DB level (see
// supabase/migrations/0012_sit_members.sql) — 'uat' IS the stored value for
// what the UI calls "Bank" (see the PHASE_ORG mapping in
// app/(app)/[engagementId]/dashboard/page.tsx). This maps the domain-level
// MemberRole to the phase value actually stored/queried in the DB.
const roleToPhase = (role: MemberRole): 'sit' | 'uat' | null =>
  role === 'prometeia' ? null : role === 'bank' ? 'uat' : role;

export type AddMemberResult = { ok: boolean; message: string };

export async function addMemberByEmail(
  engagementId: string,
  email: string,
  role: MemberRole,
): Promise<AddMemberResult> {
  await requireProm();
  const supabase = createServerClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_prometeia')
    .ilike('email', email)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    return { ok: false, message: `No account found for ${email} yet — ask them to sign up first.` };
  }
  // Enforce that the account's actual role (`profiles.is_prometeia`, fixed at
  // signup) matches the role slot it's being granted here — prevents e.g.
  // seating a genuine Prometeia employee's account as a bank/SIT member (or
  // vice versa), which downstream org/phase-based logic throughout the app
  // assumes can never happen.
  if (profile.is_prometeia !== (role === 'prometeia')) {
    return {
      ok: false,
      message:
        role === 'prometeia'
          ? `${email} is registered as a bank/SIT account, not a Prometeia account.`
          : `${email} is registered as a Prometeia account, not a bank/SIT account.`,
    };
  }

  // SIT is an optional phase per engagement (`engagements.sit_expected`,
  // supabase/migrations/0016_sit_expected.sql) — refuse to seat a
  // phase = 'sit' member on an engagement where SIT hasn't been turned on,
  // since there is no SIT roster/board surface for them to use.
  if (role === 'sit') {
    const { data: engagement, error: engagementError } = await supabase
      .from('engagements')
      .select('sit_expected')
      .eq('id', engagementId)
      .single();
    if (engagementError) throw engagementError;
    if (!engagement.sit_expected) {
      return { ok: false, message: 'SIT is not enabled for this engagement — enable it in Settings first.' };
    }
  }

  const { error } = await supabase
    .from('engagement_members')
    .insert({ engagement_id: engagementId, user_id: profile.id, phase: roleToPhase(role) });
  if (error) {
    // Postgres unique_violation — `engagement_members` has a
    // (engagement_id, user_id) uniqueness constraint; translate it into a
    // friendly message instead of surfacing the raw DB error to the UI.
    if (error.code === '23505') return { ok: false, message: `${email} is already a member.` };
    throw error;
  }
  revalidatePath(`/${engagementId}/settings`);
  revalidatePath(`/${engagementId}/board`);
  return { ok: true, message: `${email} added.` };
}

export type Member = { userId: string; email: string; fullName: string | null };

export async function listMembers(engagementId: string, role: MemberRole): Promise<Member[]> {
  await requireProm();
  const supabase = createServerClient();
  // Prometeia roster is distinguished purely by `profiles.is_prometeia`;
  // bank vs. SIT rosters are both non-Prometeia members of the very same
  // `engagement_members` table and are further split by `phase`, via the
  // same `roleToPhase` mapping used when adding a member above.
  let query = supabase
    .from('engagement_members')
    .select('user_id, profiles!inner(email, full_name, is_prometeia)')
    .eq('engagement_id', engagementId)
    .eq('profiles.is_prometeia', role === 'prometeia');
  if (role !== 'prometeia') query = query.eq('phase', roleToPhase(role));
  const { data, error } = await query;
  if (error) throw error;
  return (
    data as unknown as { user_id: string; profiles: { email: string; full_name: string | null } }[]
  ).map((row) => ({ userId: row.user_id, email: row.profiles.email, fullName: row.profiles.full_name }));
}
