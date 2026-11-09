import { ShiftResponse } from '../core/api/models/shift-response';
import { opensOn, weekdayOf } from './shift-days';

const CENA: ShiftResponse = {
  id: 11,
  name: 'Cena',
  start: '20:00:00',
  end: '23:30:00',
  days: ['MONDAY', 'FRIDAY'],
};

describe('shift-days', () => {
  it('weekdayOfReadsTheLocalDate', () => {
    expect(weekdayOf('2026-11-09')).toBe('MONDAY');
    expect(weekdayOf('2026-11-15')).toBe('SUNDAY');
  });

  it('opensOnUsesLocalWeekday', () => {
    expect(opensOn(CENA, '2026-11-09')).toBe(true);
    expect(opensOn(CENA, '2026-11-10')).toBe(false);
  });

  it('opensOnIsFalseWithoutDays', () => {
    expect(opensOn({ id: 12, name: 'Sin días' }, '2026-11-09')).toBe(false);
  });
});
