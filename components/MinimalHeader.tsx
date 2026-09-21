import { LogoutButton } from '@/components/auth/LogoutButton';

/**
 * Stripped-down header (Prometeia logo + sign-out only) for pages rendered
 * outside of any specific engagement context — e.g. the "create your first
 * engagement" flow — where the full `Header` can't be used because it
 * requires an `Engagement`/`EngagementSummary[]` to render the picker and
 * bank logo. Keep this in sync with `Header`'s branding markup if the
 * Prometeia logo treatment changes, since the two intentionally share look
 * and feel.
 */
export function MinimalHeader({ prometeiaLogoUrl }: { prometeiaLogoUrl: string | null }) {
  return (
    <header className="flex items-center justify-between border-b border-ink-soft/10 bg-white px-6 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={prometeiaLogoUrl ?? '/prometeia-logo.png'}
        alt="Prometeia"
        className="h-9 max-w-[160px] object-contain"
      />
      <LogoutButton />
    </header>
  );
}
