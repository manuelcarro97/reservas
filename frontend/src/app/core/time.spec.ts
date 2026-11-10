import { addDays, calendarLeaf, formatDate, longDateParts, timeIn, todayIn } from './time';

describe('time', () => {
  it('timeInUsesPlanZone', () => {
    const instant = new Date('2026-11-09T23:30:00Z');

    expect(timeIn('Europe/Madrid', instant)).toBe('00:30');
    expect(timeIn('America/Los_Angeles', instant)).toBe('15:30');
    // Medianoche en punto: siempre 00:xx, nunca 24:xx.
    expect(timeIn('Europe/Madrid', new Date('2026-11-09T23:00:00Z'))).toBe('00:00');
  });

  it('timeInFallsBackToBrowserTime', () => {
    const instant = new Date(2030, 0, 5, 9, 7);

    expect(timeIn('No/Existe', instant)).toBe('09:07');
    expect(timeIn(undefined, instant)).toBe('09:07');
  });

  it('todayFollowsTheRestaurantZoneNotTheBrowser', () => {
    const instant = new Date('2030-01-05T23:30:00Z');

    expect(todayIn('Europe/Madrid', instant)).toBe('2030-01-06');
    expect(todayIn('America/Los_Angeles', instant)).toBe('2030-01-05');
    expect(todayIn('Asia/Tokyo', new Date('2030-01-05T15:30:00Z'))).toBe('2030-01-06');
  });

  it('unknownZoneFallsBackToBrowserDate', () => {
    const instant = new Date(2030, 0, 5, 12, 0);

    expect(todayIn('No/Existe', instant)).toBe('2030-01-05');
    expect(todayIn(undefined, instant)).toBe('2030-01-05');
  });

  it('addsDaysAcrossMonths', () => {
    expect(addDays('2030-01-31', 1)).toBe('2030-02-01');
    expect(addDays('2030-12-31', 90)).toBe('2031-03-31');
  });

  it('addsDaysAcrossDaylightSavingChanges', () => {
    expect(addDays('2030-03-30', 2)).toBe('2030-04-01');
    expect(addDays('2030-10-26', 2)).toBe('2030-10-28');
  });

  it('longDateKeepsTheCalendarDayWhateverTheBrowserZoneIs', () => {
    expect(longDateParts('2026-11-09')).toEqual({ weekday: 'Lunes', day: '9 de noviembre' });
    expect(longDateParts('2026-03-01')).toEqual({ weekday: 'Domingo', day: '1 de marzo' });
  });

  it('calendarLeafGivesTheShortMonthAndTheDayWithoutLeadingZero', () => {
    expect(calendarLeaf('2026-12-24')).toEqual({ month: 'dic', day: '24' });
    expect(calendarLeaf('2027-01-01')).toEqual({ month: 'ene', day: '1' });
    expect(calendarLeaf('2026-03-09')).toEqual({ month: 'mar', day: '9' });
  });

  it('calendarLeafMonthIsAlwaysThreeLettersWithoutDot', () => {
    // Según la versión de ICU, septiembre sale como "sep", "sept" o "sept.": la banda del calendario es de 3 letras.
    expect(calendarLeaf('2026-09-15').month).toBe('sep');
    for (let month = 1; month <= 12; month++) {
      const iso = `2026-${String(month).padStart(2, '0')}-10`;
      expect(calendarLeaf(iso).month).toMatch(/^[a-zñ]{3}$/);
    }
  });

  it('formatsDateAsDayMonthYear', () => {
    expect(formatDate('2030-01-05')).toBe('05/01/2030');
  });
});
