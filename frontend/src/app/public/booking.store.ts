import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, Subscription, catchError, map, of, switchMap } from 'rxjs';
import { PublicPlanResponse } from '../core/api/models/public-plan-response';
import { ReservationDetails } from '../core/api/models/reservation-details';
import { ShiftAvailability } from '../core/api/models/shift-availability';
import { PublicReservationControllerService } from '../core/api/services/public-reservation-controller.service';
import { toRoom, toTable } from '../plano/plan-mapping';
import { TableState } from '../plano/plano.component';
import { ThemeKey, knownTheme } from '../plano/themes';
import { errorCode, rateLimitedMessage } from '../core/api-errors';
import { NOW, addDays, todayIn } from '../core/time';

/** Días de antelación máximos, inclusive (`BookingPolicy.BOOKING_WINDOW_DAYS` del backend). */
export const BOOKING_WINDOW_DAYS = 90;

export type PlanStatus = 'loading' | 'ready' | 'unavailable' | 'error';

const DEFAULT_PARTY_SIZE = 2;

const ERROR_MESSAGES: Record<string, string> = {
  DATE_IN_PAST: 'Ese turno ya ha empezado. Elige otro.',
  DATE_TOO_FAR: 'Solo se puede reservar con 90 días de antelación como máximo.',
  RESTAURANT_CLOSED: 'El local está cerrado ese día. Elige otra fecha.',
  SHIFT_NOT_OPEN: 'Ese turno no abre ese día. Elige otro.',
  PARTY_TOO_LARGE: 'No hay mesas para un grupo tan grande.',
  TABLE_TOO_SMALL: 'Esa mesa es pequeña para tu grupo. Elige otra.',
  NO_TABLE_AVAILABLE: 'Ya no quedan mesas libres para tu grupo en ese turno. Prueba con otro.',
  PAYLOAD_TOO_LARGE: 'Los datos son demasiado largos. Revísalos.',
};
const GENERIC_ERROR = 'No se pudo completar la reserva. Inténtalo de nuevo.';
const TABLE_TAKEN_MESSAGE = 'Esa mesa se acaba de reservar, elige otra';
const UNAVAILABLE_PLAN_MESSAGE = 'Este plano no está disponible';
const GONE_MESSAGE = 'Ese turno o mesa ya no está disponible, elige otro';
const ARRIVAL_UNAVAILABLE_MESSAGE = 'Esa hora ya no está disponible, elige otra';
/** El backend rechaza la hora elegida (ya pasó o no es del turno): hay que volver a pedir las horas. */
const ARRIVAL_ERROR_CODES = ['ARRIVAL_TIME_PAST', 'INVALID_ARRIVAL_TIME'];
/** El local cambió el modo de reserva con la página abierta: o ya no se elige mesa o ahora hay que elegirla. */
const MODE_CHANGED_CODES = ['TABLE_NOT_ALLOWED', 'TABLE_REQUIRED'];
const MODE_CHANGED_MESSAGE =
  'El local ha cambiado la forma de reservar; revisa tu reserva y vuelve a enviarla.';

/** Las horas llegan como `HH:mm:ss` o `HH:mm`; el store trabaja y envía `HH:mm`. */
function toHourMinute(time: string): string {
  return time.slice(0, 5);
}

/**
 * Estado de la página pública de reserva. Fecha y personas piden los turnos; el turno pide la ocupación del plano
 * (solo en elección libre). Cada petición nueva cancela la anterior (`switchMap`).
 */
@Injectable()
export class BookingStore {
  private readonly api = inject(PublicReservationControllerService);
  private readonly now = inject(NOW);

  private slug = '';
  private planRequest: Subscription | undefined;
  private submitRequest: Subscription | undefined;
  private readonly availabilityRequests = new Subject<{ date: string; partySize: number }>();
  /** `null` cancela la petición en vuelo sin pedir otra. */
  private readonly occupancyRequests = new Subject<{ date: string; shiftId: number } | null>();

  /** "Hoy" en la zona del local; hasta tener el plan, el del navegador. */
  readonly today = signal(todayIn(undefined, this.now()));
  readonly maxDate = computed(() => addDays(this.today(), BOOKING_WINDOW_DAYS));

  readonly status = signal<PlanStatus>('loading');
  readonly plan = signal<PublicPlanResponse | null>(null);

  readonly date = signal(this.today());
  readonly partySize = signal(DEFAULT_PARTY_SIZE);
  /** `null` mientras se piden los turnos. */
  readonly shifts = signal<ShiftAvailability[] | null>(null);
  readonly shiftsFailed = signal(false);
  readonly shiftId = signal<number | null>(null);
  /** Hora de llegada elegida (`HH:mm`) dentro del turno elegido. */
  readonly arrivalTime = signal<string | null>(null);
  /** Mesas ocupadas en el turno elegido; `null` mientras se pide la ocupación. */
  readonly occupied = signal<ReadonlySet<number> | null>(null);
  readonly occupancyFailed = signal(false);
  readonly tableId = signal<number | null>(null);

  readonly customerName = signal('');
  readonly customerPhone = signal('');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly reservation = signal<ReservationDetails | null>(null);

  readonly theme = computed<ThemeKey>(() => knownTheme(this.plan()?.theme));
  readonly room = computed(() => toRoom(this.plan()?.room));
  readonly tables = computed(() => (this.plan()?.tables ?? []).map(toTable));
  readonly freeChoice = computed(() => this.plan()?.bookingMode === 'FREE_CHOICE');
  readonly isDemo = computed(() => this.plan()?.slug === 'demo');

  /** Mesa más grande del plano: es el tope de personas que acepta el backend (`PARTY_TOO_LARGE`). */
  readonly maxPartySize = computed(() => Math.max(1, ...this.tables().map((table) => table.seats)));

  /** Lo que el cliente no puede elegir (ocupada o pequeña para el grupo) va como `blocked`. `taken` no se usa. */
  readonly tableStates = computed<Record<number, TableState>>(() => {
    const occupied = this.occupied();
    const selected = this.tableId();
    const states: Record<number, TableState> = {};
    if (occupied === null) {
      return states;
    }
    for (const table of this.tables()) {
      if (occupied.has(table.id) || table.seats < this.partySize()) {
        states[table.id] = 'blocked';
      } else if (table.id === selected) {
        states[table.id] = 'selected';
      }
    }
    return states;
  });

  /** Horas de llegada que ofrece el turno elegido (el backend ya descarta las pasadas). */
  readonly arrivalTimes = computed(() => {
    const shift = this.shifts()?.find((candidate) => candidate.shiftId === this.shiftId());
    return (shift?.arrivalTimes ?? []).map(toHourMinute);
  });

  readonly selectedTable = computed(
    () => this.tables().find((table) => table.id === this.tableId()) ?? null,
  );

  readonly canSubmit = computed(
    () =>
      this.status() === 'ready' &&
      !this.submitting() &&
      this.shiftId() !== null &&
      this.arrivalTime() !== null &&
      (!this.freeChoice() || this.tableId() !== null) &&
      this.customerName().trim() !== '' &&
      this.customerPhone().trim() !== '',
  );

  constructor() {
    this.availabilityRequests
      .pipe(
        switchMap((request) =>
          this.api.availability({ slug: this.slug, ...request }).pipe(
            map((shifts) => ({ shifts, failed: false })),
            catchError(() => of({ shifts: [] as ShiftAvailability[], failed: true })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ shifts, failed }) => {
        this.shifts.set(shifts);
        this.shiftsFailed.set(failed);
      });

    this.occupancyRequests
      .pipe(
        switchMap((request) =>
          request === null
            ? EMPTY
            : this.api.occupancy({ slug: this.slug, ...request }).pipe(
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
        this.occupancyFailed.set(failed);
      });

    inject(DestroyRef).onDestroy(() => {
      this.planRequest?.unsubscribe();
      this.submitRequest?.unsubscribe();
    });
  }

  load(slug: string): void {
    this.slug = slug;
    this.planRequest?.unsubscribe();
    this.submitRequest?.unsubscribe();
    this.status.set('loading');
    this.plan.set(null);
    this.date.set(this.today());
    this.partySize.set(DEFAULT_PARTY_SIZE);
    this.customerName.set('');
    this.customerPhone.set('');
    this.error.set(null);
    this.reservation.set(null);
    this.submitting.set(false);
    this.clearShifts();

    this.planRequest = this.api.plan({ slug }).subscribe({
      next: (plan) => {
        this.plan.set(plan);
        this.today.set(todayIn(plan.timeZone, this.now()));
        this.date.set(this.today());
        this.partySize.set(Math.min(DEFAULT_PARTY_SIZE, this.maxPartySize()));
        this.status.set('ready');
        this.requestShifts();
      },
      error: (error: HttpErrorResponse) =>
        this.status.set(error.status === 404 ? 'unavailable' : 'error'),
    });
  }

  setDate(date: string): void {
    // Un valor vacío o fuera de la ventana (campo a medio escribir) no pide nada.
    if (
      this.submitting() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date < this.today() ||
      date > this.maxDate()
    ) {
      return;
    }
    this.date.set(date);
    this.requestShifts();
  }

  setPartySize(partySize: number): void {
    if (
      this.submitting() ||
      !Number.isInteger(partySize) ||
      partySize < 1 ||
      partySize > this.maxPartySize()
    ) {
      return;
    }
    this.partySize.set(partySize);
    this.requestShifts();
  }

  selectShift(shiftId: number): void {
    const shift = this.shifts()?.find((candidate) => candidate.shiftId === shiftId);
    // Pulsar el turno ya elegido no repite nada, salvo que la ocupación haya fallado: así se puede reintentar.
    if (
      this.submitting() ||
      !shift?.available ||
      (this.shiftId() === shiftId && !this.occupancyFailed())
    ) {
      return;
    }
    // Pulsar el mismo turno para reintentar la ocupación no borra la hora elegida; cambiar de turno sí.
    if (this.shiftId() !== shiftId) {
      this.arrivalTime.set(null);
    }
    this.shiftId.set(shiftId);
    this.tableId.set(null);
    this.error.set(null);
    this.requestOccupancy();
  }

  selectArrivalTime(time: string): void {
    if (this.submitting() || !this.arrivalTimes().includes(time)) {
      return;
    }
    this.arrivalTime.set(time);
    this.error.set(null);
  }

  selectTable(tableId: number): void {
    const known = this.tables().some((table) => table.id === tableId);
    if (
      this.submitting() ||
      !known ||
      this.occupied() === null ||
      this.tableStates()[tableId] === 'blocked'
    ) {
      return;
    }
    this.tableId.set(tableId);
    this.error.set(null);
  }

  submit(): void {
    const shiftId = this.shiftId();
    const arrivalTime = this.arrivalTime();
    if (!this.canSubmit() || shiftId === null || arrivalTime === null) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const tableId = this.freeChoice() ? this.tableId() : null;
    this.submitRequest = this.api
      .create({
        slug: this.slug,
        body: {
          date: this.date(),
          shiftId,
          arrivalTime,
          partySize: this.partySize(),
          customerName: this.customerName().trim(),
          customerPhone: this.customerPhone().trim(),
          ...(tableId === null ? {} : { tableId }),
        },
      })
      .subscribe({
        next: (reservation) => {
          this.submitting.set(false);
          this.reservation.set(reservation);
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          this.handleSubmitError(error);
        },
      });
  }

  private handleSubmitError(error: HttpErrorResponse): void {
    const code = errorCode(error);
    if (error.status === 404 && code === 'RESTAURANT_NOT_FOUND') {
      this.error.set(UNAVAILABLE_PLAN_MESSAGE);
    } else if (error.status === 404) {
      // Turno o mesa que ya no existen (SHIFT_NOT_FOUND, TABLE_NOT_FOUND): se recargan los turnos de la fecha.
      this.requestShifts();
      this.error.set(GONE_MESSAGE);
    } else if (code && ARRIVAL_ERROR_CODES.includes(code)) {
      // La hora ya pasó o dejó de ser del turno: se piden las horas de nuevo y se elige otra.
      this.requestShifts();
      this.error.set(ARRIVAL_UNAVAILABLE_MESSAGE);
    } else if (error.status === 429) {
      this.error.set(rateLimitedMessage(error));
    } else if (code === 'TABLE_TAKEN') {
      // Otro cliente se la llevó: se pide la ocupación de nuevo y se vuelve a elegir mesa.
      this.tableId.set(null);
      this.error.set(TABLE_TAKEN_MESSAGE);
      this.requestOccupancy();
    } else if (code && MODE_CHANGED_CODES.includes(code)) {
      // El local cambió entre elegir mesa y que el servidor decida: se vuelve a leer el plano, sin tocar lo escrito.
      this.error.set(MODE_CHANGED_MESSAGE);
      this.reloadPlan();
    } else {
      this.error.set((code && ERROR_MESSAGES[code]) || GENERIC_ERROR);
    }
  }

  /**
   * Vuelve a leer el plano público sin vaciar el formulario: nombre, teléfono, fecha, personas, turno y hora se quedan.
   * Solo cambia lo que depende del modo de reserva: la mesa elegida ya no vale y, si el cliente ahora elige mesa, se pide
   * la ocupación del turno; si ya no la elige, se descarta.
   */
  private reloadPlan(): void {
    this.planRequest?.unsubscribe();
    this.planRequest = this.api.plan({ slug: this.slug }).subscribe({
      next: (plan) => {
        this.plan.set(plan);
        this.tableId.set(null);
        this.occupied.set(null);
        this.occupancyFailed.set(false);
        this.occupancyRequests.next(null);
        this.requestOccupancy();
      },
      // Sin el plano nuevo se queda el que había: el aviso ya está puesto y el siguiente envío lo vuelve a intentar.
      error: (error: HttpErrorResponse) => {
        if (error.status === 404) {
          this.status.set('unavailable');
        }
      },
    });
  }

  private clearShifts(): void {
    this.shifts.set(null);
    this.shiftsFailed.set(false);
    this.shiftId.set(null);
    this.arrivalTime.set(null);
    this.occupied.set(null);
    this.occupancyFailed.set(false);
    this.tableId.set(null);
    this.occupancyRequests.next(null);
  }

  /** Fecha o personas cambiadas: los turnos, la ocupación y la mesa elegida ya no valen. */
  private requestShifts(): void {
    this.clearShifts();
    this.error.set(null);
    this.availabilityRequests.next({ date: this.date(), partySize: this.partySize() });
  }

  private requestOccupancy(): void {
    const shiftId = this.shiftId();
    if (!this.freeChoice() || shiftId === null) {
      return;
    }
    this.occupied.set(null);
    this.occupancyFailed.set(false);
    this.occupancyRequests.next({ date: this.date(), shiftId });
  }
}
