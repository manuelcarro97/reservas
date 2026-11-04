import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApiConfiguration } from '../core/api/api-configuration';
import { MeResponse } from '../core/api/models/me-response';
import { PlanSummaryResponse } from '../core/api/models/plan-summary-response';
import { EditorPage } from './editor/editor.page';
import { MeStore } from './me.store';
import { PlansPage } from './plans.page';

const KAFE: PlanSummaryResponse = { slug: 'kafe', name: 'Kafé del Puerto', status: 'PUBLISHED' };
const TAPAS: PlanSummaryResponse = { slug: 'tapas', name: 'Tapas <b>Sol</b>', status: 'DRAFT' };
const CUSTOM: PlanSummaryResponse = { slug: 'otro', name: 'Otro', status: 'DRAFT' };

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

/** Cuerpo de error de un DELETE: el cliente generado lo pide como texto (`responseType: 'text'`), no como JSON. */
function problem(body: object): string {
  return JSON.stringify(body);
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
          { path: 'panel', component: PlansPage },
          { path: 'panel/:slug/plano', component: EditorPage },
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

  function expectApi(method: string, path: string): TestRequest {
    const request = http.expectOne(
      (candidate) => candidate.method === method && candidate.url.endsWith(`/api/v1/admin/${path}`),
    );
    // El contrato declara `*/*` y el generador pediría `blob`: el cuerpo (y el `code` de los errores) debe llegar como JSON.
    expect(request.request.responseType).toBe(method === 'DELETE' ? 'text' : 'json');
    return request;
  }

  async function open(me: MeResponse = meWith([KAFE, TAPAS])): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('GET', 'me').flush(me);
    await settle();
  }

  function planItems(): HTMLElement[] {
    return Array.from(page.querySelectorAll<HTMLElement>('li.plan'));
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

  it('listsPlans', async () => {
    await open();

    const items = planItems();
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Kafé del Puerto');
    expect(items[0].textContent).toContain('Publicado');
    expect(items[1].textContent).toContain('Borrador');
    // El nombre se pinta como texto, nunca como HTML.
    expect(items[1].textContent).toContain('Tapas <b>Sol</b>');
    expect(items[1].querySelector('b')).toBeNull();

    const links = Array.from(items[0].querySelectorAll('a')).map((link) => [
      link.textContent?.trim(),
      link.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Reservas', '/panel/kafe'],
      ['Plano', '/panel/kafe/plano'],
      ['Turnos', '/panel/kafe/turnos'],
      ['Ajustes', '/panel/kafe/ajustes'],
    ]);
  });

  it('showsLoadingThenFailureWithRetry', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel');
    page = harness.routeNativeElement as HTMLElement;
    expect(page.textContent).toContain('Cargando');

    expectApi('GET', 'me').flush({}, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(alertText()).toContain('No se pudieron cargar tus planos');

    await click('Reintentar');
    expectApi('GET', 'me').flush(meWith([KAFE]));
    await settle();
    expect(planItems()).toHaveLength(1);
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
    expect(TestBed.inject(Router).url).toBe('/panel');
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

    expect(alertText()).toContain('máximo de planos');
    expect(createForm()).toBeNull();
  });

  it('demoHidesCreateAndDeletePlan', async () => {
    await open(meWith([KAFE], { demo: true }));

    expect(planItems()).toHaveLength(1);
    expect(createForm()).toBeNull();
    expect(button('Borrar')).toBeUndefined();
    expect(page.textContent).toContain('demostración');
  });

  it('deletePlanAsksForConfirmationAndWarnsAboutAnonymization', async () => {
    await open();

    await click('Borrar');
    expect(page.textContent).toContain('se anonimizarán');
    expect(page.textContent).toContain('Kafé del Puerto');

    await click('Cancelar');
    expect(page.textContent).not.toContain('se anonimizarán');
  });

  it('deletePlanRemovesItAfterConfirming', async () => {
    await open();

    await click('Borrar');
    await click('Sí, borrar el plano');
    expectApi('DELETE', 'restaurants/kafe').flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expectApi('GET', 'me').flush(meWith([TAPAS]));
    await settle();

    expect(planItems()).toHaveLength(1);
    expect(page.textContent).not.toContain('Kafé del Puerto');
    expect(page.textContent).not.toContain('se anonimizarán');
  });

  it('deletePlanBlockedShowsCodes', async () => {
    await open();

    await click('Borrar');
    await click('Sí, borrar el plano');
    expectApi('DELETE', 'restaurants/kafe').flush(
      problem({
        code: 'PLAN_HAS_RESERVATIONS',
        reservations: ['KAFE23456789ABCD', 'KAFEZZZZ99998888'],
      }),
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(alertText()).toContain('reservas activas');
    expect(alertText()).toContain('KAFE23456789ABCD');
    expect(alertText()).toContain('KAFEZZZZ99998888');
    expect(planItems()).toHaveLength(2);
  });

  it('deletePlanAlreadyGoneReloadsTheList', async () => {
    await open();

    await click('Borrar');
    await click('Sí, borrar el plano');
    expectApi('DELETE', 'restaurants/kafe').flush(problem({ code: 'RESTAURANT_NOT_FOUND' }), {
      status: 404,
      statusText: 'Not Found',
    });
    await settle();
    expectApi('GET', 'me').flush(meWith([TAPAS]));
    await settle();

    expect(alertText()).toContain('ya no existe');
    expect(planItems()).toHaveLength(1);
  });

  it('deletePlanShowsRateLimitError', async () => {
    await open();

    await click('Borrar');
    await click('Sí, borrar el plano');
    expectApi('DELETE', 'restaurants/kafe').flush(problem({ code: 'RATE_LIMITED' }), {
      status: 429,
      statusText: 'Too Many',
    });
    await settle();

    expect(alertText()).toContain('Demasiados intentos');
  });
});
