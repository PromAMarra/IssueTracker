'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from '@/app/actions/notifications';

const POLL_MS = 30000;

export function NotificationBell() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function refreshCount() {
      try {
        setUnreadCount(await getUnreadNotificationCount());
      } catch {
        // transient error — the badge just won't update this tick
      }
    }
    refreshCount();
    const interval = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        setNotifications(await listNotifications());
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleSelect(n: NotificationRow) {
    setOpen(false);
    if (!n.readAt) {
      try {
        await markNotificationRead(n.id);
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // non-critical — navigation still proceeds
      }
    }
    router.push(`/${n.engagementId}/board?issue=${n.issueId}`);
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? prev);
    } catch {
      // ignore — user can retry
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Notifications"
        className="relative rounded-full p-2 text-ink-soft hover:bg-surface hover:text-ink"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-ink-soft/10 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-ink-soft/10 px-3 py-2">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-xs text-brand-blue hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {loading && <li className="px-3 py-4 text-sm text-ink-soft">Loading…</li>}
            {!loading && notifications?.length === 0 && (
              <li className="px-3 py-4 text-sm text-ink-soft">No notifications yet.</li>
            )}
            {!loading &&
              notifications?.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(n)}
                    className={`flex w-full flex-col gap-0.5 border-b border-ink-soft/5 px-3 py-2 text-left text-sm last:border-0 hover:bg-surface ${
                      n.readAt ? 'text-ink-soft' : 'font-medium text-ink'
                    }`}
                  >
                    <span className="font-mono text-xs text-ink-soft">{n.issueKey}</span>
                    <span>{n.message}</span>
                    <span className="text-xs text-ink-soft">{new Date(n.createdAt).toLocaleString('en-GB')}</span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
