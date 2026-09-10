'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';
import { keyPrefixFromBankName, sanitizeKeyPrefix } from '@/lib/keys';
import type { SlaDays } from '@/lib/types';

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
};

async function requireProm() {
  const session = await getSessionUser();
  if (!session || !session.profile.is_prometeia) throw new Error('Not authorized');
  return session;
}

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
      key_prefix: input.keyPrefix.trim() ? sanitizeKeyPrefix(input.keyPrefix) : keyPrefixFromBankName(input.bankName),
      modules: input.modules,
      test_case_packages: input.testCasePackages,
      sla_days: input.slaDays,
      sit_start_date: input.sitStartDate,
      sit_end_date: input.sitEndDate,
      uat_start_date: input.uatStartDate,
      uat_end_date: input.uatEndDate,
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

export type MemberRole = 'bank' | 'prometeia';

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
  if (profile.is_prometeia !== (role === 'prometeia')) {
    return {
      ok: false,
      message:
        role === 'prometeia'
          ? `${email} is registered as a bank account, not a Prometeia account.`
          : `${email} is registered as a Prometeia account, not a bank account.`,
    };
  }

  const { error } = await supabase
    .from('engagement_members')
    .insert({ engagement_id: engagementId, user_id: profile.id });
  if (error) {
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
  const { data, error } = await supabase
    .from('engagement_members')
    .select('user_id, profiles!inner(email, full_name, is_prometeia)')
    .eq('engagement_id', engagementId)
    .eq('profiles.is_prometeia', role === 'prometeia');
  if (error) throw error;
  return (
    data as unknown as { user_id: string; profiles: { email: string; full_name: string | null } }[]
  ).map((row) => ({ userId: row.user_id, email: row.profiles.email, fullName: row.profiles.full_name }));
}
