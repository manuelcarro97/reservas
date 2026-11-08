import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Cualquier dirección que no existe. Es pública y no importa nada del panel: no descarga Firebase. La portada de
 * verdad la decide el pulido visual; mientras tanto la única salida útil es la entrada del dueño.
 */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <section class="not-found">
      <h1>Página no encontrada</h1>
      <p>La dirección que has escrito no existe.</p>
      <p><a routerLink="/entrar">Ir a la entrada del panel</a></p>
    </section>
  `,
  styles: `
    .not-found {
      margin: 3rem auto;
      max-width: 32rem;
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
