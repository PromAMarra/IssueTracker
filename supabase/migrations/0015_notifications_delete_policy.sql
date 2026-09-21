-- =============================================================================
-- MIGRATION 0015_notifications_delete_policy.sql
--
-- Responsibility: adds the missing DELETE policy on public.notifications.
--
-- How it fits in: closes a gap left by 0008_notifications.sql, which added
-- select/update-own policies but no delete-own policy - the "clear all
-- notifications" action in the NotificationBell UI was silently a no-op
-- (RLS-blocked, zero rows affected) for every user until this migration.
-- =============================================================================

-- Users can now clear their own notifications from the bell dropdown
-- ("delete all" toolbar button). notifications had select/update policies
-- from 0008 but no delete policy, so a user's own row-owned deletes were
-- silently blocked by RLS. Mirrors the existing own-row policies exactly.
create policy "notifications_delete_own" on public.notifications for delete
  using (user_id = auth.uid());
