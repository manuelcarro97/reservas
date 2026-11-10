import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import type { Mock } from 'vitest';
import { ApiConfiguration } from '../../core/api/api-configuration';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { FeedEvent } from '../../core/api/models/feed-event';
import { PlanResponse } from '../../core/api/models/plan-response';
import { ShiftResponse } from '../../core/api/models/shift-response';
import { WeekSummaryResponse } from '../../core/api/models/week-summary-response';
import { OPEN_WINDOW } from '../../core/open-window';
import { NOW, addDays } from '../../core/time';
import { embedSnippet } from '../embed-snippet';
import { MeStore } from '../me.store';
import { FeedService } from '../notifications/feed.service';
import { dayTile, weekStart } from './home-figures';
import { HomePage } from './home.page';

@Component({ template: '<p>otra</p>' })
class Stub {}

const EVERY_DAY: ShiftResponse['days'] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

const CENA: ShiftResponse = {
  id: 11,
  name: 'Cena',
  start: '20:00:00',
  end: '23:30:00',
  days: EVERY_DAY,
};
const COMIDA: ShiftResponse = {
  id: 10,
  name: 'Comida',
  start: '13:00:00',
  end: '16:00:00',
  days: EVERY_DAY,
};

/** 9 mesas con 34 plazas. */
const SEATS = [2, 2, 2, 4, 4, 4, 4, 6, 6];

const PLAN: PlanResponse = {
  slug: 'kafe',
  name: 'Kafé del Puerto',
  status: 'PUBLISHED',
  // Los Ángeles y no Madrid: con la hora del navegador (UTC) cualquier cálculo saldría un día después.
  timeZone: 'America/Los_Angeles',
  theme: 'AZUL',
  bookingMode: 'FREE_CHOICE',
  room: { shape: 'RECTANGLE', width: 1200, height: 800, cutWidth: 0, cutDepth: 0, rotation: 0 },
  tables: SEATS.map((seats, index) => ({
    id: index + 1,
    label: String(index + 1),
    shape: 'SQUARE' as const,
    seats,
    rotation: 0,
    x: 100 + index * 100,
    y: 200,
  })),
  // Sin ordenar: la cena antes que la comida.
  shifts: [CENA, COMIDA],
};

// Lunes 9 de noviembre de 2026, 17:20 en Los Ángeles (UTC-8): la cena empieza en 2 h 40 min.
const CLOCK = new Date('2026-11-10T01:20:00Z');
const TODAY = '2026-11-09';

function reservation(extra: Partial<AdminReservation>): AdminReservation {
  return {
    status: 'CONFIRMED',
    date: TODAY,
    shiftId: CENA.id,
    partySize: 2,
    arrivalTime: '20:30:00',
    // Un móvil de verdad: sin él `Confirmar` y `Rechazar` no abrirían WhatsApp.
    customerPhone: '612 345 678',
    // El servidor manda el nombre de la mesa junto a su id: aquí es el propio id.
    tableLabel: extra.tableId === undefined ? undefined : String(extra.tableId),
    ...extra,
  };
}

const ANA = reservation({
  id: 1,
  customerName: 'Ana',
  shiftId: COMIDA.id,
  tableId: 1,
  partySize: 2,
});
const PEPE = reservation({
  id: 2,
  customerName: 'Pepe',
  shiftId: COMIDA.id,
  tableId: 2,
  partySize: 2,
});
const MARTA = reservation({ id: 3, customerName: 'Marta', tableId: 4, partySize: 3 });
const JUAN = reservation({ id: 4, customerName: 'Juan', tableId: 5, partySize: 4 });
const LUIS = reservation({
  id: 5,
  customerName: 'Luis Ejemplo',
  status: 'PENDING',
  tableId: 6,
  partySize: 6,
});
const CANCELLED = reservation({ id: 6, status: 'CANCELLED', tableId: 7, partySize: 8 });
/** 5 activas (1 pendiente) con 17 comensales; la cena ocupa 3 de 9 mesas. */
const TODAY_ROWS = [ANA, PEPE, MARTA, JUAN, LUIS, CANCELLED];

const PEDRO = reservation({
  id: 7,
  customerName: 'Pedro',
  status: 'PENDING',
  date: '2026-11-13',
  arrivalTime: '21:30:00',
  tableId: 7,
});
const JORGE = reservation({
  id: 8,
  customerName: 'Jorge',
  status: 'PENDING',
  date: '2026-11-14',
  arrivalTime: '22:30:00',
  partySize: 4,
  tableId: 8,
});
/** 1 pendiente hoy y 2 en los días siguientes. */
const PENDING_ROWS = [LUIS, PEDRO, JORGE];

interface Screen {
  plan?: PlanResponse;
  today?: AdminReservation[];
  pending?: AdminReservation[];
  closures?: string[];
  /** Reservas de los demás días de la semana, por fecha; los días que no estén aquí vienen vacíos. */
  week?: Record<string, AdminReservation[]>;
}

/** Los siete días (lunes a domingo) de la semana de `today`. */
function weekOf(today: string): string[] {
  const monday = weekStart(today);
  return Array.from({ length: 7 }, (_, offset) => addDays(monday, offset));
}

describe('HomePage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let feedEvents: Subject<FeedEvent>;
  let clock: Date;
  let openWindow: Mock<(url: string) => void>;
  let meRefresh: Mock<() => void>;
  /** Lo que el `MeStore` falso contesta; cada test lo cambia antes de `open()`. */
  let account: { demo: boolean; telegramAvailable: boolean; telegramLinked: boolean };

  beforeEach(() => {
    clock = CLOCK;
    openWindow = vi.fn<(url: string) => void>();
    meRefresh = vi.fn<() => void>();
    account = { demo: false, telegramAvailable: false, telegramLinked: false };
    feedEvents = new Subject<FeedEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'panel/:slug/inicio', component: HomePage },
          { path: 'panel/:slug', component: Stub },
          { path: 'panel/:slug/plano', component: Stub },
          { path: 'panel/:slug/ajustes', component: Stub },
        ]),
        { provide: NOW, useValue: () => clock },
        { provide: OPEN_WINDOW, useFactory: () => openWindow },
        { provide: FeedService, useValue: { events: feedEvents.asObservable() } },
        {
          provide: MeStore,
          useValue: {
            demo: () => account.demo,
            telegramAvailable: () => account.telegramAvailable,
            me: () => ({ telegramLinked: account.telegramLinked }),
            plans: () => [
              { slug: 'kafe', name: 'Kafé del Puerto' },
              { slug: 'otro', name: 'Otro' },
            ],
            refresh: () => meRefresh(),
          },
        },
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
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

  const base = (slug = 'kafe') => `/api/v1/admin/restaurants/${slug}`;

  function expectPlan(slug = 'kafe') {
    return request('GET', base(slug));
  }
  function expectDay(date: string, slug = 'kafe') {
    return request('GET', `${base(slug)}/reservations`, { date, status: null });
  }
  function expectPending(slug = 'kafe') {
    return request('GET', `${base(slug)}/reservations`, { status: 'PENDING', date: null });
  }
  function expectClosures(from: string, slug = 'kafe') {
    return request('GET', `${base(slug)}/closures`, { from });
  }

  function expectWeek(monday: string, slug = 'kafe') {
    return request('GET', `${base(slug)}/summary`, { week: monday });
  }

  /**
   * La respuesta del servidor para la semana de `today`, con la misma regla que `WeekSummaryService`: por turno que
   * abre ese día, mesas distintas ocupadas, reservas sin mesa, reservas, comensales y pendientes de las activas; un día
   * cerrado va sin turnos. Se calcula desde las reservas de cada fecha para que los tests digan qué hay en la semana.
   */
  function summaryOf(screen: Screen, today: string): WeekSummaryResponse {
    const plan = screen.plan ?? PLAN;
    const closures = new Set(screen.closures ?? []);
    return {
      monday: weekStart(today),
      days: weekOf(today).map((date) => {
        const rows = date === today ? (screen.today ?? TODAY_ROWS) : (screen.week?.[date] ?? []);
        const tile = dayTile(
          date,
          today,
          plan.shifts ?? [],
          closures,
          rows,
          plan.tables?.length ?? 0,
        );
        return {
          date,
          closed: tile.closed,
          shifts: tile.shifts.map((load) => ({
            shiftId: load.shift.id,
            occupiedTables: load.occupied,
            unassigned: load.unassigned,
            reservations: load.reservations,
            guests: load.guests,
            pending: load.pending,
          })),
        };
      }),
    };
  }

  /** La lectura de la semana: una sola petición, `summary?week=<lunes>`, con los siete días. */
  function flushWeek(screen: Screen, slug = 'kafe', today = TODAY): void {
    expectWeek(weekStart(today), slug).flush(summaryOf(screen, today));
  }

  /**
   * Las lecturas que salen cuando llega el plano: hoy, pendientes, cierres y el resumen de la semana. Si el próximo
   * turno cae dentro de la semana sale de ese mismo resumen: no hay una petición aparte.
   */
  async function flushReads(screen: Screen, slug = 'kafe', today = TODAY): Promise<void> {
    expectDay(today, slug).flush(screen.today ?? TODAY_ROWS);
    expectPending(slug).flush(screen.pending ?? PENDING_ROWS);
    expectClosures(weekStart(today), slug).flush(screen.closures ?? []);
    flushWeek(screen, slug, today);
    await settle();
  }

  async function open(screen: Screen = {}): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/inicio');
    expectPlan().flush(screen.plan ?? PLAN);
    await settle();
    await flushReads(screen);
    page = harness.routeNativeElement as HTMLElement;
  }

  function normalized(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, ' ').trim();
  }

  function text(selector: string): string {
    return normalized(page.querySelector(selector)?.textContent);
  }

  /** Las cifras del día, cada una como sus tres líneas. */
  function figures(): { kicker: string; value: string; sub: string }[] {
    return Array.from(page.querySelectorAll('.today .fig')).map((fig) => ({
      kicker: normalized(fig.querySelector('.kicker')?.textContent),
      value: normalized(fig.querySelector('b')?.textContent),
      sub: normalized(fig.querySelector('.sub')?.textContent),
    }));
  }

  function link(name: string): HTMLAnchorElement | undefined {
    return Array.from(page.querySelectorAll('a')).find(
      (candidate) => normalized(candidate.textContent) === name,
    );
  }

  function button(name: string): HTMLButtonElement | undefined {
    return Array.from(page.querySelectorAll('button')).find(
      (candidate) => normalized(candidate.textContent) === name,
    );
  }

  it('showsLoadingThenTitleInPlanZone', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/inicio');
    page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Cargando…');
    expect(text('.eyebrow b')).toBe('Kafé del Puerto');

    expectPlan().flush(PLAN);
    await settle();
    await flushReads({});

    // En Los Ángeles es lunes 9; con la hora del navegador (UTC) ya sería martes 10.
    expect(text('h1')).toBe('Hoy, lunes 9 de noviembre');
    expect(page.textContent).not.toContain('Cargando…');
  });

  it('figuresWaitForTheirReads', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/inicio');
    expectPlan().flush(PLAN);
    await settle();
    page = harness.routeNativeElement as HTMLElement;

    expect(figures().map((fig) => fig.sub)).toEqual([
      'Cargando…',
      'Cargando…',
      'Cargando…',
      'Cargando…',
      'Cargando…',
    ]);

    await flushReads({});
  });

  it('todayFiguresMatchSpec', async () => {
    await open();

    expect(figures()).toEqual([
      { kicker: 'Reservas hoy', value: '5', sub: '1 por confirmar' },
      { kicker: 'Comensales', value: '17', sub: 'de 34 plazas por turno' },
      { kicker: 'Pendientes', value: '3', sub: '1 hoy · 2 próximos días' },
      { kicker: 'Próximo turno', value: 'Cena · 20:00', sub: 'empieza en 2 h 40 min' },
      { kicker: 'Mesas libres · Cena', value: '6 / 9', sub: 'ocupación 33 %' },
    ]);
  });

  it('allConfirmedSaysSo', async () => {
    await open({ today: [ANA, { ...LUIS, status: 'CONFIRMED' }], pending: [] });

    expect(figures()[0].sub).toBe('todas confirmadas');
    expect(figures()[2]).toEqual({ kicker: 'Pendientes', value: '0', sub: 'todo al día' });
  });

  it('startsInMinutesUnderAnHour', async () => {
    // 19:20 en Los Ángeles.
    clock = new Date('2026-11-10T03:20:00Z');
    await open();

    expect(figures()[3].sub).toBe('empieza en 40 min');
  });

  it('startsInWholeHours', async () => {
    // 18:00 en Los Ángeles.
    clock = new Date('2026-11-10T02:00:00Z');
    await open();

    expect(figures()[3].sub).toBe('empieza en 2 h');
  });

  it('nextShiftTomorrowWhenNoneLeftToday', async () => {
    // 21:30 en Los Ángeles: la cena ya ha empezado.
    clock = new Date('2026-11-10T05:30:00Z');
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/inicio');
    expectPlan().flush(PLAN);
    await settle();
    // Mañana cae dentro de la semana: su carga llega en el resumen de la semana (sin petición aparte) y de ella sale la
    // cifra de mesas libres.
    await flushReads({
      week: {
        '2026-11-10': [reservation({ id: 20, date: '2026-11-10', shiftId: COMIDA.id, tableId: 1 })],
      },
    });
    page = harness.routeNativeElement as HTMLElement;

    expect(figures()[3]).toEqual({
      kicker: 'Próximo turno',
      value: 'Mañana · Comida 13:00',
      sub: 'hoy no quedan turnos',
    });
    expect(figures()[4]).toEqual({
      kicker: 'Mesas libres · mañana, Comida',
      value: '8 / 9',
      sub: 'ocupación 11 %',
    });
  });

  it('nextShiftSkipsAClosedDayAndNamesTheWeekday', async () => {
    clock = new Date('2026-11-10T05:30:00Z');
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/inicio');
    expectPlan().flush(PLAN);
    await settle();
    // El miércoles también está en la semana: sin petición aparte.
    await flushReads({ closures: ['2026-11-10'] });
    page = harness.routeNativeElement as HTMLElement;

    expect(figures()[3].value).toBe('Miércoles · Comida 13:00');
    expect(figures()[4]).toEqual({
      kicker: 'Mesas libres · miércoles, Comida',
      value: '9 / 9',
      sub: 'sin reservas aún',
    });
  });

  it('noShiftsShowsDashes', async () => {
    await open({ plan: { ...PLAN, shifts: [] }, today: [], pending: [] });

    expect(figures()[3]).toEqual({
      kicker: 'Próximo turno',
      value: '—',
      sub: 'sin turnos próximos',
    });
    expect(figures()[4].value).toBe('—');
  });

  it('unassignedReservationsAreNotedNextToFreeTables', async () => {
    const withoutTable = reservation({ id: 30, customerName: 'Sara', tableId: undefined });
    await open({ today: [MARTA, JUAN, withoutTable], pending: [] });

    expect(figures()[4]).toEqual({
      kicker: 'Mesas libres · Cena',
      value: '7 / 9',
      sub: 'ocupación 22 % · 1 sin mesa',
    });
  });

  it('planCardShowsFiguresAndLinks', async () => {
    await open();

    const card = page.querySelector('app-home-plan-card') as HTMLElement;
    const values = Array.from(card.querySelectorAll('.figures .fig')).map((fig) => ({
      kicker: normalized(fig.querySelector('.kicker')?.textContent),
      value: normalized(fig.querySelector('b')?.textContent),
      sub: normalized(fig.querySelector('.sub')?.textContent),
    }));

    expect(values).toEqual([
      { kicker: 'Mesas', value: '9', sub: '' },
      { kicker: 'Capacidad', value: '34', sub: 'comensales' },
      { kicker: 'Turnos', value: '2', sub: 'Comida · Cena' },
      { kicker: 'Modo', value: 'Elección libre', sub: '' },
    ]);
    expect(normalized(card.querySelector('.dot-state')?.textContent)).toBe('Publicado');
    expect(card.querySelector('app-plano svg')).not.toBeNull();
    expect(link('Editar plano')?.getAttribute('href')).toBe('/panel/kafe/plano');
    expect(link('Ver página pública')?.getAttribute('href')).toBe('/r/kafe');
    expect(text('.link-box')).toContain(`${location.host}/r/kafe`);
  });

  it('publicPageOpensInANewTab', async () => {
    await open();

    // Sale del panel: en la misma pestaña el dueño perdería su sitio en él (igual que en Configuración).
    const publicPage = link('Ver página pública');
    expect(publicPage?.getAttribute('target')).toBe('_blank');
    expect(publicPage?.getAttribute('rel')).toBe('noopener');
  });

  it('copyLinkUsesClipboardWithManualFallback', async () => {
    await open();

    // jsdom no trae portapapeles: es el caso de un navegador que lo niega.
    button('Copiar')!.click();
    await settle();
    expect(text('.copy-status')).toBe('Copia el enlace a mano');

    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    button('Copiar')!.click();
    await settle();

    expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/kafe`);
    expect(text('.copy-status')).toBe('Copiado');
  });

  it('draftHidesCopyAndPublicLink', async () => {
    await open({ plan: { ...PLAN, status: 'DRAFT' }, today: [], pending: [] });

    expect(normalized(page.querySelector('app-home-plan-card .dot-state')?.textContent)).toBe(
      'Borrador',
    );
    expect(button('Copiar')).toBeUndefined();
    expect(link('Ver página pública')).toBeUndefined();
    expect(link('Editar plano')?.getAttribute('href')).toBe('/panel/kafe/plano');
  });

  it('notFoundForAnotherOwnersPlan', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/inicio');
    expectPlan().flush({ code: 'RESTAURANT_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect((harness.routeNativeElement as HTMLElement).textContent).toContain(
      'Este plano no existe',
    );
  });

  it('loadErrorShowsRetry', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/inicio');
    expectPlan().flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    page = harness.routeNativeElement as HTMLElement;

    expect(text('[role="alert"]')).toContain('No se pudo cargar el resumen');

    button('Reintentar')!.click();
    await settle();
    expectPlan().flush(PLAN);
    await settle();
    await flushReads({});

    expect(text('h1')).toBe('Hoy, lunes 9 de noviembre');
  });

  it('partialFailureStaysInItsCard', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/inicio');
    expectPlan().flush(PLAN);
    await settle();
    expectDay(TODAY).flush(TODAY_ROWS);
    expectPending().flush(null, { status: 500, statusText: 'Server Error' });
    expectClosures(TODAY).flush([]);
    flushWeek({});
    await settle();
    page = harness.routeNativeElement as HTMLElement;

    const alerts = Array.from(page.querySelectorAll('[role="alert"]'));
    expect(alerts.length).toBe(1);
    expect(alerts[0].closest('#pendientes')).not.toBeNull();
    expect(normalized(alerts[0].textContent)).toContain('No se pudieron cargar las pendientes');
    // El resto de la página sigue con sus datos.
    expect(figures()[0].value).toBe('5');
    expect(figures()[2]).toEqual({ kicker: 'Pendientes', value: '—', sub: 'no disponible' });
    expect(text('h1')).toBe('Hoy, lunes 9 de noviembre');
  });

  it('failedTodayReadStaysInTheFigures', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/inicio');
    expectPlan().flush(PLAN);
    await settle();
    expectDay(TODAY).flush(null, { status: 500, statusText: 'Server Error' });
    expectPending().flush(PENDING_ROWS);
    expectClosures(TODAY).flush([]);
    flushWeek({});
    await settle();
    page = harness.routeNativeElement as HTMLElement;

    expect(text('.today [role="alert"]')).toContain('No se pudieron cargar las cifras de hoy');
    expect(page.querySelectorAll('[role="alert"]').length).toBe(1);

    // Reintentar vuelve a pedir lo de hoy y lo demás, no el plano.
    button('Reintentar')!.click();
    await settle();
    await flushReads({});

    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(figures()[0].value).toBe('5');
  });

  it('switchingPlanCancelsTheReadsOfThePreviousOne', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/inicio');
    expectPlan().flush(PLAN);
    await settle();
    // Las lecturas de "kafe" quedan en vuelo: hoy, pendientes, cierres y el resumen de la semana.
    const inFlight = [
      expectDay(TODAY),
      expectPending(),
      expectClosures(TODAY),
      expectWeek(weekStart(TODAY)),
    ];

    await harness.navigateByUrl('/panel/otro/inicio');

    // Si respondieran después, pisarían la pantalla de "otro": tienen que haberse cancelado.
    expect(inFlight.length).toBe(4);
    expect(inFlight.every((pending) => pending.cancelled)).toBe(true);
    expectPlan('otro').flush({ ...PLAN, slug: 'otro', name: 'Otro' });
    await settle();
    await flushReads({}, 'otro');
  });

  it('switchingPlanDropsPreviousAnswers', async () => {
    await open();
    expect(figures()[0].value).toBe('5');

    await harness.navigateByUrl('/panel/otro/inicio');
    page = harness.routeNativeElement as HTMLElement;

    // Mientras llega el plano nuevo no queda nada del anterior.
    expect(page.textContent).toContain('Cargando…');
    expect(page.querySelector('.today')).toBeNull();

    expectPlan('otro').flush({
      ...PLAN,
      slug: 'otro',
      name: 'Otro',
      tables: PLAN.tables!.slice(0, 2),
    });
    await settle();
    // Las respuestas del plano nuevo son las únicas que cuentan.
    expectDay(TODAY, 'otro').flush([ANA]);
    expectPending('otro').flush([]);
    expectClosures(TODAY, 'otro').flush([]);
    flushWeek({}, 'otro');
    await settle();

    expect(figures()[0]).toEqual({ kicker: 'Reservas hoy', value: '1', sub: 'todas confirmadas' });
    expect(figures()[1].sub).toBe('de 4 plazas por turno');
    expect(text('app-home-plan-card .sheet-title')).toBe('Tu plano');
    expect(text('.eyebrow b')).toBe('Otro');
  });

  it('feedEventOfThisPlanRefreshesTheReads', async () => {
    await open();

    feedEvents.next({ restaurantSlug: 'otro' });
    await settle();
    http.expectNone((candidate) => candidate.url.includes('/reservations'));

    feedEvents.next({ restaurantSlug: 'kafe' });
    await settle();
    // Se leen otra vez hoy, pendientes y cierres, pero no el plano.
    await flushReads({ today: [ANA] });

    expect(figures()[0].value).toBe('1');
  });

  describe('reloj', () => {
    /** Solo el temporizador: con todos los relojes falsos `whenStable` y las peticiones de prueba no avanzan. */
    beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
    afterEach(() => vi.useRealTimers());

    /** Pasa un minuto de reloj: la hora del navegador pasa a `to` y salta el temporizador de Inicio. */
    async function tick(to: string): Promise<void> {
      clock = new Date(to);
      vi.advanceTimersByTime(60_000);
      await settle();
    }

    it('clockTicksWithoutRequests', async () => {
      // 19:50 en Los Ángeles: la cena empieza en 10 min.
      clock = new Date('2026-11-10T03:50:00Z');
      await open();
      expect(figures()[3]).toMatchObject({ value: 'Cena · 20:00', sub: 'empieza en 10 min' });

      // 20:01: la cena ya empezó y el próximo turno es el de mañana. Es la misma lectura de la semana, sin peticiones.
      await tick('2026-11-10T04:01:00Z');

      http.expectNone(() => true);
      expect(figures()[3]).toMatchObject({ value: 'Mañana · Comida 13:00' });
      expect(text('h1')).toBe('Hoy, lunes 9 de noviembre');
    });

    it('newDayRefreshesTheData', async () => {
      // 23:50 del lunes 9 en Los Ángeles.
      clock = new Date('2026-11-10T07:50:00Z');
      await open();
      expect(text('h1')).toBe('Hoy, lunes 9 de noviembre');

      // 00:01 del martes 10: cambia el día, así que "hoy" y la semana se vuelven a pedir (el plano no).
      await tick('2026-11-10T08:01:00Z');
      await flushReads({}, 'kafe', '2026-11-10');

      expect(text('h1')).toBe('Hoy, martes 10 de noviembre');
      expect(text('app-home-week .day.is-today .dhead b')).toBe('Mar 10');
    });

    it('nextShiftBeyondTheWeekIsReadWhenTheClockMovesOn', async () => {
      // Domingo 15, 19:50 en Los Ángeles: el próximo turno es la cena de hoy.
      clock = new Date('2026-11-16T03:50:00Z');
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/inicio');
      expectPlan().flush(PLAN);
      await settle();
      await flushReads({ today: [], pending: [] }, 'kafe', '2026-11-15');
      page = harness.routeNativeElement as HTMLElement;

      // 20:01: el próximo turno es el del lunes 16, fuera de la semana: esa carga no está en el resumen y se pide.
      await tick('2026-11-16T04:01:00Z');
      expectDay('2026-11-16').flush([
        reservation({ id: 20, date: '2026-11-16', shiftId: COMIDA.id, tableId: 1 }),
      ]);
      await settle();

      expect(figures()[3].value).toBe('Mañana · Comida 13:00');
      expect(figures()[4].value).toBe('8 / 9');
    });

    it('leavingThePageStopsTheClock', async () => {
      await open();
      expect(vi.getTimerCount()).toBe(1);

      TestBed.resetTestingModule();

      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('pendientes', () => {
    /** La fila de una pendiente, por el nombre del cliente. */
    function row(name: string): HTMLElement {
      const found = Array.from(page.querySelectorAll<HTMLElement>('#pendientes .row')).find(
        (item) => normalized(item.textContent).includes(name),
      );
      if (!found) {
        throw new Error(`No hay fila de ${name}`);
      }
      return found;
    }

    function rowButton(name: string, label: string): HTMLButtonElement | undefined {
      return Array.from(row(name).querySelectorAll('button')).find(
        (candidate) => normalized(candidate.textContent) === label,
      );
    }

    async function click(target: HTMLElement | undefined): Promise<void> {
      target!.click();
      await settle();
    }

    function post(id: number, action: 'confirm' | 'cancel') {
      return request('POST', `/api/v1/admin/reservations/${id}/${action}`);
    }

    /** Lo que el servidor devuelve al confirmar o rechazar: la reserva con su turno. */
    function details(source: AdminReservation, status: string): Record<string, unknown> {
      return {
        code: 'ABC123',
        date: source.date,
        status,
        shiftId: source.shiftId,
        shiftName: 'Cena',
        arrivalTime: source.arrivalTime,
        partySize: source.partySize,
        restaurantName: 'Kafé del Puerto',
        slug: 'kafe',
        tableLabel: source.tableLabel,
      };
    }

    it('pendingSplitTodayAndLater', async () => {
      await open();

      const groups = Array.from(page.querySelectorAll('#pendientes .group')).map((group) =>
        normalized(group.textContent),
      );
      expect(groups).toEqual(['Hoy 1', 'Próximos días 2']);

      // La de hoy lleva la hora y el aviso de que caduca; las de otros días, la fecha.
      expect(normalized(row('Luis Ejemplo').querySelector('.time')?.textContent)).toBe('20:30');
      expect(normalized(row('Luis Ejemplo').querySelector('.meta')?.textContent)).toBe(
        'Cena · 6 personas · Mesa 6',
      );
      expect(normalized(row('Luis Ejemplo').querySelector('.deadline')?.textContent)).toBe(
        'Se cancela sola a las 20:00 si no la confirmas',
      );
      expect(row('Luis Ejemplo').classList).toContain('urgent');
      expect(page.querySelectorAll('#pendientes .deadline').length).toBe(1);

      expect(normalized(row('Pedro').querySelector('.date')?.textContent)).toBe('13vie');
      expect(normalized(row('Jorge').querySelector('.date')?.textContent)).toBe('14sáb');
      expect(normalized(row('Pedro').querySelector('.meta')?.textContent)).toBe(
        'Cena 21:30 · 2 personas · Mesa 7',
      );
      expect(row('Pedro').classList).not.toContain('urgent');
    });

    it('pendingCardWaitsForItsRead', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/inicio');
      expectPlan().flush(PLAN);
      await settle();
      page = harness.routeNativeElement as HTMLElement;

      expect(text('#pendientes')).toContain('Cargando…');
      expect(text('#pendientes')).not.toContain('Todo al día');

      await flushReads({});
      expect(text('#pendientes')).not.toContain('Cargando…');
    });

    it('confirmFromHome', async () => {
      await open();

      await click(rowButton('Luis Ejemplo', 'Confirmar'));
      post(5, 'confirm').flush(details(LUIS, 'CONFIRMED'));
      await settle();

      // Se avisa al cliente por WhatsApp y se vuelven a leer hoy y las pendientes.
      expect(openWindow).toHaveBeenCalledTimes(1);
      expect(openWindow).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/34612345678'));
      await flushReads({ today: [ANA, { ...LUIS, status: 'CONFIRMED' }], pending: [PEDRO, JORGE] });

      expect(text('#pendientes [role="status"]')).toContain('Reserva de Luis Ejemplo confirmada.');
      expect(link('Abrir WhatsApp')?.getAttribute('href')).toContain('https://wa.me/');
      expect(figures()[2].value).toBe('2');
      expect(button('Confirmar')).toBeDefined();
      expect(page.querySelector('#pendientes .group')?.textContent).toContain('Próximos días');
    });

    it('rejectAsksFirstThenOpensWhatsapp', async () => {
      await open();

      await click(rowButton('Luis Ejemplo', 'Rechazar'));
      // Antes de llamar a la API se pregunta, en la propia fila.
      http.expectNone((candidate) => candidate.method === 'POST');
      expect(normalized(row('Luis Ejemplo').querySelector('.confirm-box')?.textContent)).toContain(
        '¿Rechazar la reserva de Luis Ejemplo?',
      );
      expect(openWindow).not.toHaveBeenCalled();

      await click(rowButton('Luis Ejemplo', 'Sí, rechazar'));
      post(5, 'cancel').flush(details(LUIS, 'CANCELLED'));
      await settle();

      expect(openWindow).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/'));
      await flushReads({ pending: [PEDRO, JORGE] });
      expect(text('#pendientes [role="status"]')).toContain('Reserva de Luis Ejemplo rechazada.');
    });

    it('declineRejectLeavesEverythingAsIs', async () => {
      await open();

      await click(rowButton('Luis Ejemplo', 'Rechazar'));
      await click(rowButton('Luis Ejemplo', 'No'));

      expect(row('Luis Ejemplo').querySelector('.confirm-box')).toBeNull();
      http.expectNone((candidate) => candidate.method === 'POST');
    });

    it('demoConfirmsWithoutWhatsapp', async () => {
      account.demo = true;
      await open();

      await click(rowButton('Luis Ejemplo', 'Confirmar'));
      post(5, 'confirm').flush(details(LUIS, 'CONFIRMED'));
      await settle();
      await flushReads({ pending: [PEDRO, JORGE] });

      expect(openWindow).not.toHaveBeenCalled();
      expect(link('Abrir WhatsApp')).toBeUndefined();
      expect(text('#pendientes [role="status"]')).toContain('Reserva de Luis Ejemplo confirmada.');
    });

    it('withoutTableShowsAssign', async () => {
      const withoutTable = { ...LUIS, tableId: undefined, tableLabel: undefined };
      await open({ pending: [withoutTable] });

      expect(rowButton('Luis Ejemplo', 'Confirmar')).toBeUndefined();
      expect(normalized(row('Luis Ejemplo').querySelector('.meta')?.textContent)).toBe(
        'Cena · 6 personas · sin mesa',
      );

      await click(rowButton('Luis Ejemplo', 'Asignar mesa'));
      await harness.fixture.whenStable();

      http.expectNone((candidate) => candidate.method === 'POST');
      expect(TestBed.inject(Router).url).toBe('/panel/kafe?fecha=2026-11-09&reserva=5');
    });

    it('staleReservationReloadsTheList', async () => {
      await open();

      await click(rowButton('Luis Ejemplo', 'Confirmar'));
      post(5, 'confirm').flush(
        { code: 'INVALID_TRANSITION' },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      // Otro dispositivo ya la cambió: se avisa y se vuelven a leer las pendientes.
      await flushReads({ today: [ANA, { ...LUIS, status: 'CANCELLED' }], pending: [PEDRO, JORGE] });
      expect(text('#pendientes [role="alert"]')).toBe(
        'Esa reserva ya no admite esa acción. Se ha actualizado la lista.',
      );
      expect(openWindow).not.toHaveBeenCalled();
      expect(page.textContent).not.toContain('Luis Ejemplo');
      // Sin `busy`: se puede seguir confirmando las demás.
      expect(rowButton('Pedro', 'Confirmar')?.disabled).toBe(false);
    });

    it('buttonsAreDisabledWhileAnActionIsInFlight', async () => {
      await open();

      await click(rowButton('Luis Ejemplo', 'Confirmar'));

      expect(rowButton('Pedro', 'Confirmar')?.disabled).toBe(true);
      post(5, 'confirm').flush(details(LUIS, 'CONFIRMED'));
      await settle();
      await flushReads({});
    });

    it('noPendingShowsAllClear', async () => {
      await open({ today: [ANA, MARTA], pending: [] });

      expect(text('#pendientes')).toContain('Todo al día');
      expect(text('#pendientes')).toContain('No hay reservas esperando confirmación.');
      expect(figures()[2]).toEqual({ kicker: 'Pendientes', value: '0', sub: 'todo al día' });
      expect(link('Ver en Reservas →')).toBeUndefined();
      expect(page.querySelector('#pendientes .group')).toBeNull();
    });

    it('draftWithoutReservationsShowsPublishNotice', async () => {
      await open({ plan: { ...PLAN, status: 'DRAFT' }, today: [], pending: [] });

      const card = page.querySelector('#pendientes') as HTMLElement;
      expect(normalized(card.querySelector('.callout')?.textContent)).toContain(
        'Tu plano está en borrador.',
      );
      expect(normalized(card.textContent)).toContain('Los clientes aún no pueden reservar');
      expect(
        Array.from(card.querySelectorAll('button')).map((item) => normalized(item.textContent)),
      ).toEqual(['Publicar plano']);
      expect(
        Array.from(card.querySelectorAll('a')).find(
          (item) => normalized(item.textContent) === 'Editar plano',
        )?.href,
      ).toContain('/panel/kafe/plano');
      expect(card.textContent).not.toContain('Todo al día');
      // El aviso no es un error: la única alerta posible es la de una lectura que falla.
      expect(card.querySelector('[role="alert"]')).toBeNull();
    });

    it('draftWithReservationsKeepsTheList', async () => {
      await open({ plan: { ...PLAN, status: 'DRAFT' } });

      const card = page.querySelector('#pendientes') as HTMLElement;
      expect(normalized(card.querySelector('.callout')?.textContent)).toContain(
        'Tu plano está en borrador.',
      );
      // La lista y las cifras son las reales; el aviso va encima.
      expect(card.querySelectorAll('.row').length).toBe(3);
      expect(figures()[2].value).toBe('3');
      const notice = card.querySelector('.callout') as HTMLElement;
      const list = card.querySelector('.pending-list') as HTMLElement;
      expect(notice.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('publishFromHome', async () => {
      await open({ plan: { ...PLAN, status: 'DRAFT' }, today: [], pending: [] });

      await click(button('Publicar plano'));
      expect(button('Publicar plano')?.disabled).toBe(true);
      request('POST', `${base()}/publish`).flush({ ...PLAN, status: 'PUBLISHED' });
      await settle();

      // El plano ya está publicado: sin aviso, con "Todo al día", y el selector de la cabecera se actualiza.
      expect(meRefresh).toHaveBeenCalledTimes(1);
      expect(page.querySelector('#pendientes .callout')).toBeNull();
      expect(text('#pendientes')).toContain('Todo al día');
      expect(normalized(page.querySelector('app-home-plan-card .dot-state')?.textContent)).toBe(
        'Publicado',
      );
      expect(link('Ver página pública')).toBeDefined();
    });

    it('publishFailureShowsItsMessage', async () => {
      await open({ plan: { ...PLAN, status: 'DRAFT' }, today: [], pending: [] });

      await click(button('Publicar plano'));
      request('POST', `${base()}/publish`).flush(
        { code: 'PLAN_NOT_PUBLISHABLE' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await settle();

      expect(text('#pendientes [role="alert"]')).toBe(
        'Para publicar, el plano necesita al menos una mesa y que todas quepan en el local.',
      );
      expect(meRefresh).not.toHaveBeenCalled();
      // Se puede volver a intentar.
      expect(button('Publicar plano')?.disabled).toBe(false);
      expect(button('Reintentar')).toBeUndefined();
    });

    it('pendingFigureScrollsToCard', async () => {
      // jsdom no implementa `scrollIntoView`.
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        await open();

        const figure = page.querySelector<HTMLButtonElement>('.today button.fig');
        expect(normalized(figure?.querySelector('.kicker')?.textContent)).toBe('Pendientes');
        await click(figure ?? undefined);

        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(page.querySelector('#pendientes'));
      } finally {
        Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
      }
    });

    it('pendingFigureIsOnlyAButtonWhenThereAreOnes', async () => {
      await open({ pending: [] });

      expect(Array.from(page.querySelectorAll('.today button.fig')).length).toBe(0);
    });

    it('pendingNameLinksToReservas', async () => {
      await open();

      expect(link('Luis Ejemplo')?.getAttribute('href')).toBe(
        '/panel/kafe?fecha=2026-11-09&reserva=5',
      );
      expect(link('Pedro')?.getAttribute('href')).toBe('/panel/kafe?fecha=2026-11-13&reserva=7');
    });

    it('seeInReservasLinksToPendingTab', async () => {
      await open();

      expect(link('Ver en Reservas →')?.getAttribute('href')).toBe('/panel/kafe?tab=pendientes');
    });
  });

  describe('configuración', () => {
    /** Las filas de la tarjeta: `dt` → texto del `dd`. */
    function settings(): Record<string, string> {
      const card = page.querySelector('app-home-settings') as HTMLElement;
      return Object.fromEntries(
        Array.from(card.querySelectorAll('.settings > div')).map((item) => [
          normalized(item.querySelector('dt')?.textContent),
          normalized(item.querySelector('dd')?.textContent),
        ]),
      );
    }

    it('settingsCardValues', async () => {
      account.telegramAvailable = true;
      // El cierre anterior a hoy no cuenta: el próximo es el del domingo.
      await open({
        plan: { ...PLAN, cancellationDeadlineHours: 2 },
        closures: ['2026-11-01', '2026-11-20', '2026-11-15'],
      });

      expect(settings()).toEqual({
        'Modo de reserva': 'Elección libre',
        'Cancelación del cliente': 'hasta 2 h antes',
        'Reservas hasta': '90 días vista',
        'Próximo día cerrado': 'dom 15 nov',
        'Avisos por Telegram': 'Sin vincular',
        'Incrustar en tu web': 'Copiar código',
      });
      expect(link('Editar →')?.getAttribute('href')).toBe('/panel/kafe/ajustes');
    });

    it('settingsCardWithoutClosuresAndWithZeroHours', async () => {
      account.telegramAvailable = true;
      account.telegramLinked = true;
      await open({
        plan: { ...PLAN, bookingMode: 'ASSIGNED', cancellationDeadlineHours: 0 },
        closures: ['2026-11-01'],
      });

      expect(settings()).toMatchObject({
        'Modo de reserva': 'Asigno yo la mesa',
        'Cancelación del cliente': 'hasta la hora de la reserva',
        'Próximo día cerrado': 'ninguno',
        'Avisos por Telegram': 'Vinculado',
      });
    });

    it('telegramRowIsHiddenWithoutTelegram', async () => {
      await open();

      expect(Object.keys(settings())).not.toContain('Avisos por Telegram');
    });

    it('telegramRowIsHiddenInTheDemo', async () => {
      account.telegramAvailable = true;
      account.demo = true;
      await open();

      expect(Object.keys(settings())).not.toContain('Avisos por Telegram');
    });

    it('embedCodeOnlyWhenPublished', async () => {
      const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await open();

      expect(Object.keys(settings())).toContain('Incrustar en tu web');
      button('Copiar código')!.click();
      await settle();

      expect(writeText).toHaveBeenCalledWith(
        embedSnippet(location.origin, 'kafe', 'Kafé del Puerto'),
      );
      expect(text('app-home-settings [role="status"]')).toBe('Copiado');
    });

    it('embedCodeIsHiddenInADraft', async () => {
      await open({ plan: { ...PLAN, status: 'DRAFT' }, today: [], pending: [] });

      expect(Object.keys(settings())).not.toContain('Incrustar en tu web');
      expect(button('Copiar código')).toBeUndefined();
    });

    it('embedCodeFallsBackToManualCopy', async () => {
      await open();

      // jsdom no trae portapapeles: es el caso de un navegador que lo niega.
      button('Copiar código')!.click();
      await settle();

      const field = page.querySelector('app-home-settings textarea') as HTMLTextAreaElement;
      expect(field.value).toBe(embedSnippet(location.origin, 'kafe', 'Kafé del Puerto'));
      expect(text('app-home-settings [role="status"]')).toBe('Copia el código a mano');
    });
  });

  describe('semana', () => {
    function days(): HTMLElement[] {
      return Array.from(page.querySelectorAll<HTMLElement>('app-home-week .day'));
    }

    /** La tarjeta de un día, por su cabecera (`Lun 9`). */
    function day(label: string): HTMLElement {
      const found = days().find(
        (item) => normalized(item.querySelector('.dhead b')?.textContent) === label,
      );
      if (!found) {
        throw new Error(`No hay tarjeta de ${label}`);
      }
      return found;
    }

    function tags(item: HTMLElement): string[] {
      return Array.from(item.querySelectorAll('.tag')).map((tag) => normalized(tag.textContent));
    }

    /** Cada fila de turno como `Comida 2/9` (más `1 sin mesa` si lo hay): nombre, cifra y nota. */
    function shiftRows(item: HTMLElement): string[] {
      return Array.from(item.querySelectorAll('.srow')).map((row) =>
        Array.from(row.children)
          .map((part) => normalized(part.textContent))
          .filter((part) => part !== '')
          .join(' '),
      );
    }

    function foot(item: HTMLElement): string {
      return normalized(item.querySelector('.dfoot')?.textContent);
    }

    /** Un día con una reserva en cada mesa de la cena (9 mesas): turno lleno. */
    function fullDinner(date: string): AdminReservation[] {
      return SEATS.map((_, index) =>
        reservation({ id: 100 + index, date, shiftId: CENA.id, tableId: index + 1 }),
      );
    }

    it('weekRunsMondayToSunday', async () => {
      await open();

      expect(days().map((item) => normalized(item.querySelector('.dhead b')?.textContent))).toEqual(
        ['Lun 9', 'Mar 10', 'Mié 11', 'Jue 12', 'Vie 13', 'Sáb 14', 'Dom 15'],
      );
      expect(tags(day('Lun 9'))).toContain('hoy');
      expect(days().filter((item) => item.classList.contains('is-today'))).toEqual([day('Lun 9')]);
      expect(text('app-home-week .sheet-title')).toBe('Esta semana');
      expect(text('app-home-week .meta')).toBe(
        'semana del 9 al 15 de noviembre · mesas ocupadas por turno, de 9',
      );
    });

    it('weekUsesOneRequest', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/inicio');
      expectPlan().flush(PLAN);
      await settle();

      // La semana entera es una petición al resumen; de las reservas solo se lee el día de hoy.
      const summaries = http.match((candidate) => candidate.url.endsWith('/summary'));
      const dayReads = http.match(
        (candidate) =>
          candidate.url.endsWith('/reservations') &&
          candidate.params.has('date') &&
          !candidate.params.has('status'),
      );
      expect(summaries.length).toBe(1);
      expect(summaries[0].request.params.get('week')).toBe('2026-11-09');
      expect(dayReads.length).toBe(1);
      expect(dayReads[0].request.params.get('date')).toBe(TODAY);

      dayReads[0].flush(TODAY_ROWS);
      summaries[0].flush(summaryOf({}, TODAY));
      expectPending().flush(PENDING_ROWS);
      expectClosures(TODAY).flush([]);
      await settle();
      page = harness.routeNativeElement as HTMLElement;

      expect(days().length).toBe(7);
    });

    it('weekShowsLoadingUntilItsReads', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/inicio');
      expectPlan().flush(PLAN);
      await settle();
      page = harness.routeNativeElement as HTMLElement;

      expect(text('app-home-week')).toContain('Cargando…');
      expect(days().length).toBe(0);

      await flushReads({});

      expect(text('app-home-week')).not.toContain('Cargando…');
    });

    it('weekCrossingAMonthNamesBoth', async () => {
      // Viernes 30 de octubre, 13:00 en Los Ángeles (todavía UTC-7).
      clock = new Date('2026-10-30T20:00:00Z');
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/inicio');
      expectPlan().flush(PLAN);
      await settle();
      await flushReads({ today: [], pending: [] }, 'kafe', '2026-10-30');
      page = harness.routeNativeElement as HTMLElement;

      expect(text('app-home-week .meta')).toBe(
        'semana del 26 de octubre al 1 de noviembre · mesas ocupadas por turno, de 9',
      );
      expect(days().map((item) => normalized(item.querySelector('.dhead b')?.textContent))).toEqual(
        ['Lun 26', 'Mar 27', 'Mié 28', 'Jue 29', 'Vie 30', 'Sáb 31', 'Dom 1'],
      );
    });

    it('dayTileShowsShiftBarsAndTotals', async () => {
      await open({
        week: {
          '2026-11-10': [
            reservation({ id: 40, date: '2026-11-10', shiftId: COMIDA.id, tableId: 1 }),
          ],
          '2026-11-12': fullDinner('2026-11-12'),
        },
      });

      // Hoy: la comida ocupa 2 mesas y la cena 3; 5 reservas activas de 17 personas (la cancelada no cuenta).
      expect(shiftRows(day('Lun 9'))).toEqual(['Comida 2/9', 'Cena 3/9']);
      expect(foot(day('Lun 9'))).toBe('5 reservas · 17 personas');
      expect(shiftRows(day('Mar 10'))).toEqual(['Comida 1/9', 'Cena 0/9']);
      expect(foot(day('Mar 10'))).toBe('1 reserva · 2 personas');
      expect(foot(day('Mié 11'))).toBe('sin reservas');

      // La barra mide mesas ocupadas / mesas, y solo la de un turno lleno lleva `full`.
      const bars = Array.from(day('Lun 9').querySelectorAll<HTMLElement>('.bar span'));
      expect(bars.map((bar) => bar.style.width)).toEqual(['22%', '33%']);
      expect(shiftRows(day('Jue 12'))).toEqual(['Comida 0/9', 'Cena 9/9']);
      expect(day('Jue 12').querySelectorAll('.bar.full').length).toBe(1);
      expect(day('Jue 12').querySelector('.bar.full span')).toBe(
        day('Jue 12').querySelectorAll('.bar span')[1],
      );
      expect(page.querySelectorAll('app-home-week .bar.full').length).toBe(1);
    });

    it('dayHeaderTags', async () => {
      await open({
        closures: ['2026-11-15'],
        week: {
          '2026-11-11': [
            reservation({ id: 60, status: 'PENDING', date: '2026-11-11', tableId: 1 }),
          ],
          '2026-11-13': [
            reservation({ id: 61, status: 'PENDING', date: '2026-11-13', tableId: 2 }),
            reservation({ id: 62, status: 'PENDING', date: '2026-11-13', tableId: 3 }),
          ],
        },
      });

      // Hoy tiene una pendiente (Luis Ejemplo): lleva las dos etiquetas.
      expect(tags(day('Lun 9'))).toEqual(['hoy', '1 pendiente']);
      expect(tags(day('Mar 10'))).toEqual([]);
      expect(tags(day('Mié 11'))).toEqual(['1 pendiente']);
      expect(tags(day('Vie 13'))).toEqual(['2 pendientes']);
      expect(tags(day('Dom 15'))).toEqual(['cerrado']);
      expect(day('Mié 11').querySelector('.tag')?.classList).toContain('warn');
    });

    it('pastDaysAreDimmedButClickable', async () => {
      // Jueves 12, 17:20 en Los Ángeles: lunes a miércoles ya pasaron.
      clock = new Date('2026-11-13T01:20:00Z');
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/inicio');
      expectPlan().flush(PLAN);
      await settle();
      await flushReads({ today: [], pending: [] }, 'kafe', '2026-11-12');
      page = harness.routeNativeElement as HTMLElement;

      for (const label of ['Lun 9', 'Mar 10', 'Mié 11']) {
        expect(day(label).classList).toContain('past');
        expect(day(label).tagName).toBe('A');
      }
      expect(day('Lun 9').getAttribute('href')).toBe('/panel/kafe?fecha=2026-11-09');
      expect(day('Jue 12').classList).toContain('is-today');
      expect(day('Jue 12').classList).not.toContain('past');
      expect(day('Vie 13').classList).not.toContain('past');
    });

    it('unassignedNoteInAssignedMode', async () => {
      const withoutTable = reservation({ id: 30, customerName: 'Sara', tableId: undefined });
      await open({ today: [MARTA, JUAN, withoutTable], pending: [] });

      // Solo cuentan las mesas con reserva; la que no tiene mesa se avisa junto a la fila de su turno.
      expect(shiftRows(day('Lun 9'))).toEqual(['Comida 0/9', 'Cena 2/9 1 sin mesa']);
      expect(figures()[4].sub).toContain('1 sin mesa');
    });

    it('closedDayIsNotClickable', async () => {
      await open({ closures: ['2026-11-15'] });

      const closed = day('Dom 15');
      expect(closed.classList).toContain('closed');
      expect(closed.tagName).not.toBe('A');
      expect(closed.querySelector('a')).toBeNull();
      expect(closed.getAttribute('href')).toBeNull();
      expect(normalized(closed.textContent)).toContain('Día cerrado');
      expect(page.querySelectorAll('app-home-week a.day').length).toBe(6);
    });

    it('dayClickOpensReservas', async () => {
      await open();

      expect(day('Vie 13').getAttribute('href')).toBe('/panel/kafe?fecha=2026-11-13');
      day('Vie 13').click();
      await settle();
      await harness.fixture.whenStable();

      expect(TestBed.inject(Router).url).toBe('/panel/kafe?fecha=2026-11-13');
    });

    it('weekErrorStaysInItsCard', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/inicio');
      expectPlan().flush(PLAN);
      await settle();
      expectDay(TODAY).flush(TODAY_ROWS);
      expectPending().flush(PENDING_ROWS);
      expectClosures(TODAY).flush([]);
      expectWeek(weekStart(TODAY)).flush(null, { status: 500, statusText: 'Server Error' });
      await settle();
      page = harness.routeNativeElement as HTMLElement;

      const alerts = Array.from(page.querySelectorAll('[role="alert"]'));
      expect(alerts.length).toBe(1);
      expect(alerts[0].closest('app-home-week')).not.toBeNull();
      expect(normalized(alerts[0].textContent)).toContain('No se pudo cargar la semana');
      expect(days().length).toBe(0);
      // El resto de la página sigue con sus datos.
      expect(figures()[0].value).toBe('5');
      expect(figures()[4].value).toBe('6 / 9');

      const retry = Array.from(page.querySelectorAll('app-home-week button')).find(
        (candidate) => normalized(candidate.textContent) === 'Reintentar',
      ) as HTMLButtonElement;
      retry.click();
      await settle();
      await flushReads({});

      expect(page.querySelector('[role="alert"]')).toBeNull();
      expect(days().length).toBe(7);
    });

    it('weekIsShownWhenClosuresFail', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/inicio');
      expectPlan().flush(PLAN);
      await settle();
      expectDay(TODAY).flush(TODAY_ROWS);
      expectPending().flush(PENDING_ROWS);
      expectClosures(TODAY).flush(null, { status: 500, statusText: 'Server Error' });
      flushWeek({ closures: ['2026-11-15'] });
      await settle();
      page = harness.routeNativeElement as HTMLElement;

      // Los cierres de la semana ya vienen en el resumen: sin la lectura de cierres la semana se pinta igual.
      expect(days().length).toBe(7);
      expect(day('Dom 15').classList).toContain('closed');
      expect(text('app-home-week')).not.toContain('No se pudo cargar la semana');
      expect(page.querySelector('app-home-week [role="alert"]')).toBeNull();
    });

    /**
     * Lunes 21:30 (la cena ya empezó): el próximo turno es el de mañana, que está en la semana. Falla el resumen de la
     * semana; `closuresFirst` dice si los cierres llegan antes o después del fallo.
     */
    async function weekFailsAfterTheLastShift(closuresFirst: boolean): Promise<void> {
      clock = new Date('2026-11-10T05:30:00Z');
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/inicio');
      expectPlan().flush(PLAN);
      await settle();
      expectDay(TODAY).flush(TODAY_ROWS);
      expectPending().flush(PENDING_ROWS);
      if (closuresFirst) {
        expectClosures(TODAY).flush([]);
      }
      expectWeek(weekStart(TODAY)).flush(null, { status: 500, statusText: 'Server Error' });
      if (!closuresFirst) {
        expectClosures(TODAY).flush([]);
      }

      // Sin el resumen, las reservas de mañana se piden aparte (una sola lectura).
      const fallback = expectDay('2026-11-10');
      fallback.flush([reservation({ id: 20, date: '2026-11-10', shiftId: COMIDA.id, tableId: 1 })]);
      await settle();
      page = harness.routeNativeElement as HTMLElement;
    }

    for (const [name, closuresFirst] of [
      ['weekErrorAfterLastShiftKeepsTodayFigures', true],
      ['weekErrorBeforeClosuresKeepsTodayFigures', false],
    ] as const) {
      it(name, async () => {
        await weekFailsAfterTheLastShift(closuresFirst);

        // Solo la tarjeta de la semana da la alerta; las cifras de hoy siguen, con las reservas de mañana.
        const alerts = Array.from(page.querySelectorAll('[role="alert"]'));
        expect(alerts.length).toBe(1);
        expect(alerts[0].closest('app-home-week')).not.toBeNull();
        expect(page.querySelector('.today [role="alert"]')).toBeNull();
        expect(figures()[3].value).toBe('Mañana · Comida 13:00');
        expect(figures()[4]).toEqual({
          kicker: 'Mesas libres · mañana, Comida',
          value: '8 / 9',
          sub: 'ocupación 11 %',
        });
      });
    }

    it('nextShiftBeyondTheWeekHasItsOwnRead', async () => {
      // Domingo 15, 21:30 en Los Ángeles: el próximo turno es el del lunes 16, ya fuera de la semana.
      clock = new Date('2026-11-16T05:30:00Z');
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/inicio');
      expectPlan().flush(PLAN);
      await settle();
      await flushReads({ today: [], pending: [] }, 'kafe', '2026-11-15');

      expectDay('2026-11-16').flush([
        reservation({ id: 20, date: '2026-11-16', shiftId: COMIDA.id, tableId: 1 }),
      ]);
      await settle();
      page = harness.routeNativeElement as HTMLElement;

      expect(figures()[3].value).toBe('Mañana · Comida 13:00');
      expect(figures()[4].value).toBe('8 / 9');
      expect(day('Dom 15').classList).toContain('is-today');
    });

    it('weekNeedsTodayReadButDoesNotRepeatItsAlert', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/inicio');
      expectPlan().flush(PLAN);
      await settle();
      expectDay(TODAY).flush(null, { status: 500, statusText: 'Server Error' });
      expectPending().flush(PENDING_ROWS);
      expectClosures(TODAY).flush([]);
      flushWeek({});
      await settle();
      page = harness.routeNativeElement as HTMLElement;

      // La tarjeta de hoy da la alerta; la semana, que necesita las reservas de hoy, solo lo explica.
      expect(text('app-home-week')).toContain('No se pudo cargar la semana');
      expect(page.querySelectorAll('[role="alert"]').length).toBe(1);
      expect(days().length).toBe(0);
    });

    it('homeFitsTheViewport', async () => {
      await open();

      // La comprobación visual (sin scroll de página a 1024 × 800) se hace en localhost.
      expect(page.classList).toContain('fit');
    });
  });
});
