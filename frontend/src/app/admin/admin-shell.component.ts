import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
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
 *
 * El panel pertenece al dueño con el que se abrió. Si la sesión cambia en otra pestaña (se cierra, o entra otro
 * dueño), se sale a `/entrar`: seguir aquí dejaría pintados los planos del anterior y mezclaría los avisos del nuevo.
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

  /** Solo cuenta quién es, no su email ni su token: renovarlos no cambia el valor. */
  private readonly uid = computed(() => this.auth.user()?.uid ?? null);
  /** Dueño con el que se abrió el panel; hasta que el SDK avisa de su sesión no hay ninguno. */
  private ownerUid: string | null = null;
  /** Salida a `/entrar` en curso: Salir y el cambio de sesión que provoca no navegan dos veces. */
  private leaving: Promise<boolean> | null = null;

  constructor() {
    inject(MeStore).refresh();
    effect(() => {
      const uid = this.uid();
      if (this.ownerUid === null) {
        this.ownerUid = uid;
      } else if (uid !== this.ownerUid) {
        void this.leaveToLogin();
      }
    });
  }

  protected async signOut(): Promise<void> {
    this.signOutError.set(null);
    try {
      await this.auth.signOut();
    } catch {
      this.signOutError.set('No se pudo salir. Inténtalo de nuevo.');
      return;
    }
    await this.leaveToLogin();
  }

  private leaveToLogin(): Promise<boolean> {
    // Solo mientras dura: si la página se negó a que se saliera (editor con cambios sin guardar), el siguiente intento
    // tiene que navegar de nuevo.
    this.leaving ??= this.router.navigateByUrl('/entrar').finally(() => (this.leaving = null));
    return this.leaving;
  }
}
