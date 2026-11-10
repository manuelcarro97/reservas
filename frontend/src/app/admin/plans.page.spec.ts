import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApiConfiguration } from '../core/api/api-configuration';
import { MeResponse } from '../core/api/models/me-response';
import { PlanResponse } from '../core/api/models/plan-response';
import { PlanSummaryResponse } from '../core/api/models/plan-summary-response';
import { MeStore } from './me.store';
import { PlansPage } from './plans.page';

@Component({ template: '<p>plano</p>' })
class EditorStub {}

const KAFE: PlanSummaryResponse = { slug: 'kafe', name: 'Kafé del Puerto', status: 'PUBLISHED' };
const TAPAS: PlanSummaryResponse = { slug: 'tapas', name: 'Tapas <b>Sol</b>', status: 'DRAFT' };
const TERRAZA: PlanSummaryResponse = { slug: 'terraza', name: 'Terraza', status: 'DRAFT' };
const CUSTOM: PlanSummaryResponse = { slug: 'otro', name: 'Otro', status: 'DRAFT' };

const ROOM = {
  shape: 'RECTANGLE',
  width: 800,
  height: 600,
  cutWidth: 0,
  cutDepth: 0,
  rotation: 0,
} as const;

function table(id: number, seats: number) {
  return {
    id,
    label: String(id),
    shape: 'SQUARE',
    seats,
    rotation: 0,
    x: 100 * id,
    y: 200,
  } as const;
}

/** El `PlanResponse` de cada plano de las pruebas; los que no están aquí llegan vacíos. */
const DETAILS: Record<string, PlanResponse> = {
  kafe: {
    ...KAFE,
    theme: 'AZUL',
    bookingMode: 'FREE_CHOICE',
    cancellationDeadlineHours: 2,
    room: ROOM,
    tables: [table(1, 2), table(2, 4), table(3, 6)],
    shifts: [
      { id: 1, name: 'Comida', days: ['MONDAY'], start: '13:00', end: '16:00' },
      { id: 2, name: 'Cena', days: ['MONDAY'], start: '20:00', end: '23:00' },
    ],
  },
  tapas: {
    ...TAPAS,
    theme: 'BOSQUE',
    bookingMode: 'ASSIGNED',
    cancellationDeadlineHours: 0,
    room: ROOM,
    tables: [table(1, 2), table(2, 4)],
    shifts: [{ id: 3, name: 'Noche', days: ['FRIDAY'], start: '20:00', end: '23:00' }],
  },
  terraza: {
    ...TERRAZA,
    theme: 'TERRACOTA',
    bookingMode: 'FREE_CHOICE',
    cancellationDeadlineHours: 2,
    room: ROOM,
    tables: [table(1, 4), table(2, 4)],
    shifts: [],
  },
};

function meWith(plans: PlanSummaryResponse[], extra: Partial<MeResponse> = {}): MeResponse {
  return {
    email: 'dueno@example.com',
    demo: false,
    telegramAvailable: false,
    telegramLinked: false,
    maxPlans: 3,
    plans,
    ...extra,
  };
}

describe('PlansPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MeStore,
        provideRouter([
          { path: 'panel/planos', component: PlansPage },
          { path: 'panel/:slug/plano', component: EditorStub },
        ]),
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    // Algunos tests sustituyen el portapapeles.
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function expectApi(method: string, path: string): TestRequest {
    const request = http.expectOne(
      (candidate) => candidate.method === method && candidate.url.endsWith(`/api/v1/admin/${path}`),
    );
    // El contrato declara `*/*` y el generador pediría `blob`: el cuerpo (y el `code` de los errores) debe llegar como JSON.
    expect(request.request.responseType).toBe('json');
    return request;
  }

  /** Las peticiones del plano de cada tarjeta (`GET /admin/restaurants/{slug}`), sin las de otros recursos. */
  function planGets(): TestRequest[] {
    return http.match(
      (request) =>
        request.method === 'GET' && /\/api\/v1\/admin\/restaurants\/[^/]+$/.test(request.url),
    );
  }

  function slugOf(request: TestRequest): string {
    return request.request.url.split('/').pop()!;
  }

  /** Atiende las peticiones del plano pendientes y devuelve los slugs pedidos. */
  async function flushPlanGets(details: Record<string, PlanResponse> = DETAILS): Promise<string[]> {
    const requests = planGets();
    for (const request of requests) {
      const slug = slugOf(request);
      request.flush(details[slug] ?? { slug, name: slug, status: 'DRAFT', tables: [], shifts: [] });
    }
    await settle();
    return requests.map(slugOf);
  }

  async function open(
    me: MeResponse = meWith([KAFE, TAPAS]),
    options: { url?: string; details?: Record<string, PlanResponse> } = {},
  ): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(options.url ?? '/panel/planos');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('GET', 'me').flush(me);
    await settle();
    await flushPlanGets(options.details);
  }

  function planCards(): HTMLElement[] {
    return Array.from(page.querySelectorAll<HTMLElement>('[data-plan]'));
  }

  function card(slug: string): HTMLElement {
    return page.querySelector<HTMLElement>(`[data-plan="${slug}"]`)!;
  }

  function featured(): HTMLElement | null {
    return page.querySelector<HTMLElement>('[data-plan].featured');
  }

  function figure(kicker: string): HTMLElement | undefined {
    return Array.from(page.querySelectorAll<HTMLElement>('.fig')).find(
      (candidate) => candidate.querySelector('.kicker')?.textContent?.trim() === kicker,
    );
  }

  function createForm(): HTMLFormElement | null {
    return page.querySelector<HTMLFormElement>('form.create-plan');
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

  async function submitCreate(): Promise<void> {
    createForm()!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  }

  function alertText(): string | null {
    return page.querySelector('[role="alert"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
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

  function copyButton(): HTMLButtonElement | null {
    return page.querySelector<HTMLButtonElement>('button[aria-label="Copiar enlace"]');
  }

  /** Nombre accesible y destino de cada enlace de una tarjeta. */
  function links(root: HTMLElement): (string | null)[][] {
    return Array.from(root.querySelectorAll('a')).map((link) => [
      link.getAttribute('aria-label') ?? link.textContent?.trim() ?? null,
      link.getAttribute('href'),
    ]);
  }

  it('listsPlans', async () => {
    await open();

    expect(planCards()).toHaveLength(2);
    expect(page.querySelector('.eyebrow')?.textContent).toContain('2 de 3 planos');
    const main = featured()!;
    expect(main.getAttribute('data-plan')).toBe('kafe');
    expect(main.textContent).toContain('Kafé del Puerto');
    expect(main.textContent).toContain('Publicado');
    const other = card('tapas');
    expect(other.textContent).toContain('Borrador');
    // El nombre se pinta como texto, nunca como HTML.
    expect(other.textContent).toContain('Tapas <b>Sol</b>');
    expect(other.querySelector('b')).toBeNull();

    // Del plano destacado se llega a su plano, sus reservas, sus turnos y su configuración.
    expect(links(main)).toEqual([
      ['Plano interactivo', '/panel/kafe/plano'],
      ['Reservas', '/panel/kafe'],
      ['Turnos', '/panel/kafe/turnos'],
      ['Configuración', '/panel/kafe/ajustes'],
      ['Código para tu web', '/panel/kafe/ajustes'],
    ]);
    // De los demás se llega a "Abrir", que lo sube a la tarjeta grande.
    expect(links(other)).toEqual([['Abrir Tapas <b>Sol</b>', '/panel/planos?plano=tapas']]);
  });

  it('showsLoadingThenFailureWithRetry', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/planos');
    page = harness.routeNativeElement as HTMLElement;
    expect(page.textContent).toContain('Cargando');

    expectApi('GET', 'me').flush({}, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(alertText()).toContain('No se pudieron cargar tus planos');

    await click('Reintentar');
    expectApi('GET', 'me').flush(meWith([KAFE]));
    await settle();
    await flushPlanGets();
    expect(planCards()).toHaveLength(1);
  });

  it('featuredPlanShowsItsFigures', async () => {
    await open();

    expect(figure('Mesas')!.querySelector('b')!.textContent).toBe('3');
    // Mesas de 2 + 4 + 6 plazas.
    expect(figure('Capacidad')!.querySelector('b')!.textContent).toBe('12');
    expect(figure('Turnos')!.querySelector('b')!.textContent).toBe('2');
    expect(figure('Turnos')!.textContent).toContain('Comida · Cena');
    expect(figure('Turnos')!.querySelector('.sub')?.getAttribute('title')).toBe('Comida · Cena');
    expect(figure('Modo')!.querySelector('b')!.textContent).toBe('Elección libre');
    expect(figure('Modo')!.textContent).toContain('cancelación hasta 2 h antes');
    expect(featured()!.textContent).toContain('Tema · Azul');
  });

  it('featuredPlanShowsTheAssignedModeAndTheSingularForms', async () => {
    await open(meWith([TAPAS]), {
      details: {
        tapas: { ...DETAILS['tapas'], tables: [table(1, 2)], cancellationDeadlineHours: 1 },
      },
    });

    expect(figure('Mesas')!.textContent).toContain('1');
    expect(figure('Modo')!.querySelector('b')!.textContent).toBe('Asigno yo la mesa');
    expect(figure('Modo')!.textContent).toContain('cancelación hasta 1 h antes');
    expect(figure('Turnos')!.textContent).toContain('Noche');
  });

  it('featuredPlanDrawsTheRoomReadOnly', async () => {
    await open();

    const plano = featured()!.querySelector('app-plano svg.plano');
    expect(plano).not.toBeNull();
    expect(plano!.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(plano!.hasAttribute('data-interactive')).toBe(false);
  });

  it('otherPlansShowTheirTablesAndSeats', async () => {
    await open();

    expect(card('tapas').textContent).toContain('2 mesas · 6 plazas');
  });

  it('eachPlanIsRequestedOnceAndOpenDoesNotRepeatIt', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/planos');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('GET', 'me').flush(meWith([KAFE, TAPAS, CUSTOM]));
    await settle();

    expect((await flushPlanGets()).sort()).toEqual(['kafe', 'otro', 'tapas']);

    page.querySelector<HTMLAnchorElement>('[data-plan="tapas"] a')!.click();
    await settle();
    expect(planGets()).toHaveLength(0);
  });

  it('openPromotesAnotherPlan', async () => {
    await open(meWith([KAFE, TERRAZA]));
    expect(featured()!.getAttribute('data-plan')).toBe('kafe');

    page.querySelector<HTMLAnchorElement>('[data-plan="terraza"] a')!.click();
    await settle();

    expect(TestBed.inject(Router).url).toBe('/panel/planos?plano=terraza');
    expect(featured()!.getAttribute('data-plan')).toBe('terraza');
    expect(featured()!.textContent).toContain('Terraza');
    expect(featured()!.textContent).toContain('Tema · Terracota');
    expect(figure('Capacidad')!.querySelector('b')!.textContent).toBe('8');
    // Kafé pasa a ser una de las tarjetas pequeñas.
    expect(card('kafe').classList.contains('featured')).toBe(false);
    expect(planCards()).toHaveLength(2);
  });

  it('theQueryInTheUrlPicksTheFeaturedPlanOnLoad', async () => {
    await open(meWith([KAFE, TAPAS]), { url: '/panel/planos?plano=tapas' });

    expect(featured()!.getAttribute('data-plan')).toBe('tapas');
  });

  it('anUnknownPlanInTheQueryFallsBackToTheFirst', async () => {
    await open(meWith([KAFE, TAPAS]), { url: '/panel/planos?plano=no-existe' });

    expect(featured()!.getAttribute('data-plan')).toBe('kafe');
  });

  it('aPlanThatFailsToLoadShowsAMessageInsteadOfAFigureSheet', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/planos');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('GET', 'me').flush(meWith([KAFE, TAPAS]));
    await settle();
    for (const request of planGets()) {
      request.flush({}, { status: 500, statusText: 'Server Error' });
    }
    await settle();

    expect(featured()!.textContent).toContain('No se pudo cargar el plano');
    expect(featured()!.querySelector('app-plano')).toBeNull();
    expect(card('tapas').textContent).not.toContain('mesas');
    // Los enlaces siguen ahí: el plano se puede abrir aunque su ficha no cargue.
    expect(links(featured()!)).toContainEqual(['Plano interactivo', '/panel/kafe/plano']);
  });

  it('aPlanWithAThemeThisClientDoesNotKnowStillRendersWithTheDefaultOne', async () => {
    await open(meWith([KAFE, TAPAS]), {
      details: {
        kafe: { ...DETAILS['kafe'], theme: 'XYZ' as never },
        tapas: { ...DETAILS['tapas'], theme: 'XYZ' as never },
      },
    });

    expect(featured()!.querySelector('app-plano svg.plano')).not.toBeNull();
    expect(featured()!.textContent).toContain('Tema · Azul');
  });

  it('aFailedPlanCanBeRetriedAndOnlyThatPlanIsRequestedAgain', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/planos');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('GET', 'me').flush(meWith([KAFE, TAPAS]));
    await settle();
    for (const request of planGets()) {
      if (slugOf(request) === 'kafe') {
        request.flush({}, { status: 500, statusText: 'Server Error' });
      } else {
        request.flush(DETAILS[slugOf(request)]);
      }
    }
    await settle();
    expect(featured()!.textContent).toContain('No se pudo cargar el plano');

    featured()!.querySelector<HTMLButtonElement>('.drawing button')!.click();
    await settle();
    // Mientras vuelve la respuesta, el mensaje de error deja paso a la carga.
    expect(featured()!.textContent).not.toContain('No se pudo cargar el plano');
    expect(featured()!.textContent).toContain('Cargando el plano');
    expect(await flushPlanGets()).toEqual(['kafe']);

    expect(featured()!.querySelector('app-plano svg.plano')).not.toBeNull();
    expect(figure('Capacidad')!.querySelector('b')!.textContent).toBe('12');
    expect(featured()!.textContent).not.toContain('No se pudo cargar');
  });

  it('aSmallCardWhosePlanFailedSaysSoInsteadOfLeavingAGap', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/planos');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('GET', 'me').flush(meWith([KAFE, TAPAS]));
    await settle();
    for (const request of planGets()) {
      request.flush({}, { status: 500, statusText: 'Server Error' });
    }
    await settle();

    expect(card('tapas').textContent).toContain('No se pudo cargar');
  });

  it('leavingThePageCancelsTheRequestsOfTheCardsStillInFlight', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/planos');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('GET', 'me').flush(meWith([KAFE, TAPAS]));
    await settle();
    const pending = planGets();
    expect(pending).toHaveLength(2);

    await harness.navigateByUrl('/panel/kafe/plano');

    expect(pending.every((request) => request.cancelled)).toBe(true);
  });

  it('longPlanNamesAreTruncatedWithTheFullNameInTheTitle', async () => {
    const name = 'Un local con un nombre larguísimo '.repeat(4).slice(0, 120);
    const long: PlanSummaryResponse = { slug: 'largo', name, status: 'PUBLISHED' };
    await open(meWith([long, TAPAS]));

    const title = featured()!.querySelector<HTMLElement>('.plan-name');
    expect(title?.classList.contains('truncate')).toBe(true);
    expect(title?.getAttribute('title')).toBe(name);
    expect(title?.textContent?.trim()).toBe(name);
  });

  it('copyLinkOnlyWhenPublished', async () => {
    await open(meWith([KAFE, TAPAS]));
    expect(copyButton()).not.toBeNull();

    // El borrador no tiene página pública: no se ofrece copiar su enlace.
    page.querySelector<HTMLAnchorElement>('[data-plan="tapas"] a')!.click();
    await settle();

    expect(featured()!.getAttribute('data-plan')).toBe('tapas');
    expect(copyButton()).toBeNull();
  });

  it('copyLinkPutsThePublicUrlOnTheClipboard', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await open();

    copyButton()!.click();
    await settle();

    expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/kafe`);
    expect(page.querySelector('.copy-status')?.textContent).toContain('Copiado');
  });

  it('copyLinkFallsBackToAskingForACopyByHand', async () => {
    // jsdom no trae portapapeles: es el caso de un navegador que lo niega.
    await open();

    copyButton()!.click();
    await settle();

    expect(page.querySelector('.copy-status')?.textContent).toContain('Copia el enlace a mano');
  });

  it('emptyAccountShowsEmptyState', async () => {
    await open(meWith([]));

    expect(page.querySelector('.empty-state')?.textContent).toContain(
      'Todavía no tienes ningún plano.',
    );
    expect(planCards()).toHaveLength(0);
    expect(page.querySelector('app-plano')).toBeNull();
    // Sin planos se puede crear el primero.
    expect(createForm()).not.toBeNull();
  });

  it('noDeleteOnThisPage', async () => {
    await open();

    expect(button('Borrar')).toBeUndefined();
    expect(page.textContent).not.toContain('Borrar plano');
  });

  it('freeSlotTellsHowManyPlansAreLeftInThePlural', async () => {
    await open(meWith([KAFE]));

    expect(page.querySelector('.free-slot')?.textContent).toContain('Te quedan 2 planos libres');
  });

  it('freeSlotTellsHowManyPlansAreLeftInTheSingular', async () => {
    await open(meWith([KAFE, TAPAS]));

    expect(page.querySelector('.free-slot')?.textContent).toContain('Te queda 1 plano libre');
  });

  it('createShownBelowTheLimit', async () => {
    await open(meWith([KAFE, TAPAS]));

    expect(createForm()).not.toBeNull();
  });

  it('createHiddenAtLimit', async () => {
    await open(meWith([KAFE, TAPAS, CUSTOM]));

    expect(createForm()).toBeNull();
    expect(page.textContent).toContain('máximo de 3 planos');
  });

  it('noFreeSlotAtTheLimit', async () => {
    await open(meWith([KAFE, TAPAS, CUSTOM]));

    expect(page.querySelector('.free-slot')).toBeNull();
  });

  it('slugSuggestedFromName', async () => {
    await open(meWith([]));

    type('name', 'La Mesa del Puerto');

    expect(field('slug').value).toBe('la-mesa-del-puerto');
  });

  it('editedSlugIsNotOverwrittenByTheName', async () => {
    await open(meWith([]));

    type('name', 'La Mesa');
    type('slug', 'mi-enlace');
    type('name', 'La Mesa del Puerto');

    expect(field('slug').value).toBe('mi-enlace');
  });

  it('createdPlanOpensEditor', async () => {
    await open(meWith([]));
    type('name', 'La Mesa del Puerto');

    await submitCreate();
    const post = expectApi('POST', 'restaurants');
    expect(post.request.body).toEqual({ name: 'La Mesa del Puerto', slug: 'la-mesa-del-puerto' });
    post.flush(
      { slug: 'la-mesa-del-puerto', name: 'La Mesa del Puerto', status: 'DRAFT' },
      { status: 201, statusText: 'Created' },
    );
    await settle();
    expectApi('GET', 'me').flush(
      meWith([{ slug: 'la-mesa-del-puerto', name: 'La Mesa del Puerto', status: 'DRAFT' }]),
    );
    await settle();

    expect(TestBed.inject(Router).url).toBe('/panel/la-mesa-del-puerto/plano');
    expect(
      TestBed.inject(MeStore)
        .plans()
        .map((plan) => plan.slug),
    ).toEqual(['la-mesa-del-puerto']);
    // La página ya se cerró: si llegó a pedir el plano nuevo, la petición quedó cancelada.
    planGets();
  });

  it('createValidatesBeforeCallingTheApi', async () => {
    await open(meWith([]));

    await submitCreate();
    expect(alertText()).toContain('nombre');

    type('name', 'Bar Sol');
    type('slug', 'panel');
    await submitCreate();
    expect(alertText()).toContain('reservado');

    type('slug', 'cuenta');
    await submitCreate();
    expect(alertText()).toContain('reservado');

    type('slug', 'Bar Sol');
    await submitCreate();
    expect(alertText()).toContain('enlace');
    // `http.verify()` en afterEach garantiza que no salió ninguna petición.
  });

  it.each([
    [409, 'ALREADY_EXISTS', 'Ese enlace ya está en uso'],
    [409, 'SLUG_RESERVED', 'Ese enlace está reservado'],
    [400, 'INVALID_REQUEST', 'nombre o el enlace no son válidos'],
    [429, 'PLAN_CREATION_LIMIT', 'últimas 24 horas'],
    [403, 'DEMO_READ_ONLY', 'solo lectura'],
    [429, 'RATE_LIMITED', 'Demasiados intentos'],
    [500, 'INTERNAL_ERROR', 'No se pudo crear el plano'],
  ])('createShowsSpanishError %i %s', async (status, code, message) => {
    await open(meWith([]));
    type('name', 'Bar Sol');

    await submitCreate();
    expectApi('POST', 'restaurants').flush({ code }, { status, statusText: 'Error' });
    await settle();

    expect(alertText()).toContain(message);
    expect(TestBed.inject(Router).url).toBe('/panel/planos');
    expect(field('name').value).toBe('Bar Sol');
  });

  it('planLimitErrorReloadsThePlans', async () => {
    await open(meWith([KAFE]));
    type('name', 'Bar Sol');

    await submitCreate();
    expectApi('POST', 'restaurants').flush(
      { code: 'PLAN_LIMIT_REACHED' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expectApi('GET', 'me').flush(meWith([KAFE, TAPAS, CUSTOM]));
    await settle();
    // Kafé ya estaba pedido: solo faltan los dos planos nuevos.
    expect((await flushPlanGets()).sort()).toEqual(['otro', 'tapas']);

    expect(alertText()).toContain('máximo de planos');
    expect(createForm()).toBeNull();
  });

  it('demoHidesCreateAndDeletePlan', async () => {
    await open(meWith([KAFE], { demo: true }));

    expect(planCards()).toHaveLength(1);
    expect(createForm()).toBeNull();
    expect(button('Borrar')).toBeUndefined();
    expect(page.textContent).toContain('demostración');
  });

  it('demoDoesNotOfferAFreeSlot', async () => {
    await open(meWith([KAFE], { demo: true }));

    expect(page.querySelector('.free-slot')).toBeNull();
  });
});
