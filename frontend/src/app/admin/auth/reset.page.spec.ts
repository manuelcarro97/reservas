import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FakeAuthSdk, provideFakeAuthSdk } from '../../core/auth/testing/fake-auth-sdk';
import { ResetPage } from './reset.page';

const SENT =
  'Si existe una cuenta con ese email, te hemos enviado un enlace para restablecer la contraseña.';

describe('ResetPage', () => {
  let sdk: FakeAuthSdk;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(async () => {
    sdk = new FakeAuthSdk();
    TestBed.configureTestingModule({
      providers: [
        provideFakeAuthSdk(sdk),
        provideRouter([{ path: 'recuperar', component: ResetPage }]),
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/recuperar');
    page = harness.routeNativeElement as HTMLElement;
  });

  async function submit(email: string): Promise<void> {
    page.querySelector<HTMLInputElement>('input[name="email"]')!.value = email;
    page.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function status(): string | null {
    return page.querySelector('[role="status"]')?.textContent?.trim() ?? null;
  }

  function alertText(): string | null {
    return page.querySelector('[role="alert"]')?.textContent?.trim() ?? null;
  }

  it('resetShowsSentMessage', async () => {
    await submit(' dueno@example.com ');

    expect(sdk.callsTo('sendPasswordReset')).toEqual([['dueno@example.com']]);
    expect(status()).toBe(SENT);
    expect(alertText()).toBeNull();
  });

  it('resetShowsTheSameMessageWhenTheAccountDoesNotExist', async () => {
    sdk.failWith = {
      code: 'auth/user-not-found',
      message: 'Firebase: Error (auth/user-not-found).',
    };

    await submit('nadie@example.com');

    expect(status()).toBe(SENT);
    expect(alertText()).toBeNull();
  });

  it('resetShowsOtherErrorsInSpanishWithoutTheSentMessage', async () => {
    sdk.failWith = {
      code: 'auth/network-request-failed',
      message: 'Firebase: Error (auth/network-request-failed).',
    };

    await submit('dueno@example.com');

    expect(alertText()).toBe('No se pudo conectar. Revisa tu conexión y vuelve a probar');
    expect(status()).toBeNull();
  });

  it('resetAsksForTheEmail', async () => {
    await submit('  ');

    expect(alertText()).toBe('Escribe tu email');
    expect(sdk.calls).toEqual([]);
  });
});
