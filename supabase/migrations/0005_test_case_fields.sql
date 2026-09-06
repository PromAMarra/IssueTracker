-- Configurable, per-engagement list of test case packages (same pattern as
-- `modules`), plus the two new per-issue fields it feeds and a free-text
-- reproduction step. `key_prefix` was already a column (Task 2) but had no
-- Settings UI to edit it — this migration doesn't need to touch it, only the
-- application code does.
alter table public.engagements
  add column test_case_packages text[] not null default '{}';

alter table public.issues
  add column test_case_package text,
  add column test_case_step text;
