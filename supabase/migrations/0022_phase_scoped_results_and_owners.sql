-- Phase-scoped test results: SIT and UAT testers now record independent
-- results for the same step (a package's SIT progress and UAT progress are
-- genuinely different testing efforts, not one shared answer), replacing
-- the single result/result_updated_by/result_updated_at columns.
--
-- Written defensively (IF NOT EXISTS / IF EXISTS throughout) so this file is
-- safe to re-run from scratch even if an earlier attempt got partway through
-- before failing.
alter table public.test_package_steps
  add column if not exists sit_result text check (sit_result in ('passed', 'passed_with_minor', 'failed', 'na')),
  add column if not exists sit_result_updated_by uuid references public.profiles(id),
  add column if not exists sit_result_updated_at timestamptz,
  add column if not exists uat_result text check (uat_result in ('passed', 'passed_with_minor', 'failed', 'na')),
  add column if not exists uat_result_updated_by uuid references public.profiles(id),
  add column if not exists uat_result_updated_at timestamptz;

-- Backfill: route each existing result to whichever phase last touched it
-- (via engagement_members.phase for whoever set result_updated_by). A
-- result with no editor at all (pre-filled from the uploaded sheet, never
-- edited) becomes the UAT baseline, since UAT is this app's always-present
-- phase — SIT testers, when SIT is enabled, start from an untested step and
-- record their own independent result.
--
-- Computed via a CTE rather than a plain UPDATE ... FROM ... JOIN, because
-- the join's ON clause needs to reference the row being updated
-- (tps.result_updated_by) — not allowed directly in an UPDATE's FROM-list
-- join, but fine once that lookup is a separate, independently-evaluated
-- query the UPDATE then joins against normally.
with step_phase as (
  select s.id as step_id, em.phase
  from public.test_package_steps s
  join public.test_packages tp on tp.id = s.test_package_id
  left join public.engagement_members em
    on em.engagement_id = tp.engagement_id and em.user_id = s.result_updated_by
)
update public.test_package_steps tps
set
  sit_result = case when sp.phase = 'sit' then tps.result else null end,
  sit_result_updated_by = case when sp.phase = 'sit' then tps.result_updated_by else null end,
  sit_result_updated_at = case when sp.phase = 'sit' then tps.result_updated_at else null end,
  uat_result = case when sp.phase = 'sit' then null else tps.result end,
  uat_result_updated_by = case when sp.phase = 'sit' then null else tps.result_updated_by end,
  uat_result_updated_at = case when sp.phase = 'sit' then null else tps.result_updated_at end
from step_phase sp
where sp.step_id = tps.id;

alter table public.test_package_steps
  drop column if exists result,
  drop column if exists result_updated_by,
  drop column if exists result_updated_at;

-- Supersedes test_step_result_only() (0018): RLS still gates rows, not
-- columns, so the existing test_package_steps_update_bank_sit policy (any
-- non-Prometeia engagement member) is unchanged, but this trigger now also
-- scopes WHICH phase's result a given actor can touch, by looking up their
-- own membership phase for this step's engagement — a SIT member can only
-- ever affect sit_result(_updated_*), a UAT/bank member (or anyone whose
-- phase can't be determined) only uat_result(_updated_*). Every other
-- column stays pinned exactly as before.
create or replace function public.test_step_result_only()
returns trigger as $$
declare
  actor_phase text;
begin
  new.step_number       := old.step_number;
  new.step_name         := old.step_name;
  new.step_description  := old.step_description;
  new.expected_outcome  := old.expected_outcome;
  new.test_package_id   := old.test_package_id;

  select em.phase into actor_phase
  from public.test_packages tp
  join public.engagement_members em on em.engagement_id = tp.engagement_id
  where tp.id = new.test_package_id and em.user_id = auth.uid();

  if actor_phase = 'sit' then
    new.uat_result            := old.uat_result;
    new.uat_result_updated_by := old.uat_result_updated_by;
    new.uat_result_updated_at := old.uat_result_updated_at;
    new.sit_result_updated_by := auth.uid();
    new.sit_result_updated_at := now();
  else
    new.sit_result            := old.sit_result;
    new.sit_result_updated_by := old.sit_result_updated_by;
    new.sit_result_updated_at := old.sit_result_updated_at;
    new.uat_result_updated_by := auth.uid();
    new.uat_result_updated_at := now();
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Execution owners: who's responsible for testing a package, per phase —
-- independent SIT and UAT owners, since they're drawn from each phase's own
-- roster and may well be different people. Prometeia-managed, like every
-- other test_packages field, but 0018 never added an UPDATE policy for this
-- table (only insert/delete were needed until now).
alter table public.test_packages
  add column if not exists sit_execution_owner_id uuid references public.profiles(id),
  add column if not exists uat_execution_owner_id uuid references public.profiles(id);

drop policy if exists "test_packages_update_prometeia" on public.test_packages;
create policy "test_packages_update_prometeia" on public.test_packages for update
  using (is_prometeia_user());
