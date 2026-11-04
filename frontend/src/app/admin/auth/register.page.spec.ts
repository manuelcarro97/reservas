import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FakeAuthSdk, provideFakeAuthSdk } from '../../core/auth/testing/fake-auth-sdk';
import { RegisterPage } from './register.page';

@Component({ template: '' })
class PanelStub {}

describe('RegisterPage', () => {
  let sdk: FakeAuthSdk;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(async () => {
    sdk = new FakeAuthSdk();
    TestBed.configureTestingModule({
      providers: [
        provideFakeAuthSdk(sdk),
        provideRouter([
          { path: 'registro', component: RegisterPage },
          { path: 'panel', component: PanelStub },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/registro');
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

  function alertText(): string | null {
    return page.querySelector('[role="alert"]')?.textContent?.trim() ?? null;
  }

  it('registerValidatesPasswordLength', async () => {
    fill('email', 'nuevo@example.com');
    fill('password', '12345');

    await submit();

    expect(alertText()).toBe('La contraseña debe tener al menos 6 caracteres');
    expect(sdk.calls).toEqual([]);
  });

  it('registerAcceptsAPasswordOfExactlySixCharactersAndGoesToThePanel', async () => {
    fill('email', ' nuevo@example.com ');
    fill('password', '123456');

    await submit();

    expect(sdk.callsTo('register')).toEqual([['nuevo@example.com', '123456']]);
    expect(TestBed.inject(Router).url).toBe('/panel');
  });

  it('registerAsksForTheEmail', async () => {
    fill('email', '   ');
    fill('password', '123456');

    await submit();

    expect(alertText()).toBe('Escribe tu email');
    expect(sdk.calls).toEqual([]);
  });

  it('registerShowsEmailAlreadyInUseInSpanish', async () => {
    sdk.failWith = {
      code: 'auth/email-already-in-use',
      message: 'Firebase: Error (auth/email-already-in-use).',
    };
    fill('email', 'dueno@example.com');
    fill('password', 'secreto1');

    await submit();

    expect(alertText()).toBe('Ya existe una cuenta con ese email');
    expect(page.textContent).not.toContain('Firebase');
    expect(TestBed.inject(Router).url).toBe('/registro');
  });

  it('googleRegistrationGoesToThePanel', async () => {
    page.querySelector<HTMLButtonElement>('button.google')!.click();
    await settle();

    expect(sdk.callsTo('signInWithGoogle')).toHaveLength(1);
    expect(TestBed.inject(Router).url).toBe('/panel');
  });
});
