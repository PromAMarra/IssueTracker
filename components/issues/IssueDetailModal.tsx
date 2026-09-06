'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  addComment,
  getIssueDetail,
  updateIssueAssignee,
  updateIssueModule,
  updateIssuePriority,
  updateIssueStatus,
  type IssueDetail,
} from '@/app/actions/issues';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { PRIORITIES, STATUSES } from '@/lib/types';
import type { Priority, Status } from '@/lib/types';

export function IssueDetailModal({
  issueId,
  isProm,
  modules,
  teamMembers,
}: {
  issueId: string;
  isProm: boolean;
  modules: string[];
  teamMembers: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      setDetail(await getIssueDetail(issueId));
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      setError(err instanceof Error ? err.message : 'Could not load this issue.');
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId]);

  function close() {
    router.push(pathname);
  }

  async function handleField(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this change.');
    } finally {
      setBusy(false);
    }
  }

  async function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addComment(issueId, commentBody.trim());
      setCommentBody('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add your comment.');
    } finally {
      setBusy(false);
    }
  }

  if (loadFailed) {
    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={close}>
        <div
          className="rounded-lg bg-white p-6 text-sm text-red-600 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-3">{error ?? 'Could not load this issue.'}</p>
          <button onClick={close} className="text-sm font-medium text-ink hover:underline">
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40">
        <div className="rounded-lg bg-white p-6 text-sm text-ink-soft">Loading…</div>
      </div>
    );
  }

  const { issue, comments, history, attachments } = detail;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <span className="font-mono text-xs text-ink-soft">
              {issue.key} · Reported {new Date(issue.created_at).toLocaleDateString()}
            </span>
            <h2 className="text-lg font-semibold text-ink">{issue.title}</h2>
          </div>
          <button onClick={close} className="text-ink-soft hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="mb-4 whitespace-pre-wrap text-sm text-ink">{issue.description}</p>

        {(issue.test_case_package || issue.test_case_step) && (
          <div className="mb-4 flex flex-col gap-1 rounded border border-ink-soft/10 bg-surface p-3 text-sm">
            {issue.test_case_package && (
              <p>
                <span className="font-medium text-ink">Test case package:</span>{' '}
                <span className="text-ink-soft">{issue.test_case_package}</span>
              </p>
            )}
            {issue.test_case_step && (
              <p className="whitespace-pre-wrap">
                <span className="font-medium text-ink">Test case step:</span>{' '}
                <span className="text-ink-soft">{issue.test_case_step}</span>
              </p>
            )}
          </div>
        )}

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {isProm ? (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              Status
              <select
                value={issue.status}
                disabled={busy}
                onChange={(e) => handleField(() => updateIssueStatus(issueId, e.target.value as Status))}
                className="rounded border border-ink-soft/30 px-2 py-1 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              Priority
              <select
                value={issue.priority}
                disabled={busy}
                onChange={(e) => handleField(() => updateIssuePriority(issueId, e.target.value as Priority))}
                className="rounded border border-ink-soft/30 px-2 py-1 text-sm capitalize"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              Module
              <select
                value={issue.module ?? ''}
                disabled={busy}
                onChange={(e) => handleField(() => updateIssueModule(issueId, e.target.value || null))}
                className="rounded border border-ink-soft/30 px-2 py-1 text-sm"
              >
                <option value="">No module</option>
                {modules.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              Assignee
              <select
                value={issue.assignee ?? ''}
                disabled={busy}
                onChange={(e) => handleField(() => updateIssueAssignee(issueId, e.target.value || null))}
                className="rounded border border-ink-soft/30 px-2 py-1 text-sm"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <StatusBadge status={issue.status} />
            <PriorityBadge priority={issue.priority} />
            {issue.module && <span className="text-xs text-ink-soft">{issue.module}</span>}
            {issue.assignee && <span className="text-xs text-ink-soft">Assigned: {issue.assignee}</span>}
          </div>
        )}

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-ink">Attachments</h3>
          <ul className="mb-2 flex flex-col gap-1">
            {attachments.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noreferrer" className="text-sm text-brand-blue hover:underline">
                  {a.fileName}
                </a>
              </li>
            ))}
            {attachments.length === 0 && <li className="text-sm text-ink-soft">No attachments.</li>}
          </ul>
          <p className="text-xs text-ink-soft">Attachments can only be added when a ticket is first reported.</p>
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-ink">Comments</h3>
          <ul className="mb-3 flex flex-col gap-3">
            {comments.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-medium text-ink">{c.authorName}</span>{' '}
                <span className="font-mono text-xs text-ink-soft">{new Date(c.createdAt).toLocaleString()}</span>
                <p className="text-ink">{c.body}</p>
              </li>
            ))}
            {comments.length === 0 && <li className="text-sm text-ink-soft">No comments yet.</li>}
          </ul>
          <form onSubmit={handleComment} className="flex gap-2">
            <input
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Add a comment"
              className="flex-1 rounded border border-ink-soft/30 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-navy-2 disabled:opacity-60"
            >
              Send
            </button>
          </form>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">History</h3>
          <ul className="flex flex-col gap-1">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-ink-soft">
                <span className="font-mono">{new Date(h.changedAt).toLocaleString()}</span> — {h.changedByName}{' '}
                changed <span className="font-medium text-ink">{h.field}</span> to{' '}
                <span className="font-medium text-ink">{h.toValue}</span>
              </li>
            ))}
            {history.length === 0 && <li className="text-xs text-ink-soft">No changes yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
