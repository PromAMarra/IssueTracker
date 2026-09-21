import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, getOwnPhase, listBankSitTeam, listPrometeiaTeam } from '@/lib/data/engagements';
import { getTestPackageDetail, listTestCaseStepOptions, listTestPackageNames } from '@/app/actions/testPackages';
import { TestPackageView } from '@/components/testinglab/TestPackageView';

/**
 * `[engagementId]/testing-lab` — where testers (and Prometeia, read-only)
 * step through one uploaded test package at a time and record/see SIT and
 * UAT results independently per step (since migration 0022 split what used
 * to be one shared `result` column into `sit_result`/`uat_result`).
 *
 * Redirects to the board when this engagement doesn't have test-case
 * tracking turned on at all (`test_cases_enabled`) — this route is
 * meaningless without it.
 *
 * `?package=<id>` selects which package is active; falls back to the first
 * package returned (`listTestPackageNames` orders newest-first) when the
 * param is missing or doesn't match a package that exists for this
 * engagement — so a stale/forged id in the URL can't be used to probe for
 * package ids, it just silently falls back.
 *
 * `userOwnPhase` (via `getOwnPhase`) is only resolved for non-Prometeia
 * users — it tells `TestPackageView` which of the two result columns
 * (sit_result vs uat_result) *this* signed-in tester is allowed to edit;
 * Prometeia users get `null` since they don't edit results at all. The
 * actual write-side enforcement of "you can only touch your own phase's
 * column" lives in `updateTestStepResult` (app/actions/testPackages.ts)
 * and, ultimately, the `test_step_result_only` Postgres trigger — this
 * value only drives which input the UI shows as editable.
 *
 * The `key={activePackageId}` on `TestPackageView` intentionally forces a
 * full remount when the selected package changes, so any local component
 * state from the previous package doesn't leak across packages.
 */
export default async function TestingLabPage({
  params,
  searchParams,
}: {
  params: { engagementId: string };
  searchParams: { package?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const engagement = await getEngagement(params.engagementId);
  if (!engagement) redirect('/');
  if (!engagement.test_cases_enabled) redirect(`/${params.engagementId}/board`);

  const [packages, teamMembers, testCaseStepOptions, bankSitTeam, userOwnPhase] = await Promise.all([
    listTestPackageNames(params.engagementId),
    listPrometeiaTeam(params.engagementId),
    listTestCaseStepOptions(params.engagementId),
    listBankSitTeam(params.engagementId),
    session.profile.is_prometeia ? Promise.resolve(null) : getOwnPhase(params.engagementId, session.id),
  ]);

  if (packages.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">
          No test packages uploaded yet — ask Prometeia to upload one in Settings.
        </p>
      </div>
    );
  }

  const activePackageId =
    searchParams.package && packages.some((p) => p.id === searchParams.package)
      ? searchParams.package
      : packages[0].id;

  const detail = await getTestPackageDetail(params.engagementId, activePackageId);
  // Execution owners are stored as raw user ids on the package; resolve
  // each to a display name from the Bank/SIT roster (or null if unassigned,
  // or — in principle — if the owner was since removed from the roster).
  const ownerName = (id: string | null) => bankSitTeam.find((m) => m.id === id)?.name ?? null;

  return (
    <TestPackageView
      key={activePackageId}
      engagementId={params.engagementId}
      detail={detail}
      isProm={session.profile.is_prometeia}
      modules={engagement.modules}
      teamMembers={teamMembers}
      testCasesEnabled={engagement.test_cases_enabled}
      testCaseStepOptions={testCaseStepOptions}
      sitExpected={engagement.sit_expected}
      userOwnPhase={userOwnPhase}
      sitExecutionOwnerName={ownerName(detail.sitExecutionOwnerId)}
      uatExecutionOwnerName={ownerName(detail.uatExecutionOwnerId)}
    />
  );
}
