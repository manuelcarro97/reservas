import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Mock } from 'vitest';
import { appConfig } from './app.config';
import { AuthSdk, LOAD_AUTH_SDK } from './core/auth/auth-sdk';
import { FakeAuthSdk, flushPromises } from './core/auth/testing/fake-auth-sdk';

describe('routes', () => {
  let sdk: FakeAuthSdk;
  let loadSdk: Mock<() => Promise<AuthSdk>>;
  let backend: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    sdk = new FakeAuthSdk();
    loadSdk = vi.fn<() => Promise<AuthSdk>>(() => Promise.resolve(sdk));
    TestBed.configureTestingModule({
      providers: [
        ...appConfig.providers,
        provideHttpClientTesting(),
        { provide: LOAD_AUTH_SDK, useValue: loadSdk },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  /** Navega y responde con 404 a todo lo que la página pida a la API. */
  async function visit(url: string): Promise<void> {
    await harness.navigateByUrl(url);
    backend
      .match(() => true)
      .forEach((request) => request.flush({}, { status: 404, statusText: 'Not Found' }));
    await harness.fixture.whenStable();
    await flushPromises();
  }

  it('publicPagesNeverLoadTheFirebaseSdk', async () => {
    await visit('/r/kafe');
    await visit('/reserva/KAFE23456789ABCD');

    expect(loadSdk).not.toHaveBeenCalled();
  });

  it('rootRedirectsToLogin', async () => {
    await visit('/');

    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('unknownUrlShowsNotFoundWithALinkToLoginAndNeverLoadsTheFirebaseSdk', async () => {
    await visit('/no/existe/esta/pagina');
    const host = harness.fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Página no encontrada');
    expect(host.querySelector('main a[href="/entrar"]')).not.toBeNull();
    // La URL no se reescribe: el visitante ve lo que escribió.
    expect(TestBed.inject(Router).url).toBe('/no/existe/esta/pagina');
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it('unknownUrlUnderThePanelAlsoShowsNotFoundInsteadOfFailingTheNavigation', async () => {
    await visit('/panel/kafe/no-existe');
    const host = harness.fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Página no encontrada');
    expect(loadSdk).not.toHaveBeenCalled();
  });

  /** Navega a una ruta con guard: mientras espera la sesión, el SDK la comunica. */
  async function visitWithSession(url: string, user: { uid: string; email: string } | null) {
    const navigation = harness.navigateByUrl(url);
    // El chunk perezoso de /panel se descarga antes de que el guard cree `AuthService` y pida el SDK.
    await vi.waitFor(() => expect(loadSdk).toHaveBeenCalled());
    await flushPromises();
    sdk.emit(user);
    await navigation;
    await flushPromises();
  }

  it('panelRedirectsToLoginWithoutSession', async () => {
    await visitWithSession('/panel', null);

    expect(TestBed.inject(Router).url).toBe('/entrar');
    backend.expectNone(() => true);
  });

  it('panelOpensForASignedInOwnerWithItsOwnHeader', async () => {
    await visitWithSession('/panel/planos', { uid: 'uid-1', email: 'dueno@example.com' });

    expect(TestBed.inject(Router).url).toBe('/panel/planos');
    const me = backend.expectOne((request) => request.url.endsWith('/api/v1/admin/me'));
    expect(me.request.headers.get('Authorization')).toBe('Bearer token-1');
    me.flush({ email: 'dueno@example.com', demo: false, maxPlans: 3, plans: [] });
    await harness.fixture.whenStable();
    harness.detectChanges();

    const page = harness.fixture.nativeElement as HTMLElement;
    expect(page.querySelector('header')?.textContent).toContain('Salir');
    expect(page.querySelector('app-shell')).toBeNull();
  });

  it('panelEntryRedirectsToTheHomeOfTheFirstPlan', async () => {
    await visitWithSession('/panel', { uid: 'uid-1', email: 'dueno@example.com' });

    backend
      .expectOne((request) => request.url.endsWith('/api/v1/admin/me'))
      .flush({
        email: 'dueno@example.com',
        demo: false,
        maxPlans: 3,
        plans: [{ slug: 'kafe', name: 'Kafé', status: 'DRAFT' }],
      });
    await harness.fixture.whenStable();
    await flushPromises();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/panel/kafe/inicio');
    expect((harness.fixture.nativeElement as HTMLElement).textContent).toContain('Hoy');
  });

  it('everyPlanLinkOfThePanelResolvesToARoute', async () => {
    await visitWithSession('/panel/planos', { uid: 'uid-1', email: 'dueno@example.com' });
    backend
      .expectOne((request) => request.url.endsWith('/api/v1/admin/me'))
      .flush({
        email: 'dueno@example.com',
        demo: false,
        maxPlans: 3,
        plans: [{ slug: 'kafe', name: 'Kafé', status: 'DRAFT' }],
      });
    await harness.fixture.whenStable();
    harness.detectChanges();
    // Mis planos pide el plano del destacado para pintarlo (el interceptor espera al token, de ahí el await).
    await flushPromises();
    backend
      .expectOne((request) => request.url.endsWith('/api/v1/admin/restaurants/kafe'))
      .flush({ slug: 'kafe', name: 'Kafé', status: 'DRAFT', tables: [], shifts: [] });
    await harness.fixture.whenStable();
    harness.detectChanges();
    const host = harness.fixture.nativeElement as HTMLElement;
    // Configuración y "Código para tu web" llevan al mismo sitio: cada destino se recorre una vez.
    const hrefs = [
      ...new Set(
        Array.from(host.querySelectorAll('[data-plan].featured a')).map((link) =>
          link.getAttribute('href'),
        ),
      ),
    ];
    expect(hrefs).toEqual([
      '/panel/kafe/plano',
      '/panel/kafe',
      '/panel/kafe/turnos',
      '/panel/kafe/ajustes',
    ]);

    // Inicio no sale en la tarjeta del plano, sino en la pestaña de la cabecera. Va el primero: los ajustes vuelven a
    // pedir los datos del dueño y su respuesta de prueba no trae planos.
    for (const href of ['/panel/kafe/inicio', ...hrefs]) {
      // `navigateByUrl` rechaza (NG04002) si ninguna ruta casa.
      await harness.navigateByUrl(href!);
      harness.detectChanges();

      expect(TestBed.inject(Router).url).toBe(href);
      if (href === '/panel/kafe') {
        // Las reservas del día ya existen: piden el plano y, con él, la lista del día y los pendientes.
        await flushPromises();
        backend
          .expectOne((request) => request.url.endsWith('/api/v1/admin/restaurants/kafe'))
          .flush({ slug: 'kafe', name: 'Kafé', status: 'DRAFT', tables: [], shifts: [] });
        await harness.fixture.whenStable();
        harness.detectChanges();
        backend
          .match((request) => request.url.endsWith('/api/v1/admin/restaurants/kafe/reservations'))
          .forEach((request) => request.flush([]));
        await harness.fixture.whenStable();
        harness.detectChanges();
        expect(host.textContent).toContain('Kafé / Reservas');
      } else if (href === '/panel/kafe/plano') {
        // El editor ya existe: pide el plano al abrirse (el interceptor espera al token, de ahí el await).
        await flushPromises();
        backend
          .expectOne((request) => request.url.endsWith('/api/v1/admin/restaurants/kafe'))
          .flush({ slug: 'kafe', name: 'Kafé', status: 'DRAFT', tables: [] });
        await harness.fixture.whenStable();
        harness.detectChanges();
        expect(host.textContent).toContain('Kafé / Plano');
      } else if (href === '/panel/kafe/turnos') {
        // Los turnos piden el plano y, con su zona horaria, los días cerrados.
        await flushPromises();
        backend
          .expectOne((request) => request.url.endsWith('/api/v1/admin/restaurants/kafe'))
          .flush({
            slug: 'kafe',
            name: 'Kafé',
            status: 'DRAFT',
            timeZone: 'Europe/Madrid',
            shifts: [],
          });
        await harness.fixture.whenStable();
        harness.detectChanges();
        backend
          .expectOne((request) => request.url.endsWith('/api/v1/admin/restaurants/kafe/closures'))
          .flush([]);
        await harness.fixture.whenStable();
        harness.detectChanges();
        expect(host.textContent).toContain('Kafé / Turnos');
        expect(host.textContent).toContain('Días cerrados');
      } else if (href === '/panel/kafe/inicio') {
        // Inicio pide el plano y, con su zona horaria, las reservas de hoy, los pendientes y los cierres.
        await flushPromises();
        backend
          .expectOne((request) => request.url.endsWith('/api/v1/admin/restaurants/kafe'))
          .flush({
            slug: 'kafe',
            name: 'Kafé',
            status: 'DRAFT',
            timeZone: 'Europe/Madrid',
            tables: [],
            shifts: [],
          });
        await harness.fixture.whenStable();
        await flushPromises();
        backend
          .match((request) => request.url.includes('/api/v1/admin/restaurants/kafe/'))
          .forEach((request) => request.flush([]));
        await harness.fixture.whenStable();
        harness.detectChanges();
        expect(host.querySelector('app-home-page .eyebrow b')?.textContent).toBe('Kafé');
        expect(host.querySelector('app-home-page h1')?.textContent).toContain('Hoy');
      } else {
        // Los ajustes piden el plano y vuelven a pedir los datos del dueño (la cabecera ya los pidió una vez).
        await flushPromises();
        backend
          .expectOne((request) => request.url.endsWith('/api/v1/admin/restaurants/kafe'))
          .flush({ slug: 'kafe', name: 'Kafé', status: 'DRAFT', timeZone: 'Europe/Madrid' });
        backend
          .expectOne((request) => request.url.endsWith('/api/v1/admin/me'))
          .flush({ email: 'dueno@example.com', demo: false, maxPlans: 3, plans: [] });
        await harness.fixture.whenStable();
        harness.detectChanges();
        expect(host.textContent).toContain('Kafé / Configuración');
      }
    }
  });

  it('loginPageLoadsTheFirebaseSdk', async () => {
    await visit('/entrar');

    expect(loadSdk).toHaveBeenCalledTimes(1);
  });
});
