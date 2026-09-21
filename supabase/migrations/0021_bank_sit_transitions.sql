-- =============================================================================
-- MIGRATION 0021_bank_sit_transitions.sql
--
-- Responsibility: the current, authoritative definition of every status
-- transition a bank/SIT user is allowed to make directly on public.issues -
-- disputing a rejection, and resolving a ready_for_test ticket to
-- closed/rejected. Supersedes 0019_dispute_rejection.sql's narrower
-- version.
--
-- How it fits in: this is the database-level twin of
-- BANK_SIT_ALLOWED_TRANSITIONS in lib/issueAccess.ts. That TypeScript
-- constant drives the app's UI/Server-Action-level checks (which
-- transitions to offer, early rejection with a friendly error); this
-- migration's policy + trigger are what actually make illegal transitions
-- impossible, since Server Actions run with the caller's own session (anon
-- key + cookies), not a service role. If you ever change
-- BANK_SIT_ALLOWED_TRANSITIONS, you must update the `if not (...)`
-- allow-list in issue_bank_sit_transition_only() below to match, or the two
-- layers will disagree about what's permitted.
--
-- Gotcha: "RLS gates rows, not columns" applies here exactly as it does in
-- 0018_test_case_tracking.sql - the policy's USING/WITH CHECK clauses only
-- constrain which rows are visible/writable and that the actor is a
-- non-Prometeia member, not which specific transition or which columns.
-- All of that finer-grained enforcement lives in the trigger below the
-- policy.
-- =============================================================================

-- Supersedes 0019_dispute_rejection.sql's single-transition policy/trigger:
-- Bank/SIT can now make THREE narrow status changes instead of just one —
-- disputing a rejection (back to Prometeia), and resolving a Ready For Test
-- ticket themselves (Closed if the fix works, Rejected if it doesn't, sending
-- it back to Prometeia). Every other status change stays Prometeia-only
-- (issues_update_prometeia, 0002_rls.sql). Keep this migration's transition
-- list in sync with BANK_SIT_ALLOWED_TRANSITIONS in lib/issueAccess.ts.
drop trigger if exists issues_dispute_rejection_only on public.issues;
drop function if exists public.issue_dispute_rejection_only();
drop policy if exists "issues_update_dispute_rejection" on public.issues;

-- USING filters which EXISTING rows this policy applies to (old.status must
-- already be 'rejected' or 'ready_for_test'); WITH CHECK constrains the
-- RESULTING row after the update. Note WITH CHECK deliberately does NOT
-- constrain new.status here - validating the exact (old, new) transition
-- pair is left entirely to the trigger below, since that is awkward to
-- express in a WITH CHECK clause (which only ever sees NEW, not OLD).
create policy "issues_update_bank_sit_transition" on public.issues for update
  using (
    status in ('rejected', 'ready_for_test')
    and is_engagement_member(engagement_id)
    and not is_prometeia_user()
  )
  with check (
    is_engagement_member(engagement_id)
    and not is_prometeia_user()
  );

-- RLS gates rows, not columns — the policy above would otherwise let a
-- bank/SIT member rewrite other fields or set any status via a direct API
-- call. Mirrors test_step_result_only() (0018) / issue_dispute_rejection_only
-- (0019, now superseded): pin every column except status/closed_at to its old
-- value, validate the attempted transition against the exact same allow-list
-- as the app layer, and compute closed_at itself rather than trusting the
-- submitted value.
create or replace function public.issue_bank_sit_transition_only()
returns trigger as $$
begin
  if not public.is_prometeia_user() then
    -- This is the actual transition allow-list (kept in sync with
    -- BANK_SIT_ALLOWED_TRANSITIONS in lib/issueAccess.ts by hand) - without
    -- it, the policy above would let a bank/SIT member set status to ANY
    -- value on a rejected/ready_for_test issue, since WITH CHECK only
    -- verifies membership and role, not the transition itself.
    if not (
      (old.status = 'rejected' and new.status = 'ongoing')
      or (old.status = 'ready_for_test' and new.status in ('closed', 'rejected'))
    ) then
      raise exception 'This status change is not allowed.';
    end if;
    new.engagement_id     := old.engagement_id;
    new.key               := old.key;
    new.title             := old.title;
    new.description       := old.description;
    new.priority          := old.priority;
    new.module            := old.module;
    new.org               := old.org;
    new.reporter_id       := old.reporter_id;
    new.assignee_id       := old.assignee_id;
    new.created_at        := old.created_at;
    new.test_case_package := old.test_case_package;
    new.test_case_step    := old.test_case_step;
    -- Computed here rather than trusting any closed_at the client
    -- submitted, so a bank/SIT member can't forge an arbitrary closed
    -- timestamp via a direct API call.
    new.closed_at         := case when new.status = 'closed' then now() else null end;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create trigger issues_bank_sit_transition_only
  before update on public.issues
  for each row
  when (old.status in ('rejected', 'ready_for_test') and not public.is_prometeia_user())
  execute procedure public.issue_bank_sit_transition_only();
