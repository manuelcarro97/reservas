/**
 * Horas de llegada de un turno: la rejilla parte del inicio y avanza de 30 en 30 minutos hasta 60 minutos antes del
 * fin, inclusive. Un turno de menos de 60 minutos solo tiene su hora de inicio.
 *
 * Es la misma regla que `ArrivalPolicy.arrivalSlots` del backend
 * (`src/main/java/io/github/manuelcarro97/reservas/domain/service/ArrivalPolicy.java`), que es la fuente de verdad:
 * si cambia allí, cambia aquí. El público recibe las horas del API; esto solo sirve para enseñarle al dueño el rango.
 */
const STEP_MINUTES = 30;
const LAST_ARRIVAL_BEFORE_END_MINUTES = 60;

/** Minutos desde medianoche de una hora `HH:mm` o `HH:mm:ss`. */
function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function hourMinute(totalMinutes: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
}

/** Primera y última hora de llegada de un turno (`HH:mm`). Con una sola hora, `first` y `last` coinciden. */
export function arrivalRange(start: string, end: string): { first: string; last: string } {
  const from = minutesOf(start);
  const lastOffset = Math.max(0, minutesOf(end) - from - LAST_ARRIVAL_BEFORE_END_MINUTES);
  const lastOnGrid = Math.floor(lastOffset / STEP_MINUTES) * STEP_MINUTES;
  return { first: hourMinute(from), last: hourMinute(from + lastOnGrid) };
}
