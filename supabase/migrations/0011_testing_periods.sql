-- =============================================================================
-- MIGRATION 0011_testing_periods.sql
--
-- Responsibility: adds configurable SIT and UAT date ranges to engagements.
--
-- How it fits in: read by the dashboard (app/(app)/[engagementId]/dashboard)
-- to scope the daily-defects / tests-per-day charts to the relevant testing
-- window, and edited from the engagement Settings screen.
--
-- Gotcha: all four columns are nullable with no check constraint enforcing
-- start <= end, or that SIT/UAT ranges don't overlap in some invalid way -
-- that validation, if any, lives entirely in the app layer.
-- =============================================================================

-- Configurable SIT (IVS-tested) and UAT (bank-tested) date ranges per
-- engagement, used to scope the daily-defects dashboard report.
alter table public.engagements
  add column sit_start_date date,
  add column sit_end_date date,
  add column uat_start_date date,
  add column uat_end_date date;
