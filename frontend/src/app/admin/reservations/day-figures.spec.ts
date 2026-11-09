import { AdminReservation } from '../../core/api/models/admin-reservation';
import { dayFigures } from './day-figures';

function reservation(
  status: AdminReservation['status'],
  partySize: number,
  shiftId: number,
): AdminReservation {
  return { status, partySize, shiftId };
}

describe('dayFigures', () => {
  it('countsOnlyActiveOfTheShift', () => {
    const rows = [
      reservation('CONFIRMED', 2, 1),
      reservation('PENDING', 4, 1),
      reservation('CANCELLED', 3, 1),
      reservation('NO_SHOW', 2, 1),
      reservation('CONFIRMED', 5, 2),
    ];

    const figures = dayFigures(rows, 1, [], null);

    expect(figures.reservations).toBe(2);
    expect(figures.guests).toBe(6);
    expect(figures.pending).toBe(1);
  });

  it('freeTablesFromOccupancy', () => {
    const tables = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id }));

    expect(dayFigures([], 1, tables, new Set([2, 4, 6])).freeTables).toBe(4);
  });

  it('anOccupiedIdThatIsNotATableDoesNotCountAgainstTheFreeOnes', () => {
    const tables = [1, 2, 3].map((id) => ({ id }));

    expect(dayFigures([], 1, tables, new Set([2, 99])).freeTables).toBe(2);
  });

  it('freeTablesUnknownWithoutOccupancy', () => {
    const tables = [1, 2, 3].map((id) => ({ id }));

    expect(dayFigures([], 1, tables, null).freeTables).toBeNull();
  });

  it('noShiftCountsNothing', () => {
    expect(dayFigures([reservation('CONFIRMED', 2, 1)], null, [], null)).toEqual({
      reservations: 0,
      guests: 0,
      pending: 0,
      freeTables: null,
    });
  });
});
