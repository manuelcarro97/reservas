import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  protected async onSubmit(event: Event, email: string, password: string): Promise<void> {
    event.preventDefault();
    if (!email.trim() || !password) {
      this.error.set('Escribe tu email y tu contraseña');
      return;
    }
    await this.enter(() => this.auth.signInWithEmail(email.trim(), password));
  }
}
