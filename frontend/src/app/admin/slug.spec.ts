import { slugProblem, suggestSlug } from './slug';

describe('suggestSlug', () => {
  it('slugSuggestedFromName', () => {
    expect(suggestSlug('La Mesa del Puerto')).toBe('la-mesa-del-puerto');
  });

  it('removesAccentsAndSymbols', () => {
    expect(suggestSlug('Café Ñandú & Bar')).toBe('cafe-nandu-bar');
  });

  it('collapsesAndTrimsHyphens', () => {
    expect(suggestSlug('  --Bar   "El  Sol"--  ')).toBe('bar-el-sol');
  });

  it('isEmptyWhenNothingUsable', () => {
    expect(suggestSlug('¡¿?!')).toBe('');
  });

  it('cutsToTheBackendMaximum', () => {
    const slug = suggestSlug(`${'a'.repeat(79)} b`);

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('slugProblem', () => {
  it('acceptsAValidSlug', () => {
    expect(slugProblem('la-mesa-2')).toBeNull();
  });

  it('rejectsEmptyAndInvalidCharacters', () => {
    expect(slugProblem('')).not.toBeNull();
    expect(slugProblem('La Mesa')).not.toBeNull();
    expect(slugProblem('café')).not.toBeNull();
  });

  it('acceptsHyphensAnywhereLikeTheBackend', () => {
    expect(slugProblem('-bar')).toBeNull();
    expect(slugProblem('bar-')).toBeNull();
    expect(slugProblem('a--b')).toBeNull();
  });

  it('rejectsTooLong', () => {
    expect(slugProblem('a'.repeat(81))).not.toBeNull();
    expect(slugProblem('a'.repeat(80))).toBeNull();
  });

  it('rejectsReservedSlugs', () => {
    for (const reserved of ['demo', 'admin', 'api', 'r', 'panel', 'reserva', 'cuenta', 'planos']) {
      expect(slugProblem(reserved)).not.toBeNull();
    }
  });
});
