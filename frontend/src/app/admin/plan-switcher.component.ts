import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { MeStore } from './me.store';

/** Sección a la que se va al elegir un plano desde una página que no es de un plano (lista, cuenta). */
const DEFAULT_SECTION = 'plano';

/** Plano y sección de la URL actual: `/panel/:slug/:section`. `/panel` y `/panel/cuenta` no son de ningún plano. */
function planAndSection(url: string, router: Router): { slug: string | null; section: string } {
  const segments =
    router.parseUrl(url).root.children['primary']?.segments.map((segment) => segment.path) ?? [];
  const isPlanUrl =
    segments[0] === 'panel' &&
    segments.length >= 2 &&
    !(segments[1] === 'cuenta' && segments.length === 2);
  return isPlanUrl
    ? { slug: segments[1], section: segments.slice(2).join('/') }
    : { slug: null, section: DEFAULT_SECTION };
}

/** Menú de la cabecera del panel para pasar de un plano a otro conservando la sección (plano, turnos…). */
@Component({
  selector: 'app-plan-switcher',
  template: `
    @if (store.plans().length > 0) {
      <select name="plan" aria-label="Cambiar de plano" (change)="choose($event)">
        @if (!current().slug) {
          <option value="" selected>Ir a un plano…</option>
        }
        @for (plan of store.plans(); track plan.slug) {
          <option [value]="plan.slug" [selected]="plan.slug === current().slug">
            {{ plan.name }}
          </option>
        }
      </select>
    }
  `,
  styles: `
    select {
      max-width: 14rem;
      padding: 0.35rem 0.5rem;
      border: 1px solid #c4ccd6;
      border-radius: 6px;
      background: #fff;
      font: inherit;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanSwitcherComponent {
  protected readonly store = inject(MeStore);
  private readonly router = inject(Router);

  protected readonly current = signal(planAndSection(this.router.url, this.router));

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.current.set(planAndSection(event.urlAfterRedirects, this.router)));
  }

  protected async choose(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    if (!select.value) {
      return;
    }
    const { section } = this.current();
    await this.router.navigate(['/panel', select.value, ...(section ? section.split('/') : [])]);
    // Si la página no dejó salir (cambios sin guardar en el editor) el selector no debe seguir enseñando el plano elegido.
    select.value = this.current().slug ?? '';
  }
}
