import { Component } from '@angular/core';
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
import { AuthService } from '../core/auth/auth.service';
import { FakeAuthSdk, flushPromises, provideFakeAuthSdk } from '../core/auth/testing/fake-auth-sdk';
import { AccountPage } from './account.page';
import { AdminShellComponent } from './admin-shell.component';
import { ConfirmsLeaving, leaveEditorGuard } from './editor/leave-editor.guard';
import { PanelExit } from './panel-exit.service';
import { PlansPage } from './plans.page';

@Component({ template: '<p>entrar</p>' })
class LoginStub {}

@Component({ template: '<p>reservas</p>' })
class ReservationsStub {}

/** El editor real pregunta si hay cambios sin guardar; aquí el dueño contesta `leaveAnswer`. */
@Component({ template: '<p>plano</p>' })
class EditorStub implements ConfirmsLeaving {
  static unsaved = false;
  static leaveAnswer: boolean | Promise<boolean> = true;
  static asked = 0;

  confirmLeave(): boolean | Promise<boolean> {
    if (!EditorStub.unsaved) {
      return true;
    }
    EditorStub.asked++;
    return EditorStub.leaveAnswer;
  }
}

const ME: MeResponse = {
  email: 'dueno@example.com',
  demo: false,
  telegramAvailable: false,
  telegramLinked: false,
  maxPlans: 3,
  plans: [
    { slug: 'kafe', name: 'Kafé', status: 'PUBLISHED' },
    { slug: 'tapas', name: 'Tapas', status: 'DRAFT' },
  ],
};

describe('AdminShellComponent', () => {
  let http: HttpTestingController;
  let sdk: FakeAuthSdk;
  let harness: RouterTestingHarness;
  let host: HTMLElement;

  beforeEach(async () => {
    sdk = new FakeAuthSdk();
    EditorStub.unsaved = false;
    EditorStub.leaveAnswer = true;
    EditorStub.asked = 0;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFakeAuthSdk(sdk),
        provideRouter([
          {
            path: 'panel',
            component: AdminShellComponent,
            children: [
              { path: '', component: PlansPage },
              { path: 'cuenta', component: AccountPage },
              { path: ':slug', component: ReservationsStub },
              { path: ':slug/plano', component: EditorStub, canDeactivate: [leaveEditorGuard] },
              { path: ':slug/turnos', component: ReservationsStub },
            ],
          },
          { path: 'entrar', component: LoginStub },
        ]),
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    host = harness.fixture.nativeElement as HTMLElement;
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

  function expectMe(): TestRequest {
    return http.expectOne((request) => request.url.endsWith('/api/v1/admin/me'));
  }

  /**
   * Mis planos pide el plano de cada tarjeta (`GET /admin/restaurants/{slug}`). Aquí solo se atienden (o se recogen,
   * si la página se cerró y la petición quedó cancelada) para que `http.verify()` no las vea pendientes.
   */
  function planGets(): TestRequest[] {
    return http.match(
      (request) =>
        request.method === 'GET' && /\/api\/v1\/admin\/restaurants\/[^/]+$/.test(request.url),
    );
  }

  function flushPlanGets(): void {
    for (const request of planGets()) {
      const slug = request.request.url.split('/').pop();
      request.flush({ slug, name: slug, status: 'DRAFT', tables: [], shifts: [] });
    }
  }

  async function open(url: string, me: MeResponse = ME): Promise<void> {
    await harness.navigateByUrl(url);
    expectMe().flush(me);
    await settle();
    flushPlanGets();
    await settle();
  }

  function switcher(): HTMLSelectElement | null {
    return host.querySelector<HTMLSelectElement>('select[name="plan"]');
  }

  function tab(name: string): HTMLAnchorElement | undefined {
    return Array.from(host.querySelectorAll<HTMLAnchorElement>('header nav.tabs a')).find((link) =>
      link.textContent?.includes(name),
    );
  }

  async function choose(slug: string): Promise<void> {
    const select = switcher()!;
    select.value = slug;
    select.dispatchEvent(new Event('change'));
    await settle();
  }

  it('loadsMeOnceForTheShellAndItsPage', async () => {
    await open('/panel');

    expect(host.querySelectorAll('[data-plan]')).toHaveLength(2);
    // `expectMe()` exige exactamente una petición: la cabecera y la página comparten el mismo almacén.
  });

  it('switcherListsThePlansAndMarksTheCurrentOne', async () => {
    await open('/panel/tapas/plano');

    const options = Array.from(switcher()!.options).map((option) => [
      option.value,
      option.text.trim(),
    ]);
    expect(options).toContainEqual(['kafe', 'Kafé']);
    expect(options).toContainEqual(['tapas', 'Tapas']);
    expect(switcher()!.value).toBe('tapas');
  });

  it('switcherKeepsTheCurrentSection', async () => {
    await open('/panel/tapas/plano');

    await choose('kafe');

    expect(TestBed.inject(Router).url).toBe('/panel/kafe/plano');
  });

  it('switcherKeepsTheReservationsSection', async () => {
    await open('/panel/tapas');

    await choose('kafe');

    expect(TestBed.inject(Router).url).toBe('/panel/kafe');
  });

  it('switcherFromThePlanListPromotesThePlan', async () => {
    await open('/panel');
    // En la lista no hay slug en la URL: el selector enseña el plano destacado, el primero.
    expect(switcher()!.value).toBe('kafe');

    await choose('tapas');

    expect(TestBed.inject(Router).url).toBe('/panel?plano=tapas');
    expect(switcher()!.value).toBe('tapas');
    // La página sigue viva y ya tenía el plano de "tapas": no lo vuelve a pedir.
    expect(planGets()).toHaveLength(0);
  });

  it('switcherFromTheAccountPagePromotesThePlanToo', async () => {
    await open('/panel/cuenta');
    expect(switcher()!.value).toBe('kafe');

    await choose('tapas');
    // Mis planos es una página nueva: pide los datos del dueño al abrirse, como al volver de cualquier sección.
    expectMe().flush(ME);
    await settle();
    flushPlanGets();
    await settle();

    expect(TestBed.inject(Router).url).toBe('/panel?plano=tapas');
    expect(switcher()!.value).toBe('tapas');
  });

  it('switcherIsHiddenWithoutPlans', async () => {
    await open('/panel', { ...ME, plans: [] });

    expect(switcher()).toBeNull();
  });

  it('theSelectNameContainsTheVisibleNameOfThePlan', async () => {
    await open('/panel/tapas/plano');

    // WCAG 2.5.3: el nombre accesible incluye el texto que se ve en la caja.
    const name = switcher()!.getAttribute('aria-label')!;
    expect(name).toContain('Cambiar de plano');
    expect(name).toContain('Tapas');
  });

  it('switcherShowsTheStateOfThePlan', async () => {
    await open('/panel/tapas/plano');

    expect(host.querySelector('.switcher .dot-state')?.textContent?.trim()).toBe('Borrador');
    await choose('kafe');
    expect(host.querySelector('.switcher .dot-state')?.textContent?.trim()).toBe('Publicado');
  });

  it('longPlanNameIsTruncated', async () => {
    const name = 'Restaurante con un nombre larguísimo '.repeat(4).slice(0, 120);
    await open('/panel/largo/plano', {
      ...ME,
      plans: [{ slug: 'largo', name, status: 'PUBLISHED' }],
    });

    const label = host.querySelector<HTMLElement>('.switcher .truncate');
    expect(label?.textContent?.trim()).toBe(name);
    expect(label?.getAttribute('title')).toBe(name);
    // El select cubre la caja y recibe el ratón: el nombre completo tiene que estar también en él.
    expect(switcher()!.getAttribute('title')).toBe(name);
  });

  it('tabsPointToTheCurrentPlan', async () => {
    await open('/panel');

    expect(tab('Planos')!.getAttribute('href')).toBe('/panel');
    expect(tab('Reservas')!.getAttribute('href')).toBe('/panel/kafe');
    expect(tab('Turnos')!.getAttribute('href')).toBe('/panel/kafe/turnos');
    expect(tab('Configuración')!.getAttribute('href')).toBe('/panel/kafe/ajustes');
  });

  it('tabsFollowThePlanPromotedByTheQuery', async () => {
    await open('/panel?plano=tapas');

    expect(tab('Reservas')!.getAttribute('href')).toBe('/panel/tapas');
    expect(tab('Configuración')!.getAttribute('href')).toBe('/panel/tapas/ajustes');
  });

  it('thePlansTabKeepsThePlanYouAreIn', async () => {
    await open('/panel/tapas/turnos');

    // Tapas no es el primero: Planos lo lleva en la query para que no se pierda al pasar por la lista.
    expect(tab('Planos')!.getAttribute('href')).toBe('/panel?plano=tapas');
    tab('Planos')!.click();
    await settle();
    expectMe().flush(ME);
    await settle();
    flushPlanGets();
    await settle();
    expect(TestBed.inject(Router).url).toBe('/panel?plano=tapas');
    // Estando en la lista, la pestaña sigue marcada y Reservas sigue apuntando a Tapas.
    expect(tab('Planos')!.getAttribute('aria-current')).toBe('page');
    expect(tab('Reservas')!.getAttribute('href')).toBe('/panel/tapas');

    tab('Reservas')!.click();
    await settle();
    expect(TestBed.inject(Router).url).toBe('/panel/tapas');
  });

  it('thePlansTabIsPlainWhenTheCurrentPlanIsTheFirstOne', async () => {
    await open('/panel/kafe/turnos');
    expect(tab('Planos')!.getAttribute('href')).toBe('/panel');

    await harness.navigateByUrl('/panel');
    expectMe().flush(ME);
    await settle();
    flushPlanGets();
    await settle();
    expect(tab('Planos')!.getAttribute('href')).toBe('/panel');
  });

  it('tabsDisabledWithoutPlans', async () => {
    await open('/panel', { ...ME, plans: [] });

    for (const name of ['Reservas', 'Turnos', 'Configuración']) {
      const link = tab(name)!;
      expect(link.getAttribute('aria-disabled')).toBe('true');
      expect(link.hasAttribute('href')).toBe(false);
    }
    expect(tab('Planos')!.getAttribute('href')).toBe('/panel');
  });

  it('currentTabIsMarked', async () => {
    await open('/panel');
    expect(tab('Planos')!.getAttribute('aria-current')).toBe('page');
    expect(tab('Reservas')!.hasAttribute('aria-current')).toBe(false);

    await harness.navigateByUrl('/panel/tapas');
    harness.detectChanges();
    expect(tab('Reservas')!.getAttribute('aria-current')).toBe('page');
    expect(tab('Planos')!.hasAttribute('aria-current')).toBe(false);

    // El editor no tiene pestaña propia: ninguna queda marcada.
    await harness.navigateByUrl('/panel/tapas/plano');
    harness.detectChanges();
    expect(host.querySelectorAll('header nav.tabs [aria-current]')).toHaveLength(0);
  });

  it('iconButtonsHaveNames', async () => {
    await open('/panel');

    // La campana es un indicador con icono: el icono lleva el nombre.
    expect(host.querySelector('header [role="img"][aria-label="Avisos"]')).not.toBeNull();
    const sound = Array.from(host.querySelectorAll<HTMLButtonElement>('header button')).find(
      (button) => button.textContent?.includes('Silenciar'),
    )!;
    expect(sound.getAttribute('aria-label')).toBe('Silenciar');
    // Los iconos de dentro de los botones con texto son decorativos.
    for (const svg of Array.from(host.querySelectorAll('header button svg'))) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('theFooterCreditsTheAuthorOnce', async () => {
    await open('/panel');

    const footers = host.querySelectorAll('footer');
    expect(footers).toHaveLength(1);
    expect(footers[0].textContent).toContain('© 2026 reservas. · Proyecto de portafolio');
    const link = footers[0].querySelector('a')!;
    expect(link.textContent).toContain('Desarrollado por Manuel Carro');
    expect(link.getAttribute('href')).toBe('https://www.linkedin.com/in/manuelcarro');
  });

  it('headerLinksToTheAccount', async () => {
    await open('/panel');

    const link = host.querySelector<HTMLAnchorElement>('header a[href="/panel/cuenta"]');
    expect(link?.textContent).toContain('Cuenta');
  });

  it('signOutGoesToLogin', async () => {
    await open('/panel');

    Array.from(host.querySelectorAll<HTMLButtonElement>('header button'))
      .find((button) => button.textContent?.includes('Salir'))!
      .click();
    await settle();
    await flushPromises();

    expect(sdk.callsTo('signOut')).toHaveLength(1);
    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('signOutFailureAfterLeavingStaysOnLoginAndFlagsItForThatPage', async () => {
    await open('/panel');
    sdk.failWith = new Error('red');

    Array.from(host.querySelectorAll<HTMLButtonElement>('header button'))
      .find((button) => button.textContent?.includes('Salir'))!
      .click();
    await settle();
    await flushPromises();

    // El panel ya se fue (es el orden que deja preguntar al editor); la página de acceso explica el fallo.
    expect(TestBed.inject(Router).url).toBe('/entrar');
    expect(sdk.callsTo('signOut')).toHaveLength(1);
    expect(TestBed.inject(PanelExit).signOutFailed()).toBe(true);
  });

  it('panelPollsTheFeedWhileSignedInAndStopsOnSignOut', async () => {
    await open('/panel');
    // El SDK ya está cargado y su listener registrado; a partir de aquí todo es síncrono con reloj falso.
    await flushPromises();
    vi.useFakeTimers();
    try {
      sdk.emit({ uid: 'uid-1', email: 'dueno@example.com' });
      TestBed.tick();
      // Consulta de referencia al abrir, y después una cada 30 s.
      http
        .expectOne((request) => request.url.endsWith('/api/v1/admin/feed'))
        .flush({ events: [], now: new Date().toISOString() });
      vi.advanceTimersByTime(30_000);
      http
        .expectOne((request) => request.url.endsWith('/api/v1/admin/feed'))
        .flush({ events: [], now: new Date().toISOString() });

      sdk.emit(null);
      TestBed.tick();
      vi.advanceTimersByTime(60_000);

      http.expectNone((request) => request.url.endsWith('/api/v1/admin/feed'));
    } finally {
      vi.useRealTimers();
    }
  });

  function feedRequests(): TestRequest[] {
    return http.match((request) => request.url.endsWith('/api/v1/admin/feed'));
  }

  /** El dueño `uid` está dentro cuando se abre el panel: el SDK ya cargado avisa de su sesión. */
  async function signIn(uid: string): Promise<TestRequest[]> {
    await flushPromises();
    sdk.emit({ uid, email: `${uid}@example.com` });
    await settle();
    return feedRequests();
  }

  it('sessionEndedInAnotherTabSendsThePanelToLogin', async () => {
    await open('/panel');
    expect(host.querySelectorAll('[data-plan]')).toHaveLength(2);
    await signIn('uid-a');

    sdk.emit(null);
    await settle();
    await flushPromises();

    expect(TestBed.inject(Router).url).toBe('/entrar');
    expect(host.querySelector('[data-plan]')).toBeNull();
  });

  it('aSessionLostRightAfterOpeningThePanelStillLeaves', async () => {
    // El guard solo deja entrar con sesión: al crearse el shell el dueño ya está.
    TestBed.inject(AuthService);
    await flushPromises();
    sdk.emit({ uid: 'uid-a', email: 'uid-a@example.com' });
    await harness.navigateByUrl('/panel');

    sdk.emit(null);
    expectMe().flush(ME);
    await settle();
    await flushPromises();

    expect(TestBed.inject(Router).url).toBe('/entrar');
    feedRequests();
    // Si la lista llegó a pintarse, sus peticiones del plano quedaron canceladas al salir.
    planGets();
  });

  it('anotherOwnerSignedInElsewhereSendsThePanelToLoginInsteadOfShowingTheirData', async () => {
    await open('/panel');
    await signIn('uid-a');

    sdk.emit({ uid: 'uid-b', email: 'otro@example.com' });
    await settle();
    await flushPromises();

    expect(TestBed.inject(Router).url).toBe('/entrar');
    // Ni los planos de A ni los avisos de B se pintan: el panel entero se retira y el feed de B no sigue.
    expect(host.textContent).not.toContain('Kafé');
    const feedOfB = feedRequests();
    expect(feedOfB).toHaveLength(1);
    expect(feedOfB[0].cancelled).toBe(true);
  });

  for (const [name, next] of [
    ['null', null],
    ['anotherUid', { uid: 'uid-b', email: 'otro@example.com' }],
  ] as const) {
    it(`aSessionChangeTo_${name}_LeavesTheEditorWithoutAskingAboutUnsavedChanges`, async () => {
      await open('/panel/tapas/plano');
      await signIn('uid-a');
      EditorStub.unsaved = true;
      // Aunque la respuesta fuera "me quedo", un cambio de sesión no pregunta.
      EditorStub.leaveAnswer = false;

      sdk.emit(next);
      await settle();
      await flushPromises();

      expect(TestBed.inject(Router).url).toBe('/entrar');
      expect(EditorStub.asked).toBe(0);
      feedRequests();
    });
  }

  it('renewingTheTokenOfTheSameOwnerKeepsThePanelOpen', async () => {
    await open('/panel');
    await signIn('uid-a');

    sdk.emit({ uid: 'uid-a', email: 'nuevo@example.com' });
    await settle();
    await flushPromises();

    expect(TestBed.inject(Router).url).toBe('/panel');
    expect(host.querySelectorAll('[data-plan]')).toHaveLength(2);
    expect(feedRequests()).toHaveLength(0);
  });

  const signOutButton = () =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('header button')).find((button) =>
      button.textContent?.includes('Salir'),
    )!;

  /** Como el SDK real: `signOut` avisa de que ya no hay sesión. Anota dónde estaba el panel al cerrarla. */
  function emitNullOnSignOut(): { urlAtSignOut: string | null } {
    const seen = { urlAtSignOut: null as string | null };
    sdk.signOut = () => {
      sdk.calls.push({ method: 'signOut', args: [] });
      seen.urlAtSignOut = TestBed.inject(Router).url;
      sdk.emit(null);
      return Promise.resolve();
    };
    return seen;
  }

  it('signOutNavigatesToLoginOnceAndOnlyThenClosesTheSession', async () => {
    await open('/panel');
    await signIn('uid-a');
    const seen = emitNullOnSignOut();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    signOutButton().click();
    await settle();
    await flushPromises();

    expect(navigate.mock.calls.filter(([url]) => url === '/entrar')).toHaveLength(1);
    expect(seen.urlAtSignOut).toBe('/entrar');
    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('signOutByHandAsksAboutUnsavedChangesAndKeepsTheSessionIfTheOwnerStays', async () => {
    await open('/panel/tapas/plano');
    await signIn('uid-a');
    emitNullOnSignOut();
    EditorStub.unsaved = true;
    EditorStub.leaveAnswer = false;

    signOutButton().click();
    await settle();
    await flushPromises();

    // Se queda en el editor y con sesión: guardar seguiría funcionando.
    expect(EditorStub.asked).toBe(1);
    expect(sdk.callsTo('signOut')).toHaveLength(0);
    expect(TestBed.inject(AuthService).user()?.uid).toBe('uid-a');
    expect(TestBed.inject(Router).url).toBe('/panel/tapas/plano');
  });

  it('signOutByHandCanBeRetriedAfterStayingAndThenLeavesBeforeClosingTheSession', async () => {
    await open('/panel/tapas/plano');
    await signIn('uid-a');
    const seen = emitNullOnSignOut();
    EditorStub.unsaved = true;
    EditorStub.leaveAnswer = false;
    signOutButton().click();
    await settle();
    await flushPromises();

    // Salir otra vez no reutiliza la navegación que ya terminó en `false`: pregunta de nuevo y ahora sale.
    EditorStub.leaveAnswer = true;
    signOutButton().click();
    await settle();
    await flushPromises();

    expect(EditorStub.asked).toBe(2);
    expect(sdk.callsTo('signOut')).toHaveLength(1);
    expect(seen.urlAtSignOut).toBe('/entrar');
    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('aSessionChangeWhileTheEditorIsAskingTakesOverTheQuestion', async () => {
    await open('/panel/tapas/plano');
    await signIn('uid-a');
    emitNullOnSignOut();
    EditorStub.unsaved = true;
    let answer: (leave: boolean) => void = () => undefined;
    EditorStub.leaveAnswer = new Promise<boolean>((resolve) => (answer = resolve));

    // El dueño pulsa Salir y el editor pregunta; mientras tanto entra otro dueño en otra pestaña.
    // Sin `settle()`: la pregunta abierta es una navegación pendiente y `whenStable` esperaría a que se conteste.
    signOutButton().click();
    await flushPromises();
    expect(EditorStub.asked).toBe(1);
    sdk.emit({ uid: 'uid-b', email: 'otro@example.com' });
    harness.detectChanges();
    await flushPromises();

    expect(TestBed.inject(Router).url).toBe('/entrar');
    // La salida en curso quedó sustituida: no cierra la sesión del dueño nuevo.
    expect(sdk.callsTo('signOut')).toHaveLength(0);
    answer(true);
    await flushPromises();
    expect(sdk.callsTo('signOut')).toHaveLength(0);
    feedRequests();
  });

  it('deletingTheAccountNavigatesToLoginOnlyOnce', async () => {
    await open('/panel/cuenta');
    await signIn('uid-a');
    sdk.signOut = () => {
      sdk.emit(null);
      return Promise.resolve();
    };
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const press = async (label: string) => {
      Array.from(host.querySelectorAll<HTMLButtonElement>('main button'))
        .find((button) => button.textContent?.includes(label))!
        .click();
      await settle();
    };

    await press('Borrar mi cuenta');
    await press('Sí, borrar mi cuenta');
    http
      .expectOne((request) => request.method === 'DELETE' && request.url.endsWith('/admin/account'))
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    await flushPromises();

    expect(navigate.mock.calls.filter(([url]) => url === '/entrar')).toHaveLength(1);
    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('eachVisitToThePanelLoadsItsOwnData', async () => {
    await open('/panel');
    await harness.navigateByUrl('/entrar');

    // Otro dueño entra después: no debe ver los planos del anterior mientras llega su respuesta.
    await harness.navigateByUrl('/panel');
    harness.detectChanges();
    expect(host.querySelectorAll('[data-plan]')).toHaveLength(0);
    expectMe().flush({ ...ME, email: 'otro@example.com', plans: [] });
    await settle();
    expect(host.querySelectorAll('[data-plan]')).toHaveLength(0);
  });
});
