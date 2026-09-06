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
