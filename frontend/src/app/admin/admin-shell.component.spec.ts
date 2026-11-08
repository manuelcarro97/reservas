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
import { FakeAuthSdk, flushPromises, provideFakeAuthSdk } from '../core/auth/testing/fake-auth-sdk';
import { AccountPage } from './account.page';
import { AdminShellComponent } from './admin-shell.component';
import { PlansPage } from './plans.page';

@Component({ template: '<p>entrar</p>' })
class LoginStub {}

@Component({ template: '<p>reservas</p>' })
class ReservationsStub {}

@Component({ template: '<p>plano</p>' })
class EditorStub {}

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
              { path: ':slug/plano', component: EditorStub },
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
    http.verify();
  });

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function expectMe(): TestRequest {
    return http.expectOne((request) => request.url.endsWith('/api/v1/admin/me'));
  }

  async function open(url: string): Promise<void> {
    await harness.navigateByUrl(url);
    expectMe().flush(ME);
    await settle();
  }

  function switcher(): HTMLSelectElement | null {
    return host.querySelector<HTMLSelectElement>('select[name="plan"]');
  }

  async function choose(slug: string): Promise<void> {
    const select = switcher()!;
    select.value = slug;
    select.dispatchEvent(new Event('change'));
    await settle();
  }

  it('loadsMeOnceForTheShellAndItsPage', async () => {
    await open('/panel');

    expect(host.querySelectorAll('li.plan')).toHaveLength(2);
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

  it('switcherFromThePlanListOpensThePlanEditor', async () => {
    await open('/panel');
    expect(switcher()!.value).toBe('');

    await choose('kafe');

    expect(TestBed.inject(Router).url).toBe('/panel/kafe/plano');
  });

  it('switcherIsHiddenWithoutPlans', async () => {
    await harness.navigateByUrl('/panel');
    expectMe().flush({ ...ME, plans: [] });
    await settle();

    expect(switcher()).toBeNull();
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

  it('signOutFailureKeepsThePanelAndExplainsIt', async () => {
    await open('/panel');
    sdk.failWith = new Error('red');

    Array.from(host.querySelectorAll<HTMLButtonElement>('header button'))
      .find((button) => button.textContent?.includes('Salir'))!
      .click();
    await settle();
    await flushPromises();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/panel');
    expect(host.querySelector('header [role="alert"]')?.textContent).toContain('No se pudo salir');
  });

  it('panelPollsTheFeedWhileSignedInAndStopsOnSignOut', async () => {
    await open('/panel');
    // El SDK ya está cargado y su listener registrado; a partir de aquí todo es síncrono con reloj falso.
    await flushPromises();
    vi.useFakeTimers();
    try {
      sdk.emit({ uid: 'uid-1', email: 'dueno@example.com' });
      TestBed.tick();
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

  it('eachVisitToThePanelLoadsItsOwnData', async () => {
    await open('/panel');
    await harness.navigateByUrl('/entrar');

    // Otro dueño entra después: no debe ver los planos del anterior mientras llega su respuesta.
    await harness.navigateByUrl('/panel');
    harness.detectChanges();
    expect(host.querySelectorAll('li.plan')).toHaveLength(0);
    expectMe().flush({ ...ME, email: 'otro@example.com', plans: [] });
    await settle();
    expect(host.querySelectorAll('li.plan')).toHaveLength(0);
  });
});
