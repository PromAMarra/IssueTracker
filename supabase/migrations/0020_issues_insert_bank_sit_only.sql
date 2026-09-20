-- Only Bank/SIT (non-Prometeia) engagement members may open new tickets —
-- Prometeia's role is to work tickets, not report them. Extends the
-- existing issues_insert policy (from 0006_issue_insert_assignee.sql) with
-- one more condition, mirroring the "not is_prometeia_user()" idiom already
-- used in 0019_dispute_rejection.sql.
drop policy "issues_insert" on public.issues;
create policy "issues_insert" on public.issues for insert
  with check (
    is_engagement_member(engagement_id)
    and reporter_id = auth.uid()
    and status = 'backlog'
    and not is_prometeia_user()
  );
