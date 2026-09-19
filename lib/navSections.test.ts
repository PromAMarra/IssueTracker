import { describe, expect, it } from 'vitest';
import { activeNavSection, NAV_SECTIONS } from './navSections';

describe('NAV_SECTIONS', () => {
  it('lists board, list, dashboard, testing-lab, settings in that order', () => {
    expect(NAV_SECTIONS.map((s) => s.key)).toEqual(['board', 'list', 'dashboard', 'testing-lab', 'settings']);
  });
});

describe('activeNavSection', () => {
  it('matches an exact section path', () => {
    expect(activeNavSection('/eng-1/board', 'eng-1')).toBe('board');
  });

  it('matches a section path with a sub-path (e.g. a query-carrying route)', () => {
    expect(activeNavSection('/eng-1/list/', 'eng-1')).toBe('list');
  });

  it('returns null for a path under a different engagement', () => {
    expect(activeNavSection('/eng-2/board', 'eng-1')).toBeNull();
  });

  it('returns null for a path with no matching section', () => {
    expect(activeNavSection('/eng-1/unknown', 'eng-1')).toBeNull();
  });

  it('returns null for the bare engagement root with no section', () => {
    expect(activeNavSection('/eng-1', 'eng-1')).toBeNull();
  });
});
