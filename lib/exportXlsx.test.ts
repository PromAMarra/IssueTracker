import { describe, expect, it } from 'vitest';
import { sanitizeCell } from './exportXlsx';

describe('sanitizeCell', () => {
  it('defuses a leading = with a force-text apostrophe', () => {
    expect(sanitizeCell('=HYPERLINK("http://evil.com","click")')).toBe(
      "'=HYPERLINK(\"http://evil.com\",\"click\")",
    );
  });

  it('defuses leading +, -, @, tab, and carriage return', () => {
    expect(sanitizeCell('+1234')).toBe("'+1234");
    expect(sanitizeCell('-1234')).toBe("'-1234");
    expect(sanitizeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(sanitizeCell('\t=cmd')).toBe("'\t=cmd");
    expect(sanitizeCell('\r=cmd')).toBe("'\r=cmd");
  });

  it('leaves ordinary strings untouched', () => {
    expect(sanitizeCell('Login button is broken')).toBe('Login button is broken');
    expect(sanitizeCell('BANK-12')).toBe('BANK-12');
  });

  it('leaves non-string values untouched', () => {
    expect(sanitizeCell(42)).toBe(42);
    expect(sanitizeCell(null)).toBeNull();
    expect(sanitizeCell(undefined)).toBeUndefined();
  });

  it('does not falsely flag a hyphen or minus sign that is not leading', () => {
    expect(sanitizeCell('Payments-related issue')).toBe('Payments-related issue');
  });
});
