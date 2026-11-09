import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { MeStore } from './me.store';
import { FeedService } from './notifications/feed.service';
import { ToastComponent } from './notifications/toast.component';
import { PanelExit } from './panel-exit.service';
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
  private readonly exit = inject(PanelExit);

  /** Se inyecta aquí para que empiece a consultar al abrir el panel, aunque la cabecera no lo use. */
  protected readonly feed = inject(FeedService);

  /** Solo cuenta quién es, no su email ni su token: renovarlos no cambia el valor. */
  private readonly uid = computed(() => this.auth.user()?.uid ?? null);
  /**
   * Dueño con el que se abrió el panel (`authGuard` garantiza que ya hay sesión). Si aun así no hay ninguno, se
   * adopta el primero que avise el SDK.
   */
  private ownerUid: string | null = this.auth.user()?.uid ?? null;

  constructor() {
    inject(MeStore).refresh();
    effect(() => {
      const uid = this.uid();
      if (this.ownerUid === null) {
        this.ownerUid = uid;
      } else if (uid !== this.ownerUid) {
        // La sesión ya no es la de este panel: no se pregunta por cambios sin guardar, no se podrían guardar.
        void this.exit.toLogin(true);
      }
    });
  }

  /**
   * Primero sale del panel y solo después cierra la sesión: así el editor puede preguntar por los cambios sin guardar
   * y, si el dueño se queda, sigue con sesión (guardar funcionaría). El `null` que provoca `signOut()` llega con el
   * panel ya cerrado, así que el efecto de arriba no lo ve.
   */
  protected async signOut(): Promise<void> {
    this.exit.signOutFailed.set(false);
    if (!(await this.exit.toLogin())) {
      return;
    }
    try {
      await this.auth.signOut();
    } catch {
      // Ya no hay cabecera donde decirlo: la página de acceso lo cuenta.
      this.exit.signOutFailed.set(true);
    }
  }
}
