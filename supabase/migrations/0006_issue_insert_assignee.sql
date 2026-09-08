-- Let a reporter set an initial assignee when creating an issue, so a bank
-- user can hand a ticket straight to a Prometeia owner instead of waiting
-- for Prometeia to triage and assign it after the fact. Everything else about
-- issue creation (must be your own report, must start in backlog) is unchanged;
-- only Prometeia can still change status/priority/module/assignee afterward.
drop policy "issues_insert" on public.issues;
create policy "issues_insert" on public.issues for insert
  with check (
    public.is_engagement_member(engagement_id)
    and reporter_id = auth.uid()
    and status = 'backlog'
  );
