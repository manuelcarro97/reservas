import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { currentPlanSlug, panelLocation, routerUrl } from './current-plan';
import { MeStore } from './me.store';
import { PLAN_STATUS_LABELS } from './plan-status';

/**
 * Selector de plano de la cabecera del panel. Enseña el plano actual con su estado y deja pasar a otro:
 * - En la página de un plano conserva la sección (inicio, plano, turnos…).
 * - En `/panel/planos` y `/panel/cuenta` no hay sección: el elegido pasa a ser el destacado de Mis planos (`?plano=`).
 *
 * El `<select>` nativo cubre toda la caja con opacidad 0: se conserva su teclado y su lista, y la caja pinta el
 * nombre (recortado si es largo, con el nombre completo en `title`) y el estado.
 */
@Component({
  selector: 'app-plan-switcher',
  imports: [IconComponent],
  template: `
    @if (store.plans().length > 0) {
      <div class="switcher">
        <span class="name truncate" [attr.title]="label()">{{ label() }}</span>
        @if (current(); as plan) {
          <span
            class="dot-state"
            [class.live]="plan.status === 'PUBLISHED'"
            [class.draft]="plan.status === 'DRAFT'"
            >{{ plan.status ? statusLabels[plan.status] : '' }}</span
          >
        }
        <app-icon name="chev" />
        <!-- El select cubre la caja: el nombre completo también va en su title, o el ratón nunca lo vería. -->
        <select
          name="plan"
          [attr.aria-label]="'Cambiar de plano: ' + label()"
          [attr.title]="label()"
          (change)="choose($event)"
        >
          @if (!current()) {
            <option value="" selected>Ir a un plano…</option>
          }
          @for (plan of store.plans(); track plan.slug) {
            <option [value]="plan.slug" [selected]="plan.slug === slug()">
              {{ plan.name }}
            </option>
          }
        </select>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      min-width: 0;
    }

    .switcher {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      max-width: 22rem;
      padding: 6px 10px 6px 12px;
      border: 1px solid var(--rule-strong);
      border-radius: 4px;
      background: var(--paper);
    }

    .switcher:hover {
      border-color: var(--ink-2);
    }

    .switcher:has(select:focus-visible) {
      outline: 2px solid var(--blue);
      outline-offset: 2px;
    }

    .name {
      font-weight: 600;
    }

    select {
      position: absolute;
      inset: 0;
      width: 100%;
      font: inherit;
      opacity: 0;
      cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanSwitcherComponent {
  protected readonly store = inject(MeStore);
  private readonly router = inject(Router);
  private readonly url = routerUrl(this.router);

  protected readonly statusLabels = PLAN_STATUS_LABELS;

  protected readonly slug = computed(() =>
    currentPlanSlug(this.url(), this.router, this.store.plans()),
  );
  /** El plano actual, si está en la lista (la URL puede traer uno que ya no existe). */
  protected readonly current = computed(() =>
    this.store.plans().find((plan) => plan.slug === this.slug()),
  );
  protected readonly label = computed(() => this.current()?.name ?? 'Ir a un plano…');

  protected async choose(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    if (!select.value) {
      return;
    }
    const { slug, section } = panelLocation(this.url(), this.router);
    await (slug
      ? this.router.navigate(['/panel', select.value, ...(section ? section.split('/') : [])])
      : this.router.navigate(['/panel/planos'], { queryParams: { plano: select.value } }));
    // Si la página no dejó salir (cambios sin guardar en el editor) el selector no debe seguir enseñando el plano elegido.
    select.value = this.current() ? (this.slug() ?? '') : '';
  }
}
