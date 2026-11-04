import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Subscription, catchError, map, of, switchMap } from 'rxjs';
import { PublicPlanResponse } from '../core/api/models/public-plan-response';
import { ReservationDetails } from '../core/api/models/reservation-details';
import { RoomDto } from '../core/api/models/room-dto';
import { ShiftAvailability } from '../core/api/models/shift-availability';
import { TableDto } from '../core/api/models/table-dto';
import { PublicReservationControllerService } from '../core/api/services/public-reservation-controller.service';
import { Room } from '../plano/geometry';
import { PlanoTable, TableState } from '../plano/plano.component';
import { ThemeKey } from '../plano/themes';

/** Días de antelación máximos, inclusive (`BookingPolicy.BOOKING_WINDOW_DAYS` del backend). */
export const BOOKING_WINDOW_DAYS = 90;

export type PlanStatus = 'loading' | 'ready' | 'unavailable' | 'error';

const DEFAULT_PARTY_SIZE = 2;

const ERROR_MESSAGES: Record<string, string> = {
  TABLE_REQUIRED: 'Elige una mesa en el plano para poder reservar.',
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

/** Fecha de calendario de un `Date` creado con componentes locales, como `YYYY-MM-DD`. Solo para sumar días. */
export function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Reloj de la página; los tests lo sustituyen por uno fijo. */
export const NOW = new InjectionToken<() => Date>('NOW', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

/**
 * Día de calendario (`YYYY-MM-DD`) que es ahora en `timeZone` (id IANA del local). Sin zona, o si el navegador no la
 * conoce, usa la del navegador. Sin `toISOString()`: es UTC y daría otro día cerca de medianoche.
 */
export function todayIn(timeZone: string | undefined, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return localIsoDate(now);
  }
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return localIsoDate(new Date(year, month - 1, day + days));
}

function toRoom(dto: RoomDto | undefined): Room {
  return {
    shape: dto?.shape ?? 'RECTANGLE',
    width: dto?.width ?? 0,
    height: dto?.height ?? 0,
    cutWidth: dto?.cutWidth ?? 0,
    cutDepth: dto?.cutDepth ?? 0,
    rotation: dto?.rotation ?? 0,
  };
}

function toTable(dto: TableDto): PlanoTable {
  return {
    id: dto.id ?? 0,
    label: dto.label ?? '',
    shape: dto.shape ?? 'SQUARE',
    seats: dto.seats ?? 0,
    rotation: dto.rotation ?? 0,
    x: dto.x ?? 0,
    y: dto.y ?? 0,
  };
}

function errorCode(error: HttpErrorResponse): string | undefined {
  return (error.error as { code?: string } | null)?.code;
}

function rateLimitedMessage(error: HttpErrorResponse): string {
  const seconds = Number.parseInt(error.headers?.get('Retry-After') ?? '', 10);
  if (!(seconds > 0)) {
    return 'Demasiados intentos. Espera un momento y vuelve a probar.';
  }
  return `Demasiados intentos. Vuelve a probar en ${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}.`;
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
  private readonly occupancyRequests = new Subject<{ date: string; shiftId: number }>();

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
  /** Mesas ocupadas en el turno elegido; `null` mientras se pide la ocupación. */
  readonly occupied = signal<ReadonlySet<number> | null>(null);
  readonly occupancyFailed = signal(false);
  readonly tableId = signal<number | null>(null);

  readonly customerName = signal('');
  readonly customerPhone = signal('');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly reservation = signal<ReservationDetails | null>(null);

  readonly theme = computed<ThemeKey>(() => this.plan()?.theme ?? 'AZUL');
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

  readonly selectedTable = computed(
    () => this.tables().find((table) => table.id === this.tableId()) ?? null,
  );

  readonly canSubmit = computed(
    () =>
      this.status() === 'ready' &&
      !this.submitting() &&
      this.shiftId() !== null &&
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
          this.api.occupancy({ slug: this.slug, ...request }).pipe(
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < this.today() || date > this.maxDate()) {
      return;
    }
    this.date.set(date);
    this.requestShifts();
  }

  setPartySize(partySize: number): void {
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > this.maxPartySize()) {
      return;
    }
    this.partySize.set(partySize);
    this.requestShifts();
  }

  selectShift(shiftId: number): void {
    const shift = this.shifts()?.find((candidate) => candidate.shiftId === shiftId);
    // Pulsar el turno ya elegido no repite nada, salvo que la ocupación haya fallado: así se puede reintentar.
    if (!shift?.available || (this.shiftId() === shiftId && !this.occupancyFailed())) {
      return;
    }
    this.shiftId.set(shiftId);
    this.tableId.set(null);
    this.error.set(null);
    this.requestOccupancy();
  }

  selectTable(tableId: number): void {
    const known = this.tables().some((table) => table.id === tableId);
    if (!known || this.occupied() === null || this.tableStates()[tableId] === 'blocked') {
      return;
    }
    this.tableId.set(tableId);
    this.error.set(null);
  }

  submit(): void {
    const shiftId = this.shiftId();
    if (!this.canSubmit() || shiftId === null) {
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
    if (error.status === 404) {
      this.error.set(UNAVAILABLE_PLAN_MESSAGE);
    } else if (error.status === 429) {
      this.error.set(rateLimitedMessage(error));
    } else if (code === 'TABLE_TAKEN') {
      // Otro cliente se la llevó: se pide la ocupación de nuevo y se vuelve a elegir mesa.
      this.tableId.set(null);
      this.error.set(TABLE_TAKEN_MESSAGE);
      this.requestOccupancy();
    } else {
      this.error.set((code && ERROR_MESSAGES[code]) || GENERIC_ERROR);
    }
  }

  private clearShifts(): void {
    this.shifts.set(null);
    this.shiftsFailed.set(false);
    this.shiftId.set(null);
    this.occupied.set(null);
    this.occupancyFailed.set(false);
    this.tableId.set(null);
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
