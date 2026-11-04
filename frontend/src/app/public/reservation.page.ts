import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, catchError, map, of, switchMap } from 'rxjs';
import { EmbedMode } from '../core/embed-mode';
import { ReservationDetails } from '../core/api/models/reservation-details';
import { PublicReservationControllerService } from '../core/api/services/public-reservation-controller.service';
import { THEMES } from '../plano/themes';
import { errorCode, rateLimitedMessage } from './api-errors';
import { PoweredByComponent } from './powered-by.component';

type LookupStatus = 'loading' | 'ready' | 'not-found' | 'error';

type LookupResult =
  { status: 'ready'; reservation: ReservationDetails } | { status: 'not-found' | 'error' };

const STATUS_LABELS: Record<NonNullable<ReservationDetails['status']>, string> = {
  PENDING: 'Pendiente de confirmar',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No presentada',
};

const DEADLINE_PASSED_MESSAGE =
  'Ya ha pasado el plazo para cancelar esta reserva. Si no vas a poder ir, avisa al local.';
const NOT_CANCELLABLE_MESSAGE = 'Esta reserva ya no se puede cancelar.';
const GENERIC_CANCEL_ERROR = 'No se pudo cancelar la reserva. Inténtalo de nuevo.';

/** Página pública `/reserva/:code`: el cliente consulta su reserva con el código y puede cancelarla. */
@Component({
  selector: 'app-reservation-page',
  imports: [PoweredByComponent, RouterLink],
  templateUrl: './reservation.page.html',
  styleUrl: './reservation.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--page]': 'colors().page',
    '[style.--sheet]': 'colors().sheet',
    '[style.--ink]': 'colors().ink',
    '[style.--muted]': 'colors().muted',
    '[style.--line-ui]': 'colors().lineUi',
    '[style.--accent]': 'colors().cushA',
  },
})
export class ReservationPage {
  private readonly api = inject(PublicReservationControllerService);
  private cancelRequest: Subscription | undefined;
  private code = '';

  /** Con `?embed=1` el enlace "Hacer otra reserva" conserva el modo incrustado. */
  protected readonly embedQuery = inject(EmbedMode).embedded ? { embed: 1 } : null;

  protected readonly status = signal<LookupStatus>('loading');
  protected readonly reservation = signal<ReservationDetails | null>(null);
  /** Se está pidiendo confirmación en la página antes de cancelar. */
  protected readonly confirming = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly cancelError = signal<string | null>(null);
  /** El backend ya dijo que pasó el plazo: el botón no se ofrece más. */
  protected readonly deadlinePassed = signal(false);

  /** Tema del plano de la reserva; mientras no hay reserva (cargando, no encontrada), el de un plano nuevo. */
  protected readonly colors = computed(() => THEMES[this.reservation()?.theme ?? 'AZUL']);

  /** `Cena · 20:00–22:00`; las horas llegan como `HH:mm:ss` o `HH:mm`. */
  protected readonly shiftLabel = computed(() => {
    const reservation = this.reservation();
    const start = reservation?.shiftStart?.slice(0, 5);
    const end = reservation?.shiftEnd?.slice(0, 5);
    return [reservation?.shiftName, start && end ? `${start}–${end}` : start]
      .filter(Boolean)
      .join(' · ');
  });

  protected readonly statusLabel = computed(() => {
    const status = this.reservation()?.status;
    return status ? STATUS_LABELS[status] : '';
  });

  /** `YYYY-MM-DD` como fecha de calendario: en UTC para que la zona del navegador no la mueva de día. */
  protected readonly dateLabel = computed(() => {
    const date = this.reservation()?.date;
    if (!date) {
      return '';
    }
    return new Date(`${date}T00:00:00Z`).toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  });

  protected readonly canCancel = computed(() => {
    const status = this.reservation()?.status;
    return (status === 'PENDING' || status === 'CONFIRMED') && !this.deadlinePassed();
  });

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(
        map((params) => params.get('code') ?? ''),
        switchMap((code) => {
          this.reset(code);
          return this.api.byCode({ code }).pipe(
            map((reservation): LookupResult => ({ status: 'ready', reservation })),
            catchError((error: HttpErrorResponse) =>
              of<LookupResult>({ status: error.status === 404 ? 'not-found' : 'error' }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.reservation.set(result.status === 'ready' ? result.reservation : null);
        this.status.set(result.status);
      });

    inject(DestroyRef).onDestroy(() => this.cancelRequest?.unsubscribe());
  }

  protected askConfirmation(): void {
    this.cancelError.set(null);
    this.confirming.set(true);
  }

  protected keepReservation(): void {
    this.confirming.set(false);
  }

  protected cancel(): void {
    if (this.cancelling()) {
      return;
    }
    this.cancelling.set(true);
    this.cancelError.set(null);
    this.cancelRequest = this.api.cancel({ code: this.code }).subscribe({
      next: (reservation) => {
        this.cancelling.set(false);
        this.confirming.set(false);
        this.reservation.set(reservation);
      },
      error: (error: HttpErrorResponse) => {
        this.cancelling.set(false);
        this.confirming.set(false);
        this.handleCancelError(error);
      },
    });
  }

  private handleCancelError(error: HttpErrorResponse): void {
    const code = errorCode(error);
    if (error.status === 404 && code === 'RESERVATION_NOT_FOUND') {
      this.reservation.set(null);
      this.status.set('not-found');
    } else if (error.status === 429) {
      this.cancelError.set(rateLimitedMessage(error));
    } else if (code === 'CANCELLATION_DEADLINE_PASSED') {
      this.deadlinePassed.set(true);
      this.cancelError.set(DEADLINE_PASSED_MESSAGE);
    } else if (code === 'INVALID_TRANSITION') {
      this.cancelError.set(NOT_CANCELLABLE_MESSAGE);
    } else {
      this.cancelError.set(GENERIC_CANCEL_ERROR);
    }
  }

  /** Código nuevo en la ruta: se descarta todo lo de la reserva anterior. */
  private reset(code: string): void {
    this.code = code;
    this.cancelRequest?.unsubscribe();
    this.status.set('loading');
    this.reservation.set(null);
    this.confirming.set(false);
    this.cancelling.set(false);
    this.cancelError.set(null);
    this.deadlinePassed.set(false);
  }
}
