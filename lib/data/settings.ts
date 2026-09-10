import { cache } from 'react';
import { createServerClient } from '@/lib/supabase/server';

export type PlatformSettings = { prometeiaLogoUrl: string | null };

// Called once from the engagement layout and again from the settings page
// rendered inside it; cache() dedupes that to one query per request.
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('platform_settings')
    .select('prometeia_logo_url')
    .eq('id', true)
    .maybeSingle();
  if (error) throw error;
  return { prometeiaLogoUrl: data?.prometeia_logo_url ?? null };
});
