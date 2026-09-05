import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listMembers } from '@/app/actions/engagements';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { MemberManager } from '@/components/settings/MemberManager';
import { BankLogoUploader } from '@/components/settings/BankLogoUploader';

export default async function SettingsPage({ params }: { params: { engagementId: string } }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  if (!session.profile.is_prometeia) redirect(`/${params.engagementId}/board`);

  const [engagement, members] = await Promise.all([
    getEngagement(params.engagementId),
    listMembers(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="mb-4 text-xl font-semibold text-ink">Settings</h1>
        <SettingsForm
          engagementId={params.engagementId}
          initial={{
            name: engagement.name,
            bankName: engagement.bank_name,
            modules: engagement.modules,
            teamMembers: engagement.team_members,
            slaDays: engagement.sla_days,
          }}
        />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Bank logo</h2>
        <BankLogoUploader engagementId={params.engagementId} currentUrl={engagement.bank_logo_url} />
      </section>
      <section>
        <MemberManager engagementId={params.engagementId} initialMembers={members} />
      </section>
    </div>
  );
}
