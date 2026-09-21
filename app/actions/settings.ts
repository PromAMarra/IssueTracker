'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';

/**
 * Server Action for platform-wide (not per-engagement) settings: currently
 * just uploading the Prometeia logo shown in the app header/layout for every
 * engagement. Contrast with app/actions/engagements.ts's `uploadBankLogo`,
 * which is scoped to a single engagement's `bank_logo_url`.
 *
 * Backing table: `platform_settings` is a deliberate singleton — its `id`
 * column is a boolean pinned to `true` by a check constraint
 * (supabase/migrations/0004_platform_settings.sql), so there is always
 * exactly one row and `.eq('id', true)` below always targets it.
 *
 * Security model, same pattern as the rest of app/actions: `requireProm()`
 * is a JS-level, early-rejection check only. The real boundary is the
 * `platform_settings_update_prometeia` RLS policy
 * (0004_platform_settings.sql), which independently requires
 * `is_prometeia_user()` for any UPDATE.
 */
async function requireProm() {
  const session = await getSessionUser();
  if (!session || !session.profile.is_prometeia) throw new Error('Not authorized');
  return session;
}

export async function uploadPrometeiaLogo(formData: FormData) {
  await requireProm();
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided');

  const supabase = createServerClient();
  const extension = file.name.split('.').pop() ?? 'png';
  // Reuses the per-engagement `bank-logos` bucket under a `_platform/` prefix
  // rather than a dedicated bucket, since this is the only platform-wide
  // image the app stores.
  const path = `_platform/prometeia-logo-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('bank-logos')
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from('bank-logos').getPublicUrl(path);
  const { error } = await supabase
    .from('platform_settings')
    .update({ prometeia_logo_url: publicUrlData.publicUrl })
    .eq('id', true);
  if (error) throw error;
  // Targets the root layout segment (not just this settings page): the
  // Prometeia logo renders in the root layout, which every route shares, so
  // the whole layout must be invalidated for the new logo to show up without
  // a full reload.
  revalidatePath('/', 'layout');
}
