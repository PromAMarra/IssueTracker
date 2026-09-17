-- Users can now clear their own notifications from the bell dropdown
-- ("delete all" toolbar button). notifications had select/update policies
-- from 0008 but no delete policy, so a user's own row-owned deletes were
-- silently blocked by RLS. Mirrors the existing own-row policies exactly.
create policy "notifications_delete_own" on public.notifications for delete
  using (user_id = auth.uid());
