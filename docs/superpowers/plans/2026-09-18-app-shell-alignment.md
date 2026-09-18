# App Shell Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's horizontal top-tab navigation with a persistent
dark sidebar + breadcrumb shell, matching the structure of Prometeia's
existing internal software, without changing any page content, Server
Action, or bank-specific logic.

**Architecture:** Extract the "which section is active" logic that
`NavTabs.tsx` currently computes inline into a small, unit-testable pure
function shared by two new presentational components — `Sidebar.tsx` (a
persistent vertical nav, replacing `NavTabs.tsx`) and `Breadcrumbs.tsx` (a
static "Home / {Section}" trail). `Header.tsx` is restyled and stops
rendering the old tab strip. `app/(app)/[engagementId]/layout.tsx` is
restructured to compose top bar + sidebar + breadcrumbs + main content.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS,
`@fortawesome/react-fontawesome` + `@fortawesome/free-solid-svg-icons`
(already a dependency, added in a prior session pass), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-app-shell-alignment-design.md`

## Global Constraints

- No new color tokens. Sidebar dark variant uses only existing
  `tailwind.config.ts` tokens: `bg-ink`, `text-primary-soft/70`,
  `bg-white/10`, `text-white`, `text-brand-green`.
- No changes to any Server Action, any `lib/data/*` function, any page's
  internal content, `MinimalHeader.tsx`, or bank-specific logic
  (`bank_logo_url`, `bank_name`, engagement picker) — these are read as-is
  from existing props, never modified.
- No collapsible/toggleable sidebar — always visible on desktop widths.
- No search icon, no "My Desktop" link, no briefcase icon — not real
  features in this app (see spec's Non-goals).
- `npx tsc --noEmit`, `npm test`, `npm run build` must stay clean after
  every task.
- Work happens in an isolated git worktree (via `EnterWorktree`), gets an
  independent review before merge, and `main`/`master` are pushed together
  at the end — matching this session's established process.

---

### Task 1: Shared active-section logic

**Files:**
- Create: `lib/navSections.ts`
- Test: `lib/navSections.test.ts`

**Interfaces:**
- Produces: `NavSectionKey` (type: `'board' | 'list' | 'dashboard' |
  'settings'`), `NAV_SECTIONS: { key: NavSectionKey; label: string }[]`,
  `activeNavSection(pathname: string, engagementId: string): NavSectionKey
  | null` — used by Task 2 (`Sidebar.tsx`) and Task 3 (`Breadcrumbs.tsx`).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/navSections.test.ts
import { describe, expect, it } from 'vitest';
import { activeNavSection, NAV_SECTIONS } from './navSections';

describe('NAV_SECTIONS', () => {
  it('lists board, list, dashboard, settings in that order', () => {
    expect(NAV_SECTIONS.map((s) => s.key)).toEqual(['board', 'list', 'dashboard', 'settings']);
  });
});

describe('activeNavSection', () => {
  it('matches an exact section path', () => {
    expect(activeNavSection('/eng-1/board', 'eng-1')).toBe('board');
  });

  it('matches a section path with a sub-path (e.g. a query-carrying route)', () => {
    expect(activeNavSection('/eng-1/list/', 'eng-1')).toBe('list');
  });

  it('returns null for a path under a different engagement', () => {
    expect(activeNavSection('/eng-2/board', 'eng-1')).toBeNull();
  });

  it('returns null for a path with no matching section', () => {
    expect(activeNavSection('/eng-1/unknown', 'eng-1')).toBeNull();
  });

  it('returns null for the bare engagement root with no section', () => {
    expect(activeNavSection('/eng-1', 'eng-1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/navSections.test.ts`
Expected: FAIL — `Cannot find module './navSections'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/navSections.ts
export type NavSectionKey = 'board' | 'list' | 'dashboard' | 'settings';

export const NAV_SECTIONS: { key: NavSectionKey; label: string }[] = [
  { key: 'board', label: 'Board' },
  { key: 'list', label: 'List' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'settings', label: 'Settings' },
];

export function activeNavSection(pathname: string, engagementId: string): NavSectionKey | null {
  const prefix = `/${engagementId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const match = NAV_SECTIONS.find((s) => rest === s.key || rest.startsWith(`${s.key}/`));
  return match ? match.key : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/navSections.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/navSections.ts lib/navSections.test.ts
git commit -m "feat: extract shared active-nav-section logic"
```

---

### Task 2: Sidebar component

**Files:**
- Create: `components/Sidebar.tsx`
- Modify: none (not wired into the layout until Task 5)

**Interfaces:**
- Consumes: `NAV_SECTIONS`, `activeNavSection` from `lib/navSections.ts`
  (Task 1).
- Produces: `Sidebar({ engagementId, isProm }: { engagementId: string;
  isProm: boolean })` — a default-exported-free named export, consumed by
  Task 5's layout.

This is a presentational Client Component with no business logic beyond
what Task 1 already covers and unit-tested — no component-rendering test
is added here, consistent with this codebase's existing convention (no
React Testing Library or component tests exist anywhere in this repo;
verification is `tsc`/`build`, matching how `NotificationBell.tsx` and
`CollapsibleSection.tsx` were verified in prior work this session).

- [ ] **Step 1: Write the component**

```tsx
// components/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartLine, faGear, faList, faTableColumns, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { activeNavSection, NAV_SECTIONS, type NavSectionKey } from '@/lib/navSections';

const ICONS: Record<NavSectionKey, IconDefinition> = {
  board: faTableColumns,
  list: faList,
  dashboard: faChartLine,
  settings: faGear,
};

export function Sidebar({ engagementId, isProm }: { engagementId: string; isProm: boolean }) {
  const pathname = usePathname();
  const active = activeNavSection(pathname, engagementId);
  const sections = isProm ? NAV_SECTIONS : NAV_SECTIONS.filter((s) => s.key !== 'settings');

  return (
    <nav className="flex w-full shrink-0 flex-col gap-1 bg-ink p-3 md:w-56">
      {sections.map((section) => {
        const isActive = section.key === active;
        return (
          <Link
            key={section.key}
            href={`/${engagementId}/${section.key}`}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-bold ${
              isActive ? 'bg-white/10 text-white' : 'text-primary-soft/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <FontAwesomeIcon icon={ICONS[section.key]} className={`h-4 w-4 ${isActive ? 'text-brand-green' : ''}`} />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `components/Sidebar.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: add dark-sidebar navigation component"
```

---

### Task 3: Breadcrumbs component

**Files:**
- Create: `components/Breadcrumbs.tsx`

**Interfaces:**
- Consumes: `NAV_SECTIONS`, `activeNavSection` from `lib/navSections.ts`
  (Task 1).
- Produces: `Breadcrumbs({ engagementId }: { engagementId: string })`,
  consumed by Task 5's layout.

- [ ] **Step 1: Write the component**

```tsx
// components/Breadcrumbs.tsx
'use client';

import { usePathname } from 'next/navigation';
import { activeNavSection, NAV_SECTIONS } from '@/lib/navSections';

export function Breadcrumbs({ engagementId }: { engagementId: string }) {
  const pathname = usePathname();
  const active = activeNavSection(pathname, engagementId);
  const label = NAV_SECTIONS.find((s) => s.key === active)?.label;

  return (
    <p className="mb-4 text-xs text-ink-soft">
      <span className="font-bold text-ink">Home</span>
      {label && <> / {label}</>}
    </p>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `components/Breadcrumbs.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/Breadcrumbs.tsx
git commit -m "feat: add breadcrumb trail component"
```

---

### Task 4: Remove the tab strip from Header, retire NavTabs

**Files:**
- Modify: `components/Header.tsx`
- Delete: `components/NavTabs.tsx`

**Interfaces:**
- Consumes: nothing new — `Header`'s props are unchanged (`profile`,
  `engagements`, `current`, `prometeiaLogoUrl`).
- Produces: `Header` no longer renders a nav strip; that responsibility
  moved to `Sidebar` (Task 2), composed separately in Task 5.

**Note on scope**: the spec calls for the top bar to be "visually adapted
to the reference's proportions." Compared against the approved mock,
`Header.tsx`'s existing top row (`px-6 py-3`, hairline bottom border,
`gap-4` between items) and `EngagementPicker.tsx`'s existing bordered
`rounded-md` select already match the mock closely — there is no concrete,
justified visual delta to make there. The one real, load-bearing change is
removing the tab strip it renders underneath, since that responsibility
moves to `Sidebar`. Don't invent cosmetic padding tweaks with no basis;
if a genuine visual gap shows up once this is deployed and clickable,
that's a follow-up task grounded in what's actually seen, not a guess made
here.

First, read the current file to confirm nothing besides the `NavTabs`
import/render has changed since this plan was written:

- [ ] **Step 1: Remove the NavTabs import and render from Header.tsx**

In `components/Header.tsx`, delete this import line:

```tsx
import { NavTabs } from '@/components/NavTabs';
```

And delete this line (the last line inside the `<header>` element, after
the closing `</div>` of the top row):

```tsx
      <NavTabs engagementId={current.id} isProm={profile.is_prometeia} />
```

The `<header>` element's closing tag now directly follows the top row's
closing `</div>`.

- [ ] **Step 2: Verify Header still type-checks with no unused-import errors**

Run: `npx tsc --noEmit`
Expected: no errors referencing `components/Header.tsx`

- [ ] **Step 3: Delete the retired NavTabs component**

```bash
rm components/NavTabs.tsx
```

- [ ] **Step 4: Confirm nothing else imports NavTabs**

Run: `grep -rn "NavTabs" app components`
Expected: no output (Task 5 will not yet have wired `Sidebar` in, so at
this point in the plan the app temporarily has no section navigation at
all — that's fine, it's restored in Task 5, the very next task, before
this is ever merged as a whole).

- [ ] **Step 5: Run the full verify suite**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all clean (this task removes a component and its usage; it does
not yet add the replacement navigation UI, so there is nothing new for
`npm test` to cover)

- [ ] **Step 6: Commit**

```bash
git add components/Header.tsx
git rm components/NavTabs.tsx
git commit -m "refactor: retire NavTabs, remove tab strip from Header"
```

---

### Task 5: Compose the shell in the engagement layout

**Files:**
- Modify: `app/(app)/[engagementId]/layout.tsx`

**Interfaces:**
- Consumes: `Sidebar` (Task 2), `Breadcrumbs` (Task 3), the already-restyled
  `Header` (Task 4).
- Produces: the final Phase 1 shell — this is the task that makes the
  navigation user-visible again after Task 4 removed it.

- [ ] **Step 1: Rewrite the layout**

Replace the full contents of `app/(app)/[engagementId]/layout.tsx` with:

```tsx
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listAccessibleEngagements } from '@/lib/data/engagements';
import { getPlatformSettings } from '@/lib/data/settings';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { Breadcrumbs } from '@/components/Breadcrumbs';

export default async function EngagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { engagementId: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, engagements, platformSettings] = await Promise.all([
    getEngagement(params.engagementId),
    listAccessibleEngagements(),
    getPlatformSettings(),
  ]);
  if (!engagement) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Header
        profile={session.profile}
        engagements={engagements}
        current={engagement}
        prometeiaLogoUrl={platformSettings.prometeiaLogoUrl}
      />
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar engagementId={engagement.id} isProm={session.profile.is_prometeia} />
        <main className="min-w-0 flex-1 px-6 py-6">
          <Breadcrumbs engagementId={engagement.id} />
          {children}
        </main>
      </div>
    </div>
  );
}
```

This is a mechanical composition change: same data fetched the same way,
same `Header` props, `{children}` renders exactly what it did before
(Board/List/Dashboard/Settings pages, untouched). The only behavioral
difference from today is where the section navigation lives and looks.

- [ ] **Step 2: Run the full verify suite**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all clean, 60/60 tests passing, all 7 routes building

- [ ] **Step 3: Manual structural check (no live dev server available)**

Read back `app/(app)/[engagementId]/layout.tsx`, `components/Sidebar.tsx`,
`components/Header.tsx`, and `components/Breadcrumbs.tsx` once more and
confirm: `Sidebar` and `Breadcrumbs` both receive `engagementId` as a
plain string (not the whole `engagement` object), `isProm` is sourced from
`session.profile.is_prometeia` consistently with how `Header` already
receives `profile`, and no leftover reference to `NavTabs` remains
anywhere (`grep -rn "NavTabs" app components lib` returns nothing).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/[engagementId]/layout.tsx"
git commit -m "feat: compose top bar, dark sidebar, and breadcrumbs into the engagement shell"
```

---

## Final Steps (after all 5 tasks)

- [ ] Dispatch an independent code review of the full diff against the
  spec (`docs/superpowers/specs/2026-09-18-app-shell-alignment-design.md`),
  matching this session's established process for every non-trivial
  change.
- [ ] Merge into `main`, re-verify `tsc`/`test`/`build` on the clean,
  non-nested checkout, clean up the worktree.
- [ ] Sync `master` to `main` and push both to `origin`.
- [ ] Report completion honestly: this was verified via `tsc`/`test`/
  `build`/structural reading, not a live browser click-through, since no
  Supabase-backed dev server is available in this environment — say so
  plainly, and suggest the user click through Board/List/Dashboard/
  Settings themselves once deployed to confirm the visual result matches
  the approved mock.
