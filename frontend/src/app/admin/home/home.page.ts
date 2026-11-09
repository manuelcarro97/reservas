import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { MeStore } from '../me.store';

/**
 * `/panel/:slug/inicio`: la entrada por defecto del panel, un resumen del día del plano actual. De momento es solo
 * el esqueleto: la cabecera con el nombre del plano (de la lista del dueño, sin pedir nada) y el título. El contenido
 * llega en las tareas siguientes.
 */
@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'rise-stagger' },
})
export class HomePage {
  private readonly store = inject(MeStore);

  // Cambiar de plano desde la cabecera reutiliza esta página: el slug se lee con cada cambio de la ruta.
  private readonly slug = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('slug') ?? '')),
    { initialValue: '' },
  );

  /** Nombre del plano; vacío hasta que llega la lista de planos del dueño. */
  protected readonly planName = computed(
    () => this.store.plans().find((plan) => plan.slug === this.slug())?.name ?? '',
  );
}
