'use client';

import { useState, type ReactNode } from 'react';
import { IconChevronDown, type Icon } from '@tabler/icons-react';

/**
 * Generic collapsible `<section>` with a clickable header (icon + title +
 * chevron) used throughout `IssueDetailModal` (Attachments, Comments, Time
 * in status, History). Not issue-specific despite living in `components/
 * issues` — could be reused for any titled, collapsible block.
 *
 * `open` is the user's own toggle state; `forceOpen` is an independent,
 * caller-driven override (see the `forceOpen` prop doc below) so a section
 * can be pinned open by app logic (e.g. Comments while a Bank/SIT status
 * change is pending confirmation) without permanently discarding the user's
 * own preference — once the forcing condition clears, `open` still reflects
 * whatever the user last chose.
 */
export function CollapsibleSection({
  title,
  icon: SectionIcon,
  defaultOpen = true,
  forceOpen = false,
  children,
}: {
  title: string;
  icon: Icon;
  defaultOpen?: boolean;
  // Opens the section regardless of the user's own toggle state, without
  // taking away their ability to collapse it again once whatever required
  // this stops applying — e.g. Comments while a status change is pending.
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = open || forceOpen;

  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={isOpen}
        className="mb-2 flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-ink">
          <SectionIcon className="h-3.5 w-3.5 text-ink-soft" stroke={1.5} />
          {title}
        </span>
        <IconChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform ${isOpen ? '' : '-rotate-90'}`}
          stroke={1.5}
        />
      </button>
      {isOpen && <div>{children}</div>}
    </section>
  );
}
