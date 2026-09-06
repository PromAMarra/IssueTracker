import Image from 'next/image';
import { LogoutButton } from '@/components/auth/LogoutButton';

export function MinimalHeader() {
  return (
    <header className="flex items-center justify-between border-b border-ink-soft/10 bg-white px-6 py-3">
      <Image src="/prometeia-logo.png" alt="Prometeia" width={140} height={45} priority />
      <LogoutButton />
    </header>
  );
}
