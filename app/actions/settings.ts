'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';

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
  revalidatePath('/', 'layout');
}
