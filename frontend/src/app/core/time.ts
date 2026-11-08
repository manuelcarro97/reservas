import { InjectionToken } from '@angular/core';

/** Reloj de la página; los tests lo sustituyen por uno fijo. */
export const NOW = new InjectionToken<() => Date>('NOW', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

/** Fecha de calendario de un `Date` creado con componentes locales, como `YYYY-MM-DD`. */
function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Día de calendario (`YYYY-MM-DD`) que es ahora en `timeZone` (id IANA del local). Sin zona, o si el navegador no la
 * conoce, usa la del navegador. Sin `toISOString()`: es UTC y daría otro día cerca de medianoche.
 */
export function todayIn(timeZone: string | undefined, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return localIsoDate(now);
  }
}

/** `YYYY-MM-DD` más `days` días, en UTC: sin horario de verano que desplace el día. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** `YYYY-MM-DD` como `dd/mm/aaaa`. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}
