import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, Subscription, catchError, map, of, switchMap } from 'rxjs';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { PlanResponse } from '../../core/api/models/plan-response';
import { ShiftResponse } from '../../core/api/models/shift-response';
import { TableSuggestion } from '../../core/api/models/table-suggestion';
import { AdminPlanControllerService } from '../../core/api/services/admin-plan-controller.service';
import { AdminReservationControllerService } from '../../core/api/services/admin-reservation-controller.service';
import { AdminRestaurantControllerService } from '../../core/api/services/admin-restaurant-controller.service';
import { NOW, todayIn } from '../../core/time';
import { toRoom, toTable } from '../../plano/plan-mapping';
import { PlanoTable, TableState } from '../../plano/plano.component';
import { tableName } from '../../plano/table-name';
import { knownTheme } from '../../plano/themes';
import { opensOn } from '../shift-days';
import { PendingReservationsService } from './pending-reservations.service';
import { ActionHost, QuestionKind, ReservationActions } from './reservation-actions';

export type { Question, QuestionKind } from './reservation-actions';

export type PageStatus = 'loading' | 'ready' | 'notFound' | 'error';
export type Tab = 'day' | 'pending';

/** Rango de años que acepta el backend (`SupportedDateValidator`). */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const INVALID_DATE_MESSAGE = 'Elige una fecha válida.';

/** `YYYY-MM-DD` que existe en el calendario (rechaza `2026-13-45` y `2026-02-30`) y que el backend acepta. */
export function isRealDate(isoDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return false;
  }
  const [year, month, day] = match.slice(1).map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return false;
  }
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Orden de la lista: por hora de llegada; las que no tienen hora (anteriores a V5) al final. */
function byArrival(a: AdminReservation, b: AdminReservation): number {
  if (a.arrivalTime === undefined || a.arrivalTime === null) {
    return b.arrivalTime === undefined || b.arrivalTime === null ? (a.id ?? 0) - (b.id ?? 0) : 1;
  }
  if (b.arrivalTime === undefined || b.arrivalTime === null) {
    return -1;
  }
  return a.arrivalTime.localeCompare(b.arrivalTime) || (a.id ?? 0) - (b.id ?? 0);
}

function byDateThenArrival(a: AdminReservation, b: AdminReservation): number {
  return (a.date ?? '').localeCompare(b.date ?? '') || byArrival(a, b);
}

function byStart(a: ShiftResponse, b: ShiftResponse): number {
  return (a.start ?? '').localeCompare(b.start ?? '');
}

/**
 * Estado de `/panel/:slug`: reservas de un día y turno, pendientes de todos los días, ocupación del plano y las
 * acciones del dueño. Cada petición de lectura cancela la anterior (`switchMap`); las acciones se encadenan a mano
 * y, pase lo que pase, la pantalla se vuelve a leer del servidor.
 */
@Injectable()
export class ReservationsStore implements ActionHost {
  private readonly plans = inject(AdminPlanControllerService);
  private readonly reservationsApi = inject(AdminReservationControllerService);
  private readonly restaurantApi = inject(AdminRestaurantControllerService);
  private readonly pendingApi = inject(PendingReservationsService);
  private readonly actions = inject(ReservationActions);
  private readonly now = inject(NOW);

  private slug = '';
  private loadRequest: Subscription | undefined;
  /**
   * Asignaciones de mesa en vuelo (las acciones de la reserva, en `ReservationActions`). Cambiar de plano no las
   * cancela: la petición ya salió y el servidor la va a aplicar. Solo se cancelan al cerrar la página.
   */
  private readonly actionRequests = new Subscription();
  /** Cuenta los planos cargados: una acción solo toca la pantalla si sigue siendo la del plano que la lanzó. */
  private view = 0;
  private planReload: Subscription | undefined;
  /** `null` cancela la petición en vuelo sin pedir otra (al cambiar de plano, la respuesta vieja no debe llegar). */
  private readonly dayRequests = new Subject<string | null>();
  /** `false` cancela la petición en vuelo sin pedir otra. */
  private readonly pendingRequests = new Subject<boolean>();
  /** `null` cancela la petición en vuelo sin pedir otra. */
  private readonly occupancyRequests = new Subject<{ date: string; shiftId: number } | null>();
  private readonly suggestionRequests = new Subject<number | null>();

  readonly status = signal<PageStatus>('loading');
  readonly plan = signal<PlanResponse | null>(null);
  readonly tab = signal<Tab>('day');

  readonly date = signal('');
  readonly shiftId = signal<number | null>(null);

  /** Reservas de la fecha (de todos los turnos); `null` mientras se piden. */
  readonly day = signal<AdminReservation[] | null>(null);
  readonly pending = signal<AdminReservation[]>([]);
  readonly loadFailed = signal(false);
  /** Mesas ocupadas en el turno elegido; `null` mientras se pide la ocupación. */
  readonly occupied = signal<ReadonlySet<number> | null>(null);

  // Estado de las acciones sobre una reserva: vive en `ReservationActions`, que comparte con la página de Inicio.
  readonly busy = this.actions.busy;
  readonly error = this.actions.error;
  readonly notice = this.actions.notice;
  readonly whatsappUrl = this.actions.whatsappUrl;
  readonly question = this.actions.question;
  /** Reserva a la que se está eligiendo mesa. */
  readonly assigning = signal<AdminReservation | null>(null);
  readonly suggestions = signal<TableSuggestion[] | null>(null);

  readonly planName = computed(() => this.plan()?.name ?? '');
  readonly theme = computed(() => knownTheme(this.plan()?.theme));
  readonly room = computed(() => toRoom(this.plan()?.room));
  readonly tables = computed<PlanoTable[]>(() => (this.plan()?.tables ?? []).map(toTable));

  /** Turnos de la fecha por hora de inicio; el elegido se muestra aunque el día de la semana no sea suyo. */
  readonly shifts = computed<ShiftResponse[]>(() => {
    const date = this.date();
    if (!date) {
      return [];
    }
    return [...(this.plan()?.shifts ?? [])]
      .filter((shift) => shift.id === this.shiftId() || opensOn(shift, date))
      .sort(byStart);
  });

  /** Reservas del turno elegido, de la fecha elegida. */
  readonly dayRows = computed(() =>
    (this.day() ?? []).filter((item) => item.shiftId === this.shiftId()).sort(byArrival),
  );
  readonly pendingRows = computed(() => [...this.pending()].sort(byDateThenArrival));

  /** Pendiente (gris) o reservada (rojo) según la reserva activa que tiene cada mesa ocupada. */
  readonly tableStates = computed<Record<number, TableState>>(() => {
    const occupied = this.occupied();
    const states: Record<number, TableState> = {};
    if (occupied === null) {
      return states;
    }
    const waiting = new Set(
      (this.day() ?? [])
        .filter((item) => item.status === 'PENDING' && item.shiftId === this.shiftId())
        .map((item) => item.tableId),
    );
    for (const table of this.tables()) {
      if (occupied.has(table.id)) {
        states[table.id] = waiting.has(table.id) ? 'pending' : 'taken';
      }
    }
    return states;
  });

  /** Texto de la pregunta abierta y de su botón de confirmar. */
  readonly questionText = this.actions.questionText;

  constructor() {
    this.actions.attach(this);
    this.dayRequests
      .pipe(
        switchMap((date) =>
          date === null
            ? EMPTY
            : // El `pending()` generado es la lista del día (`?date=`): springdoc nombra las dos variantes del endpoint
              // `pending` y el snapshot se quedó con la de la fecha. Los pendientes de todos los días: PendingReservationsService.
              this.reservationsApi.pending({ slug: this.slug, date }).pipe(
                map((list) => ({ list, failed: false })),
                catchError(() => of({ list: null, failed: true })),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ list, failed }) => {
        this.day.set(list);
        this.loadFailed.set(failed);
      });

    this.pendingRequests
      .pipe(
        switchMap((read) =>
          read
            ? this.pendingApi.list(this.slug).pipe(
                map((list) => ({ list, failed: false })),
                catchError(() => of({ list: null, failed: true })),
              )
            : EMPTY,
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ list, failed }) => {
        // Si falla, los pendientes que ya había se quedan.
        if (list) {
          this.pending.set(list);
        }
        if (failed) {
          this.loadFailed.set(true);
        }
      });

    this.occupancyRequests
      .pipe(
        switchMap((request) =>
          request === null
            ? EMPTY
            : this.restaurantApi.occupancy1({ slug: this.slug, ...request }).pipe(
                map((tables) => ({
                  occupied: new Set(
                    tables.filter((table) => table.occupied).map((table) => table.tableId ?? 0),
                  ),
                  failed: false,
                })),
                catchError(() => of({ occupied: null, failed: true })),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ occupied, failed }) => {
        this.occupied.set(occupied);
        if (failed) {
          this.loadFailed.set(true);
        }
      });

    this.suggestionRequests
      .pipe(
        switchMap((id) =>
          id === null
            ? of(null)
            : this.reservationsApi.suggestions({ id }).pipe(catchError(() => of([]))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((list) => this.suggestions.set(list));

    inject(DestroyRef).onDestroy(() => {
      this.loadRequest?.unsubscribe();
      this.actionRequests.unsubscribe();
      this.planReload?.unsubscribe();
    });
  }

  load(slug: string): void {
    this.slug = slug;
    this.view++;
    this.loadRequest?.unsubscribe();
    this.planReload?.unsubscribe();
    this.status.set('loading');
    this.plan.set(null);
    this.tab.set('day');
    this.day.set(null);
    this.pending.set([]);
    this.occupied.set(null);
    this.loadFailed.set(false);
    this.actions.resetMessages();
    this.cancelAssign();
    this.busy.set(false);
    // Las lecturas del plano anterior que sigan en vuelo no deben pisar la pantalla del nuevo.
    this.dayRequests.next(null);
    this.pendingRequests.next(false);
    this.occupancyRequests.next(null);

    this.loadRequest = this.plans.get({ slug }).subscribe({
      next: (plan) => {
        this.plan.set(plan);
        // "Hoy" es el de la zona del local, no el del navegador.
        this.date.set(todayIn(plan.timeZone, this.now()));
        this.shiftId.set(this.shifts()[0]?.id ?? null);
        this.status.set('ready');
        this.refresh();
      },
      error: (error: HttpErrorResponse) =>
        this.status.set(error.status === 404 ? 'notFound' : 'error'),
    });
  }

  /** Vuelve a leer el plano (mesas y turnos) sin tocar fecha ni turno elegidos. */
  reloadPlan(): void {
    this.planReload?.unsubscribe();
    this.planReload = this.plans.get({ slug: this.slug }).subscribe({
      next: (plan) => this.plan.set(plan),
      // Si falla se queda el plano que había; la próxima recarga lo intenta otra vez.
      error: () => undefined,
    });
  }

  /** Vuelve a leer del servidor la lista del día, los pendientes y la ocupación. */
  refresh(): void {
    this.loadFailed.set(false);
    this.dayRequests.next(this.date());
    this.pendingRequests.next(true);
    this.requestOccupancy(true);
  }

  setTab(tab: Tab): void {
    this.actions.resetMessages();
    // La pregunta vive en la fila de su reserva: al cambiar de pestaña esa fila puede no estar y quedaría escondida.
    this.question.set(null);
    this.tab.set(tab);
  }

  /**
   * Cambia de fecha. Devuelve `false` si el valor no es una fecha válida (campo borrado, mes 13, año fuera de rango):
   * no se pide nada, se avisa, y quien llama debe devolver al campo la fecha que sigue vigente.
   */
  setDate(date: string): boolean {
    if (!isRealDate(date)) {
      this.actions.resetMessages();
      this.error.set(INVALID_DATE_MESSAGE);
      return false;
    }
    if (date === this.date()) {
      return true;
    }
    this.actions.resetMessages();
    this.cancelAssign();
    this.question.set(null);
    this.date.set(date);
    // Se conserva el turno si abre ese día; si no, el primero que abra.
    const open = (this.plan()?.shifts ?? []).filter((shift) => opensOn(shift, date)).sort(byStart);
    if (!open.some((shift) => shift.id === this.shiftId())) {
      this.shiftId.set(open[0]?.id ?? null);
    }
    this.day.set(null);
    this.loadFailed.set(false);
    this.dayRequests.next(date);
    this.requestOccupancy();
    return true;
  }

  selectShift(shiftId: number): void {
    if (shiftId === this.shiftId()) {
      return;
    }
    this.actions.resetMessages();
    this.cancelAssign();
    this.question.set(null);
    this.shiftId.set(shiftId);
    this.requestOccupancy();
  }

  confirm(reservation: AdminReservation): void {
    this.actions.confirm(reservation);
  }

  ask(kind: QuestionKind, reservation: AdminReservation): void {
    this.actions.ask(kind, reservation);
  }

  answerYes(): void {
    this.actions.answerYes();
  }

  dismissQuestion(): void {
    this.actions.dismissQuestion();
  }

  // ActionHost: lo que `ReservationActions` pide a esta página.

  viewToken(): number {
    return this.view;
  }

  messageFallback(reservation: AdminReservation): { restaurantName: string; shiftName: string } {
    return { restaurantName: this.planName(), shiftName: this.shiftName(reservation.shiftId) };
  }

  afterAction(): void {
    this.refresh();
  }

  /** Cierra la elección de mesa solo si es la de esta reserva: la de otra no tiene que ver con lo que acaba de pasar. */
  forget(reservation: AdminReservation): void {
    if (this.assigning()?.id === reservation.id) {
      this.cancelAssign();
    }
  }

  needsTable(reservation: AdminReservation, message: string): void {
    this.startAssign(reservation, message);
  }

  /**
   * Abre la elección de mesa de una reserva. Si es de otra fecha o turno (viene de Pendientes) la vista se mueve
   * a ellos: el plano y su ocupación tienen que ser los del turno de la reserva.
   */
  startAssign(reservation: AdminReservation, message: string | null = null): void {
    // Con una acción en vuelo la página va a recargarse: no se abre otra elección encima.
    if (this.busy()) {
      return;
    }
    this.question.set(null);
    this.actions.resetMessages();
    this.error.set(message);
    this.assigning.set(reservation);
    this.suggestions.set(null);
    this.tab.set('day');
    const date = reservation.date ?? this.date();
    const shiftId = reservation.shiftId ?? this.shiftId();
    const dateChanged = date !== this.date();
    if (dateChanged || shiftId !== this.shiftId()) {
      this.date.set(date);
      this.shiftId.set(shiftId);
      if (dateChanged) {
        this.day.set(null);
        this.dayRequests.next(date);
      }
      this.requestOccupancy();
    }
    this.suggestionRequests.next(reservation.id ?? null);
  }

  cancelAssign(): void {
    this.assigning.set(null);
    this.suggestions.set(null);
    this.suggestionRequests.next(null);
  }

  /** Clic en una mesa del plano mientras se elige mesa. */
  selectTable(tableId: number): void {
    const reservation = this.assigning();
    const table = this.tables().find((candidate) => candidate.id === tableId);
    if (!reservation || !table || this.busy()) {
      return;
    }
    const name = tableName(table.label);
    const partySize = reservation.partySize ?? 0;
    this.actions.resetMessages();
    if (table.id === reservation.tableId) {
      this.notice.set(`${reservation.customerName} ya tiene la ${name.toLowerCase()}.`);
    } else if (this.occupied()?.has(tableId)) {
      this.error.set(`La ${name.toLowerCase()} ya está ocupada en este turno.`);
    } else if (table.seats < partySize) {
      this.error.set(
        `La ${name.toLowerCase()} tiene ${table.seats} plazas y el grupo es de ${partySize}.`,
      );
    } else {
      this.assign(reservation, tableId);
    }
  }

  assign(reservation: AdminReservation, tableId: number): void {
    if (this.busy() || reservation.id === undefined) {
      return;
    }
    this.actions.begin();
    const view = this.view;
    this.actionRequests.add(
      this.reservationsApi.assignTable({ id: reservation.id, body: { tableId } }).subscribe({
        next: (details) => {
          if (view !== this.view) {
            return;
          }
          this.busy.set(false);
          this.cancelAssign();
          this.notice.set(
            `${tableName(details.tableLabel ?? '')} asignada a ${reservation.customerName}.`,
          );
          this.refresh();
        },
        error: (error: HttpErrorResponse) => this.actions.fail(error, reservation, view),
      }),
    );
  }

  shiftName(shiftId: number | undefined): string {
    return this.plan()?.shifts?.find((shift) => shift.id === shiftId)?.name ?? 'Turno';
  }

  /**
   * Pide la ocupación del turno elegido. Al cambiar de fecha o de turno se vacía la anterior (ya no es de esta vista);
   * al releer lo mismo (`keepPrevious`) se conserva hasta que llegue la nueva, para que el plano no parpadee.
   */
  private requestOccupancy(keepPrevious = false): void {
    const shiftId = this.shiftId();
    if (!keepPrevious || shiftId === null) {
      this.occupied.set(null);
    }
    this.occupancyRequests.next(shiftId === null ? null : { date: this.date(), shiftId });
  }
}
