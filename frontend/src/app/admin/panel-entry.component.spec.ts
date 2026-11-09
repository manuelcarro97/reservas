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
import { MeStore } from './me.store';
import { PanelEntryComponent } from './panel-entry.component';

@Component({ template: '<p>destino</p>' })
class DestinationStub {}

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

describe('PanelEntryComponent', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;
  let host: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Lo provee el marco del panel; aquí se prueba la entrada sin él.
        MeStore,
        provideRouter([
          { path: 'panel', component: PanelEntryComponent },
          { path: 'panel/planos', component: DestinationStub },
          { path: 'panel/:slug/inicio', component: DestinationStub },
        ]),
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
    host = harness.fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
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

  it('redirectsToHomeOfCurrentPlan', async () => {
    const navigate = vi.spyOn(router, 'navigate');

    await harness.navigateByUrl('/panel');
    expectMe().flush(ME);
    await settle();

    expect(router.url).toBe('/panel/kafe/inicio');
    // Sustituye la entrada del historial: con "atrás" no se vuelve a una redirección.
    expect(navigate).toHaveBeenCalledWith(['/panel', 'kafe', 'inicio'], { replaceUrl: true });
  });

  it('honoursPlanoQuery', async () => {
    await harness.navigateByUrl('/panel?plano=tapas');
    expectMe().flush(ME);
    await settle();

    expect(router.url).toBe('/panel/tapas/inicio');
  });

  it('waitsForThePlansBeforeRedirecting', async () => {
    await harness.navigateByUrl('/panel');
    await settle();

    expect(router.url).toBe('/panel');
    expect(host.textContent).toContain('Cargando…');
    expectMe().flush(ME);
    await settle();
    expect(router.url).toBe('/panel/kafe/inicio');
  });

  it('showsWelcomeWithoutPlans', async () => {
    await harness.navigateByUrl('/panel');
    expectMe().flush({ ...ME, plans: [] });
    await settle();

    expect(router.url).toBe('/panel');
    expect(host.textContent).toContain('Bienvenido a reservas');
    expect(host.textContent).toContain('Aún no tienes ningún plano');
    const create = Array.from(host.querySelectorAll<HTMLAnchorElement>('a')).find((link) =>
      link.textContent?.includes('Crear mi primer plano'),
    );
    expect(create?.getAttribute('href')).toBe('/panel/planos');
  });

  it('showsTheErrorWithRetry', async () => {
    await harness.navigateByUrl('/panel');
    expectMe().flush(null, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(host.textContent).toContain('No se pudieron cargar tus planos');
    Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Reintentar'))!
      .click();
    await settle();
    expectMe().flush(ME);
    await settle();

    expect(router.url).toBe('/panel/kafe/inicio');
  });

  it('redirectsWithFreshPlansAfterDelete', async () => {
    // El almacén ya está listo con los dos planos (el marco lo cargó antes de abrir Configuración).
    const store = TestBed.inject(MeStore);
    store.refresh();
    expectMe().flush(ME);
    expect(store.status()).toBe('ready');

    await harness.navigateByUrl('/panel');
    await settle();

    // No decide con la lista vieja: espera una respuesta nueva, ya sin el plano borrado.
    expect(router.url).toBe('/panel');
    expectMe().flush({ ...ME, plans: [{ slug: 'tapas', name: 'Tapas', status: 'DRAFT' }] });
    await settle();

    expect(router.url).toBe('/panel/tapas/inicio');
  });
});
