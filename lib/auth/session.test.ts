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
