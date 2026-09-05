-- profiles mirrors auth.users with app-specific fields
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  is_prometeia boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bank_name text not null,
  bank_logo_url text,
  key_prefix text not null,
  modules text[] not null default '{}',
  team_members text[] not null default '{}',
  sla_days jsonb not null default '{"critical":2,"high":5,"medium":10,"low":20}'::jsonb,
  next_issue_seq integer not null default 1,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.engagement_members (
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (engagement_id, user_id)
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  key text not null,
  title text not null,
  description text not null default '',
  status text not null default 'backlog'
    check (status in ('backlog', 'ongoing', 'ready_for_test', 'closed', 'rejected')),
  priority text not null
    check (priority in ('critical', 'high', 'medium', 'low')),
  module text,
  org text not null check (org in ('prometeia', 'bank')),
  reporter_id uuid not null references public.profiles(id),
  assignee text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (engagement_id, key)
);

create table public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.issue_history (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  field text not null,
  from_value text,
  to_value text not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);

create table public.issue_attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now()
);

create or replace function public.next_issue_key(p_engagement_id uuid)
returns text as $$
declare
  v_prefix text;
  v_seq integer;
begin
  if not public.is_engagement_member(p_engagement_id) then
    raise exception 'not a member of this engagement';
  end if;

  update public.engagements
    set next_issue_seq = next_issue_seq + 1
    where id = p_engagement_id
    returning key_prefix, next_issue_seq - 1 into v_prefix, v_seq;
  return v_prefix || '-' || v_seq;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
