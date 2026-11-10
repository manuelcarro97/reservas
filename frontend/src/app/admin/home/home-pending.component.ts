import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { calendarLeaf, longDateParts } from '../../core/time';
import { tableName } from '../../plano/table-name';
import { ReservationActions } from '../reservations/reservation-actions';
import { HomeStore } from './home.store';

/** "08:30:00" → "08:30". */
function hourOf(time: string | undefined): string {
  return (time ?? '').slice(0, 5);
}

/**
 * Tarjeta "Pendientes de confirmar" de Inicio: las reservas por confirmar de hoy y de los días siguientes, con
 * Confirmar y Rechazar (los mismos que en Reservas: los hace `ReservationActions`) o Asignar mesa, que se hace en
 * Reservas. En un plano en borrador lleva además el aviso para publicarlo.
 */
@Component({
  selector: 'app-home-pending',
  imports: [RouterLink],
  templateUrl: './home-pending.component.html',
  styleUrl: './home-pending.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `id` y `tabindex`: la cifra Pendientes de arriba lleva aquí el foco.
  host: { class: 'sheet pending', id: 'pendientes', tabindex: '-1' },
})
export class HomePendingComponent {
  protected readonly store = inject(HomeStore);
  protected readonly actions = inject(ReservationActions);

  protected readonly slug = computed(() => this.store.plan()?.slug ?? '');
  protected readonly draft = computed(() => this.store.plan()?.status === 'DRAFT');
  protected readonly total = computed(
    () => this.store.pendingToday().length + this.store.pendingLater().length,
  );

  /** Los dos grupos de la lista; el que no tiene reservas no sale. */
  protected readonly groups = computed(() =>
    [
      { title: 'Hoy', today: true, rows: this.store.pendingToday() },
      { title: 'Próximos días', today: false, rows: this.store.pendingLater() },
    ].filter((group) => group.rows.length > 0),
  );

  /** Hora a la que llega el cliente; las reservas anteriores a V5 no la tienen y salen con la del turno. */
  protected arrival(reservation: AdminReservation): string {
    return hourOf(reservation.arrivalTime) || hourOf(this.shiftOf(reservation)?.start);
  }

  /** Día del mes y día de la semana corto: `13` y `vie`. */
  protected leaf(reservation: AdminReservation): { day: string; weekday: string } {
    const date = reservation.date ?? '';
    return {
      day: calendarLeaf(date).day,
      weekday: longDateParts(date).weekday.slice(0, 3).toLowerCase(),
    };
  }

  /** `turno · personas · mesa`; en los días siguientes el turno lleva la hora de llegada (la fecha ya está en la fila). */
  protected meta(reservation: AdminReservation, today: boolean): string {
    const shift = this.shiftOf(reservation)?.name ?? 'Turno';
    const people = reservation.partySize === 1 ? '1 persona' : `${reservation.partySize} personas`;
    const table = reservation.tableLabel ? tableName(reservation.tableLabel) : 'sin mesa';
    return `${today ? shift : `${shift} ${this.arrival(reservation)}`} · ${people} · ${table}`;
  }

  /** Hora a la que la pendiente de hoy se cancela sola: el inicio de su turno (`PendingExpirationJob`). */
  protected deadline(reservation: AdminReservation): string {
    return hourOf(this.shiftOf(reservation)?.start);
  }

  /** Sin mesa (modo "asigna el local"): no se puede confirmar hasta elegir una. */
  protected hasTable(reservation: AdminReservation): boolean {
    return reservation.tableId !== undefined && reservation.tableId !== null;
  }

  /** La pregunta abierta es sobre esta reserva. Se compara por id: tras recargar la lista los objetos son otros. */
  protected asksAbout(reservation: AdminReservation): boolean {
    return (
      reservation.id !== undefined && this.actions.question()?.reservation.id === reservation.id
    );
  }

  private shiftOf(reservation: AdminReservation) {
    return this.store.plan()?.shifts?.find((shift) => shift.id === reservation.shiftId);
  }
}
