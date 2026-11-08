import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Mock } from 'vitest';
import { ApiConfiguration } from '../../core/api/api-configuration';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { PlanResponse } from '../../core/api/models/plan-response';
import { TableOccupancy } from '../../core/api/models/table-occupancy';
import { TableSuggestion } from '../../core/api/models/table-suggestion';
import { NOW } from '../../public/booking.store';
import { ReservationsPage } from './reservations.page';
import { OPEN_WINDOW } from './whatsapp';

const EVERY_DAY = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

const CENA = { id: 11, name: 'Cena', start: '20:00:00', end: '23:30:00', days: [...EVERY_DAY] };
const COMIDA = { id: 10, name: 'Comida', start: '13:00:00', end: '16:00:00', days: [...EVERY_DAY] };

const PLAN: PlanResponse = {
  slug: 'kafe',
  name: 'Kafé del Puerto',
  status: 'PUBLISHED',
  theme: 'AZUL',
  bookingMode: 'ASSIGNED',
  room: { shape: 'RECTANGLE', width: 1200, height: 800, cutWidth: 0, cutDepth: 0, rotation: 0 },
  tables: [
    { id: 1, label: '1', shape: 'SQUARE', seats: 2, rotation: 0, x: 200, y: 200 },
    { id: 2, label: '2', shape: 'ROUND', seats: 4, rotation: 0, x: 600, y: 400 },
    { id: 3, label: '3', shape: 'SQUARE', seats: 6, rotation: 0, x: 900, y: 300 },
  ],
  shifts: [CENA],
};

const TWO_SHIFTS: PlanResponse = { ...PLAN, shifts: [CENA, COMIDA] };

// 23:30 UTC del 9 de noviembre: en Madrid (UTC+1) ya es día 10; con la zona del navegador (UTC en CI) seguiría siendo 9.
const CLOCK = new Date('2026-11-09T23:30:00Z');
const TODAY = '2026-11-10';

const ANA: AdminReservation = {
  id: 1,
  code: 'KAFE23456789ABCD',
  status: 'PENDING',
  date: TODAY,
  shiftId: 11,
  arrivalTime: '21:30:00',
  partySize: 4,
  customerName: 'Ana',
  customerPhone: '612 345 678',
  tableId: 2,
  tableLabel: '2',
};
const LUIS: AdminReservation = {
  id: 2,
  code: 'KAFEBBBB22223333',
  status: 'CONFIRMED',
  date: TODAY,
  shiftId: 11,
  arrivalTime: '20:30:00',
  partySize: 6,
  customerName: 'Luis',
  customerPhone: '+44 7700 900123',
  tableId: 3,
  tableLabel: '3',
};
const MARTA: AdminReservation = {
  id: 3,
  code: 'KAFECCCC44445555',
  status: 'PENDING',
  date: TODAY,
  shiftId: 11,
  partySize: 2,
  customerName: 'Marta',
  customerPhone: '•••78',
};
const PEPE: AdminReservation = {
  id: 4,
  code: 'KAFEDDDD66667777',
  status: 'CONFIRMED',
  date: TODAY,
  shiftId: 10,
  arrivalTime: '13:30:00',
  partySize: 2,
  customerName: 'Pepe',
  customerPhone: '600111222',
  tableId: 1,
  tableLabel: '1',
};

// Ana (mesa 2) y Luis (mesa 3) ocupan mesas; la 1 está libre.
const OCCUPANCY: TableOccupancy[] = [
  { tableId: 1, label: '1', seats: 2, occupied: false },
  { tableId: 2, label: '2', seats: 4, occupied: true },
  { tableId: 3, label: '3', seats: 6, occupied: true },
];

interface Screen {
  plan?: PlanResponse;
  day?: AdminReservation[];
  pending?: AdminReservation[];
  occupancy?: TableOccupancy[];
}

describe('ReservationsPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let openWindow: Mock<(url: string) => void>;

  beforeEach(() => {
    openWindow = vi.fn<(url: string) => void>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'panel/:slug', component: ReservationsPage }]),
        { provide: NOW, useValue: () => CLOCK },
        { provide: OPEN_WINDOW, useValue: openWindow },
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function request(method: string, path: string, params: Record<string, string | null> = {}) {
    return http.expectOne(
      (candidate) =>
        candidate.method === method &&
        candidate.url.endsWith(path) &&
        Object.entries(params).every(([name, value]) =>
          value === null ? !candidate.params.has(name) : candidate.params.get(name) === value,
        ),
    );
  }

  const listPath = '/api/v1/admin/restaurants/kafe/reservations';

  function expectDay(date: string): TestRequest {
    return request('GET', listPath, { date, status: null });
  }

  function expectPending(): TestRequest {
    return request('GET', listPath, { status: 'PENDING', date: null });
  }

  function expectOccupancy(date: string, shiftId: number): TestRequest {
    return request('GET', '/api/v1/admin/restaurants/kafe/occupancy', {
      date,
      shiftId: String(shiftId),
    });
  }

  /** Lo que la página pide cuando el plano está listo y tiene turno ese día. */
  async function flushScreen(date: string, shiftId: number | null, screen: Screen): Promise<void> {
    expectDay(date).flush(screen.day ?? []);
    expectPending().flush(screen.pending ?? []);
    if (shiftId !== null) {
      expectOccupancy(date, shiftId).flush(screen.occupancy ?? OCCUPANCY);
    }
    await settle();
  }

  async function open(screen: Screen = {}): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe');
    request('GET', '/api/v1/admin/restaurants/kafe').flush(screen.plan ?? PLAN);
    // La zona horaria solo la trae el plano público.
    request('GET', '/api/v1/restaurants/kafe').flush({ slug: 'kafe', timeZone: 'Europe/Madrid' });
    await settle();
    // Turno por defecto: el primero del día por hora de inicio.
    const first = [...((screen.plan ?? PLAN).shifts ?? [])].sort((a, b) =>
      (a.start ?? '').localeCompare(b.start ?? ''),
    )[0];
    await flushScreen(TODAY, first?.id ?? null, screen);
    page = harness.routeNativeElement as HTMLElement;
  }

  function rows(): HTMLElement[] {
    return Array.from(page.querySelectorAll<HTMLElement>('li.reservation'));
  }

  function row(name: string): HTMLElement {
    const found = rows().find((candidate) => candidate.textContent?.includes(name));
    if (!found) {
      throw new Error(`Sin fila de "${name}"`);
    }
    return found;
  }

  function button(scope: ParentNode, name: string): HTMLButtonElement {
    const found = Array.from(scope.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );
    if (!found) {
      throw new Error(`Sin botón "${name}"`);
    }
    return found;
  }

  async function click(scope: ParentNode, name: string): Promise<void> {
    button(scope, name).click();
    await settle();
  }

  function table(id: number): SVGGElement {
    const found = page.querySelector<SVGGElement>(`g.t[data-table-id="${id}"]`);
    if (!found) {
      throw new Error(`Sin mesa ${id}`);
    }
    return found;
  }

  function tableState(id: number): string {
    return table(id).getAttribute('class') ?? '';
  }

  function alertText(): string {
    return page.querySelector('[role="alert"]')?.textContent ?? '';
  }

  /** Respuesta de una acción: el servidor devuelve la reserva con su turno. */
  function details(reservation: AdminReservation, status: string): Record<string, unknown> {
    return {
      code: reservation.code,
      date: reservation.date,
      status,
      shiftId: reservation.shiftId,
      shiftName: 'Cena',
      arrivalTime: reservation.arrivalTime,
      partySize: reservation.partySize,
      restaurantName: 'Kafé del Puerto',
      slug: 'kafe',
      tableLabel: reservation.tableLabel,
    };
  }

  function openedLink(): URL {
    expect(openWindow).toHaveBeenCalledTimes(1);
    return new URL(openWindow.mock.calls[0][0]);
  }

  it('showsTheDayOrderedByArrivalTime', async () => {
    await open({ day: [MARTA, ANA, LUIS] });

    expect(rows().map((item) => item.querySelector('.name')?.textContent?.trim())).toEqual([
      'Luis',
      'Ana',
      'Marta',
    ]);
    expect(row('Luis').textContent).toContain('20:30 · Cena');
    expect(row('Ana').textContent).toContain('21:30 · Cena');
    // Sin hora (reserva anterior a la hora de llegada) va la última, solo con el turno.
    expect(row('Marta').textContent).toContain('Cena');
    expect(row('Marta').textContent).not.toMatch(/\d{2}:\d{2} · Cena/);
  });

  it('showsAnArrivalTimeOutsideTheCurrentGridAsIs', async () => {
    await open({ day: [{ ...ANA, arrivalTime: '03:15:00' }] });

    expect(row('Ana').textContent).toContain('03:15 · Cena');
  });

  it('defaultsToTodayInTheTimeZoneOfThePlan', async () => {
    await open();

    expect(page.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe(TODAY);
  });

  it('fallsBackToTheBrowserDayWhenThePublicPlanFails', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe');
    request('GET', '/api/v1/admin/restaurants/kafe').flush(PLAN);
    request('GET', '/api/v1/restaurants/kafe').flush({}, { status: 404, statusText: 'Not Found' });
    await settle();
    // La zona del navegador no se fija en el test: basta con que la página siga viva con alguna fecha.
    const date = harness.routeNativeElement?.querySelector<HTMLInputElement>('input[type="date"]');
    expect(date?.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expectDay(date?.value ?? '').flush([]);
    expectPending().flush([]);
    expectOccupancy(date?.value ?? '', 11).flush([]);
  });

  it('doesNotAskTheTimeZoneOfADraftPlan', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe');
    request('GET', '/api/v1/admin/restaurants/kafe').flush({ ...PLAN, status: 'DRAFT' });
    await settle();

    http.expectNone('/api/v1/restaurants/kafe');
    const date = harness.routeNativeElement?.querySelector<HTMLInputElement>('input[type="date"]');
    expectDay(date?.value ?? '').flush([]);
    expectPending().flush([]);
    expectOccupancy(date?.value ?? '', 11).flush([]);
  });

  it('showsThatThePlanDoesNotExist', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/otro');
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/admin/restaurants/otro'))
      .flush({ code: 'RESTAURANT_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect((harness.routeNativeElement as HTMLElement).textContent).toContain(
      'Este plano no existe',
    );
  });

  it('planoMarksPendingGreyAndConfirmedRed', async () => {
    await open({ day: [ANA, LUIS, MARTA] });

    expect(tableState(1)).toContain('free');
    expect(tableState(2)).toContain('pending');
    expect(tableState(3)).toContain('taken');
  });

  it('picksTheFirstShiftOfTheDayAndChangesIt', async () => {
    await open({ plan: TWO_SHIFTS, day: [PEPE, LUIS] });

    // Primero por hora: Comida (13:00), aunque en el plan vaya detrás.
    expect(button(page, 'Comida · 13:00').getAttribute('aria-pressed')).toBe('true');
    expect(rows().map((item) => item.querySelector('.name')?.textContent?.trim())).toEqual([
      'Pepe',
    ]);

    await click(page, 'Cena · 20:00');
    expectOccupancy(TODAY, 11).flush(OCCUPANCY);
    await settle();

    expect(rows().map((item) => item.querySelector('.name')?.textContent?.trim())).toEqual([
      'Luis',
    ]);
  });

  it('changingTheDateReloadsTheDay', async () => {
    await open({ day: [ANA] });

    const input = page.querySelector<HTMLInputElement>('input[type="date"]') as HTMLInputElement;
    input.value = '2026-11-12';
    input.dispatchEvent(new Event('change'));
    await settle();
    // El día cambia: la lista y la ocupación se piden de nuevo; los pendientes no dependen de la fecha.
    expectDay('2026-11-12').flush([{ ...LUIS, date: '2026-11-12' }]);
    expectOccupancy('2026-11-12', 11).flush(OCCUPANCY);
    await settle();

    expect(rows().map((item) => item.querySelector('.name')?.textContent?.trim())).toEqual([
      'Luis',
    ]);
  });

  it('pendingTabListsEveryPendingReservationWithItsDate', async () => {
    const later = { ...ANA, id: 9, date: '2026-11-15', customerName: 'Zoe' };
    await open({ day: [LUIS], pending: [later, ANA] });

    expect(button(page, 'Pendientes (2)')).toBeTruthy();
    await click(page, 'Pendientes (2)');

    expect(rows().map((item) => item.querySelector('.name')?.textContent?.trim())).toEqual([
      'Ana',
      'Zoe',
    ]);
    expect(row('Zoe').textContent).toContain('15/11/2026');
    expect(page.querySelector('app-plano')).toBeNull();
  });

  it('confirmOpensWhatsapp', async () => {
    await open({ day: [ANA], pending: [ANA] });

    await click(row('Ana'), 'Confirmar');
    // Confirmar no pide confirmación: la llamada sale ya.
    request('POST', '/api/v1/admin/reservations/1/confirm').flush(details(ANA, 'CONFIRMED'));
    await settle();
    await flushScreen(TODAY, 11, { day: [{ ...ANA, status: 'CONFIRMED' }], pending: [] });

    const link = openedLink();
    expect(link.origin + link.pathname).toBe('https://wa.me/34612345678');
    const text = link.searchParams.get('text') ?? '';
    expect(text).toContain('Ana');
    expect(text).toContain('10/11/2026');
    expect(text).toContain('Cena');
    expect(text).toContain('21:30');
    expect(text).toContain('KAFE23456789ABCD');
    expect(text).toContain('confirmada');
    expect(openWindow).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/'));
  });

  it('confirmWithoutTableAsksToAssign', async () => {
    await open({ day: [MARTA], pending: [MARTA] });

    await click(row('Marta'), 'Confirmar');

    // Sin mesa no hay POST (`http.verify` lo comprueba): se abre la asignación con sus sugerencias.
    request('GET', '/api/v1/admin/reservations/3/suggestions').flush([]);
    await settle();
    expect(alertText()).toContain('Asigna una mesa antes de confirmar');
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('unassignedShowsSuggestions', async () => {
    const suggestions: TableSuggestion[] = [
      { tableId: 1, label: '1', seats: 2 },
      { tableId: 2, label: 'Terraza', seats: 4 },
    ];
    await open({ day: [MARTA, ANA], pending: [MARTA, ANA] });

    await click(row('Marta'), 'Asignar mesa');
    request('GET', '/api/v1/admin/reservations/3/suggestions').flush(suggestions);
    await settle();

    const offered = Array.from(page.querySelectorAll('.suggestions button')).map((item) =>
      item.textContent?.trim(),
    );
    expect(offered).toEqual(['Mesa 1 · 2 plazas', 'Mesa Terraza · 4 plazas']);

    await click(page.querySelector('.suggestions') as HTMLElement, 'Mesa 1 · 2 plazas');
    const assign = request('PUT', '/api/v1/admin/reservations/3/table');
    expect(assign.request.body).toEqual({ tableId: 1 });
    assign.flush(details({ ...MARTA, tableLabel: '1' }, 'PENDING'));
    await settle();
    await flushScreen(TODAY, 11, {
      day: [{ ...MARTA, tableId: 1, tableLabel: '1' }, ANA],
      pending: [{ ...MARTA, tableId: 1, tableLabel: '1' }, ANA],
    });

    expect(row('Marta').textContent).toContain('Mesa 1');
    expect(page.querySelector('.suggestions')).toBeNull();
    // Asignar mesa no avisa por WhatsApp: solo Confirmar, Rechazar y Cancelar.
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('assignByClickingAFreeTableOnThePlano', async () => {
    await open({ day: [MARTA], pending: [MARTA] });

    await click(row('Marta'), 'Asignar mesa');
    request('GET', '/api/v1/admin/reservations/3/suggestions').flush([]);
    await settle();
    table(1).dispatchEvent(new Event('click'));
    await settle();

    const assign = request('PUT', '/api/v1/admin/reservations/3/table');
    expect(assign.request.body).toEqual({ tableId: 1 });
    assign.flush(details({ ...MARTA, tableLabel: '1' }, 'PENDING'));
    await settle();
    await flushScreen(TODAY, 11, { day: [{ ...MARTA, tableId: 1, tableLabel: '1' }] });
  });

  it('assignTakenShowsConflict', async () => {
    await open({ day: [MARTA, ANA, LUIS], pending: [MARTA, ANA] });

    await click(row('Marta'), 'Asignar mesa');
    request('GET', '/api/v1/admin/reservations/3/suggestions').flush([]);
    await settle();
    // La mesa 3 es de Luis en este turno: no se llama a la API.
    table(3).dispatchEvent(new Event('click'));
    await settle();

    expect(alertText()).toContain('La mesa 3 ya está ocupada en este turno');
    http.expectNone((candidate) => candidate.method === 'PUT');
  });

  it('assignTooSmallTableShowsTheReason', async () => {
    await open({ day: [{ ...MARTA, partySize: 3 }], pending: [MARTA] });

    await click(row('Marta'), 'Asignar mesa');
    request('GET', '/api/v1/admin/reservations/3/suggestions').flush([]);
    await settle();
    table(1).dispatchEvent(new Event('click'));
    await settle();

    expect(alertText()).toContain('La mesa 1 tiene 2 plazas y el grupo es de 3');
    http.expectNone((candidate) => candidate.method === 'PUT');
  });

  it('assigningFromPendingMovesTheViewToItsDateAndShift', async () => {
    const far: AdminReservation = { ...MARTA, id: 7, date: '2026-11-15', customerName: 'Zoe' };
    await open({ day: [], pending: [far] });

    await click(page, 'Pendientes (1)');
    await click(row('Zoe'), 'Asignar mesa');

    expect(page.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe('2026-11-15');
    expectDay('2026-11-15').flush([far]);
    expectOccupancy('2026-11-15', 11).flush(OCCUPANCY);
    request('GET', '/api/v1/admin/reservations/7/suggestions').flush([]);
    await settle();
    // Ahora el plano es el del día de la reserva: la mesa 3 sigue ocupada y la 1 libre.
    expect(page.querySelector('app-plano')).not.toBeNull();
    expect(row('Zoe')).toBeTruthy();
  });

  it('rejectAsksFirstThenCancelsAndOpensWhatsapp', async () => {
    await open({ day: [ANA], pending: [ANA] });

    await click(row('Ana'), 'Rechazar');
    // La pregunta es de la página, sin llamadas ni `window.confirm`.
    expect(page.textContent).toContain('¿Rechazar la reserva de Ana?');
    http.expectNone((candidate) => candidate.method === 'POST');
    await click(page, 'Sí, rechazar');

    request('POST', '/api/v1/admin/reservations/1/cancel').flush(details(ANA, 'CANCELLED'));
    await settle();
    await flushScreen(TODAY, 11, { day: [{ ...ANA, status: 'CANCELLED' }] });

    const text = openedLink().searchParams.get('text') ?? '';
    expect(text).toContain('no hemos podido');
    expect(text).toContain('KAFE23456789ABCD');
    expect(page.textContent).not.toContain('¿Rechazar');
  });

  it('theQuestionCanBeDismissedWithoutCalls', async () => {
    await open({ day: [LUIS] });

    await click(row('Luis'), 'Cancelar');
    expect(page.textContent).toContain('¿Cancelar la reserva de Luis?');
    await click(page, 'No');

    expect(page.textContent).not.toContain('¿Cancelar la reserva');
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('cancelAsksFirstThenOpensWhatsappWithTheCancellationText', async () => {
    await open({ day: [LUIS] });

    await click(row('Luis'), 'Cancelar');
    await click(page, 'Sí, cancelar');
    request('POST', '/api/v1/admin/reservations/2/cancel').flush(details(LUIS, 'CANCELLED'));
    await settle();
    await flushScreen(TODAY, 11, { day: [{ ...LUIS, status: 'CANCELLED' }] });

    const link = openedLink();
    expect(link.pathname).toBe('/447700900123');
    expect(link.searchParams.get('text')).toContain('cancelado');
  });

  it('noShowAsksFirstAndDoesNotOpenWhatsapp', async () => {
    await open({ day: [LUIS] });

    await click(row('Luis'), 'No presentado');
    expect(page.textContent).toContain('¿Marcar a Luis como no presentado?');
    await click(page, 'Sí, no se presentó');
    request('POST', '/api/v1/admin/reservations/2/no-show').flush(details(LUIS, 'NO_SHOW'));
    await settle();
    await flushScreen(TODAY, 11, { day: [{ ...LUIS, status: 'NO_SHOW' }] });

    expect(openWindow).not.toHaveBeenCalled();
    // La fila ya no tiene acciones; "No presentado" es ahora su estado.
    expect(row('Luis').querySelectorAll('button').length).toBe(0);
    expect(row('Luis').querySelector('.status')?.textContent).toContain('No presentado');
  });

  it('masksOfTheDemoAccountGetNoWhatsappButTheActionStillRuns', async () => {
    const masked = { ...LUIS, customerPhone: '•••78' };
    await open({ day: [masked] });

    await click(row('Luis'), 'Cancelar');
    await click(page, 'Sí, cancelar');
    request('POST', '/api/v1/admin/reservations/2/cancel').flush(details(LUIS, 'CANCELLED'));
    await settle();
    await flushScreen(TODAY, 11, { day: [{ ...masked, status: 'CANCELLED' }] });

    expect(openWindow).not.toHaveBeenCalled();
    expect(row('Luis').textContent).toContain('Cancelada');
  });

  it('aConflictShowsTheMessageAndReloadsEverything', async () => {
    await open({ day: [ANA], pending: [ANA] });

    await click(row('Ana'), 'Confirmar');
    request('POST', '/api/v1/admin/reservations/1/confirm').flush(
      { code: 'INVALID_TRANSITION' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    // Otro dispositivo ya la cambió: se avisa y se recarga la lista, los pendientes y la ocupación.
    await flushScreen(TODAY, 11, { day: [{ ...ANA, status: 'CANCELLED' }], pending: [] });
    expect(alertText()).toContain('ya no admite esa acción');
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('anUnprocessableAssignmentShowsTheMessageAndReloads', async () => {
    await open({ day: [MARTA], pending: [MARTA] });

    await click(row('Marta'), 'Asignar mesa');
    request('GET', '/api/v1/admin/reservations/3/suggestions').flush([]);
    await settle();
    table(1).dispatchEvent(new Event('click'));
    await settle();
    request('PUT', '/api/v1/admin/reservations/3/table').flush(
      { code: 'TABLE_TAKEN' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    await flushScreen(TODAY, 11, { day: [MARTA], pending: [MARTA] });

    expect(alertText()).toContain('ya está ocupada');
  });

  it('rateLimitedAsksToWait', async () => {
    await open({ day: [ANA], pending: [ANA] });

    await click(row('Ana'), 'Confirmar');
    request('POST', '/api/v1/admin/reservations/1/confirm').flush(
      { code: 'RATE_LIMITED' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '30' } },
    );
    await settle();

    expect(alertText()).toContain('Demasiadas acciones seguidas, espera un momento');
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('rendersCustomerDataAsTextOnly', async () => {
    const hostile = { ...LUIS, customerName: '<img src=x onerror=alert(1)>' };
    await open({ day: [hostile] });

    expect(page.querySelector('li.reservation img')).toBeNull();
    expect(row('<img').textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
