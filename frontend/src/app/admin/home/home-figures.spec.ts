import { AdminReservation } from '../../core/api/models/admin-reservation';
import { ShiftResponse } from '../../core/api/models/shift-response';
import { dayTile, isActive, nextShift, shiftLoad, todayFigures, weekStart } from './home-figures';

const EVERY_DAY: ShiftResponse['days'] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

const COMIDA: ShiftResponse = {
  id: 10,
  name: 'Comida',
  start: '13:00:00',
  end: '16:00:00',
  days: EVERY_DAY,
};
const CENA: ShiftResponse = {
  id: 11,
  name: 'Cena',
  start: '20:00:00',
  end: '23:30:00',
  days: EVERY_DAY,
};
/** Los turnos llegan sin ordenar: la cena antes que la comida. */
const SHIFTS = [CENA, COMIDA];

// 2026-11-09 es lunes.
const TODAY = '2026-11-09';

let nextId = 1;
function reservation(extra: Partial<AdminReservation>): AdminReservation {
  return {
    id: nextId++,
    status: 'CONFIRMED',
    date: TODAY,
    shiftId: CENA.id,
    partySize: 2,
    ...extra,
  };
}

describe('home-figures', () => {
  it('isActiveIsPendingOrConfirmed', () => {
    expect(isActive(reservation({ status: 'PENDING' }))).toBe(true);
    expect(isActive(reservation({ status: 'CONFIRMED' }))).toBe(true);
    expect(isActive(reservation({ status: 'CANCELLED' }))).toBe(false);
    expect(isActive(reservation({ status: 'NO_SHOW' }))).toBe(false);
  });

  it('todayFiguresCountsOnlyActive', () => {
    const rows = [
      reservation({ partySize: 2 }),
      reservation({ partySize: 3 }),
      reservation({ partySize: 4 }),
      reservation({ status: 'PENDING', partySize: 5 }),
      reservation({ status: 'CANCELLED', partySize: 8 }),
    ];

    expect(todayFigures(rows, 34)).toEqual({
      reservations: 4,
      toConfirm: 1,
      guests: 14,
      capacity: 34,
    });
  });

  it('todayFiguresWithoutRowsAreZero', () => {
    expect(todayFigures([], 12)).toEqual({
      reservations: 0,
      toConfirm: 0,
      guests: 0,
      capacity: 12,
    });
  });

  it('shiftLoadCountsDistinctTablesAndUnassigned', () => {
    const rows = [
      reservation({ tableId: 1, partySize: 2 }),
      reservation({ tableId: 1, partySize: 3 }),
      reservation({ tableId: 2, status: 'PENDING', partySize: 4 }),
      reservation({ partySize: 5 }),
      // No cuentan: otro turno y cancelada.
      reservation({ tableId: 3, shiftId: COMIDA.id }),
      reservation({ tableId: 4, status: 'CANCELLED' }),
    ];

    expect(shiftLoad(rows, CENA, 9)).toEqual({
      shift: CENA,
      occupied: 2,
      total: 9,
      unassigned: 1,
      reservations: 4,
      guests: 14,
      pending: 1,
    });
  });

  it('nextShiftTodayWithMinutes', () => {
    const next = nextShift(SHIFTS, new Set(), TODAY, '17:20');

    expect(next).toEqual({ shift: CENA, date: TODAY, day: 'today', minutesToStart: 160 });
  });

  it('nextShiftTomorrowWhenNoneLeftToday', () => {
    const next = nextShift(SHIFTS, new Set(), TODAY, '22:00');

    expect(next).toEqual({
      shift: COMIDA,
      date: '2026-11-10',
      day: 'tomorrow',
      minutesToStart: null,
    });
  });

  it('nextShiftSkipsStartedAndClosedDays', () => {
    const next = nextShift(SHIFTS, new Set(['2026-11-10']), TODAY, '20:01');

    expect(next).toEqual({ shift: COMIDA, date: '2026-11-11', day: 'later', minutesToStart: null });
  });

  it('nextShiftSkipsDaysTheShiftsDoNotOpen', () => {
    const onlyFriday: ShiftResponse = { ...CENA, days: ['FRIDAY'] };

    expect(nextShift([onlyFriday], new Set(), TODAY, '10:00')).toEqual({
      shift: onlyFriday,
      date: '2026-11-13',
      day: 'later',
      minutesToStart: null,
    });
  });

  it('nextShiftTodayIgnoresAShiftThatStartsRightNow', () => {
    expect(nextShift([CENA], new Set(), TODAY, '20:00')?.day).toBe('tomorrow');
  });

  it('nextShiftNullWithoutShifts', () => {
    expect(nextShift([], new Set(), TODAY, '10:00')).toBeNull();
  });

  it('nextShiftNullWhenEveryDayIsClosed', () => {
    const closed = new Set(
      Array.from({ length: 8 }, (_, i) => `2026-11-${String(9 + i).padStart(2, '0')}`),
    );

    expect(nextShift(SHIFTS, closed, TODAY, '10:00')).toBeNull();
  });

  it('weekStartFromSundayIsPreviousMonday', () => {
    expect(weekStart('2026-11-15')).toBe('2026-11-09');
  });

  it('weekStartOfMondayIsItself', () => {
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
  });

  it('weekStartCrossesYear', () => {
    expect(weekStart('2027-01-03')).toBe('2026-12-28');
  });

  it('dayTileClosedHasNoShifts', () => {
    const rows = [reservation({ tableId: 1 })];

    const tile = dayTile(TODAY, TODAY, SHIFTS, new Set([TODAY]), rows, 9);

    expect(tile).toEqual({
      date: TODAY,
      isToday: true,
      isPast: false,
      closed: true,
      shifts: [],
      reservations: 0,
      guests: 0,
      pending: 0,
    });
  });

  it('dayTilePastAndToday', () => {
    const rows = [
      reservation({ tableId: 1, partySize: 2 }),
      reservation({ tableId: 2, status: 'PENDING', partySize: 4 }),
      reservation({ shiftId: COMIDA.id, tableId: 3, partySize: 3 }),
      reservation({ status: 'CANCELLED', partySize: 9 }),
    ];

    const today = dayTile(TODAY, TODAY, SHIFTS, new Set(), rows, 9);
    const past = dayTile('2026-11-08', TODAY, SHIFTS, new Set(), [], 9);
    const future = dayTile('2026-11-10', TODAY, SHIFTS, new Set(), [], 9);

    expect(today.isToday).toBe(true);
    expect(today.isPast).toBe(false);
    // Los turnos van por hora de inicio, no en el orden en que llegan.
    expect(today.shifts.map((load) => load.shift.name)).toEqual(['Comida', 'Cena']);
    expect(today.shifts.map((load) => load.occupied)).toEqual([1, 2]);
    expect(today).toMatchObject({ reservations: 3, guests: 9, pending: 1, closed: false });
    expect(past).toMatchObject({ isToday: false, isPast: true, reservations: 0 });
    expect(future).toMatchObject({ isToday: false, isPast: false });
  });

  it('dayTileOnlyShowsShiftsThatOpenThatDay', () => {
    const onlyMonday: ShiftResponse = { ...COMIDA, days: ['MONDAY'] };

    const monday = dayTile(TODAY, TODAY, [onlyMonday, CENA], new Set(), [], 9);
    const tuesday = dayTile('2026-11-10', TODAY, [onlyMonday, CENA], new Set(), [], 9);

    expect(monday.shifts.map((load) => load.shift.name)).toEqual(['Comida', 'Cena']);
    expect(tuesday.shifts.map((load) => load.shift.name)).toEqual(['Cena']);
  });
});
