import { createServerClient } from '@/lib/supabase/server';

export type PlatformSettings = { prometeiaLogoUrl: string | null };

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('platform_settings')
    .select('prometeia_logo_url')
    .eq('id', true)
    .maybeSingle();
  if (error) throw error;
  return { prometeiaLogoUrl: data?.prometeia_logo_url ?? null };
}
