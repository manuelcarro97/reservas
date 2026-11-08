import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { PlanoComponent } from '../../plano/plano.component';
import { ReservationsStore, tableName } from './reservations.store';

const STATUS_TEXT: Record<NonNullable<AdminReservation['status']>, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No presentado',
};

/**
 * `/panel/:slug`: reservas del día. Fecha y turno eligen qué se ve; el plano muestra la ocupación del turno
 * (pendiente en gris, confirmada en rojo) y la lista permite Confirmar, Rechazar, Cancelar, marcar No presentado y
 * asignar o cambiar mesa. Los datos del cliente salen siempre como texto.
 */
@Component({
  selector: 'app-reservations-page',
  imports: [PlanoComponent, RouterLink],
  providers: [ReservationsStore],
  templateUrl: './reservations.page.html',
  styleUrl: './reservations.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationsPage {
  protected readonly store = inject(ReservationsStore);
  protected readonly tableName = tableName;
  private slug = '';

  constructor() {
    // Cambiar de plano desde la cabecera reutiliza esta página: se recarga con cada slug, no solo con el primero.
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.slug = params.get('slug') ?? '';
        this.store.load(this.slug);
      });
  }

  protected retry(): void {
    this.store.load(this.slug);
  }

  protected onDateChange(event: Event): void {
    this.store.setDate((event.target as HTMLInputElement).value);
  }

  protected statusText(reservation: AdminReservation): string {
    return (reservation.status && STATUS_TEXT[reservation.status]) ?? '';
  }

  protected tableText(reservation: AdminReservation): string {
    return reservation.tableLabel ? tableName(reservation.tableLabel) : 'Sin mesa';
  }
}
