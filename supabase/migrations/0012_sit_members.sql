-- =============================================================================
-- MIGRATION 0012_sit_members.sql
--
-- Responsibility: introduces the SIT vs UAT distinction for non-Prometeia
-- engagement members (engagement_members.phase) and widens issues.org to
-- allow 'sit' as a reporting org.
--
-- How it fits in: engagement_members.phase becomes the single source of
-- truth for "is this bank/SIT user a SIT tester or a UAT tester" everywhere
-- downstream - dashboards, execution-owner assignment
-- (0022_phase_scoped_results_and_owners.sql), and per-phase result columns
-- on test_package_steps.
--
-- Gotcha: phase is nullable and only constrained to ('sit','uat') when set -
-- Prometeia members are expected to always have phase = null (they aren't
-- SIT or UAT testers themselves), so code reading this column must not
-- assume it is always populated for every member row.
-- =============================================================================

-- Distinguish SIT testers (IVS) from UAT testers (the bank) within the
-- existing non-Prometeia membership roster, so tickets can be attributed to
-- the org that actually reported them rather than only by date window.
alter table public.engagement_members
  add column phase text check (phase in ('sit', 'uat'));

-- Every existing non-Prometeia member predates this distinction; treat them
-- as UAT (bank) testers, matching how they were already being used.
-- One-time backfill: every membership row created before this migration
-- predates the SIT/UAT split, so all of them are treated as UAT (bank)
-- testers - matching how they were already being used in practice before
-- SIT existed as a distinct concept.
update public.engagement_members em
set phase = 'uat'
where phase is null
  and exists (
    select 1 from public.profiles p where p.id = em.user_id and p.is_prometeia = false
  );

-- issues.org gains a third value for SIT-reported tickets, alongside the
-- existing 'prometeia' and 'bank'.
alter table public.issues drop constraint if exists issues_org_check;
alter table public.issues add constraint issues_org_check check (org in ('prometeia', 'bank', 'sit'));
