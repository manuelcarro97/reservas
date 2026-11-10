import { ShiftResponse } from '../core/api/models/shift-response';

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Día de la semana (`MONDAY`…) de un `YYYY-MM-DD`; con componentes locales, sin `Date` de ISO (sería UTC). */
export function weekdayOf(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
}

/** Si el turno abre el día de la semana de esa fecha. */
export function opensOn(shift: ShiftResponse, isoDate: string): boolean {
  const weekday = weekdayOf(isoDate);
  return shift.days?.some((day) => day === weekday) ?? false;
}
