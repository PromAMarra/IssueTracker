import { LogoutButton } from '@/components/auth/LogoutButton';
import { EngagementPicker } from '@/components/EngagementPicker';
import { NavTabs } from '@/components/NavTabs';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import type { Engagement, EngagementSummary } from '@/lib/data/engagements';
import type { Profile } from '@/lib/auth/session';

export function Header({
  profile,
  engagements,
  current,
  prometeiaLogoUrl,
}: {
  profile: Profile;
  engagements: EngagementSummary[];
  current: Engagement;
  prometeiaLogoUrl: string | null;
}) {
  return (
    <header className="border-b border-ink-soft/10 bg-white">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={prometeiaLogoUrl ?? '/prometeia-logo.png'}
            alt="Prometeia"
            className="h-9 max-w-[160px] object-contain"
          />
          {current.bank_logo_url && (
            <>
              <span className="h-6 w-px bg-ink-soft/20" />
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
          <NotificationBell />
          <span className="text-sm text-ink-soft">{profile.full_name ?? profile.email}</span>
          <LogoutButton />
        </div>
      </div>
      <NavTabs engagementId={current.id} isProm={profile.is_prometeia} />
    </header>
  );
}
