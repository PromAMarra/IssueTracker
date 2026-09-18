# App shell alignment — design spec

## Goal

Align the Issue Tracker's navigation shell with Prometeia's existing internal
software (reference: a VUB Slovakia loan-origination screen), so this tool
reads as consistent with the company's other internal products — a stated
step toward it becoming an adopted internal tool, not a one-off.

## Reference

A single screenshot of an existing Prometeia internal tool, showing:
- A blue top bar: logo, Home/Notifications/search, "My Desktop" link,
  briefcase icon, user name + role/org line.
- A persistent dark-navy left sidebar: hamburger "MENU" header, a green
  "+ New Application" CTA, grouped nav items under section labels
  ("To Be Started", "Application").
- Breadcrumb navigation ("Home > Group Details").
- Page-level blue pill action buttons, top-right.
- An underlined green active-tab indicator.
- White card-based content sections with key-value grids and data tables.

## Decisions

Resolved with the user before writing this spec:

1. **Color palette**: keep this app's existing DESIGN.md tokens (electric-blue
   `#0025FF` accent, flat hairline-border style). Adopt the reference's
   *structure* (top bar + sidebar + breadcrumbs + cards), not its literal
   color values. DESIGN.md remains the single source of truth for color.
2. **Sidebar content**: restyle the app's existing sections (Board, List,
   Dashboard, Settings) into the reference's vertical-nav pattern. Do not
   invent new functional groupings or sections that don't already exist.
3. **Engagement picker**: stays in the top bar, next to the user identity
   block (unchanged from today's placement) — the reference has no
   equivalent concept, so there's nothing to align to here.
4. **Phasing**: this spec covers **Phase 1 (shell only)** — top bar, sidebar,
   breadcrumbs. Rolling the card-based content pattern into the Board, List,
   Dashboard, and Settings pages themselves is **Phase 2**, out of scope
   here, to be brainstormed and approved separately once Phase 1 has shipped
   and been reviewed.

## Non-goals (explicit)

- **No search feature.** The reference's search icon is tied to real
  functionality (case search) that doesn't exist in this app. Adding a
  decorative, non-functional search icon would be misleading UI. If a real
  search feature is wanted later, that's a separate feature request with its
  own design.
- **No "My Desktop" / briefcase icon.** These are specific to the reference
  tool's own case-loading workflow and have no equivalent here.
- **No collapsible/toggleable sidebar in Phase 1.** The reference's hamburger
  "MENU" toggles a collapsed state; this spec deliberately defers that
  interaction (see Architecture, Approaches considered) to keep Phase 1 to a
  visual/IA alignment pass, not a new stateful UI feature.
- **No changes to `MinimalHeader.tsx`** or any page that doesn't render
  inside `app/(app)/[engagementId]/layout.tsx` (login, signup, new-engagement
  pages keep their current, simpler chrome — they have no engagement context
  to put in a sidebar).

## Current state (for contrast)

Exactly one layout file wraps every Board/List/Dashboard/Settings page:
`app/(app)/[engagementId]/layout.tsx`. It already fetches everything both a
new top bar and sidebar would need (`session.profile`, `engagements`,
`engagement`, `platformSettings`) and renders:
- `components/Header.tsx` — a horizontal bar (logo, bank logo, engagement
  picker, notification bell, profile name, logout) plus, nested inside it,
- `components/NavTabs.tsx` — a horizontal tab strip (Board/List/Dashboard/
  Settings, or +Settings for Prometeia users), active-tab underlined, using
  `usePathname()` for the active check.

## Architecture

### Approach (recommended)

A new `AppShell`-style composition inside `app/(app)/[engagementId]/layout.tsx`:
- **Top bar**: `Header.tsx` restyled (same props, same data, same content —
  logo, bank logo, engagement picker, notification bell, profile, logout) —
  visually adapted to the reference's horizontal-bar proportions and spacing,
  using DESIGN.md's existing color tokens.
- **Sidebar** (new `components/Sidebar.tsx`, Client Component): a persistent
  vertical nav column replacing `NavTabs.tsx`. Same four items (Board, List,
  Dashboard, +Settings for Prometeia users), vertically stacked, active-item
  highlighted, using the same `usePathname()` pattern `NavTabs` already uses.
  Always visible on desktop widths; no collapse/expand toggle in Phase 1 (see
  non-goals). Responsive behavior at mobile widths follows whatever pattern
  the rest of the app already uses for narrow viewports (checked during
  implementation — if none exists yet, a simple below-768px full-width stack
  is the fallback, consistent with DESIGN.md's documented collapsing
  strategy).
- **Breadcrumbs** (new `components/Breadcrumbs.tsx`): static per top-level
  page — "Home / Board", "Home / List", "Home / Dashboard", "Home /
  Settings" — no breadcrumb-context system needed, since none of these pages
  are nested beyond one level (the ticket detail view is a modal overlay on
  a query param, not a route).
- Layout becomes: top bar full-width, then a two-column area below it
  (sidebar + main content), main content unchanged (`{children}` renders
  Board/List/Dashboard/Settings exactly as today — no page-level changes in
  Phase 1).

`components/NavTabs.tsx` is retired; its logic moves into `Sidebar.tsx`.

### Alternatives considered, and why not chosen for Phase 1

- **Fully collapsible sidebar with persisted state** (localStorage + a
  context provider for expand/collapse): closer 1:1 parity with the
  reference's hamburger toggle, but adds real new complexity (hydration
  safety for a localStorage-backed initial state, a new context provider —
  this codebase currently has no context providers at all) for an
  interaction that isn't the actual stated goal (visual/IA alignment, not
  interaction parity). Treat as a natural Phase 3 enhancement once Phase 1
  has shipped, if still wanted.
- **CSS-only sidebar** (checkbox-driven collapse, no JS state): avoids new
  client state, but every interactive piece of this codebase is already a
  small client component with hooks (`NavTabs` itself already is one) — a
  CSS-only mechanism would be inconsistent with established conventions and
  awkward to combine with `usePathname()`-based active-route highlighting,
  which is unavoidably client-side already.

## Testing / verification plan

- `npx tsc --noEmit`, `npm test`, `npm run build` — unchanged expectation,
  must stay clean.
- No new Server Actions or data-fetching logic — `Sidebar` and `Breadcrumbs`
  are presentational, driven by props/pathname already available in the
  existing layout. Low behavioral risk; this is a visual/structural change.
- Manual verification: since this sandbox has no live Supabase-backed dev
  server (established earlier this session), visual verification will be by
  careful reading of the rendered component structure and Tailwind classes,
  not a live browser click-through — flagged honestly in the completion
  report, consistent with how prior UI work this session was verified.
- Independent code review before merge, matching this session's established
  process for every non-trivial change.

## Files touched (Phase 1)

- `app/(app)/[engagementId]/layout.tsx` — restructure to render the new
  two-column shell (top bar + sidebar + main).
- `components/Header.tsx` — restyle only; same props/content.
- `components/Sidebar.tsx` — **new**, replaces `components/NavTabs.tsx`.
- `components/Breadcrumbs.tsx` — **new**.
- `components/NavTabs.tsx` — removed once its logic is absorbed into
  `Sidebar.tsx`.

No changes to: any Server Action, any `lib/data/*` function, any page
component's internal content, `MinimalHeader.tsx`, or DESIGN.md's color
tokens.
