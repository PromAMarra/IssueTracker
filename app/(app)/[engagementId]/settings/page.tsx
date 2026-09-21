import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listBankSitTeam } from '@/lib/data/engagements';
import { getPlatformSettings } from '@/lib/data/settings';
import { listMembers } from '@/app/actions/engagements';
import { listTestPackages } from '@/app/actions/testPackages';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { MemberManager } from '@/components/settings/MemberManager';
import { BankLogoUploader } from '@/components/settings/BankLogoUploader';
import { PrometeiaLogoUploader } from '@/components/settings/PrometeiaLogoUploader';
import { TestPackageManager } from '@/components/settings/TestPackageManager';

/**
 * `[engagementId]/settings` — Prometeia-only administration screen for one
 * engagement: engagement metadata/dates (`SettingsForm`), bank/Prometeia
 * branding logos, the three membership rosters (Prometeia/SIT/Bank via
 * `MemberManager`, one instance per role), and test-package upload/owner
 * assignment (`TestPackageManager`).
 *
 * The `is_prometeia` redirect below is a page-level convenience guard only —
 * every write this page's children trigger (member add/remove, package
 * upload, logo upload, engagement field edits) goes through a Server Action
 * that re-derives authorization itself and is additionally constrained by
 * Postgres RLS/UPDATE policies. Do not treat this redirect as the security
 * boundary; it only prevents a Prometeia-only screen from flashing content
 * to the wrong role before a Server Action would reject the write anyway.
 *
 * The SIT member manager and the whole test-package section are both
 * conditionally rendered/fetched based on `sit_expected` /
 * `test_cases_enabled` on the engagement — engagements that don't use SIT
 * or don't track test cases simply don't pay for those queries or show
 * those sections.
 */
export default async function SettingsPage({ params }: { params: { engagementId: string } }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  if (!session.profile.is_prometeia) redirect(`/${params.engagementId}/board`);

  const [engagement, bankMembers, prometeiaMembers, platformSettings] = await Promise.all([
    getEngagement(params.engagementId),
    listMembers(params.engagementId, 'bank'),
    listMembers(params.engagementId, 'prometeia'),
    getPlatformSettings(),
  ]);
  if (!engagement) redirect('/');

  // Each of these is skipped when the corresponding feature is off for this
  // engagement, so a bank-only (no SIT) or issues-only (no test cases)
  // engagement's settings page doesn't fetch or render sections that would
  // have nothing meaningful to show.
  const sitMembers = engagement.sit_expected ? await listMembers(params.engagementId, 'sit') : [];
  const testPackages = engagement.test_cases_enabled ? await listTestPackages(params.engagementId) : [];
  const bankSitTeam = engagement.test_cases_enabled ? await listBankSitTeam(params.engagementId) : [];

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
            sitExpected: engagement.sit_expected,
            testCasesEnabled: engagement.test_cases_enabled,
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
      {engagement.sit_expected && (
        <section>
          <MemberManager engagementId={params.engagementId} role="sit" initialMembers={sitMembers} />
        </section>
      )}
      <section>
        <MemberManager engagementId={params.engagementId} role="bank" initialMembers={bankMembers} />
      </section>
      {engagement.test_cases_enabled && (
        <section>
          <TestPackageManager
            engagementId={params.engagementId}
            initialPackages={testPackages}
            sitExpected={engagement.sit_expected}
            bankSitTeam={bankSitTeam}
          />
        </section>
      )}
    </div>
  );
}
