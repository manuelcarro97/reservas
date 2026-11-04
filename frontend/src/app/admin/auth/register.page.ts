import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthForm } from './auth-form';

/** Mínimo de Firebase Auth para contraseñas de email: con menos, el SDK rechaza el registro (`auth/weak-password`). */
const MIN_PASSWORD_LENGTH = 6;

/** `/registro`: alta del dueño con email y contraseña (o con Google, que crea la cuenta al primer acceso). */
@Component({
  selector: 'app-register-page',
  imports: [RouterLink],
  templateUrl: './register.page.html',
  styleUrl: './auth-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage extends AuthForm {
  protected async onSubmit(event: Event, email: string, password: string): Promise<void> {
    event.preventDefault();
    if (!email.trim()) {
      this.error.set('Escribe tu email');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      this.error.set(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return;
    }
    await this.enter(() => this.auth.register(email.trim(), password));
  }
}
