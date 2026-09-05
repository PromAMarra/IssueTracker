alter table public.profiles enable row level security;
alter table public.engagements enable row level security;
alter table public.engagement_members enable row level security;
alter table public.issues enable row level security;
alter table public.issue_comments enable row level security;
alter table public.issue_history enable row level security;
alter table public.issue_attachments enable row level security;

create or replace function public.is_prometeia_user()
returns boolean as $$
  select coalesce((select is_prometeia from public.profiles where id = auth.uid()), false);
$$ language sql stable security definer;

create or replace function public.is_engagement_member(p_engagement_id uuid)
returns boolean as $$
  select public.is_prometeia_user() or exists (
    select 1 from public.engagement_members
    where engagement_id = p_engagement_id and user_id = auth.uid()
  );
$$ language sql stable security definer;

-- profiles: everyone reads all profiles (needed for assignee/author display and
-- email lookup in member management); only the row owner updates their own.
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_update_self" on public.profiles for update
  using (id = auth.uid());

-- engagements: members read; only Prometeia creates/updates.
create policy "engagements_select_members" on public.engagements for select
  using (public.is_engagement_member(id));
create policy "engagements_insert_prometeia" on public.engagements for insert
  with check (public.is_prometeia_user());
create policy "engagements_update_prometeia" on public.engagements for update
  using (public.is_prometeia_user());

-- engagement_members: members read their engagement's roster; only Prometeia writes.
create policy "members_select" on public.engagement_members for select
  using (public.is_engagement_member(engagement_id));
create policy "members_insert_prometeia" on public.engagement_members for insert
  with check (public.is_prometeia_user());
create policy "members_delete_prometeia" on public.engagement_members for delete
  using (public.is_prometeia_user());

-- issues: members read; members insert (org/reporter checked in the app layer as
-- the authenticated user); only Prometeia updates (status/priority/assignee/module).
create policy "issues_select" on public.issues for select
  using (public.is_engagement_member(engagement_id));
create policy "issues_insert" on public.issues for insert
  with check (public.is_engagement_member(engagement_id) and reporter_id = auth.uid());
create policy "issues_update_prometeia" on public.issues for update
  using (public.is_prometeia_user());

-- comments: any member reads/inserts as themselves; nobody updates or deletes.
create policy "comments_select" on public.issue_comments for select
  using (public.is_engagement_member(
    (select engagement_id from public.issues where id = issue_id)
  ));
create policy "comments_insert" on public.issue_comments for insert
  with check (
    author_id = auth.uid() and public.is_engagement_member(
      (select engagement_id from public.issues where id = issue_id)
    )
  );

-- history: any member reads; only Prometeia inserts (history rows are written by
-- the same server action that performs a Prometeia-only status/field change).
create policy "history_select" on public.issue_history for select
  using (public.is_engagement_member(
    (select engagement_id from public.issues where id = issue_id)
  ));
create policy "history_insert_prometeia" on public.issue_history for insert
  with check (public.is_prometeia_user());

-- attachments: any member reads/inserts as themselves.
create policy "attachments_select" on public.issue_attachments for select
  using (public.is_engagement_member(
    (select engagement_id from public.issues where id = issue_id)
  ));
create policy "attachments_insert" on public.issue_attachments for insert
  with check (
    uploaded_by = auth.uid() and public.is_engagement_member(
      (select engagement_id from public.issues where id = issue_id)
    )
  );
