-- Distinguish SIT testers (IVS) from UAT testers (the bank) within the
-- existing non-Prometeia membership roster, so tickets can be attributed to
-- the org that actually reported them rather than only by date window.
alter table public.engagement_members
  add column phase text check (phase in ('sit', 'uat'));

-- Every existing non-Prometeia member predates this distinction; treat them
-- as UAT (bank) testers, matching how they were already being used.
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
