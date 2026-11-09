import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { PlanResponse } from '../../core/api/models/plan-response';
import { AdminPlanControllerService } from '../../core/api/services/admin-plan-controller.service';
import { AdminReservationControllerService } from '../../core/api/services/admin-reservation-controller.service';
import { AdminShiftControllerService } from '../../core/api/services/admin-shift-controller.service';
import { NOW, timeIn, todayIn } from '../../core/time';
import { PendingReservationsService } from '../reservations/pending-reservations.service';
import { byDateThenArrival } from '../reservations/reservation-order';
import { NextShift, nextShift, weekStart } from './home-figures';

export type HomeStatus = 'loading' | 'ready' | 'notFound' | 'error';

/** Lecturas que fallan o cargan cada una por su lado. `week` lo usa la tarjeta de la semana. */
export type HomePart = 'today' | 'pending' | 'closures' | 'week';

/** Lo que cuenta como fallo: `next` (reservas del próximo turno, si no es hoy) se muestra junto a las de hoy. */
type FailureKey = HomePart | 'next';

/**
 * Estado de `/panel/:slug/inicio`: el plano, las reservas de hoy, las pendientes y los cierres. Cada lectura es
 * independiente: si una falla, solo su tarjeta lo dice. `load` cancela todo lo del plano anterior.
 */
@Injectable()
export class HomeStore {
  private readonly plans = inject(AdminPlanControllerService);
  private readonly reservationsApi = inject(AdminReservationControllerService);
  private readonly shiftsApi = inject(AdminShiftControllerService);
  private readonly pendingApi = inject(PendingReservationsService);
  private readonly now = inject(NOW);

  private slug = '';
  private planRequest: Subscription | undefined;
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
    inject(DestroyRef).onDestroy(() => {
      this.planRequest?.unsubscribe();
      this.reads.unsubscribe();
    });
  }

  load(slug: string): void {
    this.slug = slug;
    this.planRequest?.unsubscribe();
    this.reads.unsubscribe();
    this.reads = new Subscription();
    this.nextRowsDate = null;
    this.failures.clear();
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
