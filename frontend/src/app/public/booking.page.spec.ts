import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApiConfiguration } from '../core/api/api-configuration';
import { PublicOccupancyResponse } from '../core/api/models/public-occupancy-response';
import { PublicPlanResponse } from '../core/api/models/public-plan-response';
import { ShiftAvailability } from '../core/api/models/shift-availability';
import { THEMES } from '../plano/themes';
import { ShellComponent } from '../shell/shell.component';
import { BookingPage } from './booking.page';
import { NOW, addDays, todayIn } from './booking.store';

const PLAN: PublicPlanResponse = {
  slug: 'kafe',
  name: 'Kafé',
  timeZone: 'Europe/Madrid',
  theme: 'NOCHE',
  bookingMode: 'FREE_CHOICE',
  cancellationDeadlineHours: 2,
  room: { shape: 'RECTANGLE', width: 1200, height: 800, cutWidth: 0, cutDepth: 0, rotation: 0 },
  tables: [
    { id: 1, label: '1', shape: 'SQUARE', seats: 2, rotation: 0, x: 200, y: 200 },
    { id: 2, label: '2', shape: 'ROUND', seats: 4, rotation: 0, x: 600, y: 400 },
    { id: 3, label: '3', shape: 'SQUARE', seats: 6, rotation: 0, x: 900, y: 300 },
  ],
  shifts: [],
};

// 23:30 UTC del 5 de enero: en Madrid (UTC+1) ya es día 6; con la zona del navegador (UTC en CI) seguiría siendo 5.
const CLOCK = new Date('2030-01-05T23:30:00Z');
const TODAY = '2030-01-06';

const SHIFTS: ShiftAvailability[] = [
  { shiftId: 10, name: 'Comida', start: '13:00', available: true },
  { shiftId: 11, name: 'Cena', start: '20:00', available: false },
];

const FREE_OCCUPANCY: PublicOccupancyResponse[] = [
  { tableId: 1, occupied: false },
  { tableId: 2, occupied: false },
  { tableId: 3, occupied: true },
];

const RESERVATION = {
  code: 'KAFE23456789ABCD',
  date: '2030-01-01',
  partySize: 2,
  shiftId: 10,
  status: 'PENDING',
};

describe('BookingPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NOW, useValue: () => CLOCK },
        provideRouter([
          {
            path: '',
            component: ShellComponent,
            children: [{ path: 'r/:slug', component: BookingPage }],
          },
        ]),
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

  function expectApi(path: string): TestRequest {
    const request = http.expectOne((candidate) =>
      candidate.url.endsWith(`/api/v1/restaurants/${path}`),
    );
    // El contrato declara `*/*` y el generador pediría `blob`: el cuerpo (y el `code` de los errores) debe llegar como JSON.
    expect(request.request.responseType).toBe('json');
    return request;
  }

  async function open(url: string, plan: PublicPlanResponse = PLAN): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    page = harness.routeNativeElement as HTMLElement;
    const slug = url.split('?')[0].split('/').pop();
    expectApi(slug ?? '').flush(plan);
    await settle();
  }

  async function flushShifts(shifts: ShiftAvailability[] = SHIFTS): Promise<TestRequest> {
    const request = expectApi(`${PLAN.slug}/availability`);
    request.flush(shifts);
    await settle();
    return request;
  }

  async function chooseShift(
    label: string,
    occupancy: PublicOccupancyResponse[] = FREE_OCCUPANCY,
  ): Promise<void> {
    const button = shiftButtons().find((candidate) => candidate.textContent?.includes(label));
    button?.click();
    await settle();
    if (occupancy.length > 0) {
      expectApi(`${PLAN.slug}/occupancy`).flush(occupancy);
      await settle();
    }
  }

  async function choosePartySize(size: number): Promise<void> {
    const select = page.querySelector<HTMLSelectElement>('select[name=partySize]')!;
    select.value = String(size);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  }

  function shiftButtons(): HTMLButtonElement[] {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('button.shift'));
  }

  function table(label: string): Element {
    return Array.from(page.querySelectorAll('g.t')).find((group) =>
      group.getAttribute('aria-label')?.startsWith(`Mesa ${label},`),
    )!;
  }

  function type(selector: string, value: string): void {
    const input = page.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function fillCustomer(): Promise<void> {
    type('input[name=customerName]', 'Ana Pérez');
    type('input[name=customerPhone]', '600123123');
    await settle();
  }

  function submitButton(): HTMLButtonElement {
    return page.querySelector<HTMLButtonElement>('button[type=submit]')!;
  }

  async function submit(): Promise<TestRequest> {
    submitButton().click();
    await settle();
    return expectApi(`${PLAN.slug}/reservations`);
  }

  it('loadsPlanAndAppliesTheme', async () => {
    await open('/r/kafe');

    const host = page.querySelector<HTMLElement>('app-booking-page')!;
    expect(host.style.getPropertyValue('--page')).toBe(THEMES.NOCHE.page);
    expect(page.textContent).toContain('Kafé');
    expect(page.querySelectorAll('g.t').length).toBe(0);
    const availability = await flushShifts();
    expect(availability.request.params.get('partySize')).toBe('2');
    expect(availability.request.params.get('date')).toBe(TODAY);
    expect(shiftButtons().map((button) => button.disabled)).toEqual([false, true]);
  });

  it('unknownOrDraftPlanShowsNoDisponible', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/r/nada');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('nada').flush(
      { code: 'RESTAURANT_NOT_FOUND' },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();

    expect(page.textContent).toContain('Este plano no está disponible');
    expect(page.querySelector('form')).toBeNull();
  });

  it('freeChoiceRequiresTableBeforeSubmit', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    await fillCustomer();

    expect(submitButton().disabled).toBe(true);
    expect(page.textContent).toContain('Elige una mesa en el plano');

    table('1').dispatchEvent(new Event('click'));
    await settle();

    expect(table('1').classList.contains('selected')).toBe(true);
    expect(submitButton().disabled).toBe(false);
  });

  it('tablesTooSmallAreBlocked', async () => {
    await open('/r/kafe');
    await flushShifts();
    await choosePartySize(4);
    await flushShifts();
    await chooseShift('Comida');

    // La 1 es de 2 plazas (pequeña) y la 3 está ocupada: ninguna se puede elegir.
    expect(table('1').classList.contains('blocked')).toBe(true);
    expect(table('3').classList.contains('blocked')).toBe(true);
    expect(table('2').classList.contains('free')).toBe(true);

    table('1').dispatchEvent(new Event('click'));
    await settle();
    expect(table('1').classList.contains('selected')).toBe(false);
    expect(submitButton().disabled).toBe(true);
  });

  it('assignedModeSkipsTableStep', async () => {
    await open('/r/kafe', { ...PLAN, bookingMode: 'ASSIGNED' });
    await flushShifts();
    await chooseShift('Comida', []);
    await fillCustomer();

    expect(page.querySelectorAll('g.t').length).toBe(0);
    expect(submitButton().disabled).toBe(false);
    const request = await submit();
    expect(request.request.body.tableId).toBeUndefined();
    request.flush(RESERVATION, { status: 201, statusText: 'Created' });
    await settle();
  });

  it('submitShowsCode', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await fillCustomer();

    const request = await submit();
    expect(request.request.body).toEqual({
      date: TODAY,
      shiftId: 10,
      partySize: 2,
      customerName: 'Ana Pérez',
      customerPhone: '600123123',
      tableId: 2,
    });
    request.flush(RESERVATION, { status: 201, statusText: 'Created' });
    await settle();

    expect(page.textContent).toContain('KAFE23456789ABCD');
    const link = page.querySelector<HTMLAnchorElement>('a[href="/reserva/KAFE23456789ABCD"]');
    expect(link).not.toBeNull();
    expect(page.querySelector('form')).toBeNull();
  });

  it('failedOccupancyCanBeRetriedWithSameShift', async () => {
    await open('/r/kafe');
    await flushShifts();
    shiftButtons()[0].click();
    await settle();
    expectApi('kafe/occupancy').flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(page.textContent).toContain('No se pudo cargar el plano de mesas');

    shiftButtons()[0].click();
    await settle();
    expectApi('kafe/occupancy').flush(FREE_OCCUPANCY);
    await settle();

    expect(page.querySelectorAll('g.t').length).toBe(3);
  });

  it('failedShiftsShowOnlyTheErrorMessage', async () => {
    await open('/r/kafe');
    expectApi('kafe/availability').flush(null, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(page.textContent).toContain('No se pudieron cargar los turnos');
    expect(page.textContent).not.toContain('Ese día no hay turnos');
  });

  it('tableTakenReloadsOccupancyAndAsksAgain', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await fillCustomer();

    const request = await submit();
    request.flush({ code: 'TABLE_TAKEN' }, { status: 409, statusText: 'Conflict' });
    await settle();

    const reload = expectApi(`${PLAN.slug}/occupancy`);
    reload.flush([
      { tableId: 1, occupied: false },
      { tableId: 2, occupied: true },
      { tableId: 3, occupied: true },
    ]);
    await settle();

    expect(page.textContent).toContain('Esa mesa se acaba de reservar, elige otra');
    expect(table('2').classList.contains('blocked')).toBe(true);
    expect(table('2').classList.contains('selected')).toBe(false);
    expect(submitButton().disabled).toBe(true);
  });

  it('rateLimitedShowsMessage', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await fillCustomer();

    const request = await submit();
    request.flush(
      { code: 'RATE_LIMITED' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '30' } },
    );
    await settle();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Demasiados intentos');
    expect(page.querySelector('[role=alert]')?.textContent).toContain('30 segundos');
    expect(table('2').classList.contains('selected')).toBe(true);
  });

  it('footerLinkPresentInEmbed', async () => {
    await open('/r/kafe?embed=1');
    await flushShifts();

    expect(page.querySelector('header')).toBeNull();
    const link = page.querySelector<HTMLAnchorElement>('footer a');
    expect(link?.textContent).toContain('Desarrollado por Manuel Carro');
    expect(link?.getAttribute('href')).toBe('https://www.linkedin.com/in/manuelcarro');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('demoShowsPublicNotice', async () => {
    await open('/r/demo', { ...PLAN, slug: 'demo' });
    expectApi('demo/availability').flush(SHIFTS);
    await settle();

    expect(page.textContent).toContain(
      'Esta es una demo pública: no uses tu nombre ni teléfono reales.',
    );
  });

  it('otherPlansHideDemoNotice', async () => {
    await open('/r/kafe');
    await flushShifts();

    expect(page.textContent).not.toContain('demo pública');
    expect(page.textContent).toContain('anonimizan');
  });

  it('rendersCustomerTextAsText', async () => {
    await open('/r/kafe', { ...PLAN, name: '<img src=x onerror=alert(1)>' });
    await flushShifts();

    expect(page.querySelector('img')).toBeNull();
    expect(page.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('dateRangeIsTodayToNinetyDays', async () => {
    await open('/r/kafe');
    await flushShifts();

    const input = page.querySelector<HTMLInputElement>('input[type=date]')!;
    expect(input.min).toBe(TODAY);
    expect(input.max).toBe(addDays(TODAY, 90));
  });

  it('todayUsesThePlanTimeZone', async () => {
    await open('/r/kafe', { ...PLAN, timeZone: 'America/Los_Angeles' });

    const request = await flushShifts();

    expect(request.request.params.get('date')).toBe('2030-01-05');
    expect(page.querySelector<HTMLInputElement>('input[type=date]')!.min).toBe('2030-01-05');
  });

  it('changingDateReloadsShiftsAndClearsSelection', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await settle();

    const tomorrow = addDays(TODAY, 1);
    type('input[type=date]', tomorrow);
    page.querySelector('input[type=date]')!.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    const request = await flushShifts();
    expect(request.request.params.get('date')).toBe(tomorrow);
    expect(page.querySelectorAll('g.t').length).toBe(0);
    expect(submitButton().disabled).toBe(true);
  });
});

describe('booking dates', () => {
  it('todayFollowsTheRestaurantZoneNotTheBrowser', () => {
    const instant = new Date('2030-01-05T23:30:00Z');

    expect(todayIn('Europe/Madrid', instant)).toBe('2030-01-06');
    expect(todayIn('America/Los_Angeles', instant)).toBe('2030-01-05');
    expect(todayIn('Asia/Tokyo', new Date('2030-01-05T15:30:00Z'))).toBe('2030-01-06');
  });

  it('unknownZoneFallsBackToBrowserDate', () => {
    const instant = new Date(2030, 0, 5, 12, 0);

    expect(todayIn('No/Existe', instant)).toBe('2030-01-05');
    expect(todayIn(undefined, instant)).toBe('2030-01-05');
  });

  it('addsDaysAcrossMonths', () => {
    expect(addDays('2030-01-31', 1)).toBe('2030-02-01');
    expect(addDays('2030-12-31', 90)).toBe('2031-03-31');
  });
});
