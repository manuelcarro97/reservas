import { Component } from '@angular/core';

/** Sello de la página pública, también en modo incrustado. `noopener`: LinkedIn no se deja enmarcar, así que abre pestaña nueva. */
@Component({
  selector: 'app-powered-by',
  template: `
    <footer class="powered-by">
      <a href="https://www.linkedin.com/in/manuelcarro" target="_blank" rel="noopener noreferrer"
        >Desarrollado por Manuel Carro</a
      >
    </footer>
  `,
  styles: `
    .powered-by {
      margin-top: 2rem;
      text-align: center;
      font-size: 0.85rem;
    }

    a {
      color: var(--muted, inherit);
    }
  `,
})
export class PoweredByComponent {}
