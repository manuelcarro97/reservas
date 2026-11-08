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
import { PlanResponse } from '../core/api/models/plan-response';
import { NOW } from '../core/time';
import { ShiftsPage } from './shifts.page';

const EVERY_DAY = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

const COMIDA = { id: 10, name: 'Comida', start: '13:00:00', end: '16:00:00', days: [...EVERY_DAY] };
const CENA = {
  id: 11,
  name: 'Cena',
  start: '20:00:00',
  end: '23:30:00',
  days: ['FRIDAY', 'SATURDAY'] as ('FRIDAY' | 'SATURDAY')[],
};

const PLAN: PlanResponse = {
  slug: 'kafe',
  name: 'Kafé del Puerto',
  status: 'PUBLISHED',
  timeZone: 'Europe/Madrid',
  theme: 'AZUL',
  shifts: [COMIDA, CENA],
};

// 23:30 UTC del 9 de noviembre: en Madrid (UTC+1) ya es día 10; con la zona del navegador (UTC en CI) seguiría siendo 9.
const CLOCK = new Date('2026-11-09T23:30:00Z');
const TODAY = '2026-11-10';
const LAST_DAY = '2027-02-08'; // hoy + 90 días

/** Cuerpo de error de un endpoint declarado sin cuerpo: el cliente generado lo pide como texto. */
function problem(body: object): string {
  return JSON.stringify(body);
}

describe('ShiftsPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'panel/:slug/turnos', component: ShiftsPage }]),
        { provide: NOW, useValue: () => CLOCK },
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

  /** Petición al admin. Los endpoints sin cuerpo (DELETE y alta de un día cerrado) piden `text`, el resto `json`. */
  function expectApi(method: string, path: string): TestRequest {
    const request = http.expectOne(
      (candidate) => candidate.method === method && candidate.url.endsWith(`/api/v1/admin/${path}`),
    );
    const withoutBody = method === 'DELETE' || (method === 'POST' && path.endsWith('/closures'));
    expect(request.request.responseType).toBe(withoutBody ? 'text' : 'json');
    return request;
  }

  async function flushClosures(dates: string[] = [], from = TODAY): Promise<void> {
    const request = expectApi('GET', 'restaurants/kafe/closures');
    expect(request.request.params.get('from')).toBe(from);
    request.flush(dates);
    await settle();
  }

  async function open(plan: PlanResponse = PLAN, closures: string[] = []): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/turnos');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('GET', 'restaurants/kafe').flush(plan);
    await settle();
    await flushClosures(closures);
  }

  function shiftItems(): HTMLElement[] {
    return Array.from(page.querySelectorAll<HTMLElement>('li.shift'));
  }

  function shiftItem(name: string): HTMLElement {
    return shiftItems().find((item) => item.querySelector('strong')?.textContent === name)!;
  }

  function closureItems(): HTMLElement[] {
    return Array.from(page.querySelectorAll<HTMLElement>('li.closure'));
  }

  function button(label: string, within: ParentNode = page): HTMLButtonElement | undefined {
    return Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
      candidate.textContent?.includes(label),
    );
  }

  async function click(label: string, within: ParentNode = page): Promise<void> {
    button(label, within)!.click();
    await settle();
  }

  function field(name: string): HTMLInputElement {
    return page.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  }

  function type(name: string, value: string): void {
    const input = field(name);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
  }

  function setDay(day: string, checked: boolean): void {
    const input = field(`day-${day}`);
    if (input.checked !== checked) {
      input.click();
      harness.detectChanges();
    }
  }

  async function submit(form: string): Promise<void> {
    page
      .querySelector<HTMLFormElement>(`form.${form}`)!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  }

  function alertText(): string | null {
    return page.querySelector('[role="alert"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  }

  function fillNewShift(name: string, start: string, end: string): void {
    type('name', name);
    type('start', start);
    type('end', end);
  }

  describe('turnos', () => {
    it('listsShiftsByStartWithHoursAndDays', async () => {
      await open({ ...PLAN, shifts: [CENA, COMIDA] });

      expect(shiftItems().map((item) => item.querySelector('strong')?.textContent)).toEqual([
        'Comida',
        'Cena',
      ]);
      expect(shiftItem('Comida').textContent).toContain('13:00');
      expect(shiftItem('Comida').textContent).toContain('16:00');
      expect(shiftItem('Comida').textContent).toContain('Todos los días');
      expect(shiftItem('Cena').textContent).toContain('Vie');
      expect(shiftItem('Cena').textContent).toContain('Sáb');
      expect(shiftItem('Cena').textContent).not.toContain('Lun');
      expect(page.textContent).toContain('Kafé del Puerto');
    });

    it('showsNamesAsTextOnly', async () => {
      await open({ ...PLAN, shifts: [{ ...COMIDA, name: '<b>Brunch</b>' }] });

      expect(shiftItems()[0].textContent).toContain('<b>Brunch</b>');
      expect(shiftItems()[0].querySelector('b')).toBeNull();
    });

    it('addShiftSendsTheRequestAndReloadsThePlan', async () => {
      await open();

      fillNewShift('Desayuno', '08:00', '11:30');
      setDay('SATURDAY', false);
      setDay('SUNDAY', false);
      await submit('shift-form');
      const post = expectApi('POST', 'restaurants/kafe/shifts');
      expect(post.request.body).toEqual({
        name: 'Desayuno',
        start: '08:00',
        end: '11:30',
        days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      });
      post.flush({ id: 12 }, { status: 201, statusText: 'Created' });
      await settle();
      const desayuno = {
        id: 12,
        name: 'Desayuno',
        start: '08:00:00',
        end: '11:30:00',
        days: [...EVERY_DAY],
      };
      expectApi('GET', 'restaurants/kafe').flush({ ...PLAN, shifts: [desayuno, COMIDA, CENA] });
      await settle();

      expect(shiftItems()).toHaveLength(3);
      expect(shiftItems()[0].textContent).toContain('Desayuno');
      // El formulario queda listo para otro turno.
      expect(field('name').value).toBe('');
    });

    it('addShiftValidatesBeforeCallingTheApi', async () => {
      await open();

      await submit('shift-form');
      expect(alertText()).toContain('nombre');

      fillNewShift('Tarde', '17:00', '17:00');
      await submit('shift-form');
      expect(alertText()).toContain('antes de la hora de fin');

      type('end', '18:00');
      for (const day of EVERY_DAY) {
        setDay(day, false);
      }
      await submit('shift-form');
      expect(alertText()).toContain('al menos un día');
      // `http.verify()` en afterEach garantiza que no salió ninguna petición.
    });

    it.each([
      [409, 'SHIFT_OVERLAP', 'se solapa'],
      [409, 'SHIFT_LIMIT', 'máximo de 10 turnos'],
      [400, 'BAD_REQUEST', 'No se pudo guardar el turno'],
      [500, 'INTERNAL_ERROR', 'No se pudo guardar el turno'],
    ])('addShiftShowsSpanishError %i %s', async (status, code, message) => {
      await open();
      fillNewShift('Tarde', '17:00', '18:00');

      await submit('shift-form');
      expectApi('POST', 'restaurants/kafe/shifts').flush({ code }, { status, statusText: 'Error' });
      await settle();

      expect(alertText()).toContain(message);
      expect(field('name').value).toBe('Tarde');
    });

    it('renameShiftAlways', async () => {
      await open();

      await click('Editar', shiftItem('Comida'));
      expect(field('name').value).toBe('Comida');
      expect(field('start').value).toBe('13:00');
      expect(field('end').value).toBe('16:00');
      type('name', 'Almuerzo');
      await submit('shift-form');

      // Solo cambió el nombre: va el PATCH y no el PUT del horario, que es el que puede dar 409.
      const patch = expectApi('PATCH', 'restaurants/kafe/shifts/10');
      expect(patch.request.body).toEqual({ name: 'Almuerzo' });
      patch.flush({ ...COMIDA, name: 'Almuerzo' });
      await settle();
      expectApi('GET', 'restaurants/kafe').flush({
        ...PLAN,
        shifts: [{ ...COMIDA, name: 'Almuerzo' }, CENA],
      });
      await settle();

      expect(shiftItem('Almuerzo')).toBeDefined();
      expect(page.querySelector('form.shift-form h2')?.textContent).toContain('Nuevo turno');
      expect(alertText()).toBeNull();
    });

    it('renameThenRescheduleSendsPatchFirstAndKeepsTheNameIfTheScheduleFails', async () => {
      await open();

      await click('Editar', shiftItem('Comida'));
      type('name', 'Almuerzo');
      type('start', '12:30');
      await submit('shift-form');
      const patch = expectApi('PATCH', 'restaurants/kafe/shifts/10');
      patch.flush({ ...COMIDA, name: 'Almuerzo' });
      await settle();
      const put = expectApi('PUT', 'restaurants/kafe/shifts/10');
      put.flush(
        { code: 'SHIFT_HAS_RESERVATIONS', reservations: ['KAFE23456789ABCD'] },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      // El nombre ya se guardó: el plano se vuelve a leer y el formulario conserva el horario pendiente.
      expectApi('GET', 'restaurants/kafe').flush({
        ...PLAN,
        shifts: [{ ...COMIDA, name: 'Almuerzo' }, CENA],
      });
      await settle();
      expect(shiftItem('Almuerzo')).toBeDefined();
      expect(alertText()).toContain('KAFE23456789ABCD');
      expect(field('start').value).toBe('12:30');
    });

    it('rescheduleConflictShowsCodes', async () => {
      await open();

      await click('Editar', shiftItem('Cena'));
      type('start', '19:30');
      setDay('SUNDAY', true);
      await submit('shift-form');
      const put = expectApi('PUT', 'restaurants/kafe/shifts/11');
      expect(put.request.body).toEqual({
        start: '19:30',
        end: '23:30',
        days: ['FRIDAY', 'SATURDAY', 'SUNDAY'],
      });
      put.flush(
        { code: 'SHIFT_HAS_RESERVATIONS', reservations: ['KAFE23456789ABCD', 'KAFEZZZZ99998888'] },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(alertText()).toContain('reservas activas');
      expect(alertText()).toContain('KAFE23456789ABCD');
      expect(alertText()).toContain('KAFEZZZZ99998888');
      expect(page.querySelectorAll('[role="alert"] li')).toHaveLength(2);
      // Nada cambió en el servidor: el turno sigue como estaba y el formulario conserva lo escrito.
      expect(shiftItem('Cena').textContent).toContain('20:00');
      expect(field('start').value).toBe('19:30');
    });

    it('rescheduleOverlapShowsTheMessage', async () => {
      await open();

      await click('Editar', shiftItem('Cena'));
      type('start', '15:00');
      await submit('shift-form');
      expectApi('PUT', 'restaurants/kafe/shifts/11').flush(
        { code: 'SHIFT_OVERLAP' },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(alertText()).toContain('se solapa');
    });

    it('editingWithoutChangesCallsNothing', async () => {
      await open();

      await click('Editar', shiftItem('Comida'));
      await submit('shift-form');

      expect(page.querySelector('form.shift-form h2')?.textContent).toContain('Nuevo turno');
    });

    it('cancelEditingReturnsToTheNewShiftForm', async () => {
      await open();

      await click('Editar', shiftItem('Comida'));
      expect(page.querySelector('form.shift-form h2')?.textContent).toContain('Editar');
      await click('Cancelar');

      expect(page.querySelector('form.shift-form h2')?.textContent).toContain('Nuevo turno');
      expect(field('name').value).toBe('');
    });

    it('deleteShiftAsksForConfirmationInThePage', async () => {
      await open();

      await click('Borrar', shiftItem('Comida'));
      expect(shiftItem('Comida').textContent).toContain('¿Borrar el turno');
      await click('No borrar', shiftItem('Comida'));
      expect(shiftItem('Comida').textContent).not.toContain('¿Borrar el turno');

      await click('Borrar', shiftItem('Comida'));
      await click('Sí, borrar el turno', shiftItem('Comida'));
      expectApi('DELETE', 'restaurants/kafe/shifts/10').flush(null, {
        status: 204,
        statusText: 'No Content',
      });
      await settle();
      expectApi('GET', 'restaurants/kafe').flush({ ...PLAN, shifts: [CENA] });
      await settle();

      expect(shiftItems()).toHaveLength(1);
      expect(alertText()).toBeNull();
    });

    it('deleteShiftConflictShowsCodes', async () => {
      await open();

      await click('Borrar', shiftItem('Cena'));
      await click('Sí, borrar el turno', shiftItem('Cena'));
      expectApi('DELETE', 'restaurants/kafe/shifts/11').flush(
        problem({ code: 'SHIFT_HAS_RESERVATIONS', reservations: ['KAFE23456789ABCD'] }),
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(alertText()).toContain('reservas activas');
      expect(alertText()).toContain('KAFE23456789ABCD');
      expect(shiftItems()).toHaveLength(2);
      // La confirmación se cierra: tras cancelar las reservas hay que pedirla otra vez.
      expect(shiftItem('Cena').textContent).not.toContain('¿Borrar el turno');
    });

    it('shiftThatNoLongerExistsReloadsThePlan', async () => {
      await open();

      await click('Borrar', shiftItem('Cena'));
      await click('Sí, borrar el turno', shiftItem('Cena'));
      expectApi('DELETE', 'restaurants/kafe/shifts/11').flush(
        problem({ code: 'SHIFT_NOT_FOUND' }),
        { status: 404, statusText: 'Not Found' },
      );
      await settle();
      expectApi('GET', 'restaurants/kafe').flush({ ...PLAN, shifts: [COMIDA] });
      await settle();

      expect(alertText()).toContain('ya no existe');
      expect(shiftItems()).toHaveLength(1);
    });

    it('rateLimitedAsksToWait', async () => {
      await open();

      await click('Borrar', shiftItem('Cena'));
      await click('Sí, borrar el turno', shiftItem('Cena'));
      expectApi('DELETE', 'restaurants/kafe/shifts/11').flush(problem({ code: 'RATE_LIMITED' }), {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '30' },
      });
      await settle();

      expect(alertText()).toContain('Demasiadas acciones seguidas, espera un momento');
    });
  });

  describe('días cerrados', () => {
    it('listsTheClosedDays', async () => {
      await open(PLAN, ['2026-11-12', '2026-12-24']);

      expect(closureItems().map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        expect.stringContaining('12/11/2026'),
        expect.stringContaining('24/12/2026'),
      ]);
    });

    it('addAndRemoveClosure', async () => {
      await open();
      const input = field('closure-date');
      // Solo de hoy (en la zona del plano) a hoy + 90 días.
      expect(input.min).toBe(TODAY);
      expect(input.max).toBe(LAST_DAY);

      type('closure-date', '2026-11-12');
      await submit('closure-form');
      const post = expectApi('POST', 'restaurants/kafe/closures');
      expect(post.request.body).toEqual({ date: '2026-11-12' });
      post.flush(null, { status: 201, statusText: 'Created' });
      await settle();
      await flushClosures(['2026-11-12']);

      expect(closureItems()).toHaveLength(1);
      expect(closureItems()[0].textContent).toContain('12/11/2026');

      await click('Quitar', closureItems()[0]);
      expect(closureItems()[0].textContent).toContain('¿Volver a abrir');
      await click('No quitar', closureItems()[0]);
      expect(closureItems()[0].textContent).not.toContain('¿Volver a abrir');

      await click('Quitar', closureItems()[0]);
      await click('Sí, quitar el cierre', closureItems()[0]);
      expectApi('DELETE', 'restaurants/kafe/closures/2026-11-12').flush(null, {
        status: 204,
        statusText: 'No Content',
      });
      await settle();
      await flushClosures([]);

      expect(closureItems()).toHaveLength(0);
      expect(page.textContent).toContain('No hay días cerrados');
    });

    it('closureOutsideTheRangeIsNotSent', async () => {
      await open();

      await submit('closure-form');
      expect(alertText()).toContain('fecha');

      type('closure-date', '2026-11-09');
      await submit('closure-form');
      expect(alertText()).toContain('90 días');

      type('closure-date', '2027-02-09');
      await submit('closure-form');
      expect(alertText()).toContain('90 días');

      type('closure-date', LAST_DAY);
      await submit('closure-form');
      expectApi('POST', 'restaurants/kafe/closures').flush(null, {
        status: 201,
        statusText: 'Created',
      });
      await settle();
      await flushClosures([LAST_DAY]);
      expect(alertText()).toBeNull();
    });

    it('closureWithReservationsShowsTheMessageAndCodes', async () => {
      await open();
      type('closure-date', '2026-11-12');

      await submit('closure-form');
      expectApi('POST', 'restaurants/kafe/closures').flush(
        problem({
          code: 'CLOSURE_HAS_RESERVATIONS',
          reservations: ['KAFE23456789ABCD', 'KAFEZZZZ99998888'],
        }),
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(alertText()).toContain('reservas activas');
      expect(alertText()).toContain('KAFE23456789ABCD');
      expect(alertText()).toContain('KAFEZZZZ99998888');
      expect(page.querySelectorAll('[role="alert"] li')).toHaveLength(2);
      expect(closureItems()).toHaveLength(0);
      // La fecha escrita se conserva para volver a probar tras cancelar las reservas.
      expect(field('closure-date').value).toBe('2026-11-12');
    });

    it('removeClosureErrorsShowTheMessage', async () => {
      await open(PLAN, ['2026-11-12']);

      await click('Quitar', closureItems()[0]);
      await click('Sí, quitar el cierre', closureItems()[0]);
      expectApi('DELETE', 'restaurants/kafe/closures/2026-11-12').flush(
        problem({ code: 'RATE_LIMITED' }),
        { status: 429, statusText: 'Too Many Requests' },
      );
      await settle();

      expect(alertText()).toContain('Demasiadas acciones seguidas');
      expect(closureItems()).toHaveLength(1);
    });
  });

  describe('carga', () => {
    it('showsLoadingThenNotFound', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/turnos');
      page = harness.routeNativeElement as HTMLElement;
      expect(page.textContent).toContain('Cargando');

      expectApi('GET', 'restaurants/kafe').flush(
        { code: 'RESTAURANT_NOT_FOUND' },
        { status: 404, statusText: 'Not Found' },
      );
      await settle();

      expect(alertText()).toContain('no existe');
    });

    it('showsFailureWithRetry', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/turnos');
      page = harness.routeNativeElement as HTMLElement;

      expectApi('GET', 'restaurants/kafe').flush({}, { status: 500, statusText: 'Server Error' });
      await settle();
      expect(alertText()).toContain('No se pudo cargar');

      await click('Reintentar');
      expectApi('GET', 'restaurants/kafe').flush(PLAN);
      await settle();
      await flushClosures();

      expect(shiftItems()).toHaveLength(2);
    });

    it('closuresFailureKeepsTheShifts', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/turnos');
      page = harness.routeNativeElement as HTMLElement;
      expectApi('GET', 'restaurants/kafe').flush(PLAN);
      await settle();

      expectApi('GET', 'restaurants/kafe/closures').flush(
        {},
        { status: 500, statusText: 'Server Error' },
      );
      await settle();

      expect(shiftItems()).toHaveLength(2);
      expect(alertText()).toContain('días cerrados');
    });

    it('changingPlanReloadsAndResetsTheForms', async () => {
      await open();
      await click('Editar', shiftItem('Comida'));
      type('closure-date', '2026-11-12');

      await harness.navigateByUrl('/panel/otro/turnos');
      expectApi('GET', 'restaurants/otro').flush({
        slug: 'otro',
        name: 'Otro local',
        timeZone: 'Europe/Madrid',
        shifts: [],
      });
      await settle();
      const closures = http.expectOne((request) =>
        request.url.endsWith('/api/v1/admin/restaurants/otro/closures'),
      );
      closures.flush([]);
      await settle();

      expect(page.textContent).toContain('Otro local');
      expect(shiftItems()).toHaveLength(0);
      expect(page.querySelector('form.shift-form h2')?.textContent).toContain('Nuevo turno');
      expect(field('closure-date').value).toBe('');
    });
  });
});
