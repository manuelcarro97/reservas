import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { currentPlanSlug } from './current-plan';
import { MeStore } from './me.store';

/**
 * `/panel`: la entrada del panel. No tiene contenido propio: espera a los planos del dueño y redirige al Inicio del
 * plano actual (`?plano=` o el primero), sustituyendo su entrada del historial para que "atrás" no vuelva aquí. Sin
 * planos enseña la bienvenida, con el acceso al formulario de Mis planos. La redirección la hace un componente y no
 * un `redirectTo` ni un guard porque `MeStore` lo provee el marco del panel y solo existe dentro de él.
 *
 * Al crearse pide los planos de nuevo, aunque el almacén ya los tenga: llega desde Configuración tras borrar un plano
 * y la lista que había ya no vale. `retry()` deja el estado en `loading` hasta que llega la respuesta nueva, así que
 * solo se decide cuando ya no está cargando.
 */
@Component({
  selector: 'app-panel-entry',
  imports: [RouterLink],
  templateUrl: './panel-entry.component.html',
  styleUrl: './panel-entry.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'rise-stagger' },
})
export class PanelEntryComponent {
  protected readonly store = inject(MeStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    this.store.retry();
    effect(() => {
      if (this.store.status() !== 'ready') {
        return;
      }
      const plans = this.store.plans();
      untracked(() => {
        // La URL de la navegación en curso sale de la ruta, no de `router.url`, que aún puede ser la anterior.
        const url = this.router.serializeUrl(
          this.router.createUrlTree(['/panel'], { queryParams: this.route.snapshot.queryParams }),
        );
        const slug = currentPlanSlug(url, this.router, plans);
        if (slug) {
          void this.router.navigate(['/panel', slug, 'inicio'], { replaceUrl: true });
        }
      });
    });
  }
}
