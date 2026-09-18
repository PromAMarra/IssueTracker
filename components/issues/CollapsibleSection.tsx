'use client';

import { useState, type ReactNode } from 'react';
import { IconChevronDown, type Icon } from '@tabler/icons-react';

export function CollapsibleSection({
  title,
  icon: SectionIcon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: Icon;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-2 flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-ink">
          <SectionIcon className="h-3.5 w-3.5 text-ink-soft" stroke={1.5} />
          {title}
        </span>
        <IconChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform ${open ? '' : '-rotate-90'}`}
          stroke={1.5}
        />
      </button>
      {open && <div>{children}</div>}
    </section>
  );
}
