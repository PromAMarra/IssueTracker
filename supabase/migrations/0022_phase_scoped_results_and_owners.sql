-- =============================================================================
-- MIGRATION 0022_phase_scoped_results_and_owners.sql
--
-- Responsibility: splits test_package_steps' single result/result_updated_by/
-- result_updated_at columns (from 0018_test_case_tracking.sql) into
-- independent sit_result/uat_result column pairs, backfills existing data
-- into the correct phase, and adds per-phase execution-owner columns to
-- test_packages.
--
-- How it fits in: this is the current shape of test_package_steps' result
-- tracking - app code (Server Actions, dashboard aggregation) must read/
-- write sit_result and uat_result independently and must not expect a
-- single unified `result` column to exist any more.
--
-- Gotcha: the column-pinning trigger (test_step_result_only, replaced
-- below) branches on the ACTOR's own engagement_members.phase to decide
-- which of sit_result/uat_result it will allow through - it does not look
-- at which phase the test_package or step "belongs to" (there is no such
-- concept; a single step can carry both a SIT and a UAT result). A
-- Prometeia member calling this update path (which they normally wouldn't,
-- since Prometeia's own updates go through test_packages_update_prometeia,
-- not this trigger) would fall into the "else" branch and be treated as
-- UAT, because their membership row has no phase set - see the inline
-- comment above actor_phase below.
-- =============================================================================

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

  -- Looks up the ACTOR's phase for this specific engagement (not the
  -- step's or package's phase - steps/packages don't have a single phase,
  -- they carry both SIT and UAT results independently). A user's phase can
  -- therefore only ever be resolved per-engagement, matching how
  -- engagement_members.phase itself is scoped (0012_sit_members.sql).
  select em.phase into actor_phase
  from public.test_packages tp
  join public.engagement_members em on em.engagement_id = tp.engagement_id
  where tp.id = new.test_package_id and em.user_id = auth.uid();

  -- Anyone who is not a SIT member for this engagement - including a
  -- UAT/bank member, or a Prometeia member with no phase row at all - falls
  -- through to the `else` branch and is treated as UAT. This mirrors the
  -- backfill rule above: UAT is this app's always-present default phase.
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

-- No WITH CHECK needed: unlike the bank/SIT-restricted tables above, this
-- grant only ever goes to Prometeia (a trusted role for this table), so
-- there's no need for a column-pinning trigger here either.
drop policy if exists "test_packages_update_prometeia" on public.test_packages;
create policy "test_packages_update_prometeia" on public.test_packages for update
  using (is_prometeia_user());
