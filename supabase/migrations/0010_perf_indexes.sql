-- Postgres does not auto-index the referencing side of a foreign key (only
-- the referenced primary key gets one). These columns are filtered on in
-- every board/list/dashboard load and every ticket-detail open, so without
-- an index each of those was a full sequential table scan.
create index issues_engagement_id_created_at_idx
  on public.issues (engagement_id, created_at desc);

create index issue_comments_issue_id_created_at_idx
  on public.issue_comments (issue_id, created_at);

create index issue_history_issue_id_changed_at_idx
  on public.issue_history (issue_id, changed_at desc);

create index issue_attachments_issue_id_uploaded_at_idx
  on public.issue_attachments (issue_id, uploaded_at);

create index issue_attachments_comment_id_idx
  on public.issue_attachments (comment_id);

create index issues_reporter_id_idx on public.issues (reporter_id);
create index issues_assignee_id_idx on public.issues (assignee_id);
