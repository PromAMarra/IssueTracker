import { describe, expect, it } from 'vitest';
import { keyPrefixFromBankName, sanitizeKeyPrefix } from './keys';

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

describe('sanitizeKeyPrefix', () => {
  it('uppercases and strips anything but letters/digits, capped at 10 characters', () => {
    expect(sanitizeKeyPrefix('esup')).toBe('ESUP');
    expect(sanitizeKeyPrefix('e-sup 123!')).toBe('ESUP123');
  });

  it('falls back to ENG when nothing alphanumeric remains', () => {
    expect(sanitizeKeyPrefix('---')).toBe('ENG');
  });

  it('allows a longer prefix than the bank-name auto-derivation does', () => {
    expect(sanitizeKeyPrefix('UATBANKPREFIX')).toBe('UATBANKPRE');
  });
});
