import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FakeAuthSdk, provideFakeAuthSdk } from '../../core/auth/testing/fake-auth-sdk';
import { LoginPage } from './login.page';

@Component({ template: '' })
class PanelStub {}

describe('LoginPage', () => {
  let sdk: FakeAuthSdk;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(async () => {
    sdk = new FakeAuthSdk();
    TestBed.configureTestingModule({
      providers: [
        provideFakeAuthSdk(sdk),
        provideRouter([
          { path: 'entrar', component: LoginPage },
          { path: 'panel', component: PanelStub },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/entrar');
    page = harness.routeNativeElement as HTMLElement;
  });

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function fill(name: string, value: string): void {
    page.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value = value;
  }

  async function submit(): Promise<void> {
    page.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  }

  async function clickGoogle(): Promise<void> {
    page.querySelector<HTMLButtonElement>('button.google')!.click();
    await settle();
  }

  function alertText(): string | null {
    return page.querySelector('[role="alert"]')?.textContent?.trim() ?? null;
  }

  it('loginShowsFirebaseErrorInSpanish', async () => {
    sdk.failWith = {
      code: 'auth/invalid-credential',
      message: 'Firebase: Error (auth/invalid-credential).',
    };
    fill('email', 'dueno@example.com');
    fill('password', 'incorrecta');

    await submit();

    expect(alertText()).toBe('Email o contraseña incorrectos');
    expect(page.textContent).not.toContain('Firebase');
  });

  it('loginSendsTrimmedEmailAndGoesToThePanel', async () => {
    fill('email', '  dueno@example.com ');
    fill('password', 'secreto1');

    await submit();

    expect(sdk.callsTo('signInWithEmail')).toEqual([['dueno@example.com', 'secreto1']]);
    expect(TestBed.inject(Router).url).toBe('/panel');
    expect(alertText()).toBeNull();
  });

  it('loginAsksForEmailAndPasswordBeforeCallingFirebase', async () => {
    fill('email', '');
    fill('password', '');

    await submit();

    expect(alertText()).toBe('Escribe tu email y tu contraseña');
    expect(sdk.calls).toEqual([]);
  });

  it('googleSignInGoesToThePanel', async () => {
    await clickGoogle();

    expect(sdk.callsTo('signInWithGoogle')).toHaveLength(1);
    expect(TestBed.inject(Router).url).toBe('/panel');
  });

  it('googleSignInShowsClosedPopupInSpanish', async () => {
    sdk.failWith = {
      code: 'auth/popup-closed-by-user',
      message: 'Firebase: Error (auth/popup-closed-by-user).',
    };

    await clickGoogle();

    expect(alertText()).toBe('Cerraste la ventana de Google antes de terminar');
    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('linksToRegisterAndPasswordReset', () => {
    const links = Array.from(page.querySelectorAll('a')).map((link) => link.getAttribute('href'));

    expect(links).toContain('/registro');
    expect(links).toContain('/recuperar');
  });
});
