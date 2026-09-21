-- =============================================================================
-- MIGRATION 0005_test_case_fields.sql
--
-- Responsibility: adds a configurable, per-engagement list of test-case
-- package names, plus two per-issue fields (test_case_package,
-- test_case_step) that let a reported issue reference the specific test
-- script/step that surfaced it.
--
-- How it fits in: engagements.test_case_packages here is a simple free-text
-- tag list (Settings-editable), distinct from the structured test_packages /
-- test_package_steps tables introduced later in
-- 0018_test_case_tracking.sql - the two are not foreign-keyed together.
--
-- Gotcha: issues.test_case_package / test_case_step are plain nullable text
-- columns with no FK or check constraint tying them back to
-- engagements.test_case_packages, so nothing in the database stops these
-- from drifting out of sync with the configured list; validation, if any, is
-- app-layer only.
-- =============================================================================

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
