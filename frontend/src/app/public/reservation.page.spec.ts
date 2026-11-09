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
import { ReservationDetails } from '../core/api/models/reservation-details';
import { THEMES } from '../plano/themes';
import { ShellComponent } from '../shell/shell.component';
import { ReservationPage } from './reservation.page';

const CODE = 'KAFE23456789ABCD';

const RESERVATION: ReservationDetails = {
  code: CODE,
  date: '2030-01-01',
  arrivalTime: '20:30:00',
  partySize: 4,
  shiftId: 10,
  status: 'CONFIRMED',
  tableLabel: 'Terraza 3',
  restaurantName: 'Kafé',
  slug: 'kafe',
  theme: 'NOCHE',
  shiftName: 'Cena',
  shiftStart: '20:00:00',
  shiftEnd: '23:30:00',
};

describe('ReservationPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: '',
            component: ShellComponent,
            children: [{ path: 'reserva/:code', component: ReservationPage }],
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

  function expectApi(path: string, method: string): TestRequest {
    const request = http.expectOne(
      (candidate) =>
        candidate.method === method && candidate.url.endsWith(`/api/v1/reservations/${path}`),
    );
    // El contrato declara `*/*` y el generador pediría `blob`: el cuerpo (y el `code` de los errores) debe llegar como JSON.
    expect(request.request.responseType).toBe('json');
    return request;
  }

  async function open(
    url: string = `/reserva/${CODE}`,
    reservation: ReservationDetails = RESERVATION,
  ): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    page = harness.routeNativeElement as HTMLElement;
    expectApi(CODE, 'GET').flush(reservation);
    await settle();
  }

  function button(label: string): HTMLButtonElement | undefined {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
      candidate.textContent?.includes(label),
    );
  }

  async function click(label: string): Promise<void> {
    button(label)!.click();
    await settle();
  }

  it('showsReservationDetails', async () => {
    await open();

    const text = page.textContent;
    expect(text).toContain(CODE);
    expect(text).toContain('1 de enero de 2030');
    expect(text).toContain('4 personas');
    expect(text).toContain('Terraza 3');
    expect(text).toContain('Confirmada');
    expect(text).toContain('Kafé');
    expect(text).toContain('Cena · llegada 20:30 (20:00–23:30)');
    expect(button('Cancelar reserva')).toBeDefined();
  });

  it('showsTheShiftWithoutArrivalWhenTheReservationHasNone', async () => {
    await open(`/reserva/${CODE}`, { ...RESERVATION, arrivalTime: undefined });

    expect(page.textContent).toContain('Cena · 20:00–23:30');
    expect(page.textContent).not.toContain('llegada');
  });

  it('appliesThePlanTheme', async () => {
    await open();

    const host = page.querySelector<HTMLElement>('app-reservation-page')!;
    expect(host.style.getPropertyValue('--accent')).toBe(THEMES.NOCHE.cushA);
  });

  it('shellHeaderShowsTheVenueName', async () => {
    await open();

    expect(page.querySelector('header')?.textContent).toContain('Kafé');
    expect(page.querySelector('header')?.textContent).not.toContain('reservas.');
  });

  it('shellHeaderKeepsTheBrandWhenTheReservationIsNotFound', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/reserva/${CODE}`);
    page = harness.routeNativeElement as HTMLElement;
    expectApi(CODE, 'GET').flush({}, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(page.querySelector('header')?.textContent).toContain('reservas.');
  });

  it('footerAppearsOnlyOnce', async () => {
    await open();

    expect(page.querySelectorAll('footer').length).toBe(1);
  });

  it('unknownThemeFallsBackToAzul', async () => {
    await open(`/reserva/${CODE}`, {
      ...RESERVATION,
      theme: 'NEON' as ReservationDetails['theme'],
    });

    const host = page.querySelector<HTMLElement>('app-reservation-page')!;
    expect(host.style.getPropertyValue('--accent')).toBe(THEMES.AZUL.cushA);
    expect(page.textContent).toContain(CODE);
  });

  it('rejectedCancelRefreshesTheReservation', async () => {
    await open();

    await click('Cancelar reserva');
    await click('Sí, cancelar');
    expectApi(`${CODE}/cancel`, 'POST').flush(
      { code: 'INVALID_TRANSITION' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    // El local la había cancelado mientras tanto: se vuelve a pedir y se muestra el estado real.
    expectApi(CODE, 'GET').flush({ ...RESERVATION, status: 'CANCELLED' });
    await settle();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('ya no se puede cancelar');
    expect(page.textContent).toContain('Cancelada');
    expect(button('Cancelar reserva')).toBeUndefined();
  });

  it('linksToBookAgainAtTheSamePlan', async () => {
    await open();

    const link = page.querySelector<HTMLAnchorElement>('a[href="/r/kafe"]');
    expect(link?.textContent).toContain('Hacer otra reserva');
  });

  it('bookAgainLinkKeepsEmbedMode', async () => {
    await open(`/reserva/${CODE}?embed=1`);

    const link = page.querySelector<HTMLAnchorElement>('a[href="/r/kafe?embed=1"]');
    expect(link?.textContent).toContain('Hacer otra reserva');
  });

  it('cancelAsksConfirmationThenCancels', async () => {
    await open();

    await click('Cancelar reserva');
    // Primero se pide confirmación en la página; todavía no se ha cancelado nada.
    expect(page.textContent).toContain('¿Seguro que quieres cancelar tu reserva?');
    http.expectNone((candidate) => candidate.url.endsWith('/cancel'));

    await click('Sí, cancelar');
    const request = expectApi(`${CODE}/cancel`, 'POST');
    request.flush({ ...RESERVATION, status: 'CANCELLED' });
    await settle();

    expect(page.textContent).toContain('Cancelada');
    expect(page.textContent).not.toContain('¿Seguro que quieres cancelar');
    expect(button('Cancelar reserva')).toBeUndefined();
  });

  it('keepingTheReservationClosesTheConfirmation', async () => {
    await open();

    await click('Cancelar reserva');
    await click('No, mantenerla');

    expect(page.textContent).not.toContain('¿Seguro que quieres cancelar');
    expect(button('Cancelar reserva')).toBeDefined();
    http.expectNone((candidate) => candidate.url.endsWith('/cancel'));
  });

  it('cancelAfterDeadlineShowsMessage', async () => {
    await open();

    await click('Cancelar reserva');
    await click('Sí, cancelar');
    expectApi(`${CODE}/cancel`, 'POST').flush(
      { code: 'CANCELLATION_DEADLINE_PASSED' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(page.querySelector('[role=alert]')?.textContent).toContain(
      'Ya ha pasado el plazo para cancelar',
    );
    expect(page.textContent).toContain('Confirmada');
    expect(button('Cancelar reserva')).toBeUndefined();
  });

  it('unknownCodeShows404Message', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/reserva/${CODE}`);
    page = harness.routeNativeElement as HTMLElement;
    expectApi(CODE, 'GET').flush(
      { code: 'RESERVATION_NOT_FOUND' },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();

    expect(page.querySelector('[role=alert]')?.textContent).toContain(
      'No encontramos ninguna reserva con ese código',
    );
    expect(page.textContent).not.toContain('Cancelar reserva');
  });

  it('cancelledReservationShowsStateWithoutCancelButton', async () => {
    await open(`/reserva/${CODE}`, { ...RESERVATION, status: 'CANCELLED' });

    expect(page.textContent).toContain('Cancelada');
    expect(button('Cancelar reserva')).toBeUndefined();
  });

  it('reservationWithoutTableSaysSo', async () => {
    await open(`/reserva/${CODE}`, { ...RESERVATION, status: 'PENDING', tableLabel: undefined });

    expect(page.textContent).toContain('Pendiente de confirmar');
    expect(page.textContent).toContain('Mesa por asignar');
  });

  it('rateLimitedOnCancelShowsMessage', async () => {
    await open();

    await click('Cancelar reserva');
    await click('Sí, cancelar');
    expectApi(`${CODE}/cancel`, 'POST').flush(
      { code: 'RATE_LIMITED' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '30' } },
    );
    await settle();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('30 segundos');
    // Se puede reintentar: el botón sigue y la confirmación se cierra.
    expect(button('Cancelar reserva')).toBeDefined();
  });

  it('failedLoadShowsGenericMessage', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/reserva/${CODE}`);
    page = harness.routeNativeElement as HTMLElement;
    expectApi(CODE, 'GET').flush(null, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(page.querySelector('[role=alert]')?.textContent).toContain(
      'No se pudo cargar la reserva',
    );
  });

  it('rendersServerTextAsText', async () => {
    await open(`/reserva/${CODE}`, { ...RESERVATION, tableLabel: '<img src=x onerror=alert(1)>' });

    expect(page.querySelector('img')).toBeNull();
    expect(page.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('footerLinkPresentInEmbed', async () => {
    await open(`/reserva/${CODE}?embed=1`);

    expect(page.querySelector('header')).toBeNull();
    const link = page.querySelector<HTMLAnchorElement>('footer a');
    expect(link?.textContent).toContain('Desarrollado por Manuel Carro');
    expect(link?.getAttribute('href')).toBe('https://www.linkedin.com/in/manuelcarro');
  });
});
