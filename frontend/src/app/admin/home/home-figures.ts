import { AdminReservation } from '../../core/api/models/admin-reservation';
import { ShiftResponse } from '../../core/api/models/shift-response';
import { WeekSummaryDay } from '../../core/api/models/week-summary-day';
import { addDays } from '../../core/time';
import { opensOn, weekdayOf } from '../shift-days';

/** Días que se miran hacia delante para el próximo turno: hoy y los 7 siguientes, para que un turno solo de un día de la semana aparezca. */
const NEXT_SHIFT_LOOKAHEAD_DAYS = 7;

const WEEK_OFFSET: Record<string, number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
};

/** Reserva activa: la que ocupa mesa y cuenta en las cifras (pendiente o confirmada). */
export const isActive = (reservation: AdminReservation): boolean =>
  reservation.status === 'PENDING' || reservation.status === 'CONFIRMED';

/** Minutos desde medianoche de una hora `HH:mm` o `HH:mm:ss`: los turnos llegan con segundos y no se comparan como texto. */
function minutesOf(time: string | undefined): number {
  const [hours, minutes] = (time ?? '').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function byStart(a: ShiftResponse, b: ShiftResponse): number {
  return minutesOf(a.start) - minutesOf(b.start);
}

export interface HomeShiftLoad {
  shift: ShiftResponse;
  /** Mesas distintas con una reserva activa con mesa en el turno. */
  occupied: number;
  /** Mesas del plano. */
  total: number;
  /** Reservas activas sin mesa (modo "asigna el local"). */
  unassigned: number;
  reservations: number;
  guests: number;
  pending: number;
}

/** Carga de un turno. `rows` son las reservas de ese día (de todos los turnos y estados). */
export function shiftLoad(
  rows: readonly AdminReservation[],
  shift: ShiftResponse,
  tableCount: number,
): HomeShiftLoad {
  const active = rows.filter((row) => row.shiftId === shift.id && isActive(row));
  const tables = new Set<number>();
  let unassigned = 0;
  for (const row of active) {
    if (row.tableId === undefined || row.tableId === null) {
      unassigned++;
    } else {
      tables.add(row.tableId);
    }
  }
  return {
    shift,
    occupied: tables.size,
    total: tableCount,
    unassigned,
    reservations: active.length,
    guests: active.reduce((total, row) => total + (row.partySize ?? 0), 0),
    pending: active.filter((row) => row.status === 'PENDING').length,
  };
}

/**
 * Carga de un turno según el resumen de la semana del servidor (misma regla que `shiftLoad`). Si el resumen no trae el
 * turno (se creó después de pedirlo) se cuenta como vacío.
 */
export function summaryShiftLoad(
  day: WeekSummaryDay | undefined,
  shift: ShiftResponse,
  tableCount: number,
): HomeShiftLoad {
  const load = day?.shifts?.find((item) => item.shiftId === shift.id);
  return {
    shift,
    occupied: load?.occupiedTables ?? 0,
    total: tableCount,
    unassigned: load?.unassigned ?? 0,
    reservations: load?.reservations ?? 0,
    guests: load?.guests ?? 0,
    pending: load?.pending ?? 0,
  };
}

export interface TodayFigures {
  reservations: number;
  toConfirm: number;
  guests: number;
  capacity: number;
}

/** Cifras del día: `rows` son las reservas de hoy y `capacity` la suma de plazas de las mesas. */
export function todayFigures(rows: readonly AdminReservation[], capacity: number): TodayFigures {
  const active = rows.filter(isActive);
  return {
    reservations: active.length,
    toConfirm: active.filter((row) => row.status === 'PENDING').length,
    guests: active.reduce((total, row) => total + (row.partySize ?? 0), 0),
    capacity,
  };
}

export interface NextShift {
  shift: ShiftResponse;
  date: string;
  day: 'today' | 'tomorrow' | 'later';
  /** Solo si `day === 'today'`. */
  minutesToStart: number | null;
}

/**
 * Siguiente turno que no ha empezado: de hoy si queda alguno, y si no el primero del siguiente día que abra y no esté
 * cerrado. `nowTime` es la hora (`HH:mm`) en la zona del plano. Un turno que empieza justo ahora ya ha empezado.
 */
export function nextShift(
  shifts: readonly ShiftResponse[],
  closures: ReadonlySet<string>,
  today: string,
  nowTime: string,
): NextShift | null {
  const now = minutesOf(nowTime);
  for (let offset = 0; offset <= NEXT_SHIFT_LOOKAHEAD_DAYS; offset++) {
    const date = addDays(today, offset);
    if (closures.has(date)) {
      continue;
    }
    const upcoming = shifts
      .filter((shift) => opensOn(shift, date) && (offset > 0 || minutesOf(shift.start) > now))
      .sort(byStart)[0];
    if (upcoming) {
      return {
        shift: upcoming,
        date,
        day: offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : 'later',
        minutesToStart: offset === 0 ? minutesOf(upcoming.start) - now : null,
      };
    }
  }
  return null;
}

/** Lunes de la semana de una fecha (`YYYY-MM-DD`); el domingo pertenece a la semana que acaba. */
export function weekStart(isoDate: string): string {
  return addDays(isoDate, -WEEK_OFFSET[weekdayOf(isoDate)]);
}

export interface DayTile {
  date: string;
  isToday: boolean;
  isPast: boolean;
  closed: boolean;
  shifts: HomeShiftLoad[];
  reservations: number;
  guests: number;
  pending: number;
}

/**
 * Tarjeta de un día de la semana. `rows` son las reservas de esa fecha. Un día cerrado no lleva turnos ni cifras;
 * un día abierto solo lista los turnos que abren ese día de la semana.
 */
export function dayTile(
  date: string,
  today: string,
  shifts: readonly ShiftResponse[],
  closures: ReadonlySet<string>,
  rows: readonly AdminReservation[],
  tableCount: number,
): DayTile {
  const base = { date, isToday: date === today, isPast: date < today };
  if (closures.has(date)) {
    return { ...base, closed: true, shifts: [], reservations: 0, guests: 0, pending: 0 };
  }
  const active = rows.filter(isActive);
  return {
    ...base,
    closed: false,
    shifts: shifts
      .filter((shift) => opensOn(shift, date))
      .sort(byStart)
      .map((shift) => shiftLoad(rows, shift, tableCount)),
    reservations: active.length,
    guests: active.reduce((total, row) => total + (row.partySize ?? 0), 0),
    pending: active.filter((row) => row.status === 'PENDING').length,
  };
}

/**
 * Tarjeta de un día con lo que trae el resumen de la semana del servidor, en vez de las reservas del día. Mismo
 * resultado que `dayTile`: un día cerrado no lleva turnos; uno abierto, los que abren ese día de la semana, y las
 * cifras del día suman las de sus turnos.
 */
export function summaryTile(
  day: WeekSummaryDay,
  today: string,
  shifts: readonly ShiftResponse[],
  tableCount: number,
): DayTile {
  const date = day.date ?? '';
  const base = { date, isToday: date === today, isPast: date < today };
  if (day.closed) {
    return { ...base, closed: true, shifts: [], reservations: 0, guests: 0, pending: 0 };
  }
  const loads = shifts
    .filter((shift) => opensOn(shift, date))
    .sort(byStart)
    .map((shift) => summaryShiftLoad(day, shift, tableCount));
  return {
    ...base,
    closed: false,
    shifts: loads,
    reservations: loads.reduce((total, load) => total + load.reservations, 0),
    guests: loads.reduce((total, load) => total + load.guests, 0),
    pending: loads.reduce((total, load) => total + load.pending, 0),
  };
}
