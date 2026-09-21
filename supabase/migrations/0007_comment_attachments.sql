-- =============================================================================
-- MIGRATION 0007_comment_attachments.sql
--
-- Responsibility: lets an issue attachment (public.issue_attachments, from
-- 0001_schema.sql) optionally belong to a specific comment rather than only
-- to the issue as a whole.
--
-- How it fits in: comment_id is nullable - attachments uploaded directly on
-- an issue (not via a comment) leave it null.
--
-- Gotcha: `on delete cascade` means deleting a comment silently deletes any
-- attachment ROWS tied to it, but it does NOT delete the underlying Storage
-- object (see 0003_storage.sql) - orphaned storage objects must be cleaned
-- up by app code, if at all.
-- =============================================================================
alter table public.issue_attachments
  add column comment_id uuid references public.issue_comments(id) on delete cascade;
