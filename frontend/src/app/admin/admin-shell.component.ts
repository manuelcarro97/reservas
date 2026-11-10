import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import {
  IsActiveMatchOptions,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { IconComponent } from '../shared/icon.component';
import { SiteFooterComponent } from '../shared/site-footer.component';
import { currentPlanSlug, routerUrl } from './current-plan';
import { MeStore } from './me.store';
import { FeedService } from './notifications/feed.service';
import { ToastComponent } from './notifications/toast.component';
import { PanelExit } from './panel-exit.service';
import { PlanSwitcherComponent } from './plan-switcher.component';

/**
 * Marco del panel del dueño (`/panel/**`): cabecera con selector de plano, pestañas (Inicio, Planos, Reservas, Turnos
 * y Configuración; todas menos Planos son del plano actual), avisos, Cuenta y Salir, y el pie común. Es aparte del
 * marco público (`ShellComponent`), que no puede inyectar `AuthService` para no descargar Firebase en las páginas
 * públicas. Provee el `MeStore` que comparten la cabecera y las páginas del panel, y el `FeedService`, que consulta
 * los avisos mientras el panel está abierto.
 *
 * El panel pertenece al dueño con el que se abrió. Si la sesión cambia en otra pestaña (se cierra, o entra otro
 * dueño), se sale a `/entrar`: seguir aquí dejaría pintados los planos del anterior y mezclaría los avisos del nuevo.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [
    IconComponent,
    PlanSwitcherComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    SiteFooterComponent,
    ToastComponent,
  ],
  providers: [MeStore, FeedService],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  private readonly auth = inject(AuthService);
  private readonly exit = inject(PanelExit);
  private readonly store = inject(MeStore);
  private readonly router = inject(Router);
  private readonly url = routerUrl(this.router);

  /** Se inyecta aquí para que empiece a consultar al abrir el panel, aunque la cabecera no lo use. */
  protected readonly feed = inject(FeedService);

  /** Plano al que apuntan las pestañas Inicio, Reservas, Turnos y Configuración. `null` si el dueño no tiene ninguno. */
  protected readonly planSlug = computed(() =>
    currentPlanSlug(this.url(), this.router, this.store.plans()),
  );

  /** Destino de la marca: el Inicio del plano actual, o la entrada del panel si el dueño no tiene ninguno. */
  protected readonly brandLink = computed(() => {
    const slug = this.planSlug();
    return slug ? ['/panel', slug, 'inicio'] : ['/panel'];
  });

  /**
   * Query de la pestaña Planos: si el plano actual no es el primero, lo lleva en `?plano=` para que Mis planos lo
   * destaque y no se pierda al pasar por la lista. Con el primero, o sin plano, basta la ruta sola.
   */
  protected readonly plansTabQuery = computed(() => {
    const slug = this.planSlug();
    const plans = this.store.plans();
    return slug && plans[0]?.slug !== slug && plans.some((plan) => plan.slug === slug)
      ? { plano: slug }
      : null;
  });

  /** Una pestaña solo se marca en su URL exacta: `/panel/kafe` no marca Reservas en `/panel/kafe/turnos`. */
  protected readonly tabMatch: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };
  /** Solo cuenta quién es, no su email ni su token: renovarlos no cambia el valor. */
  private readonly uid = computed(() => this.auth.user()?.uid ?? null);
  /**
   * Dueño con el que se abrió el panel (`authGuard` garantiza que ya hay sesión). Si aun así no hay ninguno, se
   * adopta el primero que avise el SDK.
   */
  private ownerUid: string | null = this.auth.user()?.uid ?? null;

  constructor() {
    this.store.refresh();
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
