'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteAllNotifications,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from '@/app/actions/notifications';

const POLL_MS = 30000;

const TOOLBAR_BUTTON_CLASS =
  'flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-primary-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-soft';

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function IconEnvelope({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    </svg>
  );
}

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

  async function handleRefresh() {
    setLoading(true);
    try {
      const [list, count] = await Promise.all([listNotifications(), getUnreadNotificationCount()]);
      setNotifications(list);
      setUnreadCount(count);
    } catch {
      // transient error — user can retry
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAll() {
    if (!notifications?.length) return;
    if (!window.confirm('Delete all notifications? This cannot be undone.')) return;
    try {
      await deleteAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
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
        className="relative rounded-full p-2 text-ink-soft hover:bg-primary-soft hover:text-ink"
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                aria-label="Refresh"
                title="Refresh"
                className={TOOLBAR_BUTTON_CLASS}
              >
                <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0}
                aria-label="Mark all as read"
                title="Mark all as read"
                className={TOOLBAR_BUTTON_CLASS}
              >
                <IconEnvelope className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={!notifications?.length}
                aria-label="Delete all"
                title="Delete all"
                className={TOOLBAR_BUTTON_CLASS}
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
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
                    className={`flex w-full flex-col gap-0.5 border-b border-ink-soft/5 px-3 py-2 text-left text-sm last:border-0 hover:bg-primary-soft ${
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
