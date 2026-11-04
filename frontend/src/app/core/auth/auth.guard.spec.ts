import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authGuard } from './auth.guard';
import { FakeAuthSdk, flushPromises, provideFakeAuthSdk } from './testing/fake-auth-sdk';

@Component({ template: '<p>privado</p>' })
class PrivatePage {}

@Component({ template: '<p>entrar</p>' })
class LoginStub {}

describe('authGuard', () => {
  let sdk: FakeAuthSdk;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    sdk = new FakeAuthSdk();
    TestBed.configureTestingModule({
      providers: [
        provideFakeAuthSdk(sdk),
        provideRouter([
          { path: 'privado', component: PrivatePage, canActivate: [authGuard] },
          { path: 'entrar', component: LoginStub },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  /** Navega y, mientras el guard espera la sesión, hace que el SDK la comunique. */
  async function navigateWithSession(user: { uid: string; email: string } | null): Promise<void> {
    const navigation = harness.navigateByUrl('/privado');
    await flushPromises();
    sdk.emit(user);
    await navigation;
  }

  it('guardRedirectsWhenSignedOut', async () => {
    await navigateWithSession(null);

    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('guardLetsTheUserInWhenSignedIn', async () => {
    await navigateWithSession({ uid: 'uid-1', email: 'dueno@example.com' });

    expect(TestBed.inject(Router).url).toBe('/privado');
  });

  it('guardWaitsForTheSessionToBeRestored', async () => {
    let finished = false;
    const navigation = harness.navigateByUrl('/privado').then(() => (finished = true));
    await flushPromises();

    expect(finished).toBe(false);

    sdk.emit({ uid: 'uid-1', email: 'dueno@example.com' });
    await navigation;

    expect(finished).toBe(true);
  });
});
