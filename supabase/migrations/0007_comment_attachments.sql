alter table public.issue_attachments
  add column comment_id uuid references public.issue_comments(id) on delete cascade;
