-- Switch "assignee" from a free-text name to a real account reference, so
-- notifications can be delivered to an actual inbox. The old configurable
-- "team_members" text list is replaced by real engagement_members rows
-- (the same table already used for bank members) filtered by
-- profiles.is_prometeia — no new roster table needed.
alter table public.issues add column assignee_id uuid references public.profiles(id);
alter table public.issues drop column assignee;
alter table public.engagements drop column team_members;

-- Notifications: delivered when an issue is assigned to someone, or when a
-- comment is added. Rows are only ever written by the security-definer
-- trigger functions below, never directly by client code, so there is no
-- insert policy for regular users.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  type text not null check (type in ('issue_assigned', 'comment_added')),
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_unread_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications for select
  using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.notify_issue_assigned()
returns trigger as $$
begin
  if new.assignee_id is not null
     and new.assignee_id is distinct from old.assignee_id
     and new.assignee_id <> auth.uid() then
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

create trigger issues_notify_assigned
  after insert or update of assignee_id on public.issues
  for each row execute procedure public.notify_issue_assigned();

create or replace function public.notify_comment_added()
returns trigger as $$
declare
  v_issue public.issues%rowtype;
begin
  select * into v_issue from public.issues where id = new.issue_id;

  if v_issue.reporter_id <> new.author_id then
    insert into public.notifications (user_id, issue_id, actor_id, type, message)
    values (
      v_issue.reporter_id, v_issue.id, new.author_id, 'comment_added',
      'New comment on ' || v_issue.key || ': ' || v_issue.title
    );
  end if;

  if v_issue.assignee_id is not null
     and v_issue.assignee_id <> new.author_id
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

create trigger comments_notify_participants
  after insert on public.issue_comments
  for each row execute procedure public.notify_comment_added();
