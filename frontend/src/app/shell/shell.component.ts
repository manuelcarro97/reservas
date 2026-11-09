import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { EmbedMode } from '../core/embed-mode';
import { NON_EMBEDDABLE_LINK_TARGET } from '../core/frame';
import { PublicTitle } from '../public/public-title.service';
import { SiteFooterComponent } from '../shared/site-footer.component';

/**
 * Marco público de la aplicación: cabecera, contenido y pie. La cabecera se oculta con `?embed=1` (iframe en la web
 * del restaurante); el pie se mantiene también ahí. No importa nada del panel: no descarga Firebase.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterOutlet, SiteFooterComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class ShellComponent {
  protected readonly embedded = inject(EmbedMode).embedded;
  /** La marca lleva a `/` (y de ahí a `/entrar`), que no se puede incrustar: dentro de un iframe sale de él. */
  protected readonly brandTarget = inject(NON_EMBEDDABLE_LINK_TARGET);
  /** Nombre del local de la página abierta; sin él, la cabecera muestra la marca. */
  protected readonly venueName = inject(PublicTitle).name;
}
