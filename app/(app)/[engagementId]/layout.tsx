import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listAccessibleEngagements } from '@/lib/data/engagements';
import { Header } from '@/components/Header';

export default async function EngagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { engagementId: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, engagements] = await Promise.all([
    getEngagement(params.engagementId),
    listAccessibleEngagements(),
  ]);
  if (!engagement) notFound();

  return (
    <div className="min-h-screen bg-surface">
      <Header profile={session.profile} engagements={engagements} current={engagement} />
      <main className="px-6 py-6">{children}</main>
    </div>
  );
}
