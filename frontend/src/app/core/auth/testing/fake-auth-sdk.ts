import { Provider } from '@angular/core';
import { AuthSdk, AuthUser, LOAD_AUTH_SDK } from '../auth-sdk';

/** Doble del SDK para los tests: anota las llamadas y falla con `failWith` si se le pide. */
export class FakeAuthSdk implements AuthSdk {
  readonly calls: { method: string; args: unknown[] }[] = [];
  /** Error con el que fallan las acciones (entrar, registrar, recuperar, salir). */
  failWith: unknown = null;
  token: string | null = 'token-1';
  private current: AuthUser | null = null;
  private listener: ((user: AuthUser | null) => void) | null = null;

  /** Simula el aviso del SDK (primer estado de la sesión o un cambio posterior). */
  emit(user: AuthUser | null): void {
    this.current = user;
    this.listener?.(user);
  }

  onUserChanged(listener: (user: AuthUser | null) => void): void {
    this.listener = listener;
  }

  signInWithEmail(email: string, password: string): Promise<void> {
    return this.act('signInWithEmail', email, password);
  }

  register(email: string, password: string): Promise<void> {
    return this.act('register', email, password);
  }

  signInWithGoogle(): Promise<void> {
    return this.act('signInWithGoogle');
  }

  sendPasswordReset(email: string): Promise<void> {
    return this.act('sendPasswordReset', email);
  }

  signOut(): Promise<void> {
    return this.act('signOut');
  }

  /** Como el SDK real: sin sesión restaurada (`currentUser` nulo) no hay token. */
  idToken(): Promise<string | null> {
    return Promise.resolve(this.current ? this.token : null);
  }

  callsTo(method: string): unknown[][] {
    return this.calls.filter((call) => call.method === method).map((call) => call.args);
  }

  private act(method: string, ...args: unknown[]): Promise<void> {
    this.calls.push({ method, args });
    return this.failWith ? Promise.reject(this.failWith) : Promise.resolve();
  }
}

export function provideFakeAuthSdk(sdk: AuthSdk): Provider {
  return { provide: LOAD_AUTH_SDK, useValue: () => Promise.resolve(sdk) };
}

/** Deja correr las promesas pendientes (carga del SDK, primer aviso de sesión). */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}
