import { inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { authErrorMessage } from '../../core/auth/auth-errors';
import { AuthService } from '../../core/auth/auth.service';

/** Adonde va el dueño al entrar. */
export const AFTER_SIGN_IN_URL = '/panel';

/** Estado y acciones comunes de las páginas de acceso: operación en curso, error en español y Google. */
export abstract class AuthForm {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async signInWithGoogle(): Promise<void> {
    await this.enter(() => this.auth.signInWithGoogle());
  }

  /** Ejecuta la operación de acceso; si sale bien, lleva al panel. Si falla, deja el error en español en `error`. */
  protected async enter(action: () => Promise<void>): Promise<void> {
    if (await this.run(action)) {
      await this.router.navigateByUrl(AFTER_SIGN_IN_URL);
    }
  }

  /** Ejecuta la operación con `busy` y `error` gestionados. Devuelve si salió bien. */
  protected async run(action: () => Promise<void>): Promise<boolean> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await action();
      return true;
    } catch (failure) {
      this.error.set(authErrorMessage(failure));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
