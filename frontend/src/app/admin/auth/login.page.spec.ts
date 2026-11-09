import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FakeAuthSdk, provideFakeAuthSdk } from '../../core/auth/testing/fake-auth-sdk';
import { DEMO_ACCOUNT, DemoAccount } from '../../core/config';
import { PanelExit } from '../panel-exit.service';
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

  it('explainsThatSigningOutFailedWhenTheOwnerLeftThePanelButKeptTheSession', async () => {
    expect(alertText()).toBeNull();

    TestBed.inject(PanelExit).signOutFailed.set(true);
    await settle();

    expect(alertText()).toContain('No se pudo cerrar la sesión');
  });

  it('forgetsTheSignOutFailureWhenThePageIsLeft', async () => {
    TestBed.inject(PanelExit).signOutFailed.set(true);

    await harness.navigateByUrl('/panel');

    expect(TestBed.inject(PanelExit).signOutFailed()).toBe(false);
  });

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

describe('LoginPage demo box', () => {
  const DEMO = { email: 'demo@example.com', password: 'clave-de-prueba' };
  let sdk: FakeAuthSdk;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  async function open(demo: DemoAccount | null): Promise<void> {
    sdk = new FakeAuthSdk();
    TestBed.configureTestingModule({
      providers: [
        provideFakeAuthSdk(sdk),
        { provide: DEMO_ACCOUNT, useValue: demo },
        provideRouter([
          { path: 'entrar', component: LoginPage },
          { path: 'panel', component: PanelStub },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/entrar');
    page = harness.routeNativeElement as HTMLElement;
  }

  function fillButton(): HTMLButtonElement | undefined {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Rellenar',
    );
  }

  it('demoBoxFillsTheForm', async () => {
    await open(DEMO);

    expect(page.textContent).toContain('Cuenta demo');
    expect(page.textContent).toContain(
      'La primera carga puede tardar hasta 2 minutos: la demo usa un servidor gratuito que se apaga tras un rato sin uso.',
    );
    expect(page.textContent).toContain(DEMO.email);
    expect(page.textContent).toContain(DEMO.password);
    expect(fillButton()?.type).toBe('button');

    fillButton()!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(page.querySelector<HTMLInputElement>('input[name="email"]')!.value).toBe(DEMO.email);
    expect(page.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe(
      DEMO.password,
    );
    // Rellenar no envía nada: entrar sigue siendo cosa del botón Entrar.
    expect(sdk.callsTo('signInWithEmail')).toEqual([]);
    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('demoBoxHiddenWithoutConfig', async () => {
    await open(null);

    expect(fillButton()).toBeUndefined();
    expect(page.textContent).not.toContain('Cuenta demo');
    expect(page.textContent).not.toContain('Prueba la demo');
  });
});
