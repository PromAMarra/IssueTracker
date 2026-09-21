-- =============================================================================
-- MIGRATION 0006_issue_insert_assignee.sql
--
-- Responsibility: relaxes the issues_insert policy (originally from
-- 0002_rls.sql) so a reporter may set an assignee when filing a new issue,
-- instead of every issue starting unassigned.
--
-- How it fits in: replaces the issues_insert policy in place (drop +
-- recreate), the standard pattern this project uses whenever a policy's
-- `with check` needs to change.
--
-- Gotcha: this is not the final word on who may insert issues - see
-- 0020_issues_insert_bank_sit_only.sql, which drops and recreates this same
-- policy again to also exclude Prometeia users from inserting at all.
-- =============================================================================

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
