-- =============================================================================
-- MIGRATION 0013_updated_at.sql
--
-- Responsibility: adds issues.updated_at and a BEFORE UPDATE trigger that
-- stamps it on every update.
--
-- How it fits in: surfaced in the List view as "Last updated", alongside
-- the pre-existing closed_at.
--
-- Gotcha: Postgres fires multiple BEFORE UPDATE triggers on the same table
-- in alphabetical order of trigger name. This project later adds more
-- BEFORE UPDATE triggers on public.issues (issues_bank_sit_transition_only
-- in 0021_bank_sit_transitions.sql; issues_dispute_rejection_only in
-- 0019_dispute_rejection.sql before it was dropped) that rewrite several
-- NEW.* columns; issues_set_updated_at only ever touches NEW.updated_at, so
-- it never conflicts with those today, but keep this ordering rule in mind
-- before adding another trigger that touches a column one of these already
-- touches.
-- =============================================================================

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
