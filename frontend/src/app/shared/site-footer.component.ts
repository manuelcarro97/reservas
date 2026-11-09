import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Pie común de la aplicación. `noopener`: LinkedIn no se deja enmarcar, así que el enlace abre una pestaña nueva.
 * Que `<footer>` sea un único elemento con el enlace dentro lo necesitan los tests de la página pública.
 */
@Component({
  selector: 'app-site-footer',
  template: `
    <footer class="site-footer">
      <span>© 2026 reservas. · Proyecto de portafolio</span>
      <a href="https://www.linkedin.com/in/manuelcarro" target="_blank" rel="noopener noreferrer"
        >Desarrollado por <b>Manuel Carro</b></a
      >
    </footer>
  `,
  styles: `
    :host {
      display: block;
      flex: none;
    }

    .site-footer {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 4px 16px;
      width: 100%;
      max-width: var(--page-max);
      margin: 0 auto;
      padding: 10px var(--page-gutter);
      border-top: 1px solid var(--rule);
      color: var(--muted);
      font-size: 12.5px;
    }

    a {
      color: var(--muted);
      text-decoration: none;
    }

    b {
      border-bottom: 1px solid var(--rule-strong);
      color: var(--ink);
      font-weight: inherit;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooterComponent {}
