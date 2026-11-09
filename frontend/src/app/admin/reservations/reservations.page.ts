import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { formatDate, longDateParts } from '../../core/time';
import { PlanoComponent } from '../../plano/plano.component';
import { tableName } from '../../plano/table-name';
import { STATE_COLORS } from '../../plano/themes';
import { FeedService } from '../notifications/feed.service';
import { dayFigures } from './day-figures';
import { ReservationActions } from './reservation-actions';
import { ReservationsStore } from './reservations.store';

type Status = NonNullable<AdminReservation['status']>;

const STATUS_TEXT: Record<Status, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No presentado',
};

/** Variante del punto de estado (`.dot-state`) de cada estado de la reserva. */
const STATUS_DOT: Record<Status, string> = {
  PENDING: 'pend',
  CONFIRMED: 'conf',
  CANCELLED: 'draft',
  NO_SHOW: 'gone',
};

/**
 * `/panel/:slug`: reservas del día. Fecha y turno eligen qué se ve; el plano muestra la ocupación del turno
 * (pendiente en gris, confirmada en rojo) y la lista permite Confirmar, Rechazar, Cancelar, marcar No presentado y
 * asignar o cambiar mesa. La pregunta de confirmación y la elección de mesa salen dentro de la fila de su reserva.
 * Los datos del cliente salen siempre como texto.
 */
@Component({
  selector: 'app-reservations-page',
  imports: [PlanoComponent, RouterLink],
  providers: [ReservationsStore, ReservationActions],
  templateUrl: './reservations.page.html',
  styleUrl: './reservations.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'rise-stagger' },
})
export class ReservationsPage {
  protected readonly store = inject(ReservationsStore);
  protected readonly tableName = tableName;
  /** Los mismos colores que pinta el plano, para que la leyenda coincida. */
  protected readonly legendColors = STATE_COLORS;
  private slug = '';

  /** La fecha elegida ya está en la zona del plano: se formatea tal cual, sin pasar por el huso del navegador. */
  protected readonly title = computed(() => longDateParts(this.store.date()));

  /** Cifras de la cabecera; `null` mientras se piden las reservas del día. */
  protected readonly figures = computed(() => {
    const day = this.store.day();
    return day === null
      ? null
      : dayFigures(day, this.store.shiftId(), this.store.tables(), this.store.occupied());
  });

  /**
   * Reserva a la que se elige mesa cuando su fila no está en la lista visible (el día aún carga o falló): sin esto no
   * habría dónde salir de la elección, que mantiene interactivo el plano.
   */
  protected readonly hiddenChoice = computed(() => {
    const target = this.store.assigning();
    if (!target) {
      return null;
    }
    const listed =
      this.store.tab() === 'pending'
        ? this.store.pendingRows()
        : this.store.day() === null
          ? []
          : this.store.dayRows();
    return listed.some((reservation) => reservation.id === target.id) ? null : target;
  });

  constructor() {
    // Cambiar de plano desde la cabecera reutiliza esta página: se recarga con cada slug, no solo con el primero.
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.slug = params.get('slug') ?? '';
        this.store.load(this.slug);
      });

    // Sin el marco del panel no hay servicio de avisos (opcional): la página sigue funcionando, sin recarga en vivo.
    inject(FeedService, { optional: true })
      ?.events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        // Mientras carga el plano no hay fecha ni turno que releer: la propia carga ya trae lo último.
        if (event.restaurantSlug === this.slug && this.store.status() === 'ready') {
          this.store.refresh();
        }
      });
  }

  protected retry(): void {
    this.store.load(this.slug);
  }

  protected onDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Un valor que no vale (campo borrado, año imposible) no cambia la fecha del store, y su señal no cambia: sin
    // esto el campo se quedaría mostrando una fecha que la página no está usando.
    if (!this.store.setDate(input.value)) {
      input.value = this.store.date();
    }
  }

  protected statusText(reservation: AdminReservation): string {
    return (reservation.status && STATUS_TEXT[reservation.status]) ?? '';
  }

  protected stateClass(reservation: AdminReservation): string {
    return (reservation.status && STATUS_DOT[reservation.status]) ?? '';
  }

  protected dateText(reservation: AdminReservation): string {
    return reservation.date ? formatDate(reservation.date) : '';
  }

  /** La pregunta abierta es sobre esta reserva. Se compara por id: tras recargar la lista los objetos son otros. */
  protected asksAbout(reservation: AdminReservation): boolean {
    return reservation.id !== undefined && this.store.question()?.reservation.id === reservation.id;
  }

  /** Se está eligiendo mesa para esta reserva. */
  protected isAssigning(reservation: AdminReservation): boolean {
    return reservation.id !== undefined && this.store.assigning()?.id === reservation.id;
  }

  protected tableText(reservation: AdminReservation): string {
    return reservation.tableLabel ? tableName(reservation.tableLabel) : 'Sin mesa';
  }
}
