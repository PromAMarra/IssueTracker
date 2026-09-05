import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  return <>{children}</>;
}
