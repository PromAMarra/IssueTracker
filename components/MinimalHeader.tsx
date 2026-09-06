import { LogoutButton } from '@/components/auth/LogoutButton';

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
