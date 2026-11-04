import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Mock } from 'vitest';
import { appConfig } from './app.config';
import { AuthSdk, LOAD_AUTH_SDK } from './core/auth/auth-sdk';
import { FakeAuthSdk, flushPromises } from './core/auth/testing/fake-auth-sdk';

describe('routes', () => {
  let loadSdk: Mock<() => Promise<AuthSdk>>;
  let backend: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    loadSdk = vi.fn<() => Promise<AuthSdk>>(() => Promise.resolve(new FakeAuthSdk()));
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

  it('loginPageLoadsTheFirebaseSdk', async () => {
    await visit('/entrar');

    expect(loadSdk).toHaveBeenCalledTimes(1);
  });
});
