import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, Subscription, catchError, map, of, switchMap } from 'rxjs';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { PlanResponse } from '../../core/api/models/plan-response';
import { ReservationDetails } from '../../core/api/models/reservation-details';
import { ShiftResponse } from '../../core/api/models/shift-response';
import { TableSuggestion } from '../../core/api/models/table-suggestion';
import { AdminPlanControllerService } from '../../core/api/services/admin-plan-controller.service';
import { AdminReservationControllerService } from '../../core/api/services/admin-reservation-controller.service';
import { AdminRestaurantControllerService } from '../../core/api/services/admin-restaurant-controller.service';
import { PublicReservationControllerService } from '../../core/api/services/public-reservation-controller.service';
import { errorCode } from '../../core/api-errors';
import { PlanoTable, TableState } from '../../plano/plano.component';
import { knownTheme } from '../../plano/themes';
import { NOW, toRoom, toTable, todayIn } from '../../public/booking.store';
import { adminErrorMessage } from '../admin-errors';
import { PendingReservationsService } from './pending-reservations.service';
import {
  MessageKind,
  OPEN_WINDOW,
  canWhatsapp,
  formatDate,
  reservationMessage,
  whatsappLink,
} from './whatsapp';

export type PageStatus = 'loading' | 'ready' | 'notFound' | 'error';
export type Tab = 'day' | 'pending';

/** Acciones que piden confirmación dentro de la página antes de llamar a la API. */
export type QuestionKind = 'reject' | 'cancel' | 'noShow';

export interface Question {
  kind: QuestionKind;
  reservation: AdminReservation;
}

type ActionKind = 'confirm' | QuestionKind;

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Rango de años que acepta el backend (`SupportedDateValidator`). */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const RATE_LIMITED_MESSAGE = 'Demasiadas acciones seguidas, espera un momento';
const GENERIC_ERROR = 'No se pudo completar la acción. Inténtalo de nuevo.';
const CONFIRM_NEEDS_TABLE = 'Asigna una mesa antes de confirmar.';

/** Errores de las acciones sobre una reserva con texto propio. */
const ERROR_MESSAGES: Record<string, string> = {
  TABLE_REQUIRED: CONFIRM_NEEDS_TABLE,
  TABLE_TAKEN: 'Esa mesa ya está ocupada en este turno. Se ha actualizado el plano.',
  TABLE_TOO_SMALL: 'Esa mesa tiene menos plazas que personas en la reserva.',
  TABLE_NOT_FOUND: 'Esa mesa ya no existe. Se ha actualizado el plano.',
  TABLE_NOT_ALLOWED: 'En este plano las mesas las elige el cliente.',
  INVALID_TRANSITION: 'Esa reserva ya no admite esa acción. Se ha actualizado la lista.',
  CONCURRENT_UPDATE: 'La reserva acaba de cambiar. Se ha actualizado la lista.',
  RESERVATION_NOT_FOUND: 'Esa reserva ya no existe. Se ha actualizado la lista.',
};

const DONE_MESSAGES: Record<ActionKind, (name: string) => string> = {
  confirm: (name) => `Reserva de ${name} confirmada.`,
  reject: (name) => `Reserva de ${name} rechazada.`,
  cancel: (name) => `Reserva de ${name} cancelada.`,
  noShow: (name) => `${name} marcado como no presentado.`,
};

/** Estas respuestas significan que la reserva ya no está como la página la tenía: se cierra la asignación. */
const STALE_RESERVATION_CODES = [
  'RESERVATION_NOT_FOUND',
  'INVALID_TRANSITION',
  'CONCURRENT_UPDATE',
];

/** Nombre de la mesa para frases: "Mesa 3", o el nombre tal cual si ya empieza por "mesa". */
export function tableName(label: string): string {
  const text = label.trim();
  return /^mesa\b/i.test(text) ? text : `Mesa ${text}`;
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

/** Día de la semana (`MONDAY`…) de un `YYYY-MM-DD`; con componentes locales, sin `Date` de ISO (sería UTC). */
function weekdayOf(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
}

function byStart(a: ShiftResponse, b: ShiftResponse): number {
  return (a.start ?? '').localeCompare(b.start ?? '');
}

function opensOn(shift: ShiftResponse, isoDate: string): boolean {
  const weekday = weekdayOf(isoDate);
  return shift.days?.some((day) => day === weekday) ?? false;
}

/**
 * Estado de `/panel/:slug`: reservas de un día y turno, pendientes de todos los días, ocupación del plano y las
 * acciones del dueño. Cada petición de lectura cancela la anterior (`switchMap`); las acciones se encadenan a mano
 * y, pase lo que pase, la pantalla se vuelve a leer del servidor.
 */
@Injectable()
export class ReservationsStore {
  private readonly plans = inject(AdminPlanControllerService);
  private readonly publicApi = inject(PublicReservationControllerService);
  private readonly reservationsApi = inject(AdminReservationControllerService);
  private readonly restaurantApi = inject(AdminRestaurantControllerService);
  private readonly pendingApi = inject(PendingReservationsService);
  private readonly openWindow = inject(OPEN_WINDOW);
  private readonly now = inject(NOW);

  private slug = '';
  private loadRequest: Subscription | undefined;
  private actionRequest: Subscription | undefined;
  private readonly dayRequests = new Subject<string>();
  private readonly pendingRequests = new Subject<void>();
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

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly question = signal<Question | null>(null);
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
  readonly questionText = computed(() => {
    const question = this.question();
    if (!question) {
      return null;
    }
    const name = question.reservation.customerName ?? '';
    switch (question.kind) {
      case 'reject':
        return { text: `¿Rechazar la reserva de ${name}?`, yes: 'Sí, rechazar' };
      case 'cancel':
        return { text: `¿Cancelar la reserva de ${name}?`, yes: 'Sí, cancelar' };
      case 'noShow':
        return { text: `¿Marcar a ${name} como no presentado?`, yes: 'Sí, no se presentó' };
    }
  });

  constructor() {
    this.dayRequests
      .pipe(
        switchMap((date) =>
          // El `pending()` generado es la lista del día (`?date=`): springdoc nombra las dos variantes del endpoint
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
        switchMap(() =>
          this.pendingApi.list(this.slug).pipe(
            map((list) => ({ list, failed: false })),
            catchError(() => of({ list: null, failed: true })),
          ),
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
      this.actionRequest?.unsubscribe();
    });
  }

  load(slug: string): void {
    this.slug = slug;
    this.loadRequest?.unsubscribe();
    this.actionRequest?.unsubscribe();
    this.status.set('loading');
    this.plan.set(null);
    this.tab.set('day');
    this.day.set(null);
    this.pending.set([]);
    this.occupied.set(null);
    this.loadFailed.set(false);
    this.resetMessages();
    this.cancelAssign();
    this.busy.set(false);
    this.occupancyRequests.next(null);

    this.loadRequest = this.plans
      .get({ slug })
      .pipe(
        // El plano del dueño no trae la zona horaria; solo la trae el público, y solo si está publicado. Si no se
        // puede leer, "hoy" es el del navegador.
        switchMap((plan) =>
          plan.status === 'PUBLISHED'
            ? this.publicApi.plan({ slug }).pipe(
                map((published) => published.timeZone),
                catchError(() => of(undefined)),
                map((timeZone) => ({ plan, timeZone })),
              )
            : of({ plan, timeZone: undefined }),
        ),
      )
      .subscribe({
        next: ({ plan, timeZone }) => {
          this.plan.set(plan);
          this.date.set(todayIn(timeZone, this.now()));
          this.shiftId.set(this.shifts()[0]?.id ?? null);
          this.status.set('ready');
          this.refresh();
        },
        error: (error: HttpErrorResponse) =>
          this.status.set(error.status === 404 ? 'notFound' : 'error'),
      });
  }

  /** Vuelve a leer del servidor la lista del día, los pendientes y la ocupación. */
  refresh(): void {
    this.loadFailed.set(false);
    this.dayRequests.next(this.date());
    this.pendingRequests.next();
    this.requestOccupancy();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  setDate(date: string): void {
    const year = Number(date.slice(0, 4));
    // Un valor vacío o a medio escribir no pide nada.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || year < MIN_YEAR || year > MAX_YEAR) {
      return;
    }
    if (date === this.date()) {
      return;
    }
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
  }

  selectShift(shiftId: number): void {
    if (shiftId === this.shiftId()) {
      return;
    }
    this.cancelAssign();
    this.question.set(null);
    this.shiftId.set(shiftId);
    this.requestOccupancy();
  }

  confirm(reservation: AdminReservation): void {
    if (reservation.tableId === undefined || reservation.tableId === null) {
      // En modo asignado la reserva llega sin mesa: hay que elegirla antes de confirmar.
      this.startAssign(reservation, CONFIRM_NEEDS_TABLE);
      return;
    }
    this.run(reservation, 'confirm');
  }

  ask(kind: QuestionKind, reservation: AdminReservation): void {
    this.resetMessages();
    this.question.set({ kind, reservation });
  }

  answerYes(): void {
    const question = this.question();
    this.question.set(null);
    if (question) {
      this.run(question.reservation, question.kind);
    }
  }

  dismissQuestion(): void {
    this.question.set(null);
  }

  /**
   * Abre la elección de mesa de una reserva. Si es de otra fecha o turno (viene de Pendientes) la vista se mueve
   * a ellos: el plano y su ocupación tienen que ser los del turno de la reserva.
   */
  startAssign(reservation: AdminReservation, message: string | null = null): void {
    this.question.set(null);
    this.resetMessages();
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
    this.resetMessages();
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
    this.begin();
    this.actionRequest = this.reservationsApi
      .assignTable({ id: reservation.id, body: { tableId } })
      .subscribe({
        next: (details) => {
          this.busy.set(false);
          this.cancelAssign();
          this.notice.set(
            `${tableName(details.tableLabel ?? '')} asignada a ${reservation.customerName}.`,
          );
          this.refresh();
        },
        error: (error: HttpErrorResponse) => this.fail(error, reservation),
      });
  }

  private run(reservation: AdminReservation, kind: ActionKind): void {
    const id = reservation.id;
    if (this.busy() || id === undefined) {
      return;
    }
    this.begin();
    const call =
      kind === 'confirm'
        ? this.reservationsApi.confirm({ id })
        : kind === 'noShow'
          ? this.reservationsApi.markNoShow({ id })
          : this.reservationsApi.cancel1({ id });
    this.actionRequest = call.subscribe({
      next: (details) => {
        this.busy.set(false);
        this.cancelAssign();
        this.notice.set(DONE_MESSAGES[kind](reservation.customerName ?? ''));
        this.refresh();
        // Al no presentado no se le escribe.
        if (kind !== 'noShow') {
          this.openWhatsapp(kind, reservation, details);
        }
      },
      error: (error: HttpErrorResponse) => this.fail(error, reservation),
    });
  }

  /** Abre WhatsApp con el mensaje al cliente; sin un teléfono real (cuenta demo) no hay enlace. */
  private openWhatsapp(
    kind: MessageKind,
    reservation: AdminReservation,
    details: ReservationDetails,
  ): void {
    const phone = reservation.customerPhone ?? '';
    if (!canWhatsapp(phone)) {
      return;
    }
    const date = details.date ?? reservation.date ?? '';
    const text = reservationMessage(kind, {
      customerName: reservation.customerName ?? '',
      restaurantName: details.restaurantName ?? this.planName(),
      date,
      shiftName: details.shiftName ?? this.shiftName(reservation.shiftId),
      arrivalTime: details.arrivalTime ?? reservation.arrivalTime,
      code: details.code ?? reservation.code ?? '',
    });
    this.openWindow(whatsappLink(phone, text));
  }

  shiftName(shiftId: number | undefined): string {
    return this.plan()?.shifts?.find((shift) => shift.id === shiftId)?.name ?? 'Turno';
  }

  /** "21:30 · Cena", o solo "Cena" si la reserva no tiene hora (anterior a V5). En Pendientes lleva delante la fecha. */
  whenText(reservation: AdminReservation, withDate: boolean): string {
    const parts = [
      withDate && reservation.date ? formatDate(reservation.date) : null,
      reservation.arrivalTime ? reservation.arrivalTime.slice(0, 5) : null,
      this.shiftName(reservation.shiftId),
    ];
    return parts.filter((part) => part !== null).join(' · ');
  }

  private begin(): void {
    this.resetMessages();
    this.busy.set(true);
  }

  private resetMessages(): void {
    this.error.set(null);
    this.notice.set(null);
  }

  /** Una acción falló: se muestra el motivo y, si el servidor vio otra cosa que la página, se vuelve a leer todo. */
  private fail(error: HttpErrorResponse, reservation: AdminReservation): void {
    this.busy.set(false);
    const code = errorCode(error);
    if (error.status === 429) {
      this.error.set(RATE_LIMITED_MESSAGE);
      return;
    }
    if (code === 'TABLE_REQUIRED') {
      this.startAssign(reservation, CONFIRM_NEEDS_TABLE);
    } else {
      this.error.set((code && ERROR_MESSAGES[code]) || adminErrorMessage(error, GENERIC_ERROR));
    }
    if (code && STALE_RESERVATION_CODES.includes(code)) {
      this.cancelAssign();
    }
    if (error.status === 404 || error.status === 409 || error.status === 422) {
      this.refresh();
    }
  }

  private requestOccupancy(): void {
    const shiftId = this.shiftId();
    this.occupied.set(null);
    this.occupancyRequests.next(shiftId === null ? null : { date: this.date(), shiftId });
  }
}
