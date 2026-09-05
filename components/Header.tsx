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
