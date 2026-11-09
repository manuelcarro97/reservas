import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DEMO_ACCOUNT, DemoAccount } from '../../core/config';
import { PanelExit } from '../panel-exit.service';
import { AuthForm } from './auth-form';

/** `/entrar`: acceso del dueño con email y contraseña o con Google. */
@Component({
  selector: 'app-login-page',
  imports: [RouterLink],
  templateUrl: './login.page.html',
  styleUrl: './auth-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage extends AuthForm {
  /** Salir del panel llegó hasta aquí pero no pudo cerrar la sesión: se avisa una vez, mientras esta página esté. */
  protected readonly signOutFailed = inject(PanelExit).signOutFailed;

  /** Cuenta de la demo pública (`environment.demoAccount`); sin ella no hay recuadro de demo. */
  protected readonly demo = inject(DEMO_ACCOUNT);

  constructor() {
    super();
    const signOutFailed = this.signOutFailed;
    inject(DestroyRef).onDestroy(() => signOutFailed.set(false));
  }

  /** Copia la cuenta demo en los campos. No envía el formulario: entrar sigue siendo el botón Entrar. */
  protected fillDemo(
    email: HTMLInputElement,
    password: HTMLInputElement,
    account: DemoAccount,
  ): void {
    email.value = account.email;
    password.value = account.password;
  }

  protected async onSubmit(event: Event, email: string, password: string): Promise<void> {
    event.preventDefault();
    if (!email.trim() || !password) {
      this.error.set('Escribe tu email y tu contraseña');
      return;
    }
    await this.enter(() => this.auth.signInWithEmail(email.trim(), password));
  }
}
