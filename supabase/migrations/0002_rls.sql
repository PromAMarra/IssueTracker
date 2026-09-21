-- =============================================================================
-- MIGRATION 0002_rls.sql
--
-- Responsibility: turns on Row-Level Security for every table created in
-- 0001_schema.sql and defines the baseline policies plus the two helper
-- functions (is_prometeia_user, is_engagement_member) that almost every
-- later RLS policy in this project is built on.
--
-- How it fits in: this is the REAL authorization boundary of the whole app.
-- app/actions/*.ts Server Actions talk to Postgres using the Supabase ANON
-- key plus the caller's session cookies - they never use a service-role key -
-- so a Server Action's own JS-level "can this user do X" checks are purely a
-- UX convenience (fail fast, show a friendly error). If a policy here is
-- wrong or missing, the JS check does not save you: a hand-crafted
-- PostgREST/API call bypasses the Server Action entirely and hits these
-- policies directly.
--
-- Gotcha (applies to every SECURITY DEFINER function in this migration and
-- every migration after it): each one pins `set search_path = public,
-- pg_temp`. Do not drop this when editing or copying these functions - a
-- SECURITY DEFINER function without a pinned search_path can be tricked into
-- resolving an unqualified identifier against a schema the caller controls
-- (search-path hijacking), silently escalating the caller's privileges to
-- the function owner's. Plain `sql` functions here are additionally marked
-- STABLE so the planner can cache their result within one statement.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.engagements enable row level security;
alter table public.engagement_members enable row level security;
alter table public.issues enable row level security;
alter table public.issue_comments enable row level security;
alter table public.issue_history enable row level security;
alter table public.issue_attachments enable row level security;

-- The base privilege check used by nearly every policy below. SECURITY
-- DEFINER is required so it can read profiles.is_prometeia regardless of the
-- caller's own SELECT policy on profiles (avoiding a chicken-and-egg
-- dependency where the privilege check itself would need a privilege check).
create or replace function public.is_prometeia_user()
returns boolean as $$
  select coalesce((select is_prometeia from public.profiles where id = auth.uid()), false);
$$ language sql stable security definer set search_path = public, pg_temp;

-- Prometeia staff are implicitly a "member" of every engagement (their org
-- runs every engagement), which is why this ORs in is_prometeia_user()
-- rather than requiring an explicit engagement_members row for them.
create or replace function public.is_engagement_member(p_engagement_id uuid)
returns boolean as $$
  select public.is_prometeia_user() or exists (
    select 1 from public.engagement_members
    where engagement_id = p_engagement_id and user_id = auth.uid()
  );
$$ language sql stable security definer set search_path = public, pg_temp;

-- profiles: everyone reads all profiles (needed for assignee/author display and
-- email lookup in member management); only the row owner updates their own.
create policy "profiles_select_self_or_related" on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_prometeia_user()
    or is_prometeia
    or exists (
      select 1 from public.engagement_members em1
      join public.engagement_members em2 on em1.engagement_id = em2.engagement_id
      where em1.user_id = auth.uid() and em2.user_id = profiles.id
    )
  );
create policy "profiles_update_self" on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Without this trigger, `profiles_update_self` above would let any
-- authenticated user grant themselves Prometeia admin rights with a single
-- direct PostgREST PATCH on their own profile row (that policy's using/
-- with check only test row ownership, not which columns changed). This
-- trigger silently reverts is_prometeia to its old value whenever it was
-- changed by an ordinary (non-definer) request, so only another SECURITY
-- DEFINER function or an admin/service-role path can actually flip it.
create or replace function public.prevent_self_promote()
returns trigger as $$
begin
  if auth.uid() is not null and new.is_prometeia is distinct from old.is_prometeia then
    new.is_prometeia := old.is_prometeia;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create trigger profiles_prevent_self_promote
  before update on public.profiles
  for each row execute procedure public.prevent_self_promote();

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
-- `assignee is null` forces every new issue to start unassigned - only
-- Prometeia (via issues_update_prometeia below) can set an assignee
-- afterward, so a reporter can never self-assign at creation time. (Later
-- relaxed in 0006_issue_insert_assignee.sql, then narrowed again to exclude
-- Prometeia reporters entirely in 0020_issues_insert_bank_sit_only.sql.)
create policy "issues_insert" on public.issues for insert
  with check (
    public.is_engagement_member(engagement_id)
    and reporter_id = auth.uid()
    and status = 'backlog'
    and assignee is null
  );
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
  with check (public.is_prometeia_user() and changed_by = auth.uid());

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
