-- Bank/SIT normally cannot update issues at all (issues_update_prometeia
-- below is Prometeia-only) — this is the one narrow exception: disputing a
-- rejection sends the ticket back to Prometeia for reconsideration. RLS
-- gates rows, not columns, so (mirroring test_package_steps_update_bank_sit
-- / test_step_result_only in 0018_test_case_tracking.sql) a trigger pins
-- every column except status to its old value and forces status to
-- 'ongoing' regardless of what was submitted, so a bank/SIT member can't
-- rewrite other fields or set any other status via a direct API call.
create policy "issues_update_dispute_rejection" on public.issues for update
  using (
    status = 'rejected'
    and is_engagement_member(engagement_id)
    and not is_prometeia_user()
  )
  with check (
    is_engagement_member(engagement_id)
    and not is_prometeia_user()
  );

create or replace function public.issue_dispute_rejection_only()
returns trigger as $$
begin
  if not public.is_prometeia_user() then
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
    new.closed_at         := old.closed_at;
    new.test_case_package := old.test_case_package;
    new.test_case_step    := old.test_case_step;
    new.status            := 'ongoing';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create trigger issues_dispute_rejection_only
  before update on public.issues
  for each row
  when (old.status = 'rejected' and not public.is_prometeia_user())
  execute procedure public.issue_dispute_rejection_only();
