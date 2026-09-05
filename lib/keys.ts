export function keyPrefixFromBankName(bankName: string): string {
  const letters = bankName.toUpperCase().replace(/[^A-Z]/g, '');
  return letters.slice(0, 4) || 'ENG';
}
