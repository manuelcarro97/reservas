import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
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
  protected readonly signOutError = signal<string | null>(null);

  /** Solo cuenta quién es, no su email ni su token: renovarlos no cambia el valor. */
  private readonly uid = computed(() => this.auth.user()?.uid ?? null);
  /**
   * Dueño con el que se abrió el panel (`authGuard` garantiza que ya hay sesión). Si aun así no hay ninguno, se
   * adopta el primero que avise el SDK.
   */
  private ownerUid: string | null = this.auth.user()?.uid ?? null;
  /**
   * El dueño pulsó Salir. El `null` que eso provoca no es un cambio de sesión ajeno: la salida la hace `signOut()`,
   * que deja preguntar al editor. Si el dueño se queda, el panel sigue ahí aunque ya no haya sesión.
   */
  private signedOutByHand = false;

  constructor() {
    inject(MeStore).refresh();
    effect(() => {
      const uid = this.uid();
      if (this.ownerUid === null) {
        this.ownerUid = uid;
      } else if (uid !== this.ownerUid && !(uid === null && this.signedOutByHand)) {
        // La sesión ya no es la de este panel: no se pregunta por cambios sin guardar, no se podrían guardar.
        void this.exit.toLogin(true);
      }
    });
  }

  protected async signOut(): Promise<void> {
    this.signOutError.set(null);
    this.signedOutByHand = true;
    try {
      await this.auth.signOut();
    } catch {
      this.signedOutByHand = false;
      this.signOutError.set('No se pudo salir. Inténtalo de nuevo.');
      return;
    }
    await this.exit.toLogin();
  }
}
