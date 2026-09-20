'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { IconClock, IconHistory, IconMessage, IconPaperclip, IconX } from '@tabler/icons-react';
import {
  addComment,
  changeStatusWithNote,
  getIssueDetail,
  updateIssueAssignee,
  updateIssueModule,
  updateIssuePriority,
  updateIssueStatus,
  uploadAttachment,
  type IssueDetail,
} from '@/app/actions/issues';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { CollapsibleSection } from './CollapsibleSection';
import { BANK_SIT_ALLOWED_TRANSITIONS, canPostOnIssue, turnLockedMessage } from '@/lib/issueAccess';
import { statusDurations } from '@/lib/kpi';
import { PRIORITIES, STATUSES } from '@/lib/types';
import type { Priority, Status } from '@/lib/types';
import type { TeamMember } from '@/lib/data/engagements';

const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

function isImageFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.includes(ext);
}

export function IssueDetailModal({
  issueId,
  engagementId,
  isProm,
  modules,
  teamMembers,
}: {
  issueId: string;
  engagementId: string;
  isProm: boolean;
  modules: string[];
  teamMembers: TeamMember[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const commentFileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<Status | null>(null);
  const [statusNote, setStatusNote] = useState('');

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
    setPendingStatus(null);
    setStatusNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId]);

  function close() {
    router.push(pathname);
    // One refresh of the underlying board/list when the modal closes, rather
    // than after every single field edit made while it was open.
    router.refresh();
  }

  async function handleField(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
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
      const newCommentId = await addComment(issueId, commentBody.trim());

      for (const file of commentFiles) {
        const formData = new FormData();
        formData.set('file', file);
        // eslint-disable-next-line no-await-in-loop
        await uploadAttachment(issueId, engagementId, formData, newCommentId);
      }

      setCommentBody('');
      setCommentFiles([]);
      if (commentFileInputRef.current) commentFileInputRef.current.value = '';
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add your comment.');
    } finally {
      setBusy(false);
    }
  }

  async function submitStatusChange(e: FormEvent) {
    e.preventDefault();
    if (!pendingStatus || !statusNote.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await changeStatusWithNote(issueId, pendingStatus, statusNote.trim());
      setPendingStatus(null);
      setStatusNote('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this change.');
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

  const { issue, reporterName, assigneeName, comments, history, attachments } = detail;
  const durations = statusDurations(issue, history, new Date());
  const canPost = canPostOnIssue(issue.status, isProm);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <span className="font-mono text-xs text-ink-soft">
              {issue.key} · Reported by {reporterName} on {new Date(issue.created_at).toLocaleDateString('en-GB')}
            </span>
            <h2 className="text-lg font-bold text-ink">{issue.title}</h2>
          </div>
          <button
            onClick={close}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-primary-soft hover:text-ink"
            aria-label="Close"
          >
            <IconX className="h-4 w-4" stroke={1.5} />
          </button>
        </div>

        <p className="mb-4 whitespace-pre-wrap text-sm text-ink">{issue.description}</p>

        {(issue.test_case_package || issue.test_case_step) && (
          <div className="mb-4 flex flex-col gap-1 rounded border border-ink-soft/10 bg-brand-gray-light p-3 text-sm">
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
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              Status
              <select
                value={issue.status}
                disabled={busy}
                onChange={(e) => handleField(() => updateIssueStatus(issueId, e.target.value as Status))}
                className="rounded-md border border-ink-soft/30 px-2 py-1 text-sm font-normal"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              Priority
              <select
                value={issue.priority}
                disabled={busy}
                onChange={(e) => handleField(() => updateIssuePriority(issueId, e.target.value as Priority))}
                className="rounded-md border border-ink-soft/30 px-2 py-1 text-sm font-normal capitalize"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              Module
              <select
                value={issue.module ?? ''}
                disabled={busy}
                onChange={(e) => handleField(() => updateIssueModule(issueId, e.target.value || null))}
                className="rounded-md border border-ink-soft/30 px-2 py-1 text-sm font-normal"
              >
                <option value="">No module</option>
                {modules.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              Assignee
              <select
                value={issue.assignee_id ?? ''}
                disabled={busy}
                onChange={(e) => handleField(() => updateIssueAssignee(issueId, e.target.value || null))}
                className="w-48 truncate rounded-md border border-ink-soft/30 px-2 py-1 text-sm font-normal"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                {!teamMembers.some((m) => m.id === issue.reporter_id) && (
                  <option value={issue.reporter_id}>↩ Back to {reporterName} (reporter)</option>
                )}
              </select>
            </label>
          </div>
        ) : (
          <div className="mb-6 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {BANK_SIT_ALLOWED_TRANSITIONS[issue.status] ? (
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                  Status
                  <select
                    value={pendingStatus ?? issue.status}
                    disabled={busy}
                    onChange={(e) => setPendingStatus(e.target.value as Status)}
                    className="rounded-md border border-ink-soft/30 px-2 py-1 text-sm font-normal"
                  >
                    <option value={issue.status}>{STATUS_LABELS[issue.status]}</option>
                    {BANK_SIT_ALLOWED_TRANSITIONS[issue.status]!.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <StatusBadge status={issue.status} />
              )}
              <PriorityBadge priority={issue.priority} />
              {issue.module && <span className="text-xs text-ink-soft">{issue.module}</span>}
              {assigneeName && <span className="text-xs text-ink-soft">Assigned: {assigneeName}</span>}
            </div>
            {pendingStatus && pendingStatus !== issue.status && (
              <form
                onSubmit={submitStatusChange}
                className="flex flex-col gap-2 rounded-md border border-ink-soft/20 bg-brand-gray-light p-3"
              >
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                  Note explaining this change (required)
                  <textarea
                    required
                    autoFocus
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    rows={2}
                    className="rounded-md border border-ink-soft/30 px-2 py-1 text-sm font-normal text-ink"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy || !statusNote.trim()}
                    className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-active disabled:opacity-60"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPendingStatus(null);
                      setStatusNote('');
                    }}
                    className="rounded-md border border-ink-soft/30 px-3 py-1.5 text-xs font-medium text-ink hover:bg-primary-soft disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <CollapsibleSection title="Attachments" icon={IconPaperclip} defaultOpen={false}>
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
        </CollapsibleSection>

        <CollapsibleSection title="Comments" icon={IconMessage} defaultOpen={false}>
          <ul className="mb-3 flex flex-col gap-2">
            {comments.map((c) => (
              <li
                key={c.id}
                className={`rounded-md border-l-4 p-2 text-sm ${
                  c.authorIsProm ? 'border-brand-green bg-brand-green/5' : 'border-brand-blue bg-brand-blue/5'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span className="font-medium text-ink">{c.authorName}</span>{' '}
                    <span className="font-mono text-xs text-ink-soft">
                      {new Date(c.createdAt).toLocaleString('en-GB')}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      c.authorIsProm ? 'bg-brand-green/15 text-brand-green' : 'bg-brand-blue/15 text-brand-blue'
                    }`}
                  >
                    {c.authorIsProm ? 'Prometeia' : 'Bank'}
                  </span>
                </div>
                <p className="text-ink">{c.body}</p>
                {c.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.attachments.map((a) =>
                      isImageFile(a.fileName) ? (
                        <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                          <img
                            src={a.url}
                            alt={a.fileName}
                            className="max-h-40 rounded border border-ink-soft/20 object-cover"
                          />
                        </a>
                      ) : (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-brand-blue hover:underline"
                        >
                          {a.fileName}
                        </a>
                      ),
                    )}
                  </div>
                )}
              </li>
            ))}
            {comments.length === 0 && <li className="text-sm text-ink-soft">No comments yet.</li>}
          </ul>
          <form onSubmit={handleComment} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Add a comment"
                disabled={!canPost}
                className="flex-1 rounded-md border border-ink-soft/30 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy || !canPost}
                className="rounded-md bg-brand-blue px-3 py-2 text-sm font-bold text-white hover:bg-primary-active disabled:opacity-60"
              >
                Send
              </button>
            </div>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              Attach files or screenshots (optional)
              <input
                ref={commentFileInputRef}
                type="file"
                multiple
                disabled={!canPost}
                onChange={(e) => setCommentFiles(e.target.files ? Array.from(e.target.files) : [])}
                className="text-sm font-normal disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            {!canPost && <p className="text-xs text-ink-soft">{turnLockedMessage(issue.status)}</p>}
          </form>
        </CollapsibleSection>

        <CollapsibleSection title="Time in status" icon={IconClock} defaultOpen={false}>
          <ul className="flex flex-col gap-1 text-sm">
            {STATUSES.filter((s) => s !== 'closed' && s !== 'rejected').map((s) => (
              <li key={s} className="flex justify-between">
                <span className="text-ink-soft">{STATUS_LABELS[s]}</span>
                <span className="font-mono text-ink">{durations[s] > 0 ? `${durations[s].toFixed(1)}d` : '—'}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>

        <CollapsibleSection title="History" icon={IconHistory} defaultOpen={false}>
          <ul className="flex flex-col gap-1">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-ink-soft">
                <span className="font-mono">{new Date(h.changedAt).toLocaleString('en-GB')}</span> — {h.changedByName}{' '}
                changed <span className="font-medium text-ink">{h.field}</span> to{' '}
                <span className="font-medium text-ink">{h.toValue}</span>
              </li>
            ))}
            {history.length === 0 && <li className="text-xs text-ink-soft">No changes yet.</li>}
          </ul>
        </CollapsibleSection>
      </div>
    </div>
  );
}
