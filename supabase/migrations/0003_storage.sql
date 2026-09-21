-- =============================================================================
-- MIGRATION 0003_storage.sql
--
-- Responsibility: creates the two Supabase Storage buckets the app uses
-- (bank-logos, issue-attachments) and their access policies on
-- storage.objects.
--
-- How it fits in: bank-logos backs the per-engagement logo shown in the UI
-- header (public bucket, Prometeia-only writes); issue-attachments backs
-- file uploads on issues/comments (private bucket, gated by engagement
-- membership). Uploaded files are recorded in public.issue_attachments
-- (0001_schema.sql) by the app's Server Actions.
--
-- Gotcha: issue-attachments has no engagement_id column on storage.objects
-- itself - engagement scoping is derived entirely from the object's storage
-- *path*, whose first path segment must always be the engagement's UUID (see
-- the storage.foldername() policies below). If app code ever uploads to a
-- path that doesn't start with the engagement id, RLS silently denies access
-- rather than failing at upload time in an obvious way.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('bank-logos', 'bank-logos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('issue-attachments', 'issue-attachments', false)
on conflict (id) do nothing;

create policy "bank_logos_public_read" on storage.objects for select
  using (bucket_id = 'bank-logos');
create policy "bank_logos_prometeia_write" on storage.objects for insert
  with check (bucket_id = 'bank-logos' and public.is_prometeia_user());
create policy "bank_logos_prometeia_update" on storage.objects for update
  using (bucket_id = 'bank-logos' and public.is_prometeia_user());

-- storage.foldername(name) splits the object path into an array of folder
-- segments; [1] (1-indexed) is therefore the top-level folder, which app
-- code always names after the engagement id - this is how engagement
-- membership can gate a bucket that has no engagement_id column of its own.
create policy "attachments_member_read" on storage.objects for select
  using (
    bucket_id = 'issue-attachments'
    and public.is_engagement_member((storage.foldername(name))[1]::uuid)
  );
create policy "attachments_member_write" on storage.objects for insert
  with check (
    bucket_id = 'issue-attachments'
    and public.is_engagement_member((storage.foldername(name))[1]::uuid)
  );
