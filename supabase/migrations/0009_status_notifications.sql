-- Extend notifications to also cover status changes (e.g. reporter should
-- hear when their ticket moves to "Ready for Test" or "Closed"). The type
-- check constraint needs to be widened first.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('issue_assigned', 'comment_added', 'status_changed'));

create or replace function public.notify_status_changed()
returns trigger as $$
declare
  v_status_label text;
begin
  if new.status is distinct from old.status then
    v_status_label := case
      when old.status = 'closed' and new.status in ('ongoing', 'backlog', 'ready_for_test') then 'reopened'
      else new.status
    end;

    if new.reporter_id <> auth.uid() then
      insert into public.notifications (user_id, issue_id, actor_id, type, message)
      values (
        new.reporter_id, new.id, auth.uid(), 'status_changed',
        'Issue ' || new.key || ' status changed to ' || v_status_label || ': ' || new.title
      );
    end if;

    if new.assignee_id is not null
       and new.assignee_id <> auth.uid()
       and new.assignee_id is distinct from new.reporter_id then
      insert into public.notifications (user_id, issue_id, actor_id, type, message)
      values (
        new.assignee_id, new.id, auth.uid(), 'status_changed',
        'Issue ' || new.key || ' status changed to ' || v_status_label || ': ' || new.title
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create trigger issues_notify_status_changed
  after update of status on public.issues
  for each row execute procedure public.notify_status_changed();
