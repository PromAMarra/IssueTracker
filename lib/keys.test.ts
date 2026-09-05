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
