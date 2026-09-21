-- =============================================================================
-- MIGRATION 0017_notification_message_format.sql
--
-- Responsibility: rewrites the three notification trigger functions
-- (originally from 0008/0009, already amended by 0014) to store a short,
-- self-contained message instead of one that repeats the issue key/title.
--
-- How it fits in: notifications.message is now purely the action phrase
-- (e.g. "Assigned to Jane Doe", "Status changed to Closed"); the issue key
-- and actor name are rendered separately client-side by NotificationBell.tsx
-- using notifications.issue_id / actor_id. Changing this message format
-- again requires updating both this SQL and that component together.
--
-- Gotcha: the status-label mapping (v_status_label case, below) duplicates
-- display strings that also live in the client (Board.tsx/IssueTable.tsx/
-- IssueDetailModal.tsx) and in statusEmailLabel() - see the inline comment
-- below. There is no single source of truth for these labels; keep every
-- copy in sync by hand when a status label changes.
-- =============================================================================

-- Standardize the in-app notification body to a short, self-contained action
-- phrase: issue key and actor name are now rendered separately by the client
-- (NotificationBell.tsx, actor resolved via the existing actor_id column),
-- so `message` no longer needs to repeat the issue key/title the way it did
-- before. Only the function bodies change; the triggers from 0008/0009 already
-- point at these functions and are left attached as-is.

create or replace function public.notify_issue_assigned()
returns trigger as $$
begin
  if new.assignee_id is not null
     and new.assignee_id is distinct from old.assignee_id then
    insert into public.notifications (user_id, issue_id, actor_id, type, message)
    values (
      new.assignee_id,
      new.id,
      auth.uid(),
      'issue_assigned',
      'Assigned to ' || (select coalesce(full_name, email) from public.profiles where id = new.assignee_id)
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function public.notify_comment_added()
returns trigger as $$
declare
  v_issue public.issues%rowtype;
begin
  select * into v_issue from public.issues where id = new.issue_id;

  insert into public.notifications (user_id, issue_id, actor_id, type, message)
  values (
    v_issue.reporter_id, v_issue.id, new.author_id, 'comment_added', 'New comment added'
  );

  if v_issue.assignee_id is not null
     and v_issue.assignee_id is distinct from v_issue.reporter_id then
    insert into public.notifications (user_id, issue_id, actor_id, type, message)
    values (
      v_issue.assignee_id, v_issue.id, new.author_id, 'comment_added', 'New comment added'
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function public.notify_status_changed()
returns trigger as $$
declare
  v_status_key text;
  v_status_label text;
begin
  if new.status is distinct from old.status then
    v_status_key := case
      when old.status = 'closed' and new.status in ('ongoing', 'backlog', 'ready_for_test') then 'reopened'
      else new.status
    end;
    -- Mirrors the display labels used client-side (Board.tsx/IssueTable.tsx/
    -- IssueDetailModal.tsx) and in statusEmailLabel() — duplicated here since
    -- a Postgres trigger can't import a TS helper.
    v_status_label := case v_status_key
      when 'backlog' then 'Backlog'
      when 'ongoing' then 'Ongoing'
      when 'ready_for_test' then 'Ready for Test'
      when 'closed' then 'Closed'
      when 'rejected' then 'Rejected'
      when 'reopened' then 'Reopened'
      else v_status_key
    end;

    insert into public.notifications (user_id, issue_id, actor_id, type, message)
    values (
      new.reporter_id, new.id, auth.uid(), 'status_changed', 'Status changed to ' || v_status_label
    );

    if new.assignee_id is not null
       and new.assignee_id is distinct from new.reporter_id then
      insert into public.notifications (user_id, issue_id, actor_id, type, message)
      values (
        new.assignee_id, new.id, auth.uid(), 'status_changed', 'Status changed to ' || v_status_label
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
