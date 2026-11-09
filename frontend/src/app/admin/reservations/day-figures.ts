import { AdminReservation } from '../../core/api/models/admin-reservation';

export interface DayFigures {
  reservations: number;
  guests: number;
  pending: number;
  /** `null` mientras no se conoce la ocupación del turno. */
  freeTables: number | null;
}

/**
 * Cifras de la cabecera de Reservas para el turno elegido. `rows` son las reservas del día ya cargadas (de todos los
 * turnos); solo cuentan las PENDING y CONFIRMED del turno. Las mesas libres son las del plano que no están en `occupied`.
 */
export function dayFigures(
  rows: readonly AdminReservation[],
  shiftId: number | null,
  tables: readonly { id: number }[],
  occupied: ReadonlySet<number> | null,
): DayFigures {
  const active = rows.filter(
    (row) => row.shiftId === shiftId && (row.status === 'PENDING' || row.status === 'CONFIRMED'),
  );
  return {
    reservations: active.length,
    guests: active.reduce((total, row) => total + (row.partySize ?? 0), 0),
    pending: active.filter((row) => row.status === 'PENDING').length,
    freeTables: occupied === null ? null : tables.filter((table) => !occupied.has(table.id)).length,
  };
}
