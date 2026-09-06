# UAT Issue Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js + Supabase web app where Prometeia and a bank's staff report,
triage, and close UAT issues through a status workflow, with a BI dashboard over the
resulting data.

**Architecture:** Next.js App Router app (TypeScript, Tailwind) talking directly to
Supabase (Postgres + Auth + Storage) from server components and server actions.
Row-level security in Postgres — not application code — is the real access-control
boundary between Prometeia, one bank's users, and another bank's users. All business
logic that can be unit-tested without a live database (KPI math, issue-key generation,
status-transition rules) lives in plain TypeScript modules under `lib/`, tested with
Vitest; everything that needs a live Supabase project is verified manually per a
checklist, since no live project exists until the user creates one.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase JS client
(`@supabase/supabase-js`, `@supabase/ssr`), Recharts (charts), Vitest (unit tests).

**Spec:** `docs/superpowers/specs/2026-09-05-uat-tracker-design.md`

## Global Constraints

- Two roles only: `is_prometeia = true` (full control) or bank member of specific
  engagements (report issues, comment, view — cannot change status/priority/assignee
  or settings). Enforce both in the UI (hide controls) and in Postgres RLS (the real
  boundary).
- Statuses: `backlog`, `ongoing`, `ready_for_test`, `closed`, `rejected`. `reopened`
  is never a stored status — reopening a `closed` issue sets status back to `ongoing`
  and appends an `issue_history` row with `field = 'status'`, `to_value = 'reopened'`
  so the reopen-rate KPI can count it, while the issue's live status is `ongoing`.
- Priorities: `critical`, `high`, `medium`, `low`, each engagement-configurable SLA
  in `sla_days`.
- No email notifications, no invite-by-email — deferred per spec.
- Brand tokens (exact, from the spec): navy `#000D4C`, bright green `#33E578`, blue
  `#0026FF`. Typefaces: IBM Plex Sans (UI/headings), IBM Plex Mono (ticket keys,
  timestamps, tabular figures) — both via Google Fonts.
- Every task's file paths are relative to the project root
  `C:\dev\uat-tracker` (moved here from `Desktop\uat-tracker` during Task 1 — the
  original location was OneDrive-synced, which corrupts `npm install`; see the
  ledger for the ruling).

---

## Task 1: Project scaffold, brand tokens, tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`,
  `postcss.config.mjs`, `.env.local.example`, `.gitignore`, `vitest.config.ts`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Create: `README.md`

**Interfaces:**
- Produces: Tailwind theme tokens (`brand-navy`, `brand-green`, `brand-blue`,
  `ink`, `ink-soft`, `surface`) consumed by every component task; the `font-sans`
  and `font-mono` Tailwind families (IBM Plex Sans / IBM Plex Mono); `npm run dev`,
  `npm run build`, `npm test` scripts every later task assumes exist.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "uat-tracker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.45.4",
    "next": "^14.2.15",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.13.0"
  },
  "devDependencies": {
    "@types/node": "^20.16.10",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs without error, creates `package-lock.json`.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `next.config.mjs`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
};

export default nextConfig;
```

- [ ] **Step 5: Write `tailwind.config.ts` with Prometeia brand tokens**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-navy': '#000D4C',
        'brand-navy-2': '#0A1642',
        'brand-green': '#159E52',
        'brand-green-bright': '#33E578',
        'brand-blue': '#0026FF',
        ink: '#12213F',
        'ink-soft': '#565F78',
        surface: '#F5F7FB',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Write `postcss.config.mjs`**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 7: Write `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #f5f7fb;
  color: #12213f;
}
```

- [ ] **Step 8: Write `app/layout.tsx` with Google Fonts and metadata**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UAT Tracker',
  description: 'Prometeia UAT issue tracking and KPI dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Write a placeholder `app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface">
      <p className="text-ink-soft">UAT Tracker — scaffold OK.</p>
    </main>
  );
}
```

- [ ] **Step 10: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
```

- [ ] **Step 11: Write `.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 12: Write `.gitignore`**

```
node_modules
.next
.env.local
```

- [ ] **Step 13: Write `README.md` stub (expanded in Task 14)**

```markdown
# UAT Tracker

Prometeia UAT issue tracking platform. See `docs/superpowers/specs/` for the design
and `docs/superpowers/plans/` for the build plan. Setup instructions land in Task 14.
```

- [ ] **Step 14: Verify the app boots**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000`; loading it shows "UAT Tracker —
scaffold OK." with IBM Plex Sans applied (check DevTools computed font-family).
Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Prometeia brand tokens"
```

---

## Task 2: Supabase schema, RLS policies, storage buckets

**Files:**
- Create: `supabase/migrations/0001_schema.sql`
- Create: `supabase/migrations/0002_rls.sql`
- Create: `supabase/migrations/0003_storage.sql`
- Create: `supabase/README.md`

**Interfaces:**
- Produces: the complete Postgres schema every later task's queries assume —
  `profiles`, `engagements`, `engagement_members`, `issues`, `issue_comments`,
  `issue_history`, `issue_attachments` tables; a `handle_new_user()` trigger that
  creates a `profiles` row on signup; a `next_issue_key(engagement_id)` SQL function
  Task 8's create-issue action calls to mint `BANK-12`-style keys; storage buckets
  `bank-logos` and `issue-attachments`.

This task has no live database to run against yet (the user creates the Supabase
project in Task 14) — write the SQL correctly by inspection and Postgres syntax
rules; it is verified for real during Task 14's smoke test.

- [ ] **Step 1: Write `supabase/migrations/0001_schema.sql`**

```sql
-- profiles mirrors auth.users with app-specific fields
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  is_prometeia boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bank_name text not null,
  bank_logo_url text,
  key_prefix text not null,
  modules text[] not null default '{}',
  team_members text[] not null default '{}',
  sla_days jsonb not null default '{"critical":2,"high":5,"medium":10,"low":20}'::jsonb,
  next_issue_seq integer not null default 1,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.engagement_members (
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (engagement_id, user_id)
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  key text not null,
  title text not null,
  description text not null default '',
  status text not null default 'backlog'
    check (status in ('backlog', 'ongoing', 'ready_for_test', 'closed', 'rejected')),
  priority text not null
    check (priority in ('critical', 'high', 'medium', 'low')),
  module text,
  org text not null check (org in ('prometeia', 'bank')),
  reporter_id uuid not null references public.profiles(id),
  assignee text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (engagement_id, key)
);

create table public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.issue_history (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  field text not null,
  from_value text,
  to_value text not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);

create table public.issue_attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now()
);

create or replace function public.next_issue_key(p_engagement_id uuid)
returns text as $$
declare
  v_prefix text;
  v_seq integer;
begin
  if not public.is_engagement_member(p_engagement_id) then
    raise exception 'not a member of this engagement';
  end if;

  update public.engagements
    set next_issue_seq = next_issue_seq + 1
    where id = p_engagement_id
    returning key_prefix, next_issue_seq - 1 into v_prefix, v_seq;
  return v_prefix || '-' || v_seq;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
```

`is_engagement_member` is defined later, in `0002_rls.sql` — that's fine. Postgres
does not resolve a plpgsql function body's calls until first execution, not at
`CREATE FUNCTION` time, and migrations always run 0001 → 0002 → 0003 in order before
the app goes live (Task 14), so the helper exists by the time this is ever called.

- [ ] **Step 2: Write `supabase/migrations/0002_rls.sql`**

```sql
alter table public.profiles enable row level security;
alter table public.engagements enable row level security;
alter table public.engagement_members enable row level security;
alter table public.issues enable row level security;
alter table public.issue_comments enable row level security;
alter table public.issue_history enable row level security;
alter table public.issue_attachments enable row level security;

create or replace function public.is_prometeia_user()
returns boolean as $$
  select coalesce((select is_prometeia from public.profiles where id = auth.uid()), false);
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function public.is_engagement_member(p_engagement_id uuid)
returns boolean as $$
  select public.is_prometeia_user() or exists (
    select 1 from public.engagement_members
    where engagement_id = p_engagement_id and user_id = auth.uid()
  );
$$ language sql stable security definer set search_path = public, pg_temp;

-- profiles: every logged-in user reads all profiles (needed for assignee/author
-- display and email lookup in member management) — restricted to `authenticated`
-- so the public anon key can never read this table unauthenticated. Only the row
-- owner updates their own, and a trigger (below) blocks self-promotion to
-- is_prometeia through that path.
create policy "profiles_select_all" on public.profiles for select
  to authenticated
  using (true);
create policy "profiles_update_self" on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.prevent_self_promote()
returns trigger as $$
begin
  if auth.uid() is not null and new.is_prometeia is distinct from old.is_prometeia then
    new.is_prometeia := old.is_prometeia;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create trigger profiles_prevent_self_promote
  before update on public.profiles
  for each row execute procedure public.prevent_self_promote();
```

The trigger only reverts `is_prometeia` when the write comes through an authenticated
end-user JWT (`auth.uid() is not null`) — a service-role or Supabase SQL Editor
connection has no JWT, so `auth.uid()` is null there and the write goes through
untouched. That's the path Task 14's one-time manual promotion
(`update public.profiles set is_prometeia = true where email = '...'`, run in the SQL
Editor) relies on.

```sql

-- engagements: members read; only Prometeia creates/updates.
create policy "engagements_select_members" on public.engagements for select
  using (public.is_engagement_member(id));
create policy "engagements_insert_prometeia" on public.engagements for insert
  with check (public.is_prometeia_user());
create policy "engagements_update_prometeia" on public.engagements for update
  using (public.is_prometeia_user());

-- engagement_members: members read their engagement's roster; only Prometeia writes.
create policy "members_select" on public.engagement_members for select
  using (public.is_engagement_member(engagement_id));
create policy "members_insert_prometeia" on public.engagement_members for insert
  with check (public.is_prometeia_user());
create policy "members_delete_prometeia" on public.engagement_members for delete
  using (public.is_prometeia_user());

-- issues: members read; members insert (org/reporter checked in the app layer as
-- the authenticated user); only Prometeia updates (status/priority/assignee/module).
create policy "issues_select" on public.issues for select
  using (public.is_engagement_member(engagement_id));
create policy "issues_insert" on public.issues for insert
  with check (
    public.is_engagement_member(engagement_id)
    and reporter_id = auth.uid()
    and status = 'backlog'
    and assignee is null
  );
create policy "issues_update_prometeia" on public.issues for update
  using (public.is_prometeia_user());

-- comments: any member reads/inserts as themselves; nobody updates or deletes.
create policy "comments_select" on public.issue_comments for select
  using (public.is_engagement_member(
    (select engagement_id from public.issues where id = issue_id)
  ));
create policy "comments_insert" on public.issue_comments for insert
  with check (
    author_id = auth.uid() and public.is_engagement_member(
      (select engagement_id from public.issues where id = issue_id)
    )
  );

-- history: any member reads; only Prometeia inserts (history rows are written by
-- the same server action that performs a Prometeia-only status/field change).
create policy "history_select" on public.issue_history for select
  using (public.is_engagement_member(
    (select engagement_id from public.issues where id = issue_id)
  ));
create policy "history_insert_prometeia" on public.issue_history for insert
  with check (public.is_prometeia_user() and changed_by = auth.uid());

-- attachments: any member reads/inserts as themselves.
create policy "attachments_select" on public.issue_attachments for select
  using (public.is_engagement_member(
    (select engagement_id from public.issues where id = issue_id)
  ));
create policy "attachments_insert" on public.issue_attachments for insert
  with check (
    uploaded_by = auth.uid() and public.is_engagement_member(
      (select engagement_id from public.issues where id = issue_id)
    )
  );
```

- [ ] **Step 3: Write `supabase/migrations/0003_storage.sql`**

```sql
insert into storage.buckets (id, name, public)
values ('bank-logos', 'bank-logos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('issue-attachments', 'issue-attachments', false)
on conflict (id) do nothing;

create policy "bank_logos_public_read" on storage.objects for select
  using (bucket_id = 'bank-logos');
create policy "bank_logos_prometeia_write" on storage.objects for insert
  with check (bucket_id = 'bank-logos' and public.is_prometeia_user());
create policy "bank_logos_prometeia_update" on storage.objects for update
  using (bucket_id = 'bank-logos' and public.is_prometeia_user());

create policy "attachments_member_read" on storage.objects for select
  using (
    bucket_id = 'issue-attachments'
    and public.is_engagement_member((storage.foldername(name))[1]::uuid)
  );
create policy "attachments_member_write" on storage.objects for insert
  with check (
    bucket_id = 'issue-attachments'
    and public.is_engagement_member((storage.foldername(name))[1]::uuid)
  );
```

- [ ] **Step 4: Write `supabase/README.md` documenting the convention**

```markdown
# Supabase migrations

Run these three files, in order, in the Supabase project's SQL Editor
(Task 14 walks through this against a real project). `issue-attachments` object
paths must be `<engagement_id>/<issue_id>/<filename>` — the storage RLS policies
key off the first path segment being the engagement id.
```

- [ ] **Step 5: Commit**

```bash
git add supabase docs
git commit -m "feat: add Supabase schema, RLS policies, and storage buckets"
```

---

## Task 3: Supabase client helpers, session middleware, route protection

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `middleware.ts`
- Create: `lib/auth/session.ts`
- Test: `lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
  (Task 1's `.env.local.example`).
- Produces: `createClient()` (browser, `lib/supabase/client.ts`) and
  `createServerClient()` (server components/actions, `lib/supabase/server.ts`) —
  every later task that talks to Supabase imports one of these two. `getSessionUser()`
  in `lib/auth/session.ts` returns `{ user, profile } | null`, used by every
  authenticated page/layout to gate access.

- [ ] **Step 1: Write `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Write `lib/supabase/server.ts`**

```typescript
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createServerClient() {
  const cookieStore = cookies();
  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component; middleware refreshes the session instead
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Write `lib/supabase/middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup');

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return response;
}
```

- [ ] **Step 4: Write root `middleware.ts`**

```typescript
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 5: Write `lib/auth/session.ts`**

```typescript
import { createServerClient } from '@/lib/supabase/server';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_prometeia: boolean;
};

export type SessionUser = {
  id: string;
  email: string;
  profile: Profile;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, is_prometeia')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return { id: user.id, email: user.email ?? profile.email, profile };
}
```

- [ ] **Step 6: Write `lib/auth/session.test.ts`**

This module's only pure logic is the shape mapping — the Supabase calls themselves
need a live project, so the unit test locks down the type contract other tasks
import against, catching an accidental field rename before it breaks every caller.

```typescript
import { describe, expect, it } from 'vitest';
import type { Profile, SessionUser } from './session';

describe('SessionUser shape', () => {
  it('accepts a fully-populated Prometeia profile', () => {
    const profile: Profile = {
      id: 'u1',
      email: 'lead@prometeia.com',
      full_name: 'Ana Lead',
      is_prometeia: true,
    };
    const sessionUser: SessionUser = { id: 'u1', email: profile.email, profile };
    expect(sessionUser.profile.is_prometeia).toBe(true);
  });

  it('accepts a bank profile with a null full_name', () => {
    const profile: Profile = {
      id: 'u2',
      email: 'tester@bank.com',
      full_name: null,
      is_prometeia: false,
    };
    expect(profile.full_name).toBeNull();
  });
});
```

- [ ] **Step 7: Run the test**

Run: `npm test`
Expected: PASS (2 tests) — this only checks the TypeScript shape compiles and
`null` is accepted, since the real Supabase round-trip needs a live project
(verified in Task 14).

- [ ] **Step 8: Commit**

```bash
git add lib middleware.ts
git commit -m "feat: add Supabase client/server helpers and auth middleware"
```

---

## Task 4: Domain types and KPI calculation library (TDD)

**Files:**
- Create: `lib/types.ts`
- Create: `lib/kpi.ts`
- Test: `lib/kpi.test.ts`

**Interfaces:**
- Produces: `Issue`, `IssueHistoryEntry`, `SlaDays`, `Status`, `Priority`, `Org`
  types (`lib/types.ts`) every later task imports; `statusDistribution`,
  `priorityDistribution`, `moduleVolume`, `orgVolume`, `timeToCloseByPriority`,
  `agingReport`, `throughputByWeek`, `reopenRate` (`lib/kpi.ts`) — the dashboard
  task (Tasks 12-13) calls these directly on the issue/history arrays fetched from
  Supabase and renders the results; nothing here touches the network, so it is
  fully unit-testable now.

- [ ] **Step 1: Write `lib/types.ts`**

```typescript
export type Status = 'backlog' | 'ongoing' | 'ready_for_test' | 'closed' | 'rejected';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Org = 'prometeia' | 'bank';

export type Issue = {
  id: string;
  engagement_id: string;
  key: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  module: string | null;
  org: Org;
  reporter_id: string;
  assignee: string | null;
  created_at: string;
  closed_at: string | null;
};

export type IssueHistoryEntry = {
  id: string;
  issue_id: string;
  field: string;
  from_value: string | null;
  to_value: string;
  changed_by: string;
  changed_at: string;
};

export type SlaDays = Record<Priority, number>;

export const STATUSES: Status[] = ['backlog', 'ongoing', 'ready_for_test', 'closed', 'rejected'];
export const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];
```

- [ ] **Step 2: Write the failing test file `lib/kpi.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import {
  agingReport,
  moduleVolume,
  orgVolume,
  priorityDistribution,
  reopenRate,
  statusDistribution,
  throughputByWeek,
  timeToCloseByPriority,
} from './kpi';
import type { Issue, IssueHistoryEntry, SlaDays } from './types';

const sla: SlaDays = { critical: 2, high: 5, medium: 10, low: 20 };

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: 'i1',
    engagement_id: 'e1',
    key: 'BANK-1',
    title: 'Sample',
    description: '',
    status: 'backlog',
    priority: 'medium',
    module: 'Payments',
    org: 'bank',
    reporter_id: 'u1',
    assignee: null,
    created_at: '2026-01-01T00:00:00.000Z',
    closed_at: null,
    ...overrides,
  };
}

describe('statusDistribution', () => {
  it('counts every status, including zero for statuses absent from the input', () => {
    const issues = [
      issue({ id: 'a', status: 'backlog' }),
      issue({ id: 'b', status: 'ongoing' }),
      issue({ id: 'c', status: 'ongoing' }),
    ];
    expect(statusDistribution(issues)).toEqual({
      backlog: 1,
      ongoing: 2,
      ready_for_test: 0,
      closed: 0,
      rejected: 0,
    });
  });
});

describe('priorityDistribution', () => {
  it('counts every priority', () => {
    const issues = [
      issue({ id: 'a', priority: 'critical' }),
      issue({ id: 'b', priority: 'critical' }),
      issue({ id: 'c', priority: 'low' }),
    ];
    expect(priorityDistribution(issues)).toEqual({
      critical: 2,
      high: 0,
      medium: 0,
      low: 1,
    });
  });
});

describe('moduleVolume', () => {
  it('groups by module, sorted descending, with a null module folded to Unassigned', () => {
    const issues = [
      issue({ id: 'a', module: 'Payments' }),
      issue({ id: 'b', module: 'Payments' }),
      issue({ id: 'c', module: 'Onboarding' }),
      issue({ id: 'd', module: null }),
    ];
    expect(moduleVolume(issues)).toEqual([
      { module: 'Payments', count: 2 },
      { module: 'Onboarding', count: 1 },
      { module: 'Unassigned', count: 1 },
    ]);
  });
});

describe('orgVolume', () => {
  it('counts issues raised by each org', () => {
    const issues = [
      issue({ id: 'a', org: 'bank' }),
      issue({ id: 'b', org: 'bank' }),
      issue({ id: 'c', org: 'prometeia' }),
    ];
    expect(orgVolume(issues)).toEqual([
      { org: 'bank', count: 2 },
      { org: 'prometeia', count: 1 },
    ]);
  });
});

describe('timeToCloseByPriority', () => {
  it('computes average and median days-to-close and flags SLA breaches', () => {
    const issues = [
      // critical, target 2 days: closed in 1 day (within SLA)
      issue({
        id: 'a',
        priority: 'critical',
        status: 'closed',
        created_at: '2026-01-01T00:00:00.000Z',
        closed_at: '2026-01-02T00:00:00.000Z',
      }),
      // critical, target 2 days: closed in 5 days (breach)
      issue({
        id: 'b',
        priority: 'critical',
        status: 'closed',
        created_at: '2026-01-01T00:00:00.000Z',
        closed_at: '2026-01-06T00:00:00.000Z',
      }),
      // still open — must be excluded
      issue({ id: 'c', priority: 'critical', status: 'ongoing' }),
    ];
    const result = timeToCloseByPriority(issues, sla);
    const critical = result.find((r) => r.priority === 'critical')!;
    expect(critical.count).toBe(2);
    expect(critical.avgDays).toBe(3);
    expect(critical.medianDays).toBe(3);
    expect(critical.targetDays).toBe(2);
    expect(critical.breachCount).toBe(1);

    const high = result.find((r) => r.priority === 'high')!;
    expect(high.count).toBe(0);
    expect(high.avgDays).toBeNull();
  });
});

describe('agingReport', () => {
  it('reports days-open for currently-open issues only, sorted oldest first, with SLA breach flagged', () => {
    const now = new Date('2026-01-10T00:00:00.000Z');
    const issues = [
      issue({ id: 'a', status: 'closed', priority: 'low', created_at: '2026-01-01T00:00:00.000Z' }),
      issue({ id: 'b', status: 'ongoing', priority: 'critical', created_at: '2026-01-08T00:00:00.000Z' }), // 2 days open, target 2 -> not breached
      issue({ id: 'c', status: 'backlog', priority: 'critical', created_at: '2026-01-01T00:00:00.000Z' }), // 9 days open, target 2 -> breached
    ];
    const rows = agingReport(issues, sla, now);
    expect(rows.map((r) => r.issue.id)).toEqual(['c', 'b']);
    expect(rows[0].daysOpen).toBe(9);
    expect(rows[0].breached).toBe(true);
    expect(rows[1].daysOpen).toBe(2);
    expect(rows[1].breached).toBe(false);
  });
});

describe('throughputByWeek', () => {
  it('buckets opened and closed counts into week-start buckets', () => {
    const now = new Date('2026-01-19T00:00:00.000Z'); // a Monday
    const issues = [
      issue({ id: 'a', created_at: '2026-01-12T00:00:00.000Z', status: 'backlog' }), // opened week of Jan 12
      issue({
        id: 'b',
        created_at: '2026-01-05T00:00:00.000Z',
        status: 'closed',
        closed_at: '2026-01-13T00:00:00.000Z',
      }), // opened week of Jan 5, closed week of Jan 12
    ];
    const buckets = throughputByWeek(issues, 3, now);
    expect(buckets).toHaveLength(3);
    const jan12 = buckets.find((b) => b.weekStart === '2026-01-12')!;
    expect(jan12.opened).toBe(1);
    expect(jan12.closed).toBe(1);
    const jan5 = buckets.find((b) => b.weekStart === '2026-01-05')!;
    expect(jan5.opened).toBe(1);
    expect(jan5.closed).toBe(0);
  });
});

describe('reopenRate', () => {
  it('divides reopened issues by every issue that was ever closed', () => {
    const issues = [
      issue({ id: 'a', status: 'closed' }),
      issue({ id: 'b', status: 'closed' }),
      // reopened: currently ongoing again, but was closed once (per history)
      issue({ id: 'c', status: 'ongoing' }),
    ];
    const history: IssueHistoryEntry[] = [
      {
        id: 'h1',
        issue_id: 'c',
        field: 'status',
        from_value: 'closed',
        to_value: 'reopened',
        changed_by: 'u1',
        changed_at: '2026-01-05T00:00:00.000Z',
      },
    ];
    const result = reopenRate(issues, history);
    expect(result.everClosedCount).toBe(3);
    expect(result.reopenedCount).toBe(1);
    expect(result.ratePercent).toBeCloseTo(33.33, 1);
  });

  it('returns a zero rate with no division-by-zero when nothing was ever closed', () => {
    const result = reopenRate([issue({ id: 'a', status: 'backlog' })], []);
    expect(result.everClosedCount).toBe(0);
    expect(result.ratePercent).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/kpi.ts` does not exist yet (`Cannot find module './kpi'`).

- [ ] **Step 4: Write `lib/kpi.ts`**

```typescript
import { PRIORITIES, STATUSES } from './types';
import type { Issue, IssueHistoryEntry, Priority, SlaDays, Status } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY_MS;
}

export function statusDistribution(issues: Issue[]): Record<Status, number> {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const issue of issues) counts[issue.status] += 1;
  return counts;
}

export function priorityDistribution(issues: Issue[]): Record<Priority, number> {
  const counts = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<Priority, number>;
  for (const issue of issues) counts[issue.priority] += 1;
  return counts;
}

export function moduleVolume(issues: Issue[]): { module: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const key = issue.module ?? 'Unassigned';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count);
}

export function orgVolume(issues: Issue[]): { org: Issue['org']; count: number }[] {
  const bank = issues.filter((i) => i.org === 'bank').length;
  const prometeia = issues.filter((i) => i.org === 'prometeia').length;
  return [
    { org: 'bank' as const, count: bank },
    { org: 'prometeia' as const, count: prometeia },
  ];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type TimeToCloseRow = {
  priority: Priority;
  count: number;
  avgDays: number | null;
  medianDays: number | null;
  targetDays: number;
  breachCount: number;
};

export function timeToCloseByPriority(issues: Issue[], sla: SlaDays): TimeToCloseRow[] {
  return PRIORITIES.map((priority) => {
    const closed = issues.filter(
      (i) => i.priority === priority && i.status === 'closed' && i.closed_at,
    );
    const targetDays = sla[priority];
    if (closed.length === 0) {
      return { priority, count: 0, avgDays: null, medianDays: null, targetDays, breachCount: 0 };
    }
    const durations = closed.map((i) => daysBetween(i.created_at, i.closed_at!));
    const avgDays = durations.reduce((a, b) => a + b, 0) / durations.length;
    return {
      priority,
      count: closed.length,
      avgDays,
      medianDays: median(durations),
      targetDays,
      breachCount: durations.filter((d) => d > targetDays).length,
    };
  });
}

export type AgingRow = { issue: Issue; daysOpen: number; targetDays: number; breached: boolean };

export function agingReport(issues: Issue[], sla: SlaDays, now: Date): AgingRow[] {
  return issues
    .filter((i) => i.status !== 'closed' && i.status !== 'rejected')
    .map((issue) => {
      const daysOpen = daysBetween(issue.created_at, now.toISOString());
      const targetDays = sla[issue.priority];
      return { issue, daysOpen, targetDays, breached: daysOpen > targetDays };
    })
    .sort((a, b) => b.daysOpen - a.daysOpen);
}

function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export type ThroughputBucket = { weekStart: string; opened: number; closed: number };

export function throughputByWeek(issues: Issue[], weeks: number, now: Date): ThroughputBucket[] {
  const buckets: ThroughputBucket[] = [];
  const cursor = new Date(now);
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const d = new Date(cursor);
    d.setUTCDate(d.getUTCDate() - i * 7);
    buckets.push({ weekStart: weekStart(d.toISOString()), opened: 0, closed: 0 });
  }
  const index = new Map(buckets.map((b) => [b.weekStart, b]));
  for (const issue of issues) {
    const openedBucket = index.get(weekStart(issue.created_at));
    if (openedBucket) openedBucket.opened += 1;
    if (issue.closed_at) {
      const closedBucket = index.get(weekStart(issue.closed_at));
      if (closedBucket) closedBucket.closed += 1;
    }
  }
  return buckets;
}

export type ReopenRateResult = { everClosedCount: number; reopenedCount: number; ratePercent: number };

export function reopenRate(issues: Issue[], history: IssueHistoryEntry[]): ReopenRateResult {
  const reopenedIssueIds = new Set(
    history.filter((h) => h.field === 'status' && h.to_value === 'reopened').map((h) => h.issue_id),
  );
  const everClosedIds = new Set([
    ...issues.filter((i) => i.status === 'closed').map((i) => i.id),
    ...reopenedIssueIds,
  ]);
  const everClosedCount = everClosedIds.size;
  const reopenedCount = reopenedIssueIds.size;
  return {
    everClosedCount,
    reopenedCount,
    ratePercent: everClosedCount === 0 ? 0 : (reopenedCount / everClosedCount) * 100,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all `kpi.test.ts` cases green.

- [ ] **Step 6: Commit**

```bash
git add lib
git commit -m "feat: add domain types and unit-tested KPI calculation library"
```

---

## Task 5: Auth pages (signup, login, logout)

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/signup/page.tsx`
- Create: `components/auth/LogoutButton.tsx`

**Interfaces:**
- Consumes: `createClient()` from Task 3.
- Produces: `/login` and `/signup` routes the Task 3 middleware already redirects
  unauthenticated visitors to; `<LogoutButton />` Task 6's header renders.

- [ ] **Step 1: Write `app/login/page.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-ink">Sign in</h1>
        <p className="mb-6 text-sm text-ink-soft">UAT Tracker</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-ink">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-ink-soft/30 px-3 py-2 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-ink-soft/30 px-3 py-2 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-brand-navy px-4 py-2 font-medium text-white hover:bg-brand-navy-2 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-sm text-ink-soft">
          No account?{' '}
          <Link href="/signup" className="text-brand-blue hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Write `app/signup/page.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-ink">Check your email</h1>
          <p className="text-sm text-ink-soft">
            Confirm your address, then{' '}
            <Link href="/login" className="text-brand-blue hover:underline">
              sign in
            </Link>
            . If you were expecting access to a specific bank engagement, let your Prometeia
            contact know your email so they can add you.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-ink">Create an account</h1>
        <p className="mb-6 text-sm text-ink-soft">UAT Tracker</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-ink">
            Full name
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded border border-ink-soft/30 px-3 py-2 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-ink-soft/30 px-3 py-2 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-ink-soft/30 px-3 py-2 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-brand-navy px-4 py-2 font-medium text-white hover:bg-brand-navy-2 disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-sm text-ink-soft">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-blue hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Write `components/auth/LogoutButton.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-white/80 hover:text-white hover:underline"
    >
      Sign out
    </button>
  );
}
```

- [ ] **Step 4: Verify the pages render**

Run: `npm run dev`, open `http://localhost:3000/login` and `http://localhost:3000/signup`.
Expected: both forms render with brand-navy submit buttons and IBM Plex Sans type;
submitting fails gracefully with a Supabase error message, since no live project
exists yet (connected for real in Task 14). Stop the dev server once confirmed.

- [ ] **Step 5: Commit**

```bash
git add app/login app/signup components/auth
git commit -m "feat: add signup, login, and logout"
```

---

## Task 6: App shell — header, engagement picker, nav, route guards

**Files:**
- Create: `lib/data/engagements.ts`
- Create: `components/Header.tsx`
- Create: `components/EngagementPicker.tsx`
- Create: `components/NavTabs.tsx`
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/page.tsx`
- Create: `app/(app)/[engagementId]/layout.tsx`
- Create: `app/(app)/[engagementId]/board/page.tsx` (placeholder, filled in Task 9)
- Create: `app/(app)/[engagementId]/list/page.tsx` (placeholder, filled in Task 10)
- Create: `app/(app)/[engagementId]/dashboard/page.tsx` (placeholder, filled in Task 12)
- Create: `app/(app)/[engagementId]/settings/page.tsx` (placeholder, filled in Task 7)
- Modify: `app/page.tsx` (delete the Task 1 scaffold placeholder; the root route is
  now `app/(app)/page.tsx`)

**Interfaces:**
- Consumes: `getSessionUser()` (Task 3), `public/prometeia-logo.png` (already fetched
  from prometeia.com and present in the repo).
- Produces: `EngagementSummary` type and `listAccessibleEngagements()`,
  `getEngagement(id)` (`lib/data/engagements.ts`) — every later data-access module
  (issues, settings) follows this same pattern: a plain async function wrapping a
  Supabase query, callable from server components and server actions alike.
  `<Header engagement profile />` and the `[engagementId]` route segment every
  board/list/dashboard/settings page (Tasks 7, 9, 10, 12) renders under.

- [ ] **Step 1: Delete the Task 1 placeholder root page**

Delete `app/page.tsx` — `app/(app)/page.tsx` (a route group, so it still serves `/`)
replaces it once written below.

- [ ] **Step 2: Write `lib/data/engagements.ts`**

```typescript
import { createServerClient } from '@/lib/supabase/server';
import type { SlaDays } from '@/lib/types';

export type EngagementSummary = { id: string; name: string; bank_name: string };

export type Engagement = EngagementSummary & {
  bank_logo_url: string | null;
  key_prefix: string;
  modules: string[];
  team_members: string[];
  sla_days: SlaDays;
};

export async function listAccessibleEngagements(): Promise<EngagementSummary[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('engagements')
    .select('id, name, bank_name')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getEngagement(id: string): Promise<Engagement | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('engagements')
    .select('id, name, bank_name, bank_logo_url, key_prefix, modules, team_members, sla_days')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 3: Write `components/EngagementPicker.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import type { EngagementSummary } from '@/lib/data/engagements';

export function EngagementPicker({
  engagements,
  currentId,
  canCreate,
}: {
  engagements: EngagementSummary[];
  currentId: string;
  canCreate: boolean;
}) {
  const router = useRouter();

  return (
    <select
      value={currentId}
      onChange={(e) => {
        if (e.target.value === '__new__') router.push('/new-engagement');
        else router.push(`/${e.target.value}/board`);
      }}
      className="rounded border border-white/20 bg-brand-navy-2 px-2 py-1 text-sm text-white"
    >
      {engagements.map((e) => (
        <option key={e.id} value={e.id}>
          {e.bank_name} — {e.name}
        </option>
      ))}
      {canCreate && <option value="__new__">+ New engagement…</option>}
    </select>
  );
}
```

- [ ] **Step 4: Write `components/NavTabs.tsx`**

A client component so it can read the current path with `usePathname()` and
highlight the active tab — a server component has no access to the live route
segment of its own children, only its own `params`.

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: 'board', label: 'Board' },
  { href: 'list', label: 'List' },
  { href: 'dashboard', label: 'Dashboard' },
];

export function NavTabs({ engagementId, isProm }: { engagementId: string; isProm: boolean }) {
  const pathname = usePathname();
  const tabs = isProm ? [...TABS, { href: 'settings', label: 'Settings' }] : TABS;

  return (
    <nav className="flex gap-1 border-t border-white/10 px-6">
      {tabs.map((tab) => {
        const href = `/${engagementId}/${tab.href}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.href}
            href={href}
            className={`px-3 py-2 text-sm ${
              active ? 'border-b-2 border-brand-green-bright text-white' : 'text-white/70 hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Write `components/Header.tsx`**

```tsx
import Image from 'next/image';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { EngagementPicker } from '@/components/EngagementPicker';
import { NavTabs } from '@/components/NavTabs';
import type { Engagement, EngagementSummary } from '@/lib/data/engagements';
import type { Profile } from '@/lib/auth/session';

export function Header({
  profile,
  engagements,
  current,
}: {
  profile: Profile;
  engagements: EngagementSummary[];
  current: Engagement;
}) {
  return (
    <header className="bg-brand-navy text-white">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <Image src="/prometeia-logo.png" alt="Prometeia" width={120} height={38} priority />
          {current.bank_logo_url && (
            <>
              <span className="h-6 w-px bg-white/20" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.bank_logo_url}
                alt={current.bank_name}
                className="h-8 max-w-[140px] object-contain"
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <EngagementPicker
            engagements={engagements}
            currentId={current.id}
            canCreate={profile.is_prometeia}
          />
          <span className="text-sm text-white/70">{profile.full_name ?? profile.email}</span>
          <LogoutButton />
        </div>
      </div>
      <NavTabs engagementId={current.id} isProm={profile.is_prometeia} />
    </header>
  );
}
```

- [ ] **Step 6: Write `app/(app)/layout.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  return <>{children}</>;
}
```

- [ ] **Step 7: Write `app/(app)/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { listAccessibleEngagements } from '@/lib/data/engagements';

export default async function RootPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const engagements = await listAccessibleEngagements();
  if (engagements.length > 0) redirect(`/${engagements[0].id}/board`);
  if (session.profile.is_prometeia) redirect('/new-engagement');

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-lg font-semibold text-ink">No engagement yet</h1>
        <p className="text-sm text-ink-soft">
          Ask your Prometeia contact to add {session.email} to a bank engagement.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Write `app/(app)/[engagementId]/layout.tsx`**

```tsx
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement, listAccessibleEngagements } from '@/lib/data/engagements';
import { Header } from '@/components/Header';

export default async function EngagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { engagementId: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, engagements] = await Promise.all([
    getEngagement(params.engagementId),
    listAccessibleEngagements(),
  ]);
  if (!engagement) notFound();

  return (
    <div className="min-h-screen bg-surface">
      <Header profile={session.profile} engagements={engagements} current={engagement} />
      <main className="px-6 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 9: Write the four placeholder pages**

`app/(app)/[engagementId]/board/page.tsx`:

```tsx
export default function BoardPage() {
  return <p className="text-ink-soft">Board — implemented in Task 9.</p>;
}
```

`app/(app)/[engagementId]/list/page.tsx`:

```tsx
export default function ListPage() {
  return <p className="text-ink-soft">List — implemented in Task 10.</p>;
}
```

`app/(app)/[engagementId]/dashboard/page.tsx`:

```tsx
export default function DashboardPage() {
  return <p className="text-ink-soft">Dashboard — implemented in Task 12.</p>;
}
```

`app/(app)/[engagementId]/settings/page.tsx`:

```tsx
export default function SettingsPage() {
  return <p className="text-ink-soft">Settings — implemented in Task 7.</p>;
}
```

- [ ] **Step 10: Verify it builds**

Run: `npm run build`
Expected: build succeeds with no type errors. (It will still fail at runtime without
a live Supabase project — that's expected until Task 14.)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add authenticated app shell with header, engagement picker, and route guards"
```

---

## Task 7: Engagement creation, Settings (modules/team/SLA/logo), member management

**Files:**
- Create: `lib/keys.ts`
- Test: `lib/keys.test.ts`
- Create: `app/actions/engagements.ts`
- Create: `components/settings/EngagementConfigForm.tsx`
- Create: `components/settings/NewEngagementForm.tsx`
- Create: `components/settings/SettingsForm.tsx`
- Create: `components/settings/MemberManager.tsx`
- Create: `components/settings/BankLogoUploader.tsx`
- Create: `app/(app)/new-engagement/page.tsx`
- Modify: `app/(app)/[engagementId]/settings/page.tsx` (replace the Task 6 placeholder)

**Interfaces:**
- Consumes: `getEngagement`/`listAccessibleEngagements` (Task 6), `getSessionUser`
  (Task 3), `SlaDays` (Task 4).
- Produces: `createEngagement`, `updateEngagementSettings`, `uploadBankLogo`,
  `addMemberByEmail`, `listMembers` (`app/actions/engagements.ts`) — Task 8's new
  issue form reads `engagement.modules`/`team_members` written here; Task 9's board
  reads `engagement.sla_days`.

- [ ] **Step 1: Write the failing test `lib/keys.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { keyPrefixFromBankName } from './keys';

describe('keyPrefixFromBankName', () => {
  it('uppercases and strips non-letters, capped at 4 characters', () => {
    expect(keyPrefixFromBankName('Banca Esempio')).toBe('BANC');
  });

  it('falls back to ENG when the name has no letters', () => {
    expect(keyPrefixFromBankName('123')).toBe('ENG');
  });

  it('keeps short names as-is', () => {
    expect(keyPrefixFromBankName('UBI')).toBe('UBI');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './keys'`.

- [ ] **Step 3: Write `lib/keys.ts`**

```typescript
export function keyPrefixFromBankName(bankName: string): string {
  const letters = bankName.toUpperCase().replace(/[^A-Z]/g, '');
  return letters.slice(0, 4) || 'ENG';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Write `app/actions/engagements.ts`**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';
import { keyPrefixFromBankName } from '@/lib/keys';
import type { SlaDays } from '@/lib/types';

export type EngagementInput = {
  name: string;
  bankName: string;
  modules: string[];
  teamMembers: string[];
  slaDays: SlaDays;
};

async function requireProm() {
  const session = await getSessionUser();
  if (!session || !session.profile.is_prometeia) throw new Error('Not authorized');
  return session;
}

export async function createEngagement(input: EngagementInput): Promise<string> {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('engagements')
    .insert({
      name: input.name,
      bank_name: input.bankName,
      key_prefix: keyPrefixFromBankName(input.bankName),
      modules: input.modules,
      team_members: input.teamMembers,
      sla_days: input.slaDays,
      created_by: session.id,
    })
    .select('id')
    .single();
  if (error) throw error;
  revalidatePath('/');
  return data.id as string;
}

export async function updateEngagementSettings(engagementId: string, input: EngagementInput) {
  await requireProm();
  const supabase = createServerClient();
  const { error } = await supabase
    .from('engagements')
    .update({
      name: input.name,
      bank_name: input.bankName,
      modules: input.modules,
      team_members: input.teamMembers,
      sla_days: input.slaDays,
    })
    .eq('id', engagementId);
  if (error) throw error;
  revalidatePath(`/${engagementId}/settings`);
}

export async function uploadBankLogo(engagementId: string, formData: FormData) {
  await requireProm();
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided');

  const supabase = createServerClient();
  const extension = file.name.split('.').pop() ?? 'png';
  const path = `${engagementId}/logo-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('bank-logos')
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from('bank-logos').getPublicUrl(path);
  const { error } = await supabase
    .from('engagements')
    .update({ bank_logo_url: publicUrlData.publicUrl })
    .eq('id', engagementId);
  if (error) throw error;
  revalidatePath(`/${engagementId}/settings`);
}

export type AddMemberResult = { ok: boolean; message: string };

export async function addMemberByEmail(engagementId: string, email: string): Promise<AddMemberResult> {
  await requireProm();
  const supabase = createServerClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    return { ok: false, message: `No account found for ${email} yet — ask them to sign up first.` };
  }

  const { error } = await supabase
    .from('engagement_members')
    .insert({ engagement_id: engagementId, user_id: profile.id });
  if (error) {
    if (error.code === '23505') return { ok: false, message: `${email} is already a member.` };
    throw error;
  }
  revalidatePath(`/${engagementId}/settings`);
  return { ok: true, message: `${email} added.` };
}

export type Member = { userId: string; email: string; fullName: string | null };

export async function listMembers(engagementId: string): Promise<Member[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('engagement_members')
    .select('user_id, profiles(email, full_name)')
    .eq('engagement_id', engagementId);
  if (error) throw error;
  return (data as unknown as { user_id: string; profiles: { email: string; full_name: string | null } }[]).map(
    (row) => ({ userId: row.user_id, email: row.profiles.email, fullName: row.profiles.full_name }),
  );
}
```

- [ ] **Step 6: Write `components/settings/EngagementConfigForm.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import type { SlaDays } from '@/lib/types';

export type EngagementConfigValues = {
  name: string;
  bankName: string;
  modules: string[];
  teamMembers: string[];
  slaDays: SlaDays;
};

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function EngagementConfigForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: EngagementConfigValues;
  submitLabel: string;
  onSubmit: (values: EngagementConfigValues) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [bankName, setBankName] = useState(initial.bankName);
  const [modules, setModules] = useState(initial.modules.join(', '));
  const [teamMembers, setTeamMembers] = useState(initial.teamMembers.join(', '));
  const [sla, setSla] = useState(initial.slaDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name,
        bankName,
        modules: splitList(modules),
        teamMembers: splitList(teamMembers),
        slaDays: sla,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-ink">
        Engagement name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-ink-soft/30 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Bank name
        <input
          required
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          className="rounded border border-ink-soft/30 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Modules (comma-separated)
        <input
          value={modules}
          onChange={(e) => setModules(e.target.value)}
          placeholder="Payments, Onboarding, Reporting"
          className="rounded border border-ink-soft/30 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Prometeia team members / assignees (comma-separated)
        <input
          value={teamMembers}
          onChange={(e) => setTeamMembers(e.target.value)}
          placeholder="Ana Rossi, Marco Bianchi"
          className="rounded border border-ink-soft/30 px-3 py-2"
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">SLA target (days to close)</legend>
        <div className="grid grid-cols-4 gap-3">
          {PRIORITIES.map((p) => (
            <label key={p} className="flex flex-col gap-1 text-xs capitalize text-ink-soft">
              {p}
              <input
                type="number"
                min={1}
                required
                value={sla[p]}
                onChange={(e) => setSla({ ...sla, [p]: Number(e.target.value) })}
                className="rounded border border-ink-soft/30 px-2 py-1"
              />
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-fit rounded bg-brand-navy px-4 py-2 font-medium text-white hover:bg-brand-navy-2 disabled:opacity-60"
      >
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 7: Write `components/settings/NewEngagementForm.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { EngagementConfigForm } from './EngagementConfigForm';
import { createEngagement } from '@/app/actions/engagements';

const EMPTY = {
  name: '',
  bankName: '',
  modules: [] as string[],
  teamMembers: [] as string[],
  slaDays: { critical: 2, high: 5, medium: 10, low: 20 },
};

export function NewEngagementForm() {
  const router = useRouter();
  return (
    <EngagementConfigForm
      initial={EMPTY}
      submitLabel="Create engagement"
      onSubmit={async (values) => {
        const id = await createEngagement(values);
        router.push(`/${id}/board`);
      }}
    />
  );
}
```

- [ ] **Step 8: Write `components/settings/SettingsForm.tsx`**

```tsx
'use client';

import { EngagementConfigForm, type EngagementConfigValues } from './EngagementConfigForm';
import { updateEngagementSettings } from '@/app/actions/engagements';

export function SettingsForm({
  engagementId,
  initial,
}: {
  engagementId: string;
  initial: EngagementConfigValues;
}) {
  return (
    <EngagementConfigForm
      initial={initial}
      submitLabel="Save changes"
      onSubmit={(values) => updateEngagementSettings(engagementId, values)}
    />
  );
}
```

- [ ] **Step 9: Write `components/settings/BankLogoUploader.tsx`**

```tsx
'use client';

import { useState, type ChangeEvent } from 'react';
import { uploadBankLogo } from '@/app/actions/engagements';

export function BankLogoUploader({
  engagementId,
  currentUrl,
}: {
  engagementId: string;
  currentUrl: string | null;
}) {
  const [preview, setPreview] = useState(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      await uploadBankLogo(engagementId, formData);
      setPreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Bank logo" className="h-12 max-w-[160px] object-contain" />
      )}
      <label className="cursor-pointer rounded border border-ink-soft/30 px-3 py-2 text-sm text-ink hover:bg-white">
        {uploading ? 'Uploading…' : 'Upload bank logo'}
        <input type="file" accept="image/*" onChange={handleChange} className="hidden" disabled={uploading} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 10: Write `components/settings/MemberManager.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { addMemberByEmail, type Member } from '@/app/actions/engagements';

export function MemberManager({
  engagementId,
  initialMembers,
}: {
  engagementId: string;
  initialMembers: Member[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await addMemberByEmail(engagementId, email.trim());
    setPending(false);
    setMessage(result.message);
    if (result.ok) {
      setMembers((prev) => [...prev, { userId: '', email: email.trim(), fullName: null }]);
      setEmail('');
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="mb-2 text-sm font-semibold text-ink">Bank members</h2>
      <ul className="mb-3 flex flex-col gap-1">
        {members.map((m) => (
          <li key={m.email} className="text-sm text-ink-soft">
            {m.fullName ?? m.email}
            {m.fullName && <span className="text-xs"> ({m.email})</span>}
          </li>
        ))}
        {members.length === 0 && <li className="text-sm text-ink-soft">No bank members yet.</li>}
      </ul>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="email"
          required
          placeholder="person@bank.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded border border-ink-soft/30 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-navy-2 disabled:opacity-60"
        >
          Add
        </button>
      </form>
      {message && <p className="mt-2 text-sm text-ink-soft">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 11: Write `app/(app)/new-engagement/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { NewEngagementForm } from '@/components/settings/NewEngagementForm';

export default async function NewEngagementPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  if (!session.profile.is_prometeia) redirect('/');

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold text-ink">New engagement</h1>
      <NewEngagementForm />
    </main>
  );
}
```

- [ ] **Step 12: Replace the Task 6 placeholder `app/(app)/[engagementId]/settings/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listMembers } from '@/app/actions/engagements';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { MemberManager } from '@/components/settings/MemberManager';
import { BankLogoUploader } from '@/components/settings/BankLogoUploader';

export default async function SettingsPage({ params }: { params: { engagementId: string } }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  if (!session.profile.is_prometeia) redirect(`/${params.engagementId}/board`);

  const [engagement, members] = await Promise.all([
    getEngagement(params.engagementId),
    listMembers(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="mb-4 text-xl font-semibold text-ink">Settings</h1>
        <SettingsForm
          engagementId={params.engagementId}
          initial={{
            name: engagement.name,
            bankName: engagement.bank_name,
            modules: engagement.modules,
            teamMembers: engagement.team_members,
            slaDays: engagement.sla_days,
          }}
        />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Bank logo</h2>
        <BankLogoUploader engagementId={params.engagementId} currentUrl={engagement.bank_logo_url} />
      </section>
      <section>
        <MemberManager engagementId={params.engagementId} initialMembers={members} />
      </section>
    </div>
  );
}
```

- [ ] **Step 13: Verify it builds**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: add engagement creation, settings, bank logo upload, and member management"
```

---

## Task 8: Issue data access, badges, new-issue form

**Files:**
- Create: `lib/data/issues.ts`
- Create: `app/actions/issues.ts`
- Create: `components/issues/StatusBadge.tsx`
- Create: `components/issues/PriorityBadge.tsx`
- Create: `components/issues/NewIssueForm.tsx`

**Interfaces:**
- Consumes: `Issue`, `Priority` (Task 4), `getSessionUser` (Task 3).
- Produces: `listIssues(engagementId)`, `getIssue(issueId)` (`lib/data/issues.ts`) —
  Tasks 9, 10, 11, 12, 13 all read issues through these; `createIssue(input)`
  (`app/actions/issues.ts`); `<StatusBadge status />`, `<PriorityBadge priority />`,
  `<NewIssueForm engagementId modules onCreated? />` — Tasks 9 and 10 render all
  three directly.

- [ ] **Step 1: Write `lib/data/issues.ts`**

```typescript
import { createServerClient } from '@/lib/supabase/server';
import type { Issue } from '@/lib/types';

export async function listIssues(engagementId: string): Promise<Issue[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issues')
    .select('*')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Issue[];
}

export async function getIssue(issueId: string): Promise<Issue | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('issues').select('*').eq('id', issueId).maybeSingle();
  if (error) throw error;
  return data as Issue | null;
}
```

- [ ] **Step 2: Write `app/actions/issues.ts`**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';
import type { Priority } from '@/lib/types';

export type CreateIssueInput = {
  engagementId: string;
  title: string;
  description: string;
  priority: Priority;
  module: string | null;
};

export async function createIssue(input: CreateIssueInput): Promise<string> {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');

  const supabase = createServerClient();
  const { data: keyData, error: keyError } = await supabase.rpc('next_issue_key', {
    p_engagement_id: input.engagementId,
  });
  if (keyError) throw keyError;

  const { data, error } = await supabase
    .from('issues')
    .insert({
      engagement_id: input.engagementId,
      key: keyData as string,
      title: input.title,
      description: input.description,
      priority: input.priority,
      module: input.module,
      org: session.profile.is_prometeia ? 'prometeia' : 'bank',
      reporter_id: session.id,
    })
    .select('id')
    .single();
  if (error) throw error;
  revalidatePath(`/${input.engagementId}/board`);
  revalidatePath(`/${input.engagementId}/list`);
  return data.id as string;
}
```

- [ ] **Step 3: Write `components/issues/StatusBadge.tsx`**

```tsx
import type { Status } from '@/lib/types';

const STYLES: Record<Status, string> = {
  backlog: 'bg-slate-100 text-slate-700',
  ongoing: 'bg-amber-100 text-amber-800',
  ready_for_test: 'bg-teal-100 text-teal-800',
  closed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 4: Write `components/issues/PriorityBadge.tsx`**

One hue (red), monotone lightness by priority — an ordinal ramp, not four unrelated
colors — plus a text label, so priority is never color-alone.

```tsx
import type { Priority } from '@/lib/types';

const DOT_COLOR: Record<Priority, string> = {
  critical: '#B42318',
  high: '#DC5F45',
  medium: '#E8896A',
  low: '#F0B8A8',
};

const LABELS: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DOT_COLOR[priority] }} />
      {LABELS[priority]}
    </span>
  );
}
```

- [ ] **Step 5: Write `components/issues/NewIssueForm.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createIssue } from '@/app/actions/issues';
import type { Priority } from '@/lib/types';

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

export function NewIssueForm({
  engagementId,
  modules,
  onCreated,
}: {
  engagementId: string;
  modules: string[];
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [module, setModule] = useState(modules[0] ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createIssue({ engagementId, title, description, priority, module: module || null });
      setTitle('');
      setDescription('');
      router.refresh();
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the issue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm">
      <input
        required
        placeholder="Issue title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded border border-ink-soft/30 px-3 py-2 text-sm"
      />
      <textarea
        required
        placeholder="What's wrong, and how to reproduce it"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="rounded border border-ink-soft/30 px-3 py-2 text-sm"
      />
      <div className="flex gap-3">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="rounded border border-ink-soft/30 px-2 py-2 text-sm capitalize"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={module}
          onChange={(e) => setModule(e.target.value)}
          className="rounded border border-ink-soft/30 px-2 py-2 text-sm"
        >
          <option value="">No module</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy-2 disabled:opacity-60"
      >
        {submitting ? 'Reporting…' : 'Report issue'}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Verify it builds**

Run: `npm run build`
Expected: succeeds with no type errors. `NewIssueForm` and the badges are not
rendered by any page yet — that lands in Task 9 — so this step only confirms they
compile.

- [ ] **Step 7: Commit**

```bash
git add lib/data/issues.ts app/actions/issues.ts components/issues
git commit -m "feat: add issue data access, status/priority badges, and new-issue form"
```

---

## Task 9: Board view, status/priority/assignee transitions, reopen logic

**Files:**
- Modify: `app/actions/issues.ts` (add `updateIssueStatus`, `updateIssuePriority`,
  `updateIssueAssignee`)
- Create: `components/issues/Board.tsx`
- Modify: `app/(app)/[engagementId]/board/page.tsx` (replace the Task 6 placeholder)

**Interfaces:**
- Consumes: `STATUSES` (Task 4), `StatusBadge`/`PriorityBadge`/`NewIssueForm`
  (Task 8), `getEngagement`/`listIssues` (Tasks 6, 8).
- Produces: `updateIssueStatus(issueId, status)`, `updateIssuePriority(issueId,
  priority)`, `updateIssueAssignee(issueId, assignee)` — Task 11's issue detail view
  calls the same three for its inline-edit controls, so the two views share one
  source of truth for every transition. Card links use `?issue=<id>` in the URL —
  Task 11 reads that query param to open the detail modal; it does nothing yet.

No Supabase Realtime subscription in v1: after any mutation the page calls
`router.refresh()` to reload server-rendered data. A second viewer's change
appears on this viewer's next navigation or refresh, not instantly — an accepted
simplification, not an oversight.

- [ ] **Step 1: Update the import line, then append to `app/actions/issues.ts`**

First, change the file's existing `import type { Priority } from '@/lib/types';` line
(from Task 8) to `import type { Priority, Status } from '@/lib/types';` — don't add a
second `import` statement for the same module, which would be a duplicate-identifier
error. Then append the rest below the existing `createIssue` function:

```typescript
async function requireProm() {
  const session = await getSessionUser();
  if (!session || !session.profile.is_prometeia) throw new Error('Not authorized');
  return session;
}

async function recordHistory(
  supabase: ReturnType<typeof createServerClient>,
  issueId: string,
  field: string,
  fromValue: string | null,
  toValue: string,
  changedBy: string,
) {
  const { error } = await supabase
    .from('issue_history')
    .insert({ issue_id: issueId, field, from_value: fromValue, to_value: toValue, changed_by: changedBy });
  if (error) throw error;
}

export async function updateIssueStatus(issueId: string, newStatus: Status) {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('status, engagement_id')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  const isReopen = current.status === 'closed' && newStatus === 'ongoing';
  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'closed') patch.closed_at = new Date().toISOString();
  if (isReopen) patch.closed_at = null;

  const { error } = await supabase.from('issues').update(patch).eq('id', issueId);
  if (error) throw error;

  await recordHistory(supabase, issueId, 'status', current.status, isReopen ? 'reopened' : newStatus, session.id);

  revalidatePath(`/${current.engagement_id}/board`);
  revalidatePath(`/${current.engagement_id}/list`);
  revalidatePath(`/${current.engagement_id}/dashboard`);
}

export async function updateIssuePriority(issueId: string, newPriority: Priority) {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('priority, engagement_id')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('issues').update({ priority: newPriority }).eq('id', issueId);
  if (error) throw error;
  await recordHistory(supabase, issueId, 'priority', current.priority, newPriority, session.id);
  revalidatePath(`/${current.engagement_id}/board`);
  revalidatePath(`/${current.engagement_id}/list`);
}

export async function updateIssueAssignee(issueId: string, newAssignee: string | null) {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('assignee, engagement_id')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('issues').update({ assignee: newAssignee }).eq('id', issueId);
  if (error) throw error;
  await recordHistory(supabase, issueId, 'assignee', current.assignee, newAssignee ?? 'Unassigned', session.id);
  revalidatePath(`/${current.engagement_id}/board`);
  revalidatePath(`/${current.engagement_id}/list`);
}
```

- [ ] **Step 2: Write `components/issues/Board.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { updateIssueAssignee, updateIssuePriority, updateIssueStatus } from '@/app/actions/issues';
import { STATUSES } from '@/lib/types';
import type { Issue, Priority, Status } from '@/lib/types';

const COLUMN_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

export function Board({
  issues,
  teamMembers,
  isProm,
}: {
  issues: Issue[];
  teamMembers: string[];
  isProm: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function run(issueId: string, action: () => Promise<void>) {
    setPendingId(issueId);
    try {
      await action();
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
      {STATUSES.map((status) => (
        <div key={status} className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {COLUMN_LABELS[status]} · {issues.filter((i) => i.status === status).length}
          </h2>
          <div className="flex flex-col gap-3">
            {issues
              .filter((i) => i.status === status)
              .map((issue) => (
                <div key={issue.id} className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-xs text-ink-soft">{issue.key}</span>
                    <PriorityBadge priority={issue.priority} />
                  </div>
                  <a href={`?issue=${issue.id}`} className="mb-2 block text-sm font-medium text-ink hover:underline">
                    {issue.title}
                  </a>
                  {issue.module && <p className="mb-2 text-xs text-ink-soft">{issue.module}</p>}
                  {isProm ? (
                    <div className="flex flex-col gap-2">
                      <select
                        value={issue.status}
                        disabled={pendingId === issue.id}
                        onChange={(e) => run(issue.id, () => updateIssueStatus(issue.id, e.target.value as Status))}
                        className="rounded border border-ink-soft/30 px-2 py-1 text-xs"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {COLUMN_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <select
                        value={issue.priority}
                        disabled={pendingId === issue.id}
                        onChange={(e) =>
                          run(issue.id, () => updateIssuePriority(issue.id, e.target.value as Priority))
                        }
                        className="rounded border border-ink-soft/30 px-2 py-1 text-xs capitalize"
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <select
                        value={issue.assignee ?? ''}
                        disabled={pendingId === issue.id}
                        onChange={(e) => run(issue.id, () => updateIssueAssignee(issue.id, e.target.value || null))}
                        className="rounded border border-ink-soft/30 px-2 py-1 text-xs"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <StatusBadge status={issue.status} />
                      {issue.assignee && <span className="text-xs text-ink-soft">{issue.assignee}</span>}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Replace the Task 6 placeholder `app/(app)/[engagementId]/board/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listIssues } from '@/lib/data/issues';
import { Board } from '@/components/issues/Board';
import { NewIssueForm } from '@/components/issues/NewIssueForm';

export default async function BoardPage({ params }: { params: { engagementId: string } }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  return (
    <div className="flex flex-col gap-6">
      <NewIssueForm engagementId={engagement.id} modules={engagement.modules} />
      <Board issues={issues} teamMembers={engagement.team_members} isProm={session.profile.is_prometeia} />
    </div>
  );
}
```

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/actions/issues.ts components/issues/Board.tsx "app/(app)/[engagementId]/board/page.tsx"
git commit -m "feat: add Kanban board with status/priority/assignee transitions"
```

---

## Task 10: List view (sortable, filterable table)

**Files:**
- Create: `components/issues/IssueTable.tsx`
- Modify: `app/(app)/[engagementId]/list/page.tsx` (replace the Task 6 placeholder)

**Interfaces:**
- Consumes: `StatusBadge`/`PriorityBadge` (Task 8), `listIssues`/`getEngagement`
  (Tasks 6, 8), `STATUSES`/`PRIORITIES` (Task 4).
- Produces: nothing later tasks import — this view is a leaf. Card/row links use the
  same `?issue=<id>` convention as the board so Task 11 can wire the same modal into
  both with one shared query-param contract.

- [ ] **Step 1: Write `components/issues/IssueTable.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { PRIORITIES, STATUSES } from '@/lib/types';
import type { Issue, Org, Priority, Status } from '@/lib/types';

type SortKey = 'key' | 'title' | 'status' | 'priority' | 'module' | 'assignee' | 'org' | 'created_at';

const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'key', label: 'Key' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'module', label: 'Module' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'org', label: 'Raised by' },
  { key: 'created_at', label: 'Opened' },
];

export function IssueTable({ issues, modules }: { issues: Issue[]; modules: string[] }) {
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState<Org | ''>('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    let result = issues;
    if (statusFilter) result = result.filter((i) => i.status === statusFilter);
    if (priorityFilter) result = result.filter((i) => i.priority === priorityFilter);
    if (moduleFilter) result = result.filter((i) => (i.module ?? 'Unassigned') === moduleFilter);
    if (orgFilter) result = result.filter((i) => i.org === orgFilter);

    const sorted = [...result].sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? '')));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [issues, statusFilter, priorityFilter, moduleFilter, orgFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | '')}
          className="rounded border border-ink-soft/30 px-2 py-1 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | '')}
          className="rounded border border-ink-soft/30 px-2 py-1 text-sm capitalize"
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded border border-ink-soft/30 px-2 py-1 text-sm"
        >
          <option value="">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value="Unassigned">Unassigned</option>
        </select>
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value as Org | '')}
          className="rounded border border-ink-soft/30 px-2 py-1 text-sm capitalize"
        >
          <option value="">Bank + Prometeia</option>
          <option value="bank">Bank</option>
          <option value="prometeia">Prometeia</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-soft/10 text-xs uppercase tracking-wide text-ink-soft">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="cursor-pointer whitespace-nowrap px-3 py-2"
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((issue) => (
              <tr key={issue.id} className="border-b border-ink-soft/5 last:border-0 hover:bg-surface">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">{issue.key}</td>
                <td className="px-3 py-2">
                  <a href={`?issue=${issue.id}`} className="text-ink hover:underline">
                    {issue.title}
                  </a>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={issue.status} />
                </td>
                <td className="px-3 py-2">
                  <PriorityBadge priority={issue.priority} />
                </td>
                <td className="px-3 py-2 text-ink-soft">{issue.module ?? 'Unassigned'}</td>
                <td className="px-3 py-2 text-ink-soft">{issue.assignee ?? '—'}</td>
                <td className="px-3 py-2 capitalize text-ink-soft">{issue.org}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-soft">
                  {new Date(issue.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-ink-soft">
                  No issues match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the Task 6 placeholder `app/(app)/[engagementId]/list/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listIssues } from '@/lib/data/issues';
import { IssueTable } from '@/components/issues/IssueTable';

export default async function ListPage({ params }: { params: { engagementId: string } }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  return <IssueTable issues={issues} modules={engagement.modules} />;
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add components/issues/IssueTable.tsx "app/(app)/[engagementId]/list/page.tsx"
git commit -m "feat: add sortable, filterable issue list view"
```

---

## Task 11: Issue detail modal — comments, history, real file attachments

**Files:**
- Modify: `app/actions/issues.ts` (add `updateIssueModule`, `addComment`,
  `listComments`, `listHistory`, `listAttachments`, `uploadAttachment`,
  `getIssueDetail`)
- Create: `components/issues/IssueDetailModal.tsx`
- Modify: `app/(app)/[engagementId]/board/page.tsx` (render the modal when
  `?issue=<id>` is present)
- Modify: `app/(app)/[engagementId]/list/page.tsx` (same)

**Interfaces:**
- Consumes: `updateIssueStatus`/`updateIssuePriority`/`updateIssueAssignee`
  (Task 9), `StatusBadge`/`PriorityBadge` (Task 8), the `?issue=<id>` URL
  convention both views already use (Tasks 9, 10).
- Produces: `getIssueDetail(issueId, engagementId)` returning
  `{ issue, comments, history, attachments }` — this task's only consumer, since
  the modal is the leaf of the issue-detail feature.

Attachments live in the private `issue-attachments` bucket (Task 2) — reading one
back needs a signed URL, not a public one; `listAttachments` mints a 1-hour signed
URL per file on every read rather than storing one, since a stored URL would expire.

- [ ] **Step 1: Append to `app/actions/issues.ts`**

```typescript
export async function updateIssueModule(issueId: string, newModule: string | null) {
  const session = await requireProm();
  const supabase = createServerClient();
  const { data: current, error: fetchError } = await supabase
    .from('issues')
    .select('module, engagement_id')
    .eq('id', issueId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('issues').update({ module: newModule }).eq('id', issueId);
  if (error) throw error;
  await recordHistory(supabase, issueId, 'module', current.module, newModule ?? 'None', session.id);
  revalidatePath(`/${current.engagement_id}/board`);
  revalidatePath(`/${current.engagement_id}/list`);
}

export async function addComment(issueId: string, body: string) {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const supabase = createServerClient();
  const { error } = await supabase
    .from('issue_comments')
    .insert({ issue_id: issueId, author_id: session.id, body });
  if (error) throw error;
}

export type CommentRow = { id: string; body: string; createdAt: string; authorName: string };

export async function listComments(issueId: string): Promise<CommentRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issue_comments')
    .select('id, body, created_at, profiles(full_name, email)')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as unknown as { id: string; body: string; created_at: string; profiles: { full_name: string | null; email: string } }[]).map(
    (row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      authorName: row.profiles.full_name ?? row.profiles.email,
    }),
  );
}

export type HistoryRow = {
  id: string;
  field: string;
  fromValue: string | null;
  toValue: string;
  changedAt: string;
  changedByName: string;
};

export async function listHistory(issueId: string): Promise<HistoryRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issue_history')
    .select('id, field, from_value, to_value, changed_at, profiles(full_name, email)')
    .eq('issue_id', issueId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      field: string;
      from_value: string | null;
      to_value: string;
      changed_at: string;
      profiles: { full_name: string | null; email: string };
    }[]
  ).map((row) => ({
    id: row.id,
    field: row.field,
    fromValue: row.from_value,
    toValue: row.to_value,
    changedAt: row.changed_at,
    changedByName: row.profiles.full_name ?? row.profiles.email,
  }));
}

export type AttachmentRow = { id: string; fileName: string; url: string; uploadedByName: string; uploadedAt: string };

export async function listAttachments(issueId: string): Promise<AttachmentRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issue_attachments')
    .select('id, storage_path, file_name, uploaded_at, profiles(full_name, email)')
    .eq('issue_id', issueId)
    .order('uploaded_at', { ascending: true });
  if (error) throw error;

  const rows = data as unknown as {
    id: string;
    storage_path: string;
    file_name: string;
    uploaded_at: string;
    profiles: { full_name: string | null; email: string };
  }[];

  return Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await supabase.storage
        .from('issue-attachments')
        .createSignedUrl(row.storage_path, 3600);
      return {
        id: row.id,
        fileName: row.file_name,
        url: signed?.signedUrl ?? '',
        uploadedByName: row.profiles.full_name ?? row.profiles.email,
        uploadedAt: row.uploaded_at,
      };
    }),
  );
}

export async function uploadAttachment(issueId: string, engagementId: string, formData: FormData) {
  const session = await getSessionUser();
  if (!session) throw new Error('Not authenticated');
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided');

  const supabase = createServerClient();
  const path = `${engagementId}/${issueId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('issue-attachments').upload(path, file);
  if (uploadError) throw uploadError;

  const { error } = await supabase
    .from('issue_attachments')
    .insert({ issue_id: issueId, storage_path: path, file_name: file.name, uploaded_by: session.id });
  if (error) throw error;
}

export type IssueDetail = {
  issue: Issue;
  comments: CommentRow[];
  history: HistoryRow[];
  attachments: AttachmentRow[];
};

export async function getIssueDetail(issueId: string): Promise<IssueDetail> {
  const supabase = createServerClient();
  const { data: issue, error } = await supabase.from('issues').select('*').eq('id', issueId).single();
  if (error) throw error;
  const [comments, history, attachments] = await Promise.all([
    listComments(issueId),
    listHistory(issueId),
    listAttachments(issueId),
  ]);
  return { issue: issue as Issue, comments, history, attachments };
}
```

Add `Issue` to the existing `import type { Priority, Status } from '@/lib/types';` line at the top of
`app/actions/issues.ts` (making it `import type { Issue, Priority, Status } from '@/lib/types';`).

- [ ] **Step 2: Write `components/issues/IssueDetailModal.tsx`**

```tsx
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
  uploadAttachment,
  type IssueDetail,
} from '@/app/actions/issues';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { PRIORITIES, STATUSES } from '@/lib/types';
import type { Priority, Status } from '@/lib/types';

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
  teamMembers: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    setDetail(await getIssueDetail(issueId));
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
    try {
      await action();
      await reload();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setBusy(true);
    try {
      await addComment(issueId, commentBody.trim());
      setCommentBody('');
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set('file', file);
      await uploadAttachment(issueId, engagementId, formData);
      await reload();
    } finally {
      setBusy(false);
    }
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
            <span className="font-mono text-xs text-ink-soft">{issue.key}</span>
            <h2 className="text-lg font-semibold text-ink">{issue.title}</h2>
          </div>
          <button onClick={close} className="text-ink-soft hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="mb-4 whitespace-pre-wrap text-sm text-ink">{issue.description}</p>

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
            {attachments.length === 0 && <li className="text-sm text-ink-soft">No attachments yet.</li>}
          </ul>
          <label className="cursor-pointer text-sm text-brand-blue hover:underline">
            Attach a file
            <input
              type="file"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
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
```

- [ ] **Step 3: Modify `app/(app)/[engagementId]/board/page.tsx` to render the modal**

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listIssues } from '@/lib/data/issues';
import { Board } from '@/components/issues/Board';
import { NewIssueForm } from '@/components/issues/NewIssueForm';
import { IssueDetailModal } from '@/components/issues/IssueDetailModal';

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: { engagementId: string };
  searchParams: { issue?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  return (
    <div className="flex flex-col gap-6">
      <NewIssueForm engagementId={engagement.id} modules={engagement.modules} />
      <Board issues={issues} teamMembers={engagement.team_members} isProm={session.profile.is_prometeia} />
      {searchParams.issue && (
        <IssueDetailModal
          issueId={searchParams.issue}
          engagementId={engagement.id}
          isProm={session.profile.is_prometeia}
          modules={engagement.modules}
          teamMembers={engagement.team_members}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Modify `app/(app)/[engagementId]/list/page.tsx` to render the modal**

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listIssues } from '@/lib/data/issues';
import { IssueTable } from '@/components/issues/IssueTable';
import { IssueDetailModal } from '@/components/issues/IssueDetailModal';

export default async function ListPage({
  params,
  searchParams,
}: {
  params: { engagementId: string };
  searchParams: { issue?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  return (
    <>
      <IssueTable issues={issues} modules={engagement.modules} />
      {searchParams.issue && (
        <IssueDetailModal
          issueId={searchParams.issue}
          engagementId={engagement.id}
          isProm={session.profile.is_prometeia}
          modules={engagement.modules}
          teamMembers={engagement.team_members}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Verify it builds**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add issue detail modal with comments, history, and file attachments"
```

---

## Task 12: Dashboard, part 1 — stat tiles, status and priority charts

**Files:**
- Create: `components/dashboard/StatTile.tsx`
- Create: `components/dashboard/StatusDistributionChart.tsx`
- Create: `components/dashboard/PriorityDistributionChart.tsx`
- Modify: `app/(app)/[engagementId]/dashboard/page.tsx` (replace the Task 6
  placeholder)
- Modify: `package.json` (Recharts is already a Task 1 dependency — confirm it's
  installed; if `npm run build` fails on a missing module, run `npm install`)

**Interfaces:**
- Consumes: `statusDistribution`, `priorityDistribution` (Task 4), `listIssues`/
  `getEngagement` (Tasks 6, 8).
- Produces: `<StatTile label value sublabel? />` — Task 13 reuses it for the
  reopen-rate tile.

Status colors (`backlog` slate, `ongoing` amber, `ready_for_test` aqua, `closed`
green, `rejected` red) and the priority ordinal red ramp intentionally reuse the
same hex values as `StatusBadge`/`PriorityBadge` (Task 8) — one color meaning per
concept across the whole app, not a second palette for charts.

- [ ] **Step 1: Write `components/dashboard/StatTile.tsx`**

```tsx
export function StatTile({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-ink">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-ink-soft">{sublabel}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Write `components/dashboard/StatusDistributionChart.tsx`**

```tsx
'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Status } from '@/lib/types';

const COLORS: Record<Status, string> = {
  backlog: '#94A3B8',
  ongoing: '#EDA100',
  ready_for_test: '#1BAF7A',
  closed: '#008300',
  rejected: '#E34948',
};

const LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ongoing: 'Ongoing',
  ready_for_test: 'Ready for Test',
  closed: 'Closed',
  rejected: 'Rejected',
};

export function StatusDistributionChart({ distribution }: { distribution: Record<Status, number> }) {
  const data = (Object.keys(distribution) as Status[]).map((status) => ({
    status,
    label: LABELS[status],
    count: distribution[status],
  }));

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">Issues by status</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#565F78' }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 12, fill: '#12213F' }}>
            {data.map((entry) => (
              <Cell key={entry.status} fill={COLORS[entry.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Write `components/dashboard/PriorityDistributionChart.tsx`**

```tsx
'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Priority } from '@/lib/types';

const COLORS: Record<Priority, string> = {
  critical: '#B42318',
  high: '#DC5F45',
  medium: '#E8896A',
  low: '#F0B8A8',
};

export function PriorityDistributionChart({ distribution }: { distribution: Record<Priority, number> }) {
  const data = (Object.keys(distribution) as Priority[]).map((priority) => ({
    priority,
    label: priority.charAt(0).toUpperCase() + priority.slice(1),
    count: distribution[priority],
  }));

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">Issues by priority</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#565F78' }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 12, fill: '#12213F' }}>
            {data.map((entry) => (
              <Cell key={entry.priority} fill={COLORS[entry.priority]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Replace the Task 6 placeholder `app/(app)/[engagementId]/dashboard/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listIssues } from '@/lib/data/issues';
import { priorityDistribution, statusDistribution } from '@/lib/kpi';
import { StatTile } from '@/components/dashboard/StatTile';
import { StatusDistributionChart } from '@/components/dashboard/StatusDistributionChart';
import { PriorityDistributionChart } from '@/components/dashboard/PriorityDistributionChart';

export default async function DashboardPage({ params }: { params: { engagementId: string } }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  const openCount = issues.filter((i) => i.status !== 'closed' && i.status !== 'rejected').length;
  const closedCount = issues.filter((i) => i.status === 'closed').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Total issues" value={String(issues.length)} />
        <StatTile label="Open" value={String(openCount)} />
        <StatTile label="Closed" value={String(closedCount)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusDistributionChart distribution={statusDistribution(issues)} />
        <PriorityDistributionChart distribution={priorityDistribution(issues)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify it builds and renders**

Run: `npm run build`, then `npm run dev` and open a dashboard URL once a real
engagement exists (Task 14's smoke test exercises this for real — for now, confirm
only that the build has no type errors, since there is no live data yet).

- [ ] **Step 6: Commit**

```bash
git add components/dashboard "app/(app)/[engagementId]/dashboard/page.tsx"
git commit -m "feat: add dashboard stat tiles and status/priority charts"
```

---

## Task 13: Dashboard, part 2 — time-to-close, throughput, aging, volume, reopen rate

**Files:**
- Modify: `lib/data/issues.ts` (add `listHistoryForEngagement`)
- Create: `components/dashboard/TimeToCloseChart.tsx`
- Create: `components/dashboard/ThroughputChart.tsx`
- Create: `components/dashboard/AgingReportTable.tsx`
- Create: `components/dashboard/ModuleVolumeChart.tsx`
- Create: `components/dashboard/OrgVolumeChart.tsx`
- Modify: `app/(app)/[engagementId]/dashboard/page.tsx` (add the new sections)

**Interfaces:**
- Consumes: `timeToCloseByPriority`, `throughputByWeek`, `agingReport`,
  `moduleVolume`, `orgVolume`, `reopenRate` (all Task 4), `StatTile` (Task 12).
- Produces: nothing later tasks import — the dashboard is complete after this task.

The time-to-close chart draws **actual vs. target as two bars per priority**, both
on the same day-count axis, rather than a reference line per category — Recharts'
`ReferenceLine` is built for one threshold across the whole chart, not a different
one per category, and forcing that would be fragile. Grouped bars are the
correct, simple way to compare two values with one shared unit.

- [ ] **Step 1: Append `listHistoryForEngagement` to `lib/data/issues.ts`**

```typescript
import type { IssueHistoryEntry } from '@/lib/types';

export async function listHistoryForEngagement(engagementId: string): Promise<IssueHistoryEntry[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('issue_history')
    .select('id, issue_id, field, from_value, to_value, changed_by, changed_at, issues!inner(engagement_id)')
    .eq('issues.engagement_id', engagementId);
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      issue_id: string;
      field: string;
      from_value: string | null;
      to_value: string;
      changed_by: string;
      changed_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    issue_id: row.issue_id,
    field: row.field,
    from_value: row.from_value,
    to_value: row.to_value,
    changed_by: row.changed_by,
    changed_at: row.changed_at,
  }));
}
```

- [ ] **Step 2: Write `components/dashboard/TimeToCloseChart.tsx`**

```tsx
'use client';

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimeToCloseRow } from '@/lib/kpi';

export function TimeToCloseChart({ rows }: { rows: TimeToCloseRow[] }) {
  const data = rows.map((r) => ({
    label: r.priority.charAt(0).toUpperCase() + r.priority.slice(1),
    actual: r.avgDays !== null ? Number(r.avgDays.toFixed(1)) : 0,
    target: r.targetDays,
    breached: r.avgDays !== null && r.avgDays > r.targetDays,
    count: r.count,
  }));

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-ink">Time to close vs. SLA target</h3>
      <p className="mb-3 text-xs text-ink-soft">
        Average days to close, by priority. Red means the average missed the SLA target.
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Days', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#565F78' }}
          />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="target" name="SLA target" fill="#C3C2B7" radius={[4, 4, 0, 0]} />
          <Bar
            dataKey="actual"
            name="Actual average"
            radius={[4, 4, 0, 0]}
            label={{ position: 'top', fontSize: 12, fill: '#12213F' }}
          >
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.breached ? '#D03B3B' : '#159E52'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-ink-soft">{data.map((d) => `${d.label}: ${d.count} closed`).join(' · ')}</p>
    </div>
  );
}
```

- [ ] **Step 3: Write `components/dashboard/ThroughputChart.tsx`**

```tsx
'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ThroughputBucket } from '@/lib/kpi';

export function ThroughputChart({ buckets }: { buckets: ThroughputBucket[] }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">Throughput (last {buckets.length} weeks)</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" vertical={false} />
          <XAxis
            dataKey="weekStart"
            tick={{ fontSize: 11, fill: '#565F78' }}
            axisLine={{ stroke: '#C3C2B7' }}
            tickLine={false}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#565F78' }} axisLine={false} tickLine={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="opened" name="Opened" stroke="#0026FF" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="closed" name="Closed" stroke="#159E52" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Write `components/dashboard/AgingReportTable.tsx`**

```tsx
import type { AgingRow } from '@/lib/kpi';

export function AgingReportTable({ rows }: { rows: AgingRow[] }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">Aging — open issues, oldest first</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No open issues.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-soft/10 text-xs uppercase tracking-wide text-ink-soft">
                <th className="px-2 py-1">Key</th>
                <th className="px-2 py-1">Title</th>
                <th className="px-2 py-1">Priority</th>
                <th className="px-2 py-1">Days open</th>
                <th className="px-2 py-1">SLA</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row) => (
                <tr key={row.issue.id} className="border-b border-ink-soft/5 last:border-0">
                  <td className="px-2 py-1 font-mono text-xs text-ink-soft">{row.issue.key}</td>
                  <td className="px-2 py-1 text-ink">{row.issue.title}</td>
                  <td className="px-2 py-1 capitalize text-ink-soft">{row.issue.priority}</td>
                  <td className="px-2 py-1 font-mono text-ink">{row.daysOpen.toFixed(1)}</td>
                  <td className="px-2 py-1">
                    {row.breached ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Over ({row.targetDays}d target)
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Within SLA
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `components/dashboard/ModuleVolumeChart.tsx`**

```tsx
'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function ModuleVolumeChart({ data }: { data: { module: string; count: number }[] }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">Issues by module</h3>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="module"
            width={110}
            tick={{ fontSize: 12, fill: '#12213F' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="count" fill="#2A78D6" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12, fill: '#12213F' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

One series (issue count) broken out by module on the category axis is nominal
categorical with a single measure — per the color formula, that takes one hue for
every bar (no legend box; the axis labels already name each bar), never a
different color per bar re-encoding what the bar length already shows.

- [ ] **Step 6: Write `components/dashboard/OrgVolumeChart.tsx`**

```tsx
'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Org } from '@/lib/types';

const COLORS: Record<Org, string> = { bank: '#159E52', prometeia: '#000D4C' };
const LABELS: Record<Org, string> = { bank: 'Bank', prometeia: 'Prometeia' };

export function OrgVolumeChart({ data }: { data: { org: Org; count: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: LABELS[d.org] }));
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">Issues raised: bank vs. Prometeia</h3>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E1E0D9" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 12, fill: '#565F78' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={90}
            tick={{ fontSize: 12, fill: '#12213F' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12, fill: '#12213F' }}>
            {rows.map((row) => (
              <Cell key={row.org} fill={COLORS[row.org]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 7: Replace `app/(app)/[engagementId]/dashboard/page.tsx` with the complete dashboard**

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getEngagement } from '@/lib/data/engagements';
import { listHistoryForEngagement, listIssues } from '@/lib/data/issues';
import {
  agingReport,
  moduleVolume,
  orgVolume,
  priorityDistribution,
  reopenRate,
  statusDistribution,
  throughputByWeek,
  timeToCloseByPriority,
} from '@/lib/kpi';
import { StatTile } from '@/components/dashboard/StatTile';
import { StatusDistributionChart } from '@/components/dashboard/StatusDistributionChart';
import { PriorityDistributionChart } from '@/components/dashboard/PriorityDistributionChart';
import { TimeToCloseChart } from '@/components/dashboard/TimeToCloseChart';
import { ThroughputChart } from '@/components/dashboard/ThroughputChart';
import { AgingReportTable } from '@/components/dashboard/AgingReportTable';
import { ModuleVolumeChart } from '@/components/dashboard/ModuleVolumeChart';
import { OrgVolumeChart } from '@/components/dashboard/OrgVolumeChart';

export default async function DashboardPage({ params }: { params: { engagementId: string } }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const [engagement, issues, history] = await Promise.all([
    getEngagement(params.engagementId),
    listIssues(params.engagementId),
    listHistoryForEngagement(params.engagementId),
  ]);
  if (!engagement) redirect('/');

  const openCount = issues.filter((i) => i.status !== 'closed' && i.status !== 'rejected').length;
  const closedCount = issues.filter((i) => i.status === 'closed').length;
  const reopen = reopenRate(issues, history);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Total issues" value={String(issues.length)} />
        <StatTile label="Open" value={String(openCount)} />
        <StatTile label="Closed" value={String(closedCount)} />
        <StatTile
          label="Reopen rate"
          value={`${reopen.ratePercent.toFixed(0)}%`}
          sublabel={`${reopen.reopenedCount} of ${reopen.everClosedCount} closed`}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusDistributionChart distribution={statusDistribution(issues)} />
        <PriorityDistributionChart distribution={priorityDistribution(issues)} />
      </div>
      <TimeToCloseChart rows={timeToCloseByPriority(issues, engagement.sla_days)} />
      <ThroughputChart buckets={throughputByWeek(issues, 8, now)} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ModuleVolumeChart data={moduleVolume(issues)} />
        <OrgVolumeChart data={orgVolume(issues)} />
      </div>
      <AgingReportTable rows={agingReport(issues, engagement.sla_days, now)} />
    </div>
  );
}
```

- [ ] **Step 8: Verify it builds**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: complete BI dashboard with time-to-close, throughput, aging, and volume charts"
```

---

## Task 14: Deployment handoff and end-to-end smoke test

**Files:**
- Modify: `README.md` (replace the Task 1 stub with real setup steps)

**Interfaces:**
- Consumes: every prior task — this is where the whole app first runs against a
  real Supabase project and gets deployed.

This task cannot be run by a subagent to completion: creating the Supabase and
Vercel accounts, and entering real credentials, has to be done by a person. Its
deliverable is the README a person follows, plus running the smoke test yourself
once you've done the account-creation steps.

- [ ] **Step 1: Write `README.md`**

```markdown
# UAT Tracker

A UAT issue tracker for Prometeia and its bank clients: report issues, track them
through a status workflow, and monitor KPIs on a BI dashboard. See
`docs/superpowers/specs/2026-09-05-uat-tracker-design.md` for the full design.

## One-time setup

### 1. Create a Supabase project

1. Go to https://supabase.com, create a free account, then "New project".
2. Once it's provisioned, go to **Project Settings → API**. Copy the **Project URL**
   and the **anon public** key.
3. Go to **Project Settings → API → Project API keys** and copy the
   **service_role** key too (keep this one secret — never commit it or expose it
   to the browser).
4. Copy `.env.local.example` to `.env.local` and fill in the three values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<your project URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
   SUPABASE_SERVICE_ROLE_KEY=<your service role key>
   ```

### 2. Run the database migrations

In the Supabase dashboard, go to **SQL Editor → New query**, and run these three
files in order (paste each file's contents, click Run):

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_storage.sql`

### 3. Install dependencies and run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/login`.

### 4. Create the first Prometeia admin account

1. Go to `/signup`, create an account with your real Prometeia email.
2. By default Supabase requires email confirmation — check your inbox for the
   confirmation link (Supabase's default project sends real email, no extra setup
   needed for testing). Click it, then sign in at `/login`.
3. Every new account starts as a bank-tier user (`is_prometeia = false`) — nobody
   has admin rights yet on a fresh database. Promote yourself: in the Supabase
   dashboard, go to **SQL Editor** and run, substituting your email:
   ```sql
   update public.profiles set is_prometeia = true where email = 'you@prometeia.com';
   ```
4. Reload the app. You should land on `/new-engagement` (no engagements exist
   yet) and see the Prometeia logo and green "Create engagement" button.

### 5. Deploy to Vercel

1. Push this repository to a GitHub repo (`git remote add origin <your repo
   URL>`, `git push -u origin main`).
2. Go to https://vercel.com, create a free account, "Add New Project", import the
   GitHub repo.
3. In the project's **Environment Variables** settings, add the same three
   variables from `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
4. Deploy. Vercel gives you a URL like `https://uat-tracker-yourname.vercel.app`.
5. Back in Supabase, go to **Authentication → URL Configuration** and set **Site
   URL** to that Vercel URL, so email confirmation links point at the deployed
   app instead of `localhost`.

## Adding a bank to an engagement

1. As a Prometeia user, create an engagement (bank name, modules, team members,
   SLA days) from the engagement picker's "+ New engagement…" option.
2. Send the bank contact the deployed URL and ask them to sign up at `/signup`
   with their own email.
3. Once they have an account, go to the engagement's **Settings** page and add
   their email under "Bank members". They now see that engagement (and only that
   one) next time they log in.

## Smoke test checklist

Run through this once, end to end, after deploying:

- [ ] Sign up as a Prometeia user, promote via SQL, confirm you land on
      `/new-engagement`.
- [ ] Create an engagement with 2-3 modules, 2 team members, and default SLA
      days.
- [ ] Sign up a second account (a different email/browser profile) — confirm it
      has no engagements ("No engagement yet" screen).
- [ ] As the Prometeia user, add the second account's email as a bank member in
      Settings. Confirm the second account now sees the engagement.
- [ ] As the bank account, report 2-3 issues with different priorities and
      modules. Confirm the bank account cannot see any status/priority/assignee
      edit controls on the board or in the issue detail modal.
- [ ] As the Prometeia user, move one issue through Backlog → Ongoing → Ready for
      Test → Closed, assigning it to a team member along the way. Confirm each
      change appears in the issue's History log.
- [ ] Reopen the closed issue (set its status back to Ongoing). Confirm the
      History log shows a "reopened" entry and the Dashboard's reopen rate
      updates.
- [ ] Attach a real file to an issue as the bank account; confirm the Prometeia
      account can open it from the issue detail modal.
- [ ] Add a comment as each account; confirm both appear in the thread with the
      right author name.
- [ ] Open the Dashboard: confirm stat tiles, status/priority charts,
      time-to-close vs. SLA, throughput, module/org volume, and the aging report
      all reflect the seeded issues correctly.
- [ ] Create a second engagement for a different bank, add a third account as
      that bank's member, and confirm the third account cannot see the first
      bank's engagement in its picker or by guessing the URL.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add deployment guide and end-to-end smoke test checklist"
```

---

## Self-review notes

**Spec coverage:** every section of `docs/superpowers/specs/2026-09-05-uat-tracker-design.md`
maps to a task — Platform/Auth (Tasks 1, 3, 5, 14), Roles & access model (Task 2's
RLS, Task 7's member management), Data model (Task 2), Workflow incl. the
reopen-as-action rule (Tasks 4, 9), Views 1-7 (Tasks 6-13), Branding (Tasks 1, 6, 7),
Out-of-scope items are simply not tasked, Verification plan (Task 14's smoke test).

**Placeholder scan:** no TBD/TODO markers; every step has real code or a real SQL
statement, not a description of what to write.

**Type consistency:** `Issue`/`IssueHistoryEntry`/`Priority`/`Status`/`Org`/`SlaDays`
(Task 4) are the single source of type truth every later task imports rather than
redeclaring — checked `EngagementConfigValues` (Task 7), `CreateIssueInput`
(Task 8), and the dashboard prop types (Tasks 12-13) all reference them consistently
rather than re-typing field names. `updateIssueStatus`/`updateIssuePriority`/
`updateIssueAssignee`/`updateIssueModule` (Tasks 9, 11) share one `recordHistory`
helper and one naming convention the board and detail-modal components both call
identically.

