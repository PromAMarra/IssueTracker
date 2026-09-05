import { createServerClient } from '@/lib/supabase/server';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_prometeia: boolean;
};

export type SessionUser = {
  id: string;
  email: string;
  profile: Profile;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, is_prometeia')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return { id: user.id, email: user.email ?? profile.email, profile };
}
