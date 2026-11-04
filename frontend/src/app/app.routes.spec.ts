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
    await visitWithSession('/panel', { uid: 'uid-1', email: 'dueno@example.com' });

    expect(TestBed.inject(Router).url).toBe('/panel');
    const me = backend.expectOne((request) => request.url.endsWith('/api/v1/admin/me'));
    expect(me.request.headers.get('Authorization')).toBe('Bearer token-1');
    me.flush({ email: 'dueno@example.com', demo: false, maxPlans: 3, plans: [] });
    await harness.fixture.whenStable();
    harness.detectChanges();

    const page = harness.fixture.nativeElement as HTMLElement;
    expect(page.querySelector('header')?.textContent).toContain('Salir');
    expect(page.querySelector('app-shell')).toBeNull();
  });

  it('loginPageLoadsTheFirebaseSdk', async () => {
    await visit('/entrar');

    expect(loadSdk).toHaveBeenCalledTimes(1);
  });
});
