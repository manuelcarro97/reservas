import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { PlanResponse } from '../../core/api/models/plan-response';
import { AdminPlanControllerService } from '../../core/api/services/admin-plan-controller.service';
import { AdminReservationControllerService } from '../../core/api/services/admin-reservation-controller.service';
import { AdminShiftControllerService } from '../../core/api/services/admin-shift-controller.service';
import { NOW, timeIn, todayIn } from '../../core/time';
import { adminErrorMessage } from '../admin-errors';
import { MeStore } from '../me.store';
import { PendingReservationsService } from '../reservations/pending-reservations.service';
import { ActionHost, ReservationActions } from '../reservations/reservation-actions';
import { byDateThenArrival } from '../reservations/reservation-order';
import { NextShift, nextShift, weekStart } from './home-figures';

export type HomeStatus = 'loading' | 'ready' | 'notFound' | 'error';

/** Lecturas que fallan o cargan cada una por su lado. `week` lo usa la tarjeta de la semana. */
export type HomePart = 'today' | 'pending' | 'closures' | 'week';

/** Lo que cuenta como fallo: `next` (reservas del próximo turno, si no es hoy) se muestra junto a las de hoy. */
type FailureKey = HomePart | 'next';

const PUBLISH_FAILED = 'No se pudo publicar el plano. Inténtalo de nuevo.';

/**
 * Estado de `/panel/:slug/inicio`: el plano, las reservas de hoy, las pendientes y los cierres. Cada lectura es
 * independiente: si una falla, solo su tarjeta lo dice. `load` cancela todo lo del plano anterior. Confirmar y
 * rechazar las hace `ReservationActions`, que lo usa como su `ActionHost`.
 */
@Injectable()
export class HomeStore implements ActionHost {
  private readonly plans = inject(AdminPlanControllerService);
  private readonly reservationsApi = inject(AdminReservationControllerService);
  private readonly shiftsApi = inject(AdminShiftControllerService);
  private readonly pendingApi = inject(PendingReservationsService);
  private readonly actions = inject(ReservationActions);
  private readonly me = inject(MeStore);
  private readonly router = inject(Router);
  private readonly now = inject(NOW);

  private slug = '';
  /** Cuenta los planos cargados: una acción solo toca la pantalla si sigue siendo la del plano que la lanzó. */
  private view = 0;
  private planRequest: Subscription | undefined;
  private planReload: Subscription | undefined;
  private readonly publishRequest = new Subscription();
  /** Las lecturas del plano que se ve ahora (sin el plano): `refresh` y `load` las cancelan antes de pedir otras. */
  private reads = new Subscription();
  private nextRequest: Subscription | undefined;
  /** Fecha de las reservas que hay en `nextRows`: si el próximo turno cambia de día no se enseñan las del anterior. */
  private nextRowsDate: string | null = null;
  private readonly failures = new Set<FailureKey>();
  /** Instante de la última lectura: "hoy" y "ahora" se calculan con él, así `refresh` los pone al día. */
  private readonly clock = signal(this.now());

  readonly status = signal<HomeStatus>('loading');
  readonly plan = signal<PlanResponse | null>(null);
  /** Hoy y la hora, en la zona del plano. */
  readonly today = computed(() => todayIn(this.plan()?.timeZone, this.clock()));
  readonly nowTime = computed(() => timeIn(this.plan()?.timeZone, this.clock()));

  /** Reservas de hoy (de todos los estados); `null` mientras se piden. */
  readonly todayRows = signal<AdminReservation[] | null>(null);
  /** Reservas del día del próximo turno si no es hoy; `null` mientras se piden o si el próximo turno es de hoy. */
  readonly nextRows = signal<AdminReservation[] | null>(null);
  /** Pendientes de todos los días. */
  readonly pending = signal<AdminReservation[]>([]);
  readonly closures = signal<ReadonlySet<string>>(new Set());
  readonly partFailed = signal<ReadonlySet<HomePart>>(new Set());
  /** Lecturas que aún no han tenido su primera respuesta (ni buena ni mala). */
  readonly partLoading = signal<ReadonlySet<HomePart>>(new Set());
  /** "Publicar plano" en vuelo y el motivo del último fallo. */
  readonly publishing = signal(false);
  readonly publishError = signal<string | null>(null);

  readonly tableCount = computed(() => this.plan()?.tables?.length ?? 0);
  /** Plazas del plano: lo que cabe en un turno si estuviera lleno. */
  readonly capacity = computed(() =>
    (this.plan()?.tables ?? []).reduce((total, table) => total + (table.seats ?? 0), 0),
  );

  /** Pendientes de hoy y de los días siguientes, por fecha y hora de llegada. Las de días pasados no se enseñan. */
  readonly pendingToday = computed(() =>
    this.pending()
      .filter((reservation) => reservation.date === this.today())
      .sort(byDateThenArrival),
  );
  readonly pendingLater = computed(() =>
    this.pending()
      .filter((reservation) => (reservation.date ?? '') > this.today())
      .sort(byDateThenArrival),
  );

  /** Cierres de hoy en adelante: los de los días ya pasados de la semana no cambian nada. */
  readonly upcomingClosures = computed<ReadonlySet<string>>(
    () => new Set([...this.closures()].filter((date) => date >= this.today())),
  );

  /** Próximo turno que no ha empezado, o `null` si no hay ninguno en la semana que viene. */
  readonly next = computed<NextShift | null>(() =>
    nextShift(this.plan()?.shifts ?? [], this.upcomingClosures(), this.today(), this.nowTime()),
  );

  constructor() {
    this.actions.attach(this);
    inject(DestroyRef).onDestroy(() => {
      this.planRequest?.unsubscribe();
      this.planReload?.unsubscribe();
      this.publishRequest.unsubscribe();
      this.reads.unsubscribe();
    });
  }

  load(slug: string): void {
    this.slug = slug;
    this.view++;
    this.planRequest?.unsubscribe();
    this.planReload?.unsubscribe();
    this.reads.unsubscribe();
    this.reads = new Subscription();
    this.nextRowsDate = null;
    this.failures.clear();
    // Una acción de la pantalla anterior ya no va a contestar aquí: sin esto los botones se quedarían desactivados.
    this.actions.resetMessages();
    this.actions.dismissQuestion();
    this.actions.busy.set(false);
    this.publishing.set(false);
    this.publishError.set(null);
    this.status.set('loading');
    this.plan.set(null);
    this.todayRows.set(null);
    this.nextRows.set(null);
    this.pending.set([]);
    this.closures.set(new Set());
    this.partFailed.set(new Set());
    this.partLoading.set(new Set<HomePart>(['today', 'pending', 'closures']));

    this.planRequest = this.plans.get({ slug }).subscribe({
      next: (plan) => {
        this.plan.set(plan);
        this.status.set('ready');
        this.refresh();
      },
      error: (error: HttpErrorResponse) =>
        this.status.set(error.status === 404 ? 'notFound' : 'error'),
    });
  }

  /** Vuelve a leer todo menos el plano. Lo que ya se tenía se queda en pantalla hasta que llegue lo nuevo. */
  refresh(): void {
    this.reads.unsubscribe();
    this.reads = new Subscription();
    this.clock.set(this.now());
    const slug = this.slug;
    const today = this.today();

    this.read('today', this.reservationsApi.pending({ slug, date: today }), (rows) =>
      this.todayRows.set(rows),
    );
    this.read('pending', this.pendingApi.list(slug), (list) => this.pending.set(list));
    this.read(
      'closures',
      this.shiftsApi.closures({ slug, from: weekStart(today) }),
      (dates) => this.closures.set(new Set(dates)),
      // Qué turno es el próximo depende de los cierres: hasta entonces no se sabe de qué día pedir las reservas.
      () => this.readNextRows(),
    );
  }

  /** Publica el plano (borrador → publicado). Un fallo deja su motivo en `publishError`. */
  publish(): void {
    if (this.publishing()) {
      return;
    }
    const view = this.view;
    this.publishing.set(true);
    this.publishError.set(null);
    this.publishRequest.add(
      this.plans.publish({ slug: this.slug }).subscribe({
        next: (plan) => {
          // El selector de la cabecera pinta Publicado/Borrador desde `MeStore`, aunque la pantalla ya sea otra.
          this.me.refresh();
          if (view === this.view) {
            this.plan.set(plan);
            this.publishing.set(false);
          }
        },
        error: (error: HttpErrorResponse) => {
          if (view === this.view) {
            this.publishing.set(false);
            this.publishError.set(adminErrorMessage(error, PUBLISH_FAILED));
          }
        },
      }),
    );
  }

  // --- ActionHost: lo que `ReservationActions` pide a esta página ---

  viewToken(): number {
    return this.view;
  }

  messageFallback(reservation: AdminReservation): { restaurantName: string; shiftName: string } {
    const shift = this.plan()?.shifts?.find((item) => item.id === reservation.shiftId);
    return { restaurantName: this.plan()?.name ?? '', shiftName: shift?.name ?? '' };
  }

  /** Tras una acción (o su 404/409/422) se vuelve a leer lo de hoy y las pendientes. */
  afterAction(): void {
    this.refresh();
  }

  /** Inicio no tiene nada abierto sobre una reserva (la pregunta de rechazar la cierra `ReservationActions`). */
  forget(): void {
    // Nada que cerrar.
  }

  /** `TABLE_NOT_FOUND`: se vuelve a pedir el plano, sin pasar por "Cargando…" ni tocar las demás lecturas. */
  reloadPlan(): void {
    this.planReload?.unsubscribe();
    this.planReload = this.plans.get({ slug: this.slug }).subscribe({
      next: (plan) => this.plan.set(plan),
      // Si falla se queda el plano que había; la próxima recarga lo intenta otra vez.
      error: () => undefined,
    });
  }

  needsTable(reservation: AdminReservation): void {
    this.chooseTable(reservation);
  }

  /** Elegir mesa para una reserva sin ella se hace en Reservas, con el plano delante. */
  chooseTable(reservation: AdminReservation): void {
    void this.router.navigate(['/panel', this.slug], {
      queryParams: { fecha: reservation.date, reserva: reservation.id },
    });
  }

  /**
   * Lee una parte. `apply` guarda la respuesta; `settled` va después de la respuesta buena o de un fallo, cuando ya
   * se sabe el estado de esa parte.
   */
  private read<T>(
    part: HomePart,
    source: Observable<T>,
    apply: (value: T) => void,
    settled?: () => void,
  ): void {
    this.reads.add(
      source.subscribe({
        next: (value) => {
          apply(value);
          this.answered(part);
          this.markFailed(part, false);
          settled?.();
        },
        error: () => {
          this.answered(part);
          this.markFailed(part, true);
          settled?.();
        },
      }),
    );
  }

  /**
   * Pide las reservas del día del próximo turno cuando no es hoy (las de hoy ya se leen aparte). Se llama tras la
   * respuesta de los cierres: sin ellos no se sabe qué día es el próximo turno.
   */
  private readNextRows(): void {
    this.nextRequest?.unsubscribe();
    const next = this.next();
    this.markFailed('next', false);
    if (!next || next.date === this.today()) {
      this.nextRowsDate = null;
      this.nextRows.set(null);
      return;
    }
    if (next.date !== this.nextRowsDate) {
      this.nextRows.set(null);
    }
    this.nextRowsDate = next.date;
    this.nextRequest = this.reservationsApi
      .pending({ slug: this.slug, date: next.date })
      .subscribe({
        next: (rows) => this.nextRows.set(rows),
        error: () => this.markFailed('next', true),
      });
    this.reads.add(this.nextRequest);
  }

  private answered(part: HomePart): void {
    if (this.partLoading().has(part)) {
      const loading = new Set(this.partLoading());
      loading.delete(part);
      this.partLoading.set(loading);
    }
  }

  private markFailed(key: FailureKey, failed: boolean): void {
    if (failed) {
      this.failures.add(key);
    } else {
      this.failures.delete(key);
    }
    this.partFailed.set(
      new Set([...this.failures].map((item) => (item === 'next' ? 'today' : item))),
    );
  }
}
