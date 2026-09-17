'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRotateRight, faBell, faEnvelope, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import {
  deleteNotifications,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from '@/app/actions/notifications';

const POLL_MS = 30000;

const TOOLBAR_BUTTON_CLASS =
  'flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-primary-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-soft';

export function NotificationBell() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

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
    const allSelected = notifications !== null && notifications.length > 0 && selected.size === notifications.length;
    const noneSelected = selected.size === 0;
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allSelected && !noneSelected;
    }
  }, [selected, notifications]);

  async function loadPanel() {
    setLoading(true);
    try {
      // Load enough that "select all" + delete actually clears a realistic
      // backlog, not just the first page — the panel is now a full-height
      // scrollable list, not a small 30-row dropdown.
      const [list, count] = await Promise.all([listNotifications(200), getUnreadNotificationCount()]);
      setNotifications(list);
      setUnreadCount(count);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) await loadPanel();
  }

  function close() {
    setOpen(false);
  }

  async function handleSelectNotification(n: NotificationRow) {
    if (!n.readAt) {
      try {
        await markNotificationRead(n.id);
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // non-critical — navigation still proceeds
      }
    }
    close();
    router.push(`/${n.engagementId}/board?issue=${n.issueId}`);
  }

  function toggleChecked(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (notifications === null) return prev;
      return prev.size === notifications.length ? new Set() : new Set(notifications.map((n) => n.id));
    });
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

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (!window.confirm(`Delete ${count} notification${count === 1 ? '' : 's'}? This cannot be undone.`)) return;
    try {
      await deleteNotifications(Array.from(selected));
      await loadPanel();
    } catch {
      // ignore — user can retry
    }
  }

  const allSelected = useMemo(
    () => notifications !== null && notifications.length > 0 && selected.size === notifications.length,
    [notifications, selected],
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Notifications"
        className="relative rounded-full p-2 text-ink-soft hover:bg-primary-soft hover:text-ink"
      >
        <FontAwesomeIcon icon={faBell} className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/40" onClick={close}>
          <div
            className="flex h-full w-full max-w-sm flex-col bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <span className="text-sm font-bold text-ink">Notifications</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={loadPanel}
                  disabled={loading}
                  aria-label="Refresh"
                  title="Refresh"
                  className={TOOLBAR_BUTTON_CLASS}
                >
                  <FontAwesomeIcon icon={faArrowRotateRight} className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={unreadCount === 0}
                  aria-label="Mark all as read"
                  title="Mark all as read"
                  className={TOOLBAR_BUTTON_CLASS}
                >
                  <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={selected.size === 0}
                  aria-label="Delete selected"
                  title="Delete selected"
                  className={TOOLBAR_BUTTON_CLASS}
                >
                  <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  title="Close"
                  className={TOOLBAR_BUTTON_CLASS}
                >
                  <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!loading && notifications !== null && notifications.length > 0 && (
              <label className="flex items-center gap-2 border-b border-hairline px-4 py-2 text-xs font-semibold text-ink-soft">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-hairline text-brand-blue focus:ring-brand-blue"
                />
                Select all
                {selected.size > 0 && <span className="text-ink-soft">({selected.size} selected)</span>}
              </label>
            )}

            <ul className="flex-1 overflow-y-auto">
              {loading && <li className="px-4 py-4 text-sm text-ink-soft">Loading…</li>}
              {!loading && notifications?.length === 0 && (
                <li className="px-4 py-4 text-sm text-ink-soft">No notifications yet.</li>
              )}
              {!loading &&
                notifications?.map((n) => (
                  <li key={n.id} className="flex items-start gap-2 border-b border-hairline/60 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggleChecked(n.id)}
                      aria-label={`Select notification: ${n.message}`}
                      className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-hairline text-brand-blue focus:ring-brand-blue"
                    />
                    <button
                      type="button"
                      onClick={() => handleSelectNotification(n)}
                      className={`flex w-full flex-col gap-0.5 text-left text-sm hover:text-brand-blue ${
                        n.readAt ? 'text-ink-soft' : 'font-medium text-ink'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />}
                        <span className="font-mono text-xs text-ink-soft">{n.issueKey}</span>
                      </span>
                      <span>{n.message}</span>
                      <span className="text-xs text-ink-soft">{new Date(n.createdAt).toLocaleString('en-GB')}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
