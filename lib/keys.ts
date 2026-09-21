/**
 * Derives/validates the short letters-only prefix used to build human-facing
 * ticket keys (e.g. "ADCB-123") for an engagement. Consumed exclusively by
 * app/actions/engagements.ts when an engagement is created or its key prefix
 * is edited in Settings; the resulting `key_prefix` is stored on the
 * `engagements` row and later concatenated with a per-engagement sequence
 * number wherever an issue key is generated.
 *
 * Two entry points, both pure string transforms with no I/O:
 *  - keyPrefixFromBankName: the default, auto-derived from the bank's display
 *    name (first 4 letters, uppercased, non-letters stripped).
 *  - sanitizeKeyPrefix: validates/normalizes a Prometeia admin's own custom
 *    prefix choice (allows digits too, up to 10 chars).
 *
 * Gotcha: both fall back to the generic literal 'ENG' when the input yields
 * no valid characters at all (e.g. a bank name that is all numbers/symbols,
 * or an empty custom prefix) — this is a deliberate never-empty guarantee,
 * not a bug, since an empty key_prefix would produce malformed ticket keys.
 */
export function keyPrefixFromBankName(bankName: string): string {
  const letters = bankName.toUpperCase().replace(/[^A-Z]/g, '');
  return letters.slice(0, 4) || 'ENG';
}

// Used to validate/normalize a Prometeia-chosen custom ticket-ID prefix (e.g.
// "ESUP"), as opposed to `keyPrefixFromBankName`'s auto-derived default.
export function sanitizeKeyPrefix(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  return cleaned || 'ENG';
}
