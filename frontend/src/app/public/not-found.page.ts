import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NON_EMBEDDABLE_LINK_TARGET } from '../core/frame';

/**
 * Cualquier dirección que no existe. Es pública y no importa nada del panel: no descarga Firebase. La portada de
 * verdad la decide el pulido visual; mientras tanto la única salida útil es la entrada del dueño.
 */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <section class="sheet not-found rise">
      <p class="kicker">Error 404</p>
      <h1 class="sheet-heading">Página no <em>encontrada</em></h1>
      <p class="sheet-desc">La dirección que has escrito no existe.</p>
      <a class="btn ink" routerLink="/entrar" [target]="loginTarget">Ir a la entrada del panel</a>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
    }

    .not-found {
      width: 100%;
      max-width: 440px;
      padding: 34px 32px;
    }

    .kicker {
      margin: 0 0 10px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {
  /** `/entrar` no se puede incrustar: dentro de un iframe (la 404 de `/r/…` sí se ve ahí) el enlace sale de él. */
  protected readonly loginTarget = inject(NON_EMBEDDABLE_LINK_TARGET);
}
