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
import { OPEN_WINDOW } from '../../core/open-window';
import { NOW } from '../../core/time';
import { embedSnippet } from '../embed-snippet';
import { MeStore } from '../me.store';
import { FeedService } from '../notifications/feed.service';
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

  /** Las tres lecturas que salen cuando llega el plano; no responde a la del próximo turno si no es hoy. */
  async function flushReads(screen: Screen, slug = 'kafe'): Promise<void> {
    expectDay(TODAY, slug).flush(screen.today ?? TODAY_ROWS);
    expectPending(slug).flush(screen.pending ?? PENDING_ROWS);
    expectClosures(TODAY, slug).flush(screen.closures ?? []);
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
    await flushReads({});

    // Las reservas de mañana se piden aparte, y de ellas sale la cifra de mesas libres.
    expectDay('2026-11-10').flush([
      reservation({ id: 20, date: '2026-11-10', shiftId: COMIDA.id, tableId: 1 }),
    ]);
    await settle();
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
    await flushReads({ closures: ['2026-11-10'] });

    expectDay('2026-11-11').flush([]);
    await settle();
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
    // Las tres lecturas de "kafe" quedan en vuelo.
    const inFlight = [expectDay(TODAY), expectPending(), expectClosures(TODAY)];

    await harness.navigateByUrl('/panel/otro/inicio');

    // Si respondieran después, pisarían la pantalla de "otro": tienen que haberse cancelado.
    expect(inFlight.map((pending) => pending.cancelled)).toEqual([true, true, true]);
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
});
