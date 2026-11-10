import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
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
import { NOW, addDays } from '../core/time';

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
const SLOW_START_NOTICE =
  'La primera carga puede tardar hasta 2 minutos: la demo usa un servidor gratuito que se apaga tras un rato sin uso.';

const CLOCK = new Date('2030-01-05T23:30:00Z');
const TODAY = '2030-01-06';

const SHIFTS: ShiftAvailability[] = [
  {
    shiftId: 10,
    name: 'Comida',
    start: '13:00',
    available: true,
    arrivalTimes: ['13:00:00', '13:30:00', '14:00:00', '14:30:00', '15:00:00'],
  },
  { shiftId: 11, name: 'Cena', start: '20:00', available: false, arrivalTimes: [] },
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

@Component({ template: '' })
class OtherPage {}

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
            children: [
              { path: 'r/:slug', component: BookingPage },
              { path: 'otra', component: OtherPage },
            ],
          },
        ]),
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

  function arrivalButtons(): HTMLButtonElement[] {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('button.arrival'));
  }

  async function chooseArrival(label: string): Promise<void> {
    arrivalButtons()
      .find((candidate) => candidate.textContent?.trim() === label)
      ?.click();
    await settle();
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
    expect(host.style.getPropertyValue('--accent')).toBe(THEMES.NOCHE.cushA);
    expect(page.textContent).toContain('Kafé');
    // En elección libre el plano está desde que carga la página, aunque aún no haya turno.
    expect(page.querySelectorAll('g.t').length).toBe(3);
    const availability = await flushShifts();
    expect(availability.request.params.get('partySize')).toBe('2');
    expect(availability.request.params.get('date')).toBe(TODAY);
    expect(shiftButtons().map((button) => button.disabled)).toEqual([false, true]);
  });

  it('unknownThemeFallsBackToAzul', async () => {
    await open('/r/kafe', { ...PLAN, theme: 'NEON' as PublicPlanResponse['theme'] });
    await flushShifts();
    await chooseShift('Comida');

    const host = page.querySelector<HTMLElement>('app-booking-page')!;
    expect(host.style.getPropertyValue('--accent')).toBe(THEMES.AZUL.cushA);
    expect(page.querySelectorAll('g.t').length).toBe(3);
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
    await chooseArrival('13:30');
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
    await chooseArrival('13:30');
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
    await chooseArrival('13:30');
    await fillCustomer();

    const request = await submit();
    expect(request.request.body).toEqual({
      date: TODAY,
      shiftId: 10,
      arrivalTime: '13:30',
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

  it('arrivalTimesOfTheChosenShiftAppearAfterChoosingIt', async () => {
    await open('/r/kafe');
    await flushShifts();
    expect(arrivalButtons().length).toBe(0);

    await chooseShift('Comida');

    expect(arrivalButtons().map((button) => button.textContent?.trim())).toEqual([
      '13:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
    ]);
    expect(
      arrivalButtons().every((button) => button.getAttribute('aria-pressed') === 'false'),
    ).toBe(true);
  });

  it('arrivalTimeIsRequiredBeforeSubmit', async () => {
    await open('/r/kafe', { ...PLAN, bookingMode: 'ASSIGNED' });
    await flushShifts();
    await chooseShift('Comida', []);
    await fillCustomer();
    expect(submitButton().disabled).toBe(true);

    await chooseArrival('14:00');

    expect(arrivalButtons()[2].getAttribute('aria-pressed')).toBe('true');
    expect(submitButton().disabled).toBe(false);
  });

  it('arrivalTimeIsSentWithoutSeconds', async () => {
    await open('/r/kafe', { ...PLAN, bookingMode: 'ASSIGNED' });
    await flushShifts();
    await chooseShift('Comida', []);
    await chooseArrival('14:30');
    await fillCustomer();

    const request = await submit();

    expect(request.request.body.arrivalTime).toBe('14:30');
    request.flush(RESERVATION, { status: 201, statusText: 'Created' });
    await settle();
  });

  it('changingShiftClearsTheArrivalTime', async () => {
    await open('/r/kafe', { ...PLAN, bookingMode: 'ASSIGNED' });
    await flushShifts([
      SHIFTS[0],
      { shiftId: 11, name: 'Cena', start: '20:00', available: true, arrivalTimes: ['20:00:00'] },
    ]);
    await chooseShift('Comida', []);
    await chooseArrival('13:30');
    await fillCustomer();
    expect(submitButton().disabled).toBe(false);

    await chooseShift('Cena', []);

    expect(arrivalButtons().map((button) => button.textContent?.trim())).toEqual(['20:00']);
    expect(arrivalButtons()[0].getAttribute('aria-pressed')).toBe('false');
    expect(submitButton().disabled).toBe(true);
  });

  it('changingDateDropsTheArrivalTimeNotOfferedThatDay', async () => {
    await open('/r/kafe', { ...PLAN, bookingMode: 'ASSIGNED' });
    await flushShifts();
    await chooseShift('Comida', []);
    await chooseArrival('13:30');

    type('input[type=date]', addDays(TODAY, 1));
    page.querySelector('input[type=date]')!.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    await flushShifts([{ ...SHIFTS[0], arrivalTimes: ['14:00:00', '14:30:00'] }, SHIFTS[1]]);

    expect(arrivalButtons().map((button) => button.textContent?.trim())).toEqual([
      '14:00',
      '14:30',
    ]);
    expect(
      arrivalButtons().every((button) => button.getAttribute('aria-pressed') === 'false'),
    ).toBe(true);
    expect(page.textContent).toContain('La hora 13:30 ya no está disponible. Elige otra.');
  });

  for (const code of ['ARRIVAL_TIME_PAST', 'INVALID_ARRIVAL_TIME']) {
    it(`${code}ReloadsAvailabilityAndAsksForAnotherTime`, async () => {
      await open('/r/kafe', { ...PLAN, bookingMode: 'ASSIGNED' });
      await flushShifts();
      await chooseShift('Comida', []);
      await chooseArrival('13:30');
      await fillCustomer();

      const request = await submit();
      request.flush({ code }, { status: 422, statusText: 'Unprocessable Content' });
      await settle();

      await flushShifts([
        {
          ...SHIFTS[0],
          arrivalTimes: ['14:00:00', '14:30:00', '15:00:00'],
        },
      ]);
      expect(page.querySelector('[role=alert]')?.textContent).toContain(
        'Esa hora ya no está disponible, elige otra',
      );
      expect(submitButton().disabled).toBe(true);
      await chooseShift('Comida', []);
      expect(arrivalButtons().map((button) => button.textContent?.trim())).toEqual([
        '14:00',
        '14:30',
        '15:00',
      ]);
      expect(
        arrivalButtons().every((button) => button.getAttribute('aria-pressed') === 'false'),
      ).toBe(true);
    });
  }

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
    await chooseArrival('13:30');
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

  const MODE_CHANGED =
    'El local ha cambiado la forma de reservar; revisa tu reserva y vuelve a enviarla.';

  function inputValue(name: string): string {
    return page.querySelector<HTMLInputElement>(`[name=${name}]`)?.value ?? '';
  }

  function chosen(selector: string): string[] {
    return Array.from(page.querySelectorAll(`${selector}.chosen`)).map(
      (button) => button.textContent?.trim() ?? '',
    );
  }

  it('tableNotAllowedReloadsThePlanKeepsTheDataAndHidesThePlano', async () => {
    await open('/r/kafe');
    await flushShifts();
    await choosePartySize(4);
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await chooseArrival('13:30');
    await fillCustomer();
    expect(page.querySelectorAll('g.t').length).toBe(3);

    // El local pasó a asignar las mesas él mismo mientras la página estaba abierta.
    const request = await submit();
    request.flush(
      { code: 'TABLE_NOT_ALLOWED' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle();
    expectApi('kafe').flush({ ...PLAN, bookingMode: 'ASSIGNED' });
    await settle();

    expect(page.querySelector('[role=alert]')?.textContent).toContain(MODE_CHANGED);
    expect(page.querySelectorAll('g.t').length).toBe(0);
    expect(inputValue('customerName')).toBe('Ana Pérez');
    expect(inputValue('customerPhone')).toBe('600123123');
    expect(inputValue('date')).toBe(TODAY);
    expect(inputValue('partySize')).toBe('4');
    expect(chosen('button.shift')).toEqual(['Comida · 13:00']);
    expect(chosen('button.arrival')).toEqual(['13:30']);
    expect(submitButton().disabled).toBe(false);

    // Reenviar ya no lleva mesa (y `http.verify` exige que no se haya vuelto a pedir nada más).
    const again = await submit();
    expect(again.request.body.tableId).toBeUndefined();
    again.flush(RESERVATION, { status: 201, statusText: 'Created' });
    await settle();
    expect(page.textContent).toContain('KAFE23456789ABCD');
  });

  it('tableRequiredReloadsThePlanKeepsTheDataAndShowsThePlano', async () => {
    await open('/r/kafe', { ...PLAN, bookingMode: 'ASSIGNED' });
    await flushShifts();
    await chooseShift('Comida', []);
    await chooseArrival('13:30');
    await fillCustomer();
    expect(page.querySelectorAll('g.t').length).toBe(0);

    // El local pasó a que el cliente elija mesa.
    const request = await submit();
    request.flush({ code: 'TABLE_REQUIRED' }, { status: 422, statusText: 'Unprocessable Entity' });
    await settle();
    expectApi('kafe').flush(PLAN);
    await settle();
    expectApi('kafe/occupancy').flush(FREE_OCCUPANCY);
    await settle();

    expect(page.querySelector('[role=alert]')?.textContent).toContain(MODE_CHANGED);
    expect(page.querySelectorAll('g.t').length).toBe(3);
    expect(inputValue('customerName')).toBe('Ana Pérez');
    expect(inputValue('customerPhone')).toBe('600123123');
    expect(chosen('button.shift')).toEqual(['Comida · 13:00']);
    expect(chosen('button.arrival')).toEqual(['13:30']);
    // Ahora falta elegir mesa antes de poder enviar.
    expect(submitButton().disabled).toBe(true);
    table('2').dispatchEvent(new Event('click'));
    await settle();
    expect(submitButton().disabled).toBe(false);
  });

  it('rateLimitedShowsMessage', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await chooseArrival('13:30');
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

  it('tooManyActiveReservationsShowsMessage', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await chooseArrival('13:30');
    await fillCustomer();

    const request = await submit();
    request.flush(
      { code: 'TOO_MANY_ACTIVE_RESERVATIONS' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(page.querySelector('[role=alert]')?.textContent).toContain(
      'Este teléfono ya tiene el máximo de reservas activas en este local. Cancela alguna para poder hacer otra.',
    );
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
    expect(page.textContent).toContain(SLOW_START_NOTICE);
  });

  it('loadingWarnsThatTheFirstLoadCanBeSlow', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/r/kafe');
    page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Cargando…');
    expect(page.textContent).toContain(SLOW_START_NOTICE);
    expect(page.querySelectorAll('h1').length).toBe(1);

    expectApi('kafe').flush(PLAN);
    await flushShifts();
    expect(page.textContent).not.toContain(SLOW_START_NOTICE);
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

  it('clearedDateIsRestoredAndFieldIsRequired', async () => {
    await open('/r/kafe');
    await flushShifts();

    const input = page.querySelector<HTMLInputElement>('input[type=date]')!;
    expect(input.required).toBe(true);
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(input.value).toBe(TODAY);
    expect(shiftButtons().length).toBe(2);
  });

  it('formIsLockedWhileSubmitting', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await chooseArrival('13:30');
    await fillCustomer();
    const request = await submit();

    expect(page.querySelector<HTMLFieldSetElement>('fieldset.body')!.disabled).toBe(true);
    expect(shiftButtons().every((button) => button.matches(':disabled'))).toBe(true);
    table('1').dispatchEvent(new Event('click'));
    await settle();
    expect(table('2').classList.contains('selected')).toBe(true);
    expect(table('1').classList.contains('selected')).toBe(false);

    request.flush(RESERVATION, { status: 201, statusText: 'Created' });
    await settle();
  });

  it('missingShiftOnCreateReloadsShifts', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await chooseArrival('13:30');
    await fillCustomer();

    const request = await submit();
    request.flush({ code: 'SHIFT_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await settle();

    await flushShifts();
    expect(page.textContent).toContain('Ese turno o mesa ya no está disponible, elige otro');
    expect(page.textContent).not.toContain('Este plano no está disponible');
    expect(page.querySelector('form')).not.toBeNull();
  });

  it('unknownRestaurantOnCreateShowsNoDisponible', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await chooseArrival('13:30');
    await fillCustomer();

    const request = await submit();
    request.flush({ code: 'RESTAURANT_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(page.querySelector('[role=alert]')?.textContent).toContain(
      'Este plano no está disponible',
    );
  });

  it('changingDateCancelsInFlightOccupancy', async () => {
    await open('/r/kafe');
    await flushShifts();
    shiftButtons()[0].click();
    await settle();
    const occupancy = expectApi('kafe/occupancy');

    type('input[type=date]', addDays(TODAY, 1));
    page.querySelector('input[type=date]')!.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(occupancy.cancelled).toBe(true);
    await flushShifts();
    // El turno se mantiene: se pide la ocupación de la fecha nueva.
    const again = expectApi('kafe/occupancy');
    expect(again.request.params.get('date')).toBe(addDays(TODAY, 1));
    again.flush(FREE_OCCUPANCY);
    await settle();
  });

  async function changeDate(date: string): Promise<void> {
    type('input[type=date]', date);
    page.querySelector('input[type=date]')!.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  }

  it('changingDateKeepsTheShiftIfOfferedThatDay', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await chooseArrival('13:30');
    await fillCustomer();

    const tomorrow = addDays(TODAY, 1);
    await changeDate(tomorrow);

    const request = await flushShifts();
    expect(request.request.params.get('date')).toBe(tomorrow);
    const occupancy = expectApi('kafe/occupancy');
    expect(occupancy.request.params.get('date')).toBe(tomorrow);
    expect(occupancy.request.params.get('shiftId')).toBe('10');
    occupancy.flush(FREE_OCCUPANCY);
    await settle();

    expect(chosen('button.shift')).toEqual(['Comida · 13:00']);
    expect(chosen('button.arrival')).toEqual(['13:30']);
    expect(table('2').classList.contains('selected')).toBe(true);
    expect(page.querySelectorAll('g.t').length).toBe(3);
    expect(submitButton().disabled).toBe(false);
  });

  it('changingDateDropsTheShiftNotOfferedThatDayAndSaysWhy', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await chooseArrival('13:30');

    await changeDate(addDays(TODAY, 1));
    await flushShifts([{ ...SHIFTS[0], available: false }, SHIFTS[1]]);

    expect(chosen('button.shift')).toEqual([]);
    expect(arrivalButtons().length).toBe(0);
    expect(table('2').classList.contains('selected')).toBe(false);
    expect(page.textContent).toContain('Ese turno ya no está disponible para esa fecha.');
    expect(page.textContent).toContain('Elige un turno para ver las mesas libres');
    expect(page.querySelectorAll('g.t').length).toBe(3);
  });

  function columns(): string | null | undefined {
    return page.querySelector('form')?.getAttribute('data-columns');
  }

  function drawing(): HTMLElement {
    return page.querySelector<HTMLElement>('.table-step .drawing')!;
  }

  it('planoShowsFromTheStartInFreeChoice', async () => {
    await open('/r/kafe');
    expect(columns()).toBe('2');

    await flushShifts();

    expect(columns()).toBe('2');
    expect(page.querySelectorAll('.table-step app-plano g.t').length).toBe(3);
    // Sin turno no hay ocupación: el plano se pinta sin estados, atenuado, inerte y no se puede pulsar.
    expect(page.querySelector('app-plano [data-interactive]')).toBeNull();
    expect(page.querySelector('app-plano g.t[tabindex]')).toBeNull();
    expect(drawing().classList.contains('waiting')).toBe(true);
    expect(drawing().hasAttribute('inert')).toBe(true);
    expect(page.querySelector('.table-step')?.textContent).toContain(
      'Elige un turno para ver las mesas libres',
    );
    table('1').dispatchEvent(new Event('click'));
    await settle();
    expect(table('1').classList.contains('selected')).toBe(false);

    await chooseShift('Comida');

    expect(page.querySelector('app-plano [data-interactive]')).not.toBeNull();
    expect(drawing().classList.contains('waiting')).toBe(false);
    expect(drawing().hasAttribute('inert')).toBe(false);
    expect(page.textContent).not.toContain('Elige un turno para ver las mesas libres');
  });

  it('planoIsDimmedAndInertWhileTheOccupancyIsLoading', async () => {
    await open('/r/kafe');
    await flushShifts();
    shiftButtons()[0].click();
    await settle();

    expect(drawing().classList.contains('waiting')).toBe(true);
    expect(drawing().hasAttribute('inert')).toBe(true);
    expect(page.querySelector('.table-step')?.textContent).toContain('Cargando mesas…');

    expectApi('kafe/occupancy').flush(FREE_OCCUPANCY);
    await settle();

    expect(drawing().classList.contains('waiting')).toBe(false);
    expect(drawing().hasAttribute('inert')).toBe(false);
  });

  it('assignedModeHasNoPlano', async () => {
    await open('/r/kafe', { ...PLAN, bookingMode: 'ASSIGNED' });
    await flushShifts();

    expect(columns()).toBe('1');
    expect(page.querySelector('.table-step')).toBeNull();
    expect(page.querySelectorAll('g.t').length).toBe(0);
    expect(page.textContent).not.toContain('Elige un turno para ver las mesas libres');
  });

  async function reserveTable(label: string): Promise<void> {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table(label).dispatchEvent(new Event('click'));
    await chooseArrival('13:30');
    await fillCustomer();
  }

  it('changingPartySizeKeepsShiftArrivalAndTableWhenStillValid', async () => {
    await reserveTable('2');

    await choosePartySize(3);
    // Mientras llegan los turnos el plano sigue y lo elegido no se pierde.
    expect(columns()).toBe('2');
    expect(page.querySelectorAll('g.t').length).toBe(3);
    const availability = await flushShifts();
    expect(availability.request.params.get('partySize')).toBe('3');
    const occupancy = expectApi('kafe/occupancy');
    expect(occupancy.request.params.get('shiftId')).toBe('10');
    occupancy.flush(FREE_OCCUPANCY);
    await settle();

    expect(chosen('button.shift')).toEqual(['Comida · 13:00']);
    expect(chosen('button.arrival')).toEqual(['13:30']);
    expect(table('2').classList.contains('selected')).toBe(true);
    expect(page.textContent).toContain('Mesa 2 · 4 plazas');
    expect(page.textContent).not.toContain('Elige otra');
    expect(submitButton().disabled).toBe(false);
  });

  it('changingPartySizeDropsATableThatIsTooSmallAndSaysWhy', async () => {
    await reserveTable('1');

    await choosePartySize(4);
    await flushShifts();
    expectApi('kafe/occupancy').flush(FREE_OCCUPANCY);
    await settle();

    expect(chosen('button.shift')).toEqual(['Comida · 13:00']);
    expect(chosen('button.arrival')).toEqual(['13:30']);
    expect(table('1').classList.contains('selected')).toBe(false);
    expect(page.querySelector('.table-pick')?.textContent).not.toContain('Mesa 1 · 2 plazas');
    expect(page.textContent).toContain('La Mesa 1 es pequeña para 4 personas. Elige otra.');
    expect(page.textContent).toContain('Falta: mesa');
    expect(submitButton().disabled).toBe(true);

    // Elegir otra mesa borra el aviso.
    table('2').dispatchEvent(new Event('click'));
    await settle();
    expect(page.textContent).not.toContain('Elige otra.');
    expect(submitButton().disabled).toBe(false);
  });

  it('changingPartySizeDropsATableThatIsNoLongerFreeAndSaysWhy', async () => {
    await reserveTable('2');

    await choosePartySize(3);
    await flushShifts();
    expectApi('kafe/occupancy').flush([
      { tableId: 1, occupied: false },
      { tableId: 2, occupied: true },
      { tableId: 3, occupied: true },
    ]);
    await settle();

    expect(table('2').classList.contains('selected')).toBe(false);
    expect(page.textContent).toContain('La Mesa 2 ya no está libre. Elige otra.');
    expect(submitButton().disabled).toBe(true);
  });

  it('changingPartySizeDropsAShiftThatIsNoLongerAvailableAndSaysWhy', async () => {
    await reserveTable('2');

    await choosePartySize(3);
    await flushShifts([{ ...SHIFTS[0], available: false }, SHIFTS[1]]);

    // No se pide la ocupación (`http.verify`): ya no hay turno elegido.
    expect(chosen('button.shift')).toEqual([]);
    expect(arrivalButtons().length).toBe(0);
    expect(table('2').classList.contains('selected')).toBe(false);
    expect(page.textContent).toContain('Ese turno ya no está disponible para 3 personas.');
    expect(page.textContent).toContain('Elige un turno para ver las mesas libres');
    expect(submitButton().disabled).toBe(true);
    expect(page.textContent).toContain('Falta: turno, hora de llegada y mesa');
  });

  it('changingPartySizeDropsTheArrivalTimeThatIsNoLongerOffered', async () => {
    await reserveTable('2');

    await choosePartySize(3);
    await flushShifts([{ ...SHIFTS[0], arrivalTimes: ['14:00:00', '14:30:00'] }, SHIFTS[1]]);
    expectApi('kafe/occupancy').flush(FREE_OCCUPANCY);
    await settle();

    expect(chosen('button.shift')).toEqual(['Comida · 13:00']);
    expect(chosen('button.arrival')).toEqual([]);
    expect(table('2').classList.contains('selected')).toBe(true);
    expect(page.textContent).toContain('Falta: hora de llegada');
    expect(page.textContent).toContain('La hora 13:30 ya no está disponible. Elige otra.');

    // Elegir otra hora borra el aviso.
    await chooseArrival('14:00');
    expect(page.textContent).not.toContain('La hora 13:30');
  });

  it('changingPartySizeExplainsBothTheHourAndTheTableDropped', async () => {
    await reserveTable('1');

    await choosePartySize(4);
    await flushShifts([{ ...SHIFTS[0], arrivalTimes: ['14:00:00'] }, SHIFTS[1]]);
    expectApi('kafe/occupancy').flush(FREE_OCCUPANCY);
    await settle();

    const notice = page.querySelector('.choice-notice')?.textContent ?? '';
    expect(notice).toContain('La hora 13:30 ya no está disponible. Elige otra.');
    expect(notice).toContain('La Mesa 1 es pequeña para 4 personas. Elige otra.');
  });

  it('twoQuickPartySizeChangesOnlyApplyTheLast', async () => {
    await reserveTable('2');

    await choosePartySize(3);
    await choosePartySize(4);
    const [first, last] = http.match((candidate) =>
      candidate.url.endsWith('/api/v1/restaurants/kafe/availability'),
    );
    expect(first.cancelled).toBe(true);
    expect(first.request.params.get('partySize')).toBe('3');
    expect(last.request.params.get('partySize')).toBe('4');
    last.flush(SHIFTS);
    await settle();
    expectApi('kafe/occupancy').flush(FREE_OCCUPANCY);
    await settle();

    expect(page.querySelector<HTMLSelectElement>('select[name=partySize]')!.value).toBe('4');
    expect(table('2').classList.contains('selected')).toBe(true);
    expect(page.textContent).not.toContain('Elige otra');
  });

  it('failedAvailabilityAfterChangingPartySizeClearsTheChoices', async () => {
    await reserveTable('2');

    await choosePartySize(3);
    expectApi('kafe/availability').flush(null, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(page.textContent).toContain('No se pudieron cargar los turnos');
    expect(chosen('button.arrival')).toEqual([]);
    expect(arrivalButtons().length).toBe(0);
    expect(table('2').classList.contains('selected')).toBe(false);
    expect(submitButton().disabled).toBe(true);
  });

  it('cannotSubmitWhileTheNewAvailabilityIsLoading', async () => {
    await reserveTable('2');
    expect(submitButton().disabled).toBe(false);

    await choosePartySize(3);
    expect(submitButton().disabled).toBe(true);
    // No falta nada que elegir, pero el botón no se queda apagado sin decir por qué.
    const hint = () => page.querySelector('#missing-hint')?.textContent?.trim();
    expect(hint()).toBe('Comprobando disponibilidad…');
    expect(submitButton().getAttribute('aria-describedby')).toBe('missing-hint');
    await flushShifts();
    // Falta la ocupación del turno para dar la mesa por buena.
    expect(submitButton().disabled).toBe(true);
    expect(hint()).toBe('Comprobando disponibilidad…');
    expectApi('kafe/occupancy').flush(FREE_OCCUPANCY);
    await settle();
    expect(submitButton().disabled).toBe(false);
    expect(hint()).toBeUndefined();
    expect(submitButton().hasAttribute('aria-describedby')).toBe(false);
  });

  it('failedOccupancyAfterChangingPartySizeKeepsTheShiftAndAsksForATable', async () => {
    await reserveTable('2');

    await choosePartySize(3);
    await flushShifts();
    expectApi('kafe/occupancy').flush(null, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(chosen('button.shift')).toEqual(['Comida · 13:00']);
    expect(chosen('button.arrival')).toEqual(['13:30']);
    expect(page.textContent).toContain('No se pudo cargar el plano de mesas');
    expect(page.querySelector('#missing-hint')?.textContent?.trim()).toBe('Falta: mesa');
    expect(submitButton().disabled).toBe(true);
    expect(page.textContent).not.toContain('Mesa 2 · 4 plazas');

    // Pulsar el turno elegido reintenta la ocupación sin perder la hora.
    shiftButtons()[0].click();
    await settle();
    const retry = expectApi('kafe/occupancy');
    expect(retry.request.params.get('shiftId')).toBe('10');
    retry.flush(FREE_OCCUPANCY);
    await settle();

    expect(page.textContent).not.toContain('No se pudo cargar el plano de mesas');
    expect(chosen('button.arrival')).toEqual(['13:30']);
    expect(page.querySelector('#missing-hint')?.textContent?.trim()).toBe('Falta: mesa');
    table('2').dispatchEvent(new Event('click'));
    await settle();
    expect(submitButton().disabled).toBe(false);
  });

  it('changingPartySizeCancelsInFlightOccupancyAndAsksAgain', async () => {
    await open('/r/kafe');
    await flushShifts();
    shiftButtons()[0].click();
    await settle();
    const stale = expectApi('kafe/occupancy');

    await choosePartySize(3);

    expect(stale.cancelled).toBe(true);
    await flushShifts();
    const again = expectApi('kafe/occupancy');
    expect(again.request.params.get('shiftId')).toBe('10');
    again.flush(FREE_OCCUPANCY);
    await settle();
    expect(page.querySelector('app-plano [data-interactive]')).not.toBeNull();
  });

  it('noticesLiveInFixedRegionsThatExistBeforeTheTextAppears', async () => {
    await reserveTable('2');
    const notice = page.querySelector('.choice-notice');
    const planoNote = page.querySelector('.plano-note');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(planoNote?.getAttribute('role')).toBe('status');
    expect(notice?.textContent?.trim()).toBe('');

    await choosePartySize(3);
    await flushShifts([{ ...SHIFTS[0], available: false }, SHIFTS[1]]);

    // Los mismos elementos, ahora con texto: así los lectores de pantalla lo anuncian.
    expect(page.querySelector('.choice-notice')).toBe(notice);
    expect(page.querySelector('.plano-note')).toBe(planoNote);
    expect(notice?.textContent).toContain('Ese turno ya no está disponible para 3 personas.');
    expect(planoNote?.textContent).toContain('Elige un turno para ver las mesas libres');
  });

  it('submitButtonSaysWhatIsMissing', async () => {
    await open('/r/kafe');
    await flushShifts();
    const hint = () => page.querySelector('#missing-hint')?.textContent?.trim();
    expect(hint()).toBe('Falta: turno, hora de llegada, mesa, nombre y teléfono');

    await chooseShift('Comida');
    expect(hint()).toBe('Falta: hora de llegada, mesa, nombre y teléfono');

    await chooseArrival('13:30');
    expect(hint()).toBe('Falta: mesa, nombre y teléfono');

    table('2').dispatchEvent(new Event('click'));
    await settle();
    expect(hint()).toBe('Falta: nombre y teléfono');

    type('input[name=customerName]', 'Ana Pérez');
    await settle();
    expect(hint()).toBe('Falta: teléfono');

    type('input[name=customerPhone]', '600123123');
    await settle();
    expect(hint()).toBeUndefined();
    expect(submitButton().disabled).toBe(false);
    expect(submitButton().hasAttribute('aria-describedby')).toBe(false);
  });

  it('submitButtonDoesNotAskForATableInAssignedMode', async () => {
    await open('/r/kafe', { ...PLAN, bookingMode: 'ASSIGNED' });
    await flushShifts();
    expect(page.querySelector('#missing-hint')?.textContent?.trim()).toBe(
      'Falta: turno, hora de llegada, nombre y teléfono',
    );
  });

  it('missingHintIsHiddenWhileSubmitting', async () => {
    await reserveTable('2');
    const request = await submit();

    expect(page.querySelector('#missing-hint')).toBeNull();
    expect(submitButton().hasAttribute('aria-describedby')).toBe(false);
    request.flush(RESERVATION, { status: 201, statusText: 'Created' });
    await settle();
  });

  it('missingHintIsLinkedToTheButton', async () => {
    await open('/r/kafe');
    await flushShifts();

    const hint = page.querySelector('#missing-hint');
    expect(hint).not.toBeNull();
    expect(submitButton().getAttribute('aria-describedby')).toBe(hint?.id);
  });

  it('assignedModeIsSingleColumn', async () => {
    await open('/r/kafe', { ...PLAN, bookingMode: 'ASSIGNED' });
    await flushShifts();
    expect(columns()).toBe('1');

    await chooseShift('Comida', []);
    await chooseArrival('13:30');

    expect(columns()).toBe('1');
    expect(page.querySelector('.table-step')).toBeNull();
  });

  it('freeChoiceShowsThePlanoBesideTheFormFromTheStartAndKeepsItAfterChoosingAShift', async () => {
    await open('/r/kafe');
    await flushShifts();
    expect(columns()).toBe('2');
    expect(page.querySelector('.table-step app-plano')).not.toBeNull();

    await chooseShift('Comida');

    expect(columns()).toBe('2');
    expect(page.querySelector('.table-step app-plano')).not.toBeNull();
  });

  it('planoSitsOutsideTheFieldsetSoLockingTheFormKeepsItVisible', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');

    expect(page.querySelector('fieldset.body .table-step')).toBeNull();
    expect(page.querySelector('form > .table-step app-plano')).not.toBeNull();
  });

  it('shellHeaderShowsTheVenueName', async () => {
    await open('/r/kafe');
    await flushShifts();

    expect(page.querySelector('header')?.textContent).toContain('Kafé');
    expect(page.querySelector('header')?.textContent).not.toContain('reservas.');
  });

  it('headerGoesBackToTheBrandWhenLeavingThePage', async () => {
    await open('/r/kafe');
    await flushShifts();

    await harness.navigateByUrl('/otra');
    harness.detectChanges();

    expect(page.querySelector('header')?.textContent).toContain('reservas.');
    expect(page.querySelector('header')?.textContent).not.toContain('Kafé');
  });

  it('headerGoesBackToTheBrandWhenTheReloadedPlanIsNoLongerAvailable', async () => {
    await open('/r/kafe');
    await flushShifts();
    await chooseShift('Comida');
    table('2').dispatchEvent(new Event('click'));
    await chooseArrival('13:30');
    await fillCustomer();
    const request = await submit();
    request.flush(
      { code: 'TABLE_NOT_ALLOWED' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle();

    // Al recargar el plano por el cambio de modo, el local ya no está publicado.
    expectApi('kafe').flush({}, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(page.textContent).toContain('Este plano no está disponible');
    expect(page.querySelector('header')?.textContent).toContain('reservas.');
    expect(page.querySelector('header')?.textContent).not.toContain('Kafé');
  });

  it('navigatingToAnotherVenueNeverShowsTheOldNameWithTheNewPage', async () => {
    await open('/r/kafe');
    await flushShifts();
    expect(page.querySelector('header')?.textContent).toContain('Kafé');

    await harness.navigateByUrl('/r/bar');
    harness.detectChanges();

    // Mientras llega el plano nuevo: la marca, nunca el nombre viejo.
    expect(page.querySelector('header')?.textContent).not.toContain('Kafé');
    expect(page.querySelector('header')?.textContent).toContain('reservas.');

    expectApi('bar').flush({ ...PLAN, slug: 'bar', name: 'Bar Pepe' });
    await settle();
    expectApi('bar/availability').flush(SHIFTS);
    await settle();

    expect(page.querySelector('header')?.textContent).toContain('Bar Pepe');
    expect(page.querySelector('header')?.textContent).not.toContain('Kafé');
  });

  it('everyStateHasExactlyOneHeading', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/r/nada');
    page = harness.routeNativeElement as HTMLElement;
    expect(page.querySelectorAll('h1').length).toBe(1);

    expectApi('nada').flush(
      { code: 'RESTAURANT_NOT_FOUND' },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();
    expect(page.textContent).toContain('Este plano no está disponible');
    expect(page.querySelectorAll('h1').length).toBe(1);
  });

  it('errorStateHasExactlyOneHeading', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/r/nada');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('nada').flush(null, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(page.querySelectorAll('h1').length).toBe(1);
  });

  it('footerAppearsOnlyOnce', async () => {
    await open('/r/kafe');
    await flushShifts();

    expect(page.querySelectorAll('footer').length).toBe(1);
  });

  it('bookingPageHasExactlyOneFooterAndNoHeaderInEmbed', async () => {
    await open('/r/kafe?embed=1');
    await flushShifts();

    expect(page.querySelector('header')).toBeNull();
    expect(page.querySelectorAll('footer').length).toBe(1);
  });

  it('embedKeepsTheVenueNameSinceThereIsNoHeader', async () => {
    await open('/r/kafe?embed=1');
    await flushShifts();

    expect(page.textContent).toContain('Kafé');
  });
});
