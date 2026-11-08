import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { MeStore } from './me.store';
import { FeedService } from './notifications/feed.service';
import { ToastComponent } from './notifications/toast.component';
import { PlanSwitcherComponent } from './plan-switcher.component';

/**
 * Marco del panel del dueño (`/panel/**`): cabecera con selector de plano, avisos, Cuenta y Salir. Es aparte del
 * marco público (`ShellComponent`), que no puede inyectar `AuthService` para no descargar Firebase en las páginas
 * públicas. Provee el `MeStore` que comparten la cabecera y las páginas del panel, y el `FeedService`, que consulta
 * los avisos mientras el panel está abierto.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [PlanSwitcherComponent, RouterLink, RouterOutlet, ToastComponent],
  providers: [MeStore, FeedService],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Se inyecta aquí para que empiece a consultar al abrir el panel, aunque la cabecera no lo use. */
  protected readonly feed = inject(FeedService);
  protected readonly signOutError = signal<string | null>(null);

  constructor() {
    inject(MeStore).refresh();
  }

  protected async signOut(): Promise<void> {
    this.signOutError.set(null);
    try {
      await this.auth.signOut();
    } catch {
      this.signOutError.set('No se pudo salir. Inténtalo de nuevo.');
      return;
    }
    await this.router.navigateByUrl('/entrar');
  }
}
