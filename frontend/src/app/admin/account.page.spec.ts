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
import { MeStore } from './me.store';

@Component({ template: '<p>entrar</p>' })
class LoginStub {}

const ME: MeResponse = {
  email: 'dueno@example.com',
  demo: false,
  telegramAvailable: false,
  telegramLinked: false,
  maxPlans: 3,
  plans: [{ slug: 'kafe', name: 'Kafé', status: 'PUBLISHED' }],
};

/** Cuerpo de error de un DELETE: el cliente generado lo pide como texto (`responseType: 'text'`), no como JSON. */
function problem(body: object): string {
  return JSON.stringify(body);
}

describe('AccountPage', () => {
  let http: HttpTestingController;
  let sdk: FakeAuthSdk;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(() => {
    sdk = new FakeAuthSdk();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFakeAuthSdk(sdk),
        MeStore,
        provideRouter([
          { path: 'panel/cuenta', component: AccountPage },
          { path: 'entrar', component: LoginStub },
        ]),
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
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

  function expectApi(method: string, path: string): TestRequest {
    const request = http.expectOne(
      (candidate) => candidate.method === method && candidate.url.endsWith(`/api/v1/admin/${path}`),
    );
    expect(request.request.responseType).toBe(method === 'DELETE' ? 'text' : 'json');
    return request;
  }

  async function open(me: MeResponse = ME): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/cuenta');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('GET', 'me').flush(me);
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

  function alertText(): string | null {
    return page.querySelector('[role="alert"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  }

  it('showsTheEmail', async () => {
    await open();

    expect(page.textContent).toContain('dueno@example.com');
  });

  it('demoHidesDeleteAccount', async () => {
    await open({ ...ME, demo: true });

    expect(button('Borrar mi cuenta')).toBeUndefined();
    expect(page.textContent).toContain('demostración');
  });

  it('deleteAccountAsksForConfirmationFirst', async () => {
    await open();

    await click('Borrar mi cuenta');
    expect(page.textContent).toContain('se anonimizarán');
    // `http.verify()` en afterEach garantiza que aún no salió ninguna petición.

    await click('Cancelar');
    expect(page.textContent).not.toContain('se anonimizarán');
    expect(button('Borrar mi cuenta')).toBeDefined();
  });

  it('deleteAccountSignsOutAndGoesToLogin', async () => {
    await open();

    await click('Borrar mi cuenta');
    await click('Sí, borrar mi cuenta');
    expectApi('DELETE', 'account').flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    await flushPromises();

    expect(sdk.callsTo('signOut')).toHaveLength(1);
    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('deleteAccountStillLeavesWhenSignOutFails', async () => {
    await open();
    sdk.failWith = new Error('red');

    await click('Borrar mi cuenta');
    await click('Sí, borrar mi cuenta');
    expectApi('DELETE', 'account').flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    await flushPromises();

    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('deleteAccountBlockedShowsCodes', async () => {
    await open();

    await click('Borrar mi cuenta');
    await click('Sí, borrar mi cuenta');
    expectApi('DELETE', 'account').flush(
      problem({
        code: 'PLAN_HAS_RESERVATIONS',
        reservations: ['KAFE23456789ABCD', 'TAPAS99998888XYZ'],
      }),
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    const text = alertText() ?? '';
    expect(text).toContain('reservas activas');
    expect(text).toContain('KAFE23456789ABCD');
    expect(text).toContain('TAPAS99998888XYZ');
    expect(sdk.callsTo('signOut')).toHaveLength(0);
    expect(TestBed.inject(Router).url).toBe('/panel/cuenta');
    // La confirmación se cierra para poder reintentar cuando las reservas ya no estén.
    expect(button('Borrar mi cuenta')).toBeDefined();
  });

  it.each([
    [403, 'DEMO_READ_ONLY', 'solo lectura'],
    [429, 'RATE_LIMITED', 'Demasiados intentos'],
    [500, 'INTERNAL_ERROR', 'No se pudo borrar la cuenta'],
  ])('deleteAccountShowsSpanishError %i %s', async (status, code, message) => {
    await open();

    await click('Borrar mi cuenta');
    await click('Sí, borrar mi cuenta');
    expectApi('DELETE', 'account').flush(problem({ code }), { status, statusText: 'Error' });
    await settle();

    expect(alertText()).toContain(message);
    expect(sdk.callsTo('signOut')).toHaveLength(0);
  });
});
