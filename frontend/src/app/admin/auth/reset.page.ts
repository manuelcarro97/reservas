import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { authErrorCode } from '../../core/auth/auth-errors';
import { AuthForm } from './auth-form';

/**
 * Mismo aviso exista o no la cuenta: la página no debe servir para averiguar qué emails están registrados.
 */
const SENT_MESSAGE =
  'Si existe una cuenta con ese email, te hemos enviado un enlace para restablecer la contraseña.';

/** `/recuperar`: envía el correo de Firebase para restablecer la contraseña. */
@Component({
  selector: 'app-reset-page',
  imports: [RouterLink],
  templateUrl: './reset.page.html',
  styleUrl: './auth-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPage extends AuthForm {
  protected readonly sentMessage = signal<string | null>(null);

  protected async onSubmit(event: Event, email: string): Promise<void> {
    event.preventDefault();
    this.sentMessage.set(null);
    if (!email.trim()) {
      this.error.set('Escribe tu email');
      return;
    }
    const sent = await this.run(() =>
      this.auth.sendPasswordReset(email.trim()).catch((failure: unknown) => {
        // Con la protección de enumeración desactivada, Firebase avisa de que la cuenta no existe: no se enseña.
        if (authErrorCode(failure) !== 'auth/user-not-found') {
          throw failure;
        }
      }),
    );
    if (sent) {
      this.sentMessage.set(SENT_MESSAGE);
    }
  }
}
