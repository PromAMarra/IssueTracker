-- Track when an issue's row was last modified (status/priority/module/
-- assignee edits), so the List view can show a "Last updated" column
-- alongside the existing "Closed" date (issues.closed_at, already stored).
alter table public.issues add column updated_at timestamptz not null default now();

create or replace function public.set_issues_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger issues_set_updated_at
  before update on public.issues
  for each row execute procedure public.set_issues_updated_at();
