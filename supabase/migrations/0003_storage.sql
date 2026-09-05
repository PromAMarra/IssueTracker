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
