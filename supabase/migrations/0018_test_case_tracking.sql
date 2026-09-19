alter table public.engagements
  add column test_cases_enabled boolean not null default false;

create table public.test_packages (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  name text not null,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.test_package_steps (
  id uuid primary key default gen_random_uuid(),
  test_package_id uuid not null references public.test_packages(id) on delete cascade,
  step_number integer not null,
  step_name text not null,
  step_description text not null,
  expected_outcome text not null,
  result text check (result in ('passed', 'passed_with_minor', 'failed', 'na')),
  result_updated_by uuid references public.profiles(id),
  result_updated_at timestamptz
);

create index test_packages_engagement_id_idx
  on public.test_packages (engagement_id, created_at desc);
create index test_package_steps_package_id_idx
  on public.test_package_steps (test_package_id, step_number);

alter table public.test_packages enable row level security;
alter table public.test_package_steps enable row level security;

create policy "test_packages_select" on public.test_packages for select
  using (is_engagement_member(engagement_id));
create policy "test_packages_insert_prometeia" on public.test_packages for insert
  with check (is_prometeia_user());
create policy "test_packages_delete_prometeia" on public.test_packages for delete
  using (is_prometeia_user());

create policy "test_package_steps_select" on public.test_package_steps for select
  using (exists (
    select 1 from public.test_packages tp
    where tp.id = test_package_id and is_engagement_member(tp.engagement_id)
  ));
create policy "test_package_steps_insert_prometeia" on public.test_package_steps for insert
  with check (exists (
    select 1 from public.test_packages tp where tp.id = test_package_id and is_prometeia_user()
  ));
-- Inverse of every other write policy in this app: Bank/SIT only, Prometeia excluded.
create policy "test_package_steps_update_bank_sit" on public.test_package_steps for update
  using (exists (
    select 1 from public.test_packages tp
    where tp.id = test_package_id
      and is_engagement_member(tp.engagement_id)
      and not is_prometeia_user()
  ))
  with check (exists (
    select 1 from public.test_packages tp
    where tp.id = test_package_id
      and is_engagement_member(tp.engagement_id)
      and not is_prometeia_user()
  ));
