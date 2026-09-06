-- Single-row table for platform-wide (not per-engagement) settings, currently
-- just the Prometeia logo shown in the header. `id` is pinned to `true` so the
-- table can only ever hold exactly one row.
create table public.platform_settings (
  id boolean primary key default true,
  prometeia_logo_url text,
  constraint platform_settings_singleton check (id)
);

insert into public.platform_settings (id) values (true);

alter table public.platform_settings enable row level security;

create policy "platform_settings_select" on public.platform_settings for select
  to authenticated
  using (true);

create policy "platform_settings_update_prometeia" on public.platform_settings for update
  using (public.is_prometeia_user());
