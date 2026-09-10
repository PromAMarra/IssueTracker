import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { getPlatformSettings } from '@/lib/data/settings';
import { listMembers } from '@/app/actions/engagements';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { MemberManager } from '@/components/settings/MemberManager';
import { BankLogoUploader } from '@/components/settings/BankLogoUploader';
import { PrometeiaLogoUploader } from '@/components/settings/PrometeiaLogoUploader';

export default async function SettingsPage({ params }: { params: { engagementId: string } }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  if (!session.profile.is_prometeia) redirect(`/${params.engagementId}/board`);

  const [engagement, bankMembers, sitMembers, prometeiaMembers, platformSettings] = await Promise.all([
    getEngagement(params.engagementId),
    listMembers(params.engagementId, 'bank'),
    listMembers(params.engagementId, 'sit'),
    listMembers(params.engagementId, 'prometeia'),
    getPlatformSettings(),
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
            keyPrefix: engagement.key_prefix,
            modules: engagement.modules,
            testCasePackages: engagement.test_case_packages,
            slaDays: engagement.sla_days,
            sitStartDate: engagement.sit_start_date,
            sitEndDate: engagement.sit_end_date,
            uatStartDate: engagement.uat_start_date,
            uatEndDate: engagement.uat_end_date,
          }}
        />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Bank logo</h2>
        <BankLogoUploader engagementId={params.engagementId} currentUrl={engagement.bank_logo_url} />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Prometeia logo</h2>
        <PrometeiaLogoUploader currentUrl={platformSettings.prometeiaLogoUrl} />
      </section>
      <section>
        <MemberManager engagementId={params.engagementId} role="prometeia" initialMembers={prometeiaMembers} />
      </section>
      <section>
        <MemberManager engagementId={params.engagementId} role="sit" initialMembers={sitMembers} />
      </section>
      <section>
        <MemberManager engagementId={params.engagementId} role="bank" initialMembers={bankMembers} />
      </section>
    </div>
  );
}
