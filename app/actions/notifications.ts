'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';

export type NotificationType = 'issue_assigned' | 'comment_added' | 'status_changed';

export type NotificationRow = {
  id: string;
  type: NotificationType;
  message: string;
  actorName: string;
  createdAt: string;
  readAt: string | null;
  issueId: string;
  engagementId: string;
  issueKey: string;
};

export async function listNotifications(limit = 30): Promise<NotificationRow[]> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('notifications')
    .select(
      'id, type, message, created_at, read_at, issue_id, issues(engagement_id, key), actor:profiles!actor_id(full_name, email)',
    )
    .eq('user_id', session.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      type: NotificationType;
      message: string;
      created_at: string;
      read_at: string | null;
      issue_id: string;
      issues: { engagement_id: string; key: string };
      actor: { full_name: string | null; email: string } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    type: row.type,
    message: row.message,
    // actor_id is nullable in the schema; every real trigger insert sets it
    // to a real auth.uid(), so a missing actor is not expected in practice.
    actorName: row.actor ? (row.actor.full_name ?? row.actor.email) : 'someone',
    createdAt: row.created_at,
    readAt: row.read_at,
    issueId: row.issue_id,
    engagementId: row.issues.engagement_id,
    issueKey: row.issues.key,
  }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const session = await getSessionUser();
  if (!session) return 0;
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.id)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string) {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', session.id);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', session.id)
    .is('read_at', null);
  if (error) throw error;
}

export async function deleteNotifications(ids: string[]) {
  if (ids.length === 0) return;
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { error } = await supabase.from('notifications').delete().eq('user_id', session.id).in('id', ids);
  if (error) throw error;
}
