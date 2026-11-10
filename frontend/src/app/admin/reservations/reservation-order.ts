import { AdminReservation } from '../../core/api/models/admin-reservation';

/** Orden de la lista: por hora de llegada; las que no tienen hora (anteriores a V5) al final. */
export function byArrival(a: AdminReservation, b: AdminReservation): number {
  if (a.arrivalTime === undefined || a.arrivalTime === null) {
    return b.arrivalTime === undefined || b.arrivalTime === null ? (a.id ?? 0) - (b.id ?? 0) : 1;
  }
  if (b.arrivalTime === undefined || b.arrivalTime === null) {
    return -1;
  }
  return a.arrivalTime.localeCompare(b.arrivalTime) || (a.id ?? 0) - (b.id ?? 0);
}

export function byDateThenArrival(a: AdminReservation, b: AdminReservation): number {
  return (a.date ?? '').localeCompare(b.date ?? '') || byArrival(a, b);
}
