import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import type { Mock } from 'vitest';
import { ApiConfiguration } from '../../core/api/api-configuration';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { FeedEvent } from '../../core/api/models/feed-event';
import { PlanResponse } from '../../core/api/models/plan-response';
import { TableOccupancy } from '../../core/api/models/table-occupancy';
import { TableSuggestion } from '../../core/api/models/table-suggestion';
import { NOW } from '../../core/time';
import { MeStore } from '../me.store';
import { FeedService } from '../notifications/feed.service';
import { ReservationsPage } from './reservations.page';
import { isRealDate } from './reservations.store';
import { OPEN_WINDOW } from '../../core/open-window';

@Component({ template: '<p>otra</p>' })
class OtherStub {}

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
  timeZone: 'Europe/Madrid',
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
  /** Día que la página debe pedir al abrir (el de la zona del plano); por defecto TODAY. */
  date?: string;
}

describe('ReservationsPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let openWindow: Mock<(url: string) => void>;
  let feedEvents: Subject<FeedEvent>;
  let demoAccount: boolean;

  beforeEach(() => {
    openWindow = vi.fn<(url: string) => void>();
    feedEvents = new Subject<FeedEvent>();
    demoAccount = false;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'panel/:slug', component: ReservationsPage },
          { path: 'otra', component: OtherStub },
        ]),
        { provide: NOW, useValue: () => CLOCK },
        { provide: OPEN_WINDOW, useValue: openWindow },
        // El marco del panel provee el servicio real; aquí solo importan los eventos que emite.
        { provide: FeedService, useValue: { events: feedEvents.asObservable() } },
        // Idem el `MeStore`: aquí solo importa si la cuenta es la demo.
        { provide: MeStore, useValue: { demo: () => demoAccount } },
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Si `verify` falla, el módulo de test se reinicia igualmente: así el fallo no arrastra a los tests siguientes.
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
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
    await settle();
    // Turno por defecto: el primero del día por hora de inicio.
    const first = [...((screen.plan ?? PLAN).shifts ?? [])].sort((a, b) =>
      (a.start ?? '').localeCompare(b.start ?? ''),
    )[0];
    await flushScreen(screen.date ?? TODAY, first?.id ?? null, screen);
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

  /** Texto con los espacios normalizados. */
  function normalized(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, ' ').trim();
  }

  /** Hora de llegada que enseña la fila (o el guion si la reserva no tiene). */
  function timeOf(name: string): string {
    return row(name).querySelector('.time .hour')?.textContent?.trim() ?? '';
  }

  /** Texto del encabezado (`eyebrow`) con los espacios normalizados. */
  function eyebrowText(): string {
    return (page.querySelector('.eyebrow')?.textContent ?? '').replace(/\s+/g, ' ').trim();
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
    expect(timeOf('Luis')).toBe('20:30');
    expect(timeOf('Ana')).toBe('21:30');
    // Sin hora (reserva anterior a la hora de llegada) va la última, con un guion en lugar de la hora.
    expect(timeOf('Marta')).toBe('—');
    expect(row('Marta').textContent).not.toMatch(/\d{2}:\d{2}/);
    // El turno ya no se repite en cada fila: lo dice la cabecera de la lista.
    expect(normalized(page.querySelector('.list .head b')?.textContent)).toBe('Cena');
  });

  it('showsAnArrivalTimeOutsideTheCurrentGridAsIs', async () => {
    await open({ day: [{ ...ANA, arrivalTime: '03:15:00' }] });

    expect(timeOf('Ana')).toBe('03:15');
  });

  it('defaultsToTodayInTheTimeZoneOfThePlan', async () => {
    await open();

    expect(page.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe(TODAY);
  });

  it('aDraftPlanAlsoUsesItsOwnTimeZoneWithoutAskingThePublicPlan', async () => {
    // 23:30 UTC del 9: en Los Ángeles (UTC-8) sigue siendo día 9, en Madrid ya es día 10.
    await open({
      plan: { ...PLAN, status: 'DRAFT', timeZone: 'America/Los_Angeles' },
      date: '2026-11-09',
    });

    expect(page.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe('2026-11-09');
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

  it('anInvalidDateKeepsTheCurrentOneInTheInputAndSaysSo', async () => {
    await open({ day: [ANA] });
    const input = page.querySelector<HTMLInputElement>('input[type="date"]') as HTMLInputElement;

    // Campo borrado y año fuera del rango del servidor: no se pide nada y el campo vuelve a la fecha válida.
    for (const value of ['', '1999-12-31']) {
      input.value = value;
      input.dispatchEvent(new Event('change'));
      await settle();

      expect(input.value).toBe(TODAY);
      expect(alertText()).toContain('Elige una fecha válida');
    }
    expect(rows().length).toBe(1);

    input.value = '2026-11-12';
    input.dispatchEvent(new Event('change'));
    await settle();
    expectDay('2026-11-12').flush([]);
    expectOccupancy('2026-11-12', 11).flush(OCCUPANCY);
    await settle();

    expect(page.querySelector('[role="alert"]')).toBeNull();
  });

  it('switchingPlanCancelsTheReadsOfThePreviousOne', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe');
    request('GET', '/api/v1/admin/restaurants/kafe').flush(PLAN);
    await settle();
    // Las tres lecturas de "kafe" quedan en vuelo.
    const inFlight = [expectDay(TODAY), expectPending(), expectOccupancy(TODAY, 11)];

    await harness.navigateByUrl('/panel/otro');

    // Si respondieran después, pisarían la pantalla de "otro": tienen que haberse cancelado.
    expect(inFlight.map((pending) => pending.cancelled)).toEqual([true, true, true]);
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/admin/restaurants/otro'))
      .flush({ ...PLAN, slug: 'otro', name: 'Otro' });
    await settle();
    const forOther = (query: (request: { params: { has(name: string): boolean } }) => boolean) =>
      http.expectOne(
        (candidate) =>
          candidate.url.endsWith('/api/v1/admin/restaurants/otro/reservations') && query(candidate),
      );
    forOther((candidate) => candidate.params.has('date')).flush([]);
    forOther((candidate) => !candidate.params.has('date')).flush([{ ...MARTA, id: 50 }]);
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/admin/restaurants/otro/occupancy'))
      .flush(OCCUPANCY);
    await settle();
    page = harness.routeNativeElement as HTMLElement;

    expect(button(page, 'Pendientes · 1')).toBeTruthy();
    expect(eyebrowText()).toBe('Otro / Reservas');
  });

  it('pendingTabListsEveryPendingReservationWithItsDate', async () => {
    const later = { ...ANA, id: 9, date: '2026-11-15', customerName: 'Zoe' };
    await open({ day: [LUIS], pending: [later, ANA] });

    expect(button(page, 'Pendientes · 2')).toBeTruthy();
    await click(page, 'Pendientes · 2');

    expect(rows().map((item) => item.querySelector('.name')?.textContent?.trim())).toEqual([
      'Ana',
      'Zoe',
    ]);
    expect(row('Zoe').textContent).toContain('15/11/2026');
    // En Pendientes la meta lleva la fecha y el turno; la cabecera de la lista dice que son las pendientes.
    expect(normalized(row('Zoe').querySelector('.meta .when')?.textContent)).toBe(
      '15/11/2026 · Cena',
    );
    expect(normalized(page.querySelector('.list .head b')?.textContent)).toBe('Pendientes');
    expect(page.querySelector('app-plano')).toBeNull();
  });

  /** Cifras de la cabecera, por su etiqueta. */
  function figures(): Record<string, string> {
    return Object.fromEntries(
      Array.from(page.querySelectorAll('.figures .fig')).map((fig) => [
        fig.querySelector('.kicker')?.textContent?.trim() ?? '',
        fig.querySelector('b')?.textContent?.trim() ?? '',
      ]),
    );
  }

  /** Cifra de "Pendientes" de la cabecera. */
  function pendingFigure(): HTMLElement {
    const fig = Array.from(page.querySelectorAll('.figures .fig')).find(
      (candidate) => candidate.querySelector('.kicker')?.textContent?.trim() === 'Pendientes',
    );
    return fig?.querySelector('b') as HTMLElement;
  }

  function title(): string {
    return (page.querySelector('h1')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  it('titleIsTheLongDateInThePlanZone', async () => {
    await open();
    expect(title()).toBe('Martes, 10 de noviembre');

    const input = page.querySelector<HTMLInputElement>('input[type="date"]') as HTMLInputElement;
    input.value = '2026-11-09';
    input.dispatchEvent(new Event('change'));
    await settle();
    expectDay('2026-11-09').flush([]);
    expectOccupancy('2026-11-09', 11).flush(OCCUPANCY);
    await settle();

    expect(title()).toBe('Lunes, 9 de noviembre');
  });

  it('titleDoesNotShiftWestOfUtc', async () => {
    // 23:30 UTC del 9: en Nueva York es el 9 a las 18:30. El título no puede correrse al día 8.
    await open({ plan: { ...PLAN, timeZone: 'America/New_York' }, date: '2026-11-09' });

    expect(title()).toBe('Lunes, 9 de noviembre');
  });

  it('eyebrowNamesThePlanAndTruncatesALongOne', async () => {
    const longName = 'Restaurante '.repeat(10).trim();
    await open({ plan: { ...PLAN, name: longName } });

    const name = page.querySelector<HTMLElement>('.eyebrow .truncate');
    expect(name?.textContent?.trim()).toBe(longName);
    expect(name?.getAttribute('title')).toBe(longName);
    expect(eyebrowText()).toBe(`${longName} / Reservas`);
  });

  it('figuresFollowTheSelectedShift', async () => {
    const cancelled: AdminReservation = { ...LUIS, id: 20, status: 'CANCELLED', partySize: 8 };
    await open({ plan: TWO_SHIFTS, day: [PEPE, LUIS, ANA, cancelled] });

    // Comida: solo Pepe (2 personas, confirmada); de las 3 mesas, 2 ocupadas.
    expect(figures()).toEqual({
      Reservas: '1',
      Comensales: '2',
      Pendientes: '0',
      'Mesas libres': '1',
    });
    // Un 0 no se pinta como aviso, y la cifra aclara que cuenta solo el turno elegido.
    expect(pendingFigure().classList).not.toContain('warn');
    expect(normalized(pendingFigure().parentElement?.querySelector('.sub')?.textContent)).toBe(
      'en este turno',
    );

    await click(page, 'Cena · 20:00');
    // Mientras llega la ocupación del turno nuevo no se sabe cuántas mesas hay libres.
    expect(figures()['Mesas libres']).toBe('—');
    expectOccupancy(TODAY, 11).flush([
      { tableId: 1, label: '1', seats: 2, occupied: false },
      { tableId: 2, label: '2', seats: 4, occupied: false },
      { tableId: 3, label: '3', seats: 6, occupied: true },
    ]);
    await settle();

    // Cena: Luis (6, confirmada) y Ana (4, pendiente); la cancelada no cuenta.
    expect(figures()).toEqual({
      Reservas: '2',
      Comensales: '10',
      Pendientes: '1',
      'Mesas libres': '2',
    });
    expect(pendingFigure().classList).toContain('warn');
  });

  it('pendingTabIsSingleColumn', async () => {
    await open({ day: [LUIS], pending: [ANA] });
    expect(page.querySelector('.grid')).not.toBeNull();
    expect(page.querySelector('.single')).toBeNull();

    await click(page, 'Pendientes · 1');

    expect(page.querySelector('.grid.single')).not.toBeNull();
    expect(page.querySelector('app-plano')).toBeNull();
    expect(rows()).toHaveLength(1);
  });

  it('longCustomerNameIsTruncated', async () => {
    const longName = 'Cliente con un nombre larguísimo '.repeat(5).trim();
    await open({ day: [{ ...LUIS, customerName: longName }] });

    const name = row(longName).querySelector<HTMLElement>('.name');
    expect(name?.classList).toContain('truncate');
    expect(name?.getAttribute('title')).toBe(longName);
    expect(name?.textContent?.trim()).toBe(longName);
  });

  it('questionAndAssignLiveInTheirRow', async () => {
    await open({ day: [LUIS, MARTA], pending: [MARTA] });

    await click(row('Luis'), 'Cancelar');
    expect(row('Luis').querySelector('.question')?.textContent).toContain(
      '¿Cancelar la reserva de Luis?',
    );
    expect(row('Marta').querySelector('.question')).toBeNull();

    // Pedir mesa para Marta cierra la pregunta de Luis y abre la elección dentro de la fila de Marta.
    await click(row('Marta'), 'Asignar mesa');
    request('GET', '/api/v1/admin/reservations/3/suggestions').flush([
      { tableId: 1, label: '1', seats: 2 },
    ]);
    await settle();

    expect(row('Luis').querySelector('.question')).toBeNull();
    expect(row('Luis').querySelector('.assign')).toBeNull();
    expect(row('Marta').querySelector('.assign')?.textContent).toContain('Marta');
    expect(
      Array.from(row('Marta').querySelectorAll('.assign .suggestions button')).map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(['Mesa 1 · 2 plazas']);
    expect(row('Marta').classList).toContain('sel');
    expect(row('Luis').classList).not.toContain('sel');
  });

  it('theQuestionShowsInsideItsRowInThePendingTab', async () => {
    const far: AdminReservation = { ...MARTA, id: 7, date: '2026-11-15', customerName: 'Zoe' };
    await open({ day: [], pending: [far] });

    await click(page, 'Pendientes · 1');
    await click(row('Zoe'), 'Rechazar');

    expect(row('Zoe').querySelector('.question')?.textContent).toContain(
      '¿Rechazar la reserva de Zoe?',
    );
  });

  it('anOpenQuestionIsDiscardedWhenSwitchingTab', async () => {
    await open({ day: [LUIS], pending: [ANA] });

    await click(row('Luis'), 'Cancelar');
    expect(page.textContent).toContain('¿Cancelar la reserva de Luis?');

    await click(page, 'Pendientes · 1');
    await click(page, 'Del día');

    // No queda una pregunta escondida que reaparezca al volver.
    expect(page.querySelector('.question')).toBeNull();
    expect(page.textContent).not.toContain('¿Cancelar la reserva');
  });

  it('aChoiceWhoseRowIsNotVisibleCanStillBeLeft', async () => {
    const far: AdminReservation = { ...MARTA, id: 7, date: '2026-11-15', customerName: 'Zoe' };
    await open({ day: [], pending: [far] });
    expect(page.querySelector('.choosing')).toBeNull();

    await click(page, 'Pendientes · 1');
    await click(row('Zoe'), 'Asignar mesa');
    // La carga del día de Zoe falla: su fila no se ve, pero la elección sigue abierta y el plano es interactivo.
    expectDay('2026-11-15').flush(null, { status: 500, statusText: 'Server Error' });
    expectOccupancy('2026-11-15', 11).flush(OCCUPANCY);
    request('GET', '/api/v1/admin/reservations/7/suggestions').flush([]);
    await settle();

    expect(rows()).toEqual([]);
    expect(normalized(page.querySelector('.choosing')?.textContent)).toContain(
      'Eligiendo mesa para Zoe',
    );

    await click(page.querySelector('.choosing') as HTMLElement, 'Dejar de elegir mesa');

    expect(page.querySelector('.choosing')).toBeNull();
  });

  it('noChoosingBoxWhileTheRowOfTheChoiceIsVisible', async () => {
    await open({ day: [MARTA], pending: [MARTA] });

    await click(row('Marta'), 'Asignar mesa');
    request('GET', '/api/v1/admin/reservations/3/suggestions').flush([]);
    await settle();

    expect(row('Marta').querySelector('.assign')).not.toBeNull();
    expect(page.querySelector('.choosing')).toBeNull();
  });

  it('showsTheStateOfEachReservationAsADotWithText', async () => {
    await open({
      day: [
        ANA,
        LUIS,
        { ...MARTA, status: 'NO_SHOW' },
        { ...PEPE, shiftId: 11, status: 'CANCELLED' },
      ],
    });

    const state = (name: string) => row(name).querySelector('.dot-state') as HTMLElement;
    expect(state('Ana').textContent?.trim()).toBe('Pendiente');
    expect(state('Ana').classList).toContain('pend');
    expect(state('Luis').textContent?.trim()).toBe('Confirmada');
    expect(state('Luis').classList).toContain('conf');
    expect(state('Marta').classList).toContain('gone');
    expect(state('Pepe').textContent?.trim()).toBe('Cancelada');
  });

  it('theLegendNamesTheStatesOfATable', async () => {
    await open({ day: [LUIS] });

    const legend = (page.querySelector('.legend')?.textContent ?? '').replace(/\s+/g, ' ');
    expect(legend).toContain('Libre');
    expect(legend).toContain('Pendiente');
    expect(legend).toContain('Confirmada');
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

    await click(page, 'Pendientes · 1');
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
    expect(row('Luis').querySelector('.dot-state')?.textContent).toContain('No presentado');
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
    expect(page.querySelector('a.whatsapp')).toBeNull();
    expect(row('Luis').textContent).toContain('Cancelada');
  });

  describe('demoAccount', () => {
    // Aunque el seeder ya no use números marcables, un teléfono con forma de móvil real no debe abrir WhatsApp en la
    // demo: lo evita la marca de la cuenta, no el aspecto del número.
    const ANA_DEMO: AdminReservation = {
      ...ANA,
      customerName: 'Ana Demo',
      customerPhone: '600 000 001',
    };

    it('neverOpensWhatsappNorShowsTheLinkButTheActionStillRuns', async () => {
      demoAccount = true;
      await open({ day: [ANA_DEMO], pending: [ANA_DEMO] });

      await click(row('Ana Demo'), 'Confirmar');
      request('POST', '/api/v1/admin/reservations/1/confirm').flush(details(ANA_DEMO, 'CONFIRMED'));
      await settle();
      await flushScreen(TODAY, 11, { day: [{ ...ANA_DEMO, status: 'CONFIRMED' }], pending: [] });

      expect(openWindow).not.toHaveBeenCalled();
      expect(page.querySelector('a.whatsapp')).toBeNull();
      expect(row('Ana Demo').textContent).toContain('Confirmada');
      expect(page.textContent).toContain('Reserva de Ana Demo confirmada.');
    });

    it('anOrdinaryOwnerStillGetsWhatsappForTheSameNumber', async () => {
      await open({ day: [ANA_DEMO], pending: [ANA_DEMO] });

      await click(row('Ana Demo'), 'Confirmar');
      request('POST', '/api/v1/admin/reservations/1/confirm').flush(details(ANA_DEMO, 'CONFIRMED'));
      await settle();
      await flushScreen(TODAY, 11, { day: [{ ...ANA_DEMO, status: 'CONFIRMED' }], pending: [] });

      const link = openedLink();
      expect(link.origin + link.pathname).toBe('https://wa.me/34600000001');
      expect(page.querySelector('a.whatsapp')).not.toBeNull();
    });
  });

  describe('actionInFlightWhenSwitchingPlan', () => {
    /** Confirma a Ana en "kafe", deja el POST en vuelo y abre "otro" con sus lecturas ya respondidas. */
    async function confirmAndSwitchPlan(): Promise<TestRequest> {
      await open({ day: [ANA], pending: [ANA] });
      await click(row('Ana'), 'Confirmar');
      const confirmation = request('POST', '/api/v1/admin/reservations/1/confirm');
      await switchToOtherPlan();
      return confirmation;
    }

    async function switchToOtherPlan(): Promise<void> {
      await harness.navigateByUrl('/panel/otro');
      http
        .expectOne((candidate) => candidate.url.endsWith('/api/v1/admin/restaurants/otro'))
        .flush({ ...PLAN, slug: 'otro', name: 'Otro' });
      await settle();
      const forOther = (hasDate: boolean) =>
        http.expectOne(
          (candidate) =>
            candidate.url.endsWith('/api/v1/admin/restaurants/otro/reservations') &&
            candidate.params.has('date') === hasDate,
        );
      forOther(true).flush([]);
      forOther(false).flush([]);
      http
        .expectOne((candidate) =>
          candidate.url.endsWith('/api/v1/admin/restaurants/otro/occupancy'),
        )
        .flush(OCCUPANCY);
      await settle();
      page = harness.routeNativeElement as HTMLElement;
    }

    it('finishesAndStillOpensWhatsappForTheCustomer', async () => {
      const confirmation = await confirmAndSwitchPlan();

      // La petición ya salió: el servidor la va a confirmar, y el cliente tiene que enterarse.
      expect(confirmation.cancelled).toBe(false);
      confirmation.flush(details(ANA, 'CONFIRMED'));
      await settle();

      const link = openedLink();
      expect(link.origin + link.pathname).toBe('https://wa.me/34612345678');
      expect(link.searchParams.get('text')).toContain('Kafé del Puerto');
    });

    it('doesNotTouchTheViewOfTheNewPlan', async () => {
      const confirmation = await confirmAndSwitchPlan();

      confirmation.flush(details(ANA, 'CONFIRMED'));
      await settle();

      // Sin avisos, sin enlace de respaldo y sin releer nada del plano nuevo (`http.verify` lo exige).
      expect(page.textContent).not.toContain('confirmada');
      expect(page.querySelector('a.whatsapp')).toBeNull();
      http.expectNone(() => true);
    });

    it('anAssignmentInFlightAlsoFinishesWithoutTouchingTheNewPlan', async () => {
      await open({ day: [MARTA], pending: [MARTA] });
      await click(row('Marta'), 'Asignar mesa');
      request('GET', '/api/v1/admin/reservations/3/suggestions').flush([]);
      await settle();
      table(1).dispatchEvent(new Event('click'));
      await settle();
      const assignment = request('PUT', '/api/v1/admin/reservations/3/table');
      await switchToOtherPlan();

      expect(assignment.cancelled).toBe(false);
      assignment.flush(details({ ...MARTA, tableLabel: '1' }, 'PENDING'));
      await settle();

      expect(page.textContent).not.toContain('asignada');
      expect(page.querySelector('.assign')).toBeNull();
      http.expectNone(() => true);
    });

    it('leavingThePageCancelsTheActionInFlightAndOpensNoWindow', async () => {
      await open({ day: [ANA], pending: [ANA] });
      await click(row('Ana'), 'Confirmar');

      await harness.navigateByUrl('/otra');

      // La página se destruye: la petición se cancela (y las lecturas pendientes con ella).
      const cancelled = http.match(() => true);
      const confirmation = cancelled.find((candidate) => candidate.request.method === 'POST');
      expect(confirmation?.cancelled).toBe(true);
      expect(openWindow).not.toHaveBeenCalled();
    });

    it('doesNotShowTheFailureOfThePreviousPlanInTheNewOne', async () => {
      const confirmation = await confirmAndSwitchPlan();

      confirmation.flush({ code: 'INVALID_TRANSITION' }, { status: 409, statusText: 'Conflict' });
      await settle();

      expect(alertText()).toBe('');
      expect(openWindow).not.toHaveBeenCalled();
      http.expectNone(() => true);
    });
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

  /** Marta con la asignación abierta y la mesa 1 pulsada, lista para responder al PUT. */
  async function assignMartaToTable1(): Promise<TestRequest> {
    await click(row('Marta'), 'Asignar mesa');
    request('GET', '/api/v1/admin/reservations/3/suggestions').flush([]);
    await settle();
    table(1).dispatchEvent(new Event('click'));
    await settle();
    return request('PUT', '/api/v1/admin/reservations/3/table');
  }

  it('anUnprocessableAssignmentKeepsTheChoiceOpenAndReloads', async () => {
    await open({ day: [MARTA], pending: [MARTA] });

    // El plano de la página estaba viejo: la mesa 1 ya no tiene plazas para el grupo.
    (await assignMartaToTable1()).flush(
      { code: 'TABLE_TOO_SMALL' },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await settle();
    await flushScreen(TODAY, 11, { day: [MARTA], pending: [MARTA] });

    expect(alertText()).toContain('menos plazas');
    expect(page.querySelector('.assign')).not.toBeNull();
  });

  it('aMissingTableReloadsThePlano', async () => {
    await open({ day: [MARTA], pending: [MARTA] });

    (await assignMartaToTable1()).flush(
      { code: 'TABLE_NOT_FOUND' },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();
    // El dueño borró la mesa desde otro sitio: se vuelve a leer el plano, no solo la ocupación.
    request('GET', '/api/v1/admin/restaurants/kafe').flush({
      ...PLAN,
      tables: (PLAN.tables ?? []).slice(1),
    });
    await settle();
    await flushScreen(TODAY, 11, { day: [MARTA], pending: [MARTA] });

    expect(page.querySelector('g.t[data-table-id="1"]')).toBeNull();
    expect(page.querySelector('g.t[data-table-id="2"]')).not.toBeNull();
    expect(alertText()).toContain('ya no existe');
  });

  it('aTakenTableAfterAssigningShowsTheMessageAndReloads', async () => {
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

  it('aTableRequiredAnswerFromTheServerOpensTheAssignment', async () => {
    // La página cree que Ana tiene mesa, pero el servidor dice que no.
    await open({ day: [ANA], pending: [ANA] });

    await click(row('Ana'), 'Confirmar');
    request('POST', '/api/v1/admin/reservations/1/confirm').flush(
      { code: 'TABLE_REQUIRED' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    request('GET', '/api/v1/admin/reservations/1/suggestions').flush([]);
    await flushScreen(TODAY, 11, { day: [{ ...ANA, tableId: undefined }], pending: [ANA] });

    expect(page.querySelector('.assign')).not.toBeNull();
    expect(alertText()).toContain('Asigna una mesa antes de confirmar');
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('aMissingReservationShowsTheMessageAndReloads', async () => {
    await open({ day: [ANA], pending: [ANA] });

    await click(row('Ana'), 'Confirmar');
    request('POST', '/api/v1/admin/reservations/1/confirm').flush(
      { code: 'RESERVATION_NOT_FOUND' },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();
    await flushScreen(TODAY, 11, { day: [], pending: [] });

    expect(alertText()).toContain('Esa reserva ya no existe');
    expect(rows()).toEqual([]);
  });

  it('actionButtonsWaitWhileAnActionIsInFlight', async () => {
    await open({ day: [ANA, MARTA], pending: [ANA, MARTA] });

    await click(row('Ana'), 'Confirmar');

    expect(button(row('Marta'), 'Asignar mesa').disabled).toBe(true);
    expect(button(row('Ana'), 'Confirmar').disabled).toBe(true);
    request('POST', '/api/v1/admin/reservations/1/confirm').flush(details(ANA, 'CONFIRMED'));
    await settle();
    await flushScreen(TODAY, 11, {
      day: [{ ...ANA, status: 'CONFIRMED' }, MARTA],
      pending: [MARTA],
    });
    expect(button(row('Marta'), 'Asignar mesa').disabled).toBe(false);
  });

  it('finishingAnActionKeepsAnUnrelatedAssignmentOpen', async () => {
    await open({ day: [ANA, MARTA], pending: [ANA, MARTA] });

    await click(row('Marta'), 'Asignar mesa');
    request('GET', '/api/v1/admin/reservations/3/suggestions').flush([]);
    await settle();
    await click(row('Ana'), 'Confirmar');
    request('POST', '/api/v1/admin/reservations/1/confirm').flush(details(ANA, 'CONFIRMED'));
    await settle();
    await flushScreen(TODAY, 11, {
      day: [{ ...ANA, status: 'CONFIRMED' }, MARTA],
      pending: [MARTA],
    });

    // La asignación de Marta no tiene que ver con la de Ana: sigue abierta.
    expect(page.querySelector('.assign')?.textContent).toContain('Marta');
  });

  it('theAssignmentOfTheReservationThatWasActedOnCloses', async () => {
    await open({ day: [ANA], pending: [ANA] });

    await click(row('Ana'), 'Cambiar mesa');
    request('GET', '/api/v1/admin/reservations/1/suggestions').flush([]);
    await settle();
    await click(row('Ana'), 'Rechazar');
    await click(page, 'Sí, rechazar');
    request('POST', '/api/v1/admin/reservations/1/cancel').flush(details(ANA, 'CANCELLED'));
    await settle();
    await flushScreen(TODAY, 11, { day: [{ ...ANA, status: 'CANCELLED' }] });

    expect(page.querySelector('.assign')).toBeNull();
  });

  it('keepsAVisibleWhatsappLinkAsBackupUntilTheViewChanges', async () => {
    await open({ day: [ANA], pending: [ANA] });

    await click(row('Ana'), 'Confirmar');
    request('POST', '/api/v1/admin/reservations/1/confirm').flush(details(ANA, 'CONFIRMED'));
    await settle();
    await flushScreen(TODAY, 11, { day: [{ ...ANA, status: 'CONFIRMED' }], pending: [] });

    const link = page.querySelector<HTMLAnchorElement>('a.whatsapp');
    expect(link?.textContent?.trim()).toBe('Abrir WhatsApp');
    expect(link?.getAttribute('href')).toBe(openWindow.mock.calls[0][0]);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener');

    await click(page, 'Pendientes · 0');

    expect(page.querySelector('a.whatsapp')).toBeNull();
  });

  it('theWhatsappLinkGoesAwayWithTheNextAction', async () => {
    await open({ day: [ANA, LUIS], pending: [ANA] });

    await click(row('Ana'), 'Confirmar');
    request('POST', '/api/v1/admin/reservations/1/confirm').flush(details(ANA, 'CONFIRMED'));
    await settle();
    await flushScreen(TODAY, 11, { day: [{ ...ANA, status: 'CONFIRMED' }, LUIS], pending: [] });
    expect(page.querySelector('a.whatsapp')).not.toBeNull();

    await click(row('Luis'), 'No presentado');

    expect(page.querySelector('a.whatsapp')).toBeNull();
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

  describe('liveUpdates', () => {
    const NEW_EVENT = {
      kind: 'NEW',
      reservationId: 9,
      restaurantSlug: 'kafe',
      text: 'Nueva reserva',
    };

    it('reloadsTheListPendingAndOccupancyOnAnEventOfThisPlan', async () => {
      await open({ day: [LUIS] });
      expect(rows()).toHaveLength(1);

      feedEvents.next(NEW_EVENT);
      await flushScreen(TODAY, 11, { day: [LUIS, ANA], pending: [ANA] });

      expect(rows().map((item) => item.querySelector('.name')?.textContent?.trim())).toEqual([
        'Luis',
        'Ana',
      ]);
    });

    it('keepsTheOldOccupancyOnThePlanoUntilTheNewOneArrives', async () => {
      await open({ day: [ANA, LUIS] });
      expect(tableState(3)).toContain('taken');

      feedEvents.next(NEW_EVENT);
      await settle();
      // Mientras llega la ocupación nueva el plano no se vacía (no parpadea).
      expect(tableState(2)).toContain('pending');
      expect(tableState(3)).toContain('taken');

      expectDay(TODAY).flush([ANA]);
      expectPending().flush([ANA]);
      expectOccupancy(TODAY, 11).flush([
        { tableId: 2, label: '2', seats: 4, occupied: true },
        { tableId: 3, label: '3', seats: 6, occupied: false },
      ]);
      await settle();
      expect(tableState(3)).toContain('free');
    });

    it('clearsTheOccupancyWhenTheDateOrTheShiftChanges', async () => {
      await open({ plan: TWO_SHIFTS, day: [PEPE, LUIS] });

      await click(page, 'Cena · 20:00');
      expect(tableState(3)).toContain('free');
      expectOccupancy(TODAY, 11).flush(OCCUPANCY);
      await settle();
      expect(tableState(3)).toContain('taken');

      const input = page.querySelector<HTMLInputElement>('input[type="date"]') as HTMLInputElement;
      input.value = '2026-11-12';
      input.dispatchEvent(new Event('change'));
      await settle();
      expect(tableState(3)).toContain('free');
      expectDay('2026-11-12').flush([]);
      expectOccupancy('2026-11-12', 11).flush(OCCUPANCY);
      await settle();
    });

    it('ignoresEventsOfAnotherPlan', async () => {
      await open({ day: [LUIS] });

      feedEvents.next({ ...NEW_EVENT, restaurantSlug: 'tapas' });
      await settle();

      // `http.verify()` del `afterEach` falla si la página ha pedido algo.
      expect(rows()).toHaveLength(1);
    });

    it('ignoresEventsWhileThePlanIsStillLoading', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe');
      const plan = request('GET', '/api/v1/admin/restaurants/kafe');

      feedEvents.next(NEW_EVENT);
      await settle();
      plan.flush(PLAN);
      await settle();

      // Solo las lecturas de la carga normal: una por lista, no dos.
      await flushScreen(TODAY, 11, {});
    });

    it('stopsListeningWhenThePageIsLeft', async () => {
      await open({ day: [LUIS] });

      await harness.navigateByUrl('/otra');
      feedEvents.next(NEW_EVENT);

      expect(feedEvents.observed).toBe(false);
    });
  });

  // Los enlaces de Inicio abren Reservas en un día, una reserva o la pestaña de pendientes.
  describe('startingPoint', () => {
    /** Abre `url` y responde solo al plano: cada test responde a las lecturas del día en su orden. */
    async function openAt(url: string, plan: PlanResponse = PLAN): Promise<void> {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url);
      request('GET', '/api/v1/admin/restaurants/kafe').flush(plan);
      await settle();
      page = harness.routeNativeElement as HTMLElement;
    }

    function title(): string {
      return normalized(page.querySelector('h1')?.textContent);
    }

    it('fechaOpensThatDay', async () => {
      await openAt('/panel/kafe?fecha=2026-11-12');

      await flushScreen('2026-11-12', 11, {});

      expect(title()).toBe('Jueves, 12 de noviembre');
      expect((page.querySelector('input[name="date"]') as HTMLInputElement).value).toBe(
        '2026-11-12',
      );
    });

    it('pastFechaStillOpens', async () => {
      // La semana de Inicio también enseña sus días pasados: Reservas no los limita a hoy en adelante.
      await openAt('/panel/kafe?fecha=2026-11-02');

      await flushScreen('2026-11-02', 11, {});

      expect(title()).toBe('Lunes, 2 de noviembre');
    });

    it('invalidFechaFallsBackToToday', async () => {
      // El 30 de febrero no existe.
      await openAt('/panel/kafe?fecha=2026-02-30');

      await flushScreen(TODAY, 11, {});

      expect(title()).toBe('Martes, 10 de noviembre');
      expect(page.querySelector('[role="alert"]')).toBeNull();
    });

    it('nonsenseFechaFallsBackToToday', async () => {
      await openAt('/panel/kafe?fecha=hola');

      await flushScreen(TODAY, 11, {});

      expect(title()).toBe('Martes, 10 de noviembre');
      expect(page.querySelector('[role="alert"]')).toBeNull();
    });

    it('reservaWithoutTableOpensAssign', async () => {
      await openAt('/panel/kafe?fecha=2026-11-10&reserva=3');

      // La reserva se busca entre las pendientes, que llegan aparte del día: esas se responden las últimas.
      expectDay(TODAY).flush([MARTA]);
      expectOccupancy(TODAY, 11).flush(OCCUPANCY);
      expectPending().flush([MARTA]);
      request('GET', '/api/v1/admin/reservations/3/suggestions').flush([]);
      await settle();

      expect(row('Marta').querySelector('.assign')).not.toBeNull();
      expect(row('Marta').classList).toContain('sel');
      // Abrir la elección de mesa no toca la URL.
      expect(TestBed.inject(Router).url).toBe('/panel/kafe?fecha=2026-11-10&reserva=3');
    });

    it('reservaWithTableHighlightsRow', async () => {
      const cena = { ...ANA, date: '2026-11-12' };
      await openAt('/panel/kafe?fecha=2026-11-12&reserva=1', TWO_SHIFTS);

      // Se abre con la comida (la primera por hora); la reserva es de la cena y hay que moverse a ella.
      expectDay('2026-11-12').flush([cena]);
      expectOccupancy('2026-11-12', 10).flush(OCCUPANCY);
      expectPending().flush([cena]);
      expectOccupancy('2026-11-12', 11).flush(OCCUPANCY);
      await settle();

      expect(row('Ana').classList).toContain('highlight');
      expect(row('Ana').classList).not.toContain('sel');
      expect(row('Ana').querySelector('.assign')).toBeNull();
      const selected = page.querySelector('[aria-label="Turno"] [aria-pressed="true"]');
      expect(normalized(selected?.textContent)).toBe('Cena · 20:00');
    });

    it('reservaThatIsNotPendingOnlyUsesFecha', async () => {
      await openAt('/panel/kafe?fecha=2026-11-12&reserva=99');

      await flushScreen('2026-11-12', 11, { day: [{ ...LUIS, date: '2026-11-12' }] });

      expect(title()).toBe('Jueves, 12 de noviembre');
      expect(rows().some((item) => item.classList.contains('highlight'))).toBe(false);
      expect(page.querySelector('.assign')).toBeNull();
    });

    it('reservaIsOnlyUsedOnTheFirstLoad', async () => {
      await open({ day: [MARTA], pending: [MARTA] });
      await harness.navigateByUrl('/panel/kafe?reserva=3');
      await settle();
      // Cambiar solo la query no recarga la página, y menos aún vuelve a aplicar la reserva.
      expect(page.querySelector('.assign')).toBeNull();

      feedEvents.next({ restaurantSlug: 'kafe' });
      await settle();
      await flushScreen(TODAY, 11, { day: [MARTA], pending: [MARTA] });

      expect(page.querySelector('.assign')).toBeNull();
    });

    it('tabPendientesOpensPendingTab', async () => {
      await openAt('/panel/kafe?tab=pendientes');

      await flushScreen(TODAY, 11, { pending: [ANA, MARTA] });

      const pressed = page.querySelector('[aria-label="Qué reservas ver"] [aria-pressed="true"]');
      expect(normalized(pressed?.textContent)).toBe('Pendientes · 2');
      expect(page.querySelector('.board')).toBeNull();
      expect(rows().map((item) => item.querySelector('.name')?.textContent?.trim())).toEqual([
        'Ana',
        'Marta',
      ]);
    });

    it('changingDateUpdatesUrlWithoutHistory', async () => {
      await open({ day: [LUIS] });
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigate');
      const pushed = vi.spyOn(TestBed.inject(Location), 'go');

      const input = page.querySelector<HTMLInputElement>('input[name="date"]')!;
      input.value = '2026-11-12';
      input.dispatchEvent(new Event('change'));
      await settle();
      expectDay('2026-11-12').flush([]);
      expectOccupancy('2026-11-12', 11).flush(OCCUPANCY);
      await settle();

      expect(navigate).toHaveBeenCalledWith([], {
        queryParams: { fecha: '2026-11-12', reserva: null, tab: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      expect(router.url).toBe('/panel/kafe?fecha=2026-11-12');
      // Sin entrada nueva en el historial y sin volver a pedir el plano.
      expect(pushed).not.toHaveBeenCalled();
      http.expectNone((candidate) => candidate.url.endsWith('/api/v1/admin/restaurants/kafe'));
      expect(title()).toBe('Jueves, 12 de noviembre');
    });
  });
});

describe('isRealDate', () => {
  it('acceptsOnlyDatesThatExistInTheCalendar', () => {
    expect(isRealDate('2026-11-12')).toBe(true);
    expect(isRealDate('2024-02-29')).toBe(true);
    expect(isRealDate('2025-02-29')).toBe(false);
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('2026-13-45')).toBe(false);
    expect(isRealDate('1999-12-31')).toBe(false);
    expect(isRealDate('2101-01-01')).toBe(false);
    expect(isRealDate('')).toBe(false);
    expect(isRealDate('12/11/2026')).toBe(false);
  });
});
