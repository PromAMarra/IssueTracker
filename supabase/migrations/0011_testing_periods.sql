-- Configurable SIT (IVS-tested) and UAT (bank-tested) date ranges per
-- engagement, used to scope the daily-defects dashboard report.
alter table public.engagements
  add column sit_start_date date,
  add column sit_end_date date,
  add column uat_start_date date,
  add column uat_end_date date;
