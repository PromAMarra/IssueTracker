-- Notify people about their own actions too. Until now the three notification
-- triggers all skipped the person who performed the action (`<> auth.uid()`,
-- `<> new.author_id`), so e.g. a Prometeia user who assigned a ticket to
-- themselves never saw an "assigned to you" notification. Users asked for the
-- notification to fire regardless of who triggered it, so that suppression is
-- removed from all three functions below.
--
-- What is NOT removed: the reporter/assignee dedupe
-- (`assignee_id is distinct from reporter_id`). That clause exists for a
-- different reason — it stops one person who is *both* reporter and assignee
-- from getting two notifications for a single event — and is still wanted.
-- Likewise `new.assignee_id is distinct from old.assignee_id` and
-- `new.status is distinct from old.status` stay: those are "did anything
-- actually change" guards, not self-action suppression.
--
-- Only the function bodies change; the triggers from 0008/0009
-- (issues_notify_assigned, comments_notify_participants,
-- issues_notify_status_changed) already point at these functions and are left
-- attached as-is.

-- Was: `and new.assignee_id <> auth.uid()` (self-action suppression, removed).
-- Kept: the `is distinct from old.assignee_id` real-change guard.
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
      'Issue ' || new.key || ' was assigned to you: ' || new.title
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Reporter block was gated on `v_issue.reporter_id <> new.author_id`
-- (self-action suppression, removed) — the reporter now hears about every
-- comment on their ticket, including their own. issues.reporter_id is
-- `not null` and issue_comments.issue_id is a not-null FK to issues, so
-- v_issue is always found and the unconditional insert can never write a
-- null user_id.
-- Assignee block: `and v_issue.assignee_id <> new.author_id` (self-action
-- suppression) removed; `and v_issue.assignee_id is distinct from
-- v_issue.reporter_id` (dedupe) KEPT, so someone who is both reporter and
-- assignee still gets exactly one notification from the block above.
create or replace function public.notify_comment_added()
returns trigger as $$
declare
  v_issue public.issues%rowtype;
begin
  select * into v_issue from public.issues where id = new.issue_id;

  insert into public.notifications (user_id, issue_id, actor_id, type, message)
  values (
    v_issue.reporter_id, v_issue.id, new.author_id, 'comment_added',
    'New comment on ' || v_issue.key || ': ' || v_issue.title
  );

  if v_issue.assignee_id is not null
     and v_issue.assignee_id is distinct from v_issue.reporter_id then
    insert into public.notifications (user_id, issue_id, actor_id, type, message)
    values (
      v_issue.assignee_id, v_issue.id, new.author_id, 'comment_added',
      'New comment on ' || v_issue.key || ': ' || v_issue.title
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Reporter block was gated on `new.reporter_id <> auth.uid()` (self-action
-- suppression, removed). Assignee block: `and new.assignee_id <> auth.uid()`
-- (self-action suppression) removed; `and new.assignee_id is distinct from
-- new.reporter_id` (dedupe) KEPT. The outer `new.status is distinct from
-- old.status` real-change guard is unchanged.
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

    insert into public.notifications (user_id, issue_id, actor_id, type, message)
    values (
      new.reporter_id, new.id, auth.uid(), 'status_changed',
      'Issue ' || new.key || ' status changed to ' || v_status_label || ': ' || new.title
    );

    if new.assignee_id is not null
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
