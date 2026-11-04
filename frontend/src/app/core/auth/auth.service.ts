import { Injectable, inject, signal } from '@angular/core';
import { AuthSdk, AuthUser, LOAD_AUTH_SDK } from './auth-sdk';

/**
 * Sesión del dueño. Envuelve el SDK de Firebase Auth (cargado bajo demanda, ver `LOAD_AUTH_SDK`): ninguna otra
 * clase importa `firebase/*`. Solo se instancia al inyectarla, así que las páginas públicas no descargan Firebase.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly loadSdk = inject(LOAD_AUTH_SDK);
  private readonly sdk = new Promise<AuthSdk>((resolve) => resolve(this.loadSdk()));
  private readonly userState = signal<AuthUser | null>(null);
  private readonly readyState = signal(false);

  readonly user = this.userState.asReadonly();
  /** `true` cuando el SDK ya ha dicho si hay sesión guardada. Hasta entonces `user` vale `null` sin ser definitivo. */
  readonly ready = this.readyState.asReadonly();

  private readonly sessionKnown: Promise<void> = this.sdk.then(
    (sdk) =>
      new Promise<void>((resolve) =>
        sdk.onUserChanged((user) => {
          this.userState.set(user);
          this.readyState.set(true);
          resolve();
        }),
      ),
    // Sin SDK (chunk no descargado) no habrá sesión: no se bloquea a quien espera, que acabará en /entrar.
    () => this.readyState.set(true),
  );

  /** Resuelve cuando se conoce la sesión inicial (la guardada por el SDK, si la hay). */
  whenReady(): Promise<void> {
    return this.sessionKnown;
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    return (await this.sdk).signInWithEmail(email, password);
  }

  async register(email: string, password: string): Promise<void> {
    return (await this.sdk).register(email, password);
  }

  /** Entrada con Google en una ventana emergente. */
  async signInWithGoogle(): Promise<void> {
    return (await this.sdk).signInWithGoogle();
  }

  async sendPasswordReset(email: string): Promise<void> {
    return (await this.sdk).sendPasswordReset(email);
  }

  async signOut(): Promise<void> {
    return (await this.sdk).signOut();
  }

  /**
   * Token de ID para la API, o `null` sin sesión. Espera a que el SDK restaure la sesión guardada: sin esa espera,
   * una petición lanzada al cargar la página saldría sin token aunque haya sesión.
   */
  async idToken(): Promise<string | null> {
    await this.whenReady();
    return (await this.sdk).idToken();
  }
}
