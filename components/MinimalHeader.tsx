import Image from 'next/image';
import { LogoutButton } from '@/components/auth/LogoutButton';

export function MinimalHeader() {
  return (
    <header className="flex items-center justify-between bg-brand-navy px-6 py-3 text-white">
      <Image src="/prometeia-logo.png" alt="Prometeia" width={120} height={38} priority />
      <LogoutButton />
    </header>
  );
}
