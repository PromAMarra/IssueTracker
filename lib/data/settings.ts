import { cache } from 'react';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Read-only data-access for `platform_settings` — global (cross-engagement)
 * settings such as the Prometeia logo shown in the app chrome. Runs on the
 * per-request Supabase client, so this is still subject to RLS, but the
 * table is expected to be readable by any authenticated user (it holds no
 * per-engagement or per-tenant data). Mutating this table is a Prometeia-only
 * action; see app/actions/settings.ts.
 */
export type PlatformSettings = { prometeiaLogoUrl: string | null };

// Called once from the engagement layout and again from the settings page
// rendered inside it; cache() dedupes that to one query per request.
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('platform_settings')
    .select('prometeia_logo_url')
    // `platform_settings` is a singleton table: its primary key `id` is a
    // boolean that is always `true`, guaranteeing exactly one row can ever
    // exist. `.eq('id', true)` is how that one row is addressed.
    .eq('id', true)
    .maybeSingle();
  if (error) throw error;
  return { prometeiaLogoUrl: data?.prometeia_logo_url ?? null };
});
