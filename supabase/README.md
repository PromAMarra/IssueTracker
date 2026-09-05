# Supabase migrations

Run these three files, in order, in the Supabase project's SQL Editor
(Task 14 walks through this against a real project). `issue-attachments` object
paths must be `<engagement_id>/<issue_id>/<filename>` — the storage RLS policies
key off the first path segment being the engagement id.
