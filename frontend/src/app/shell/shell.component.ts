import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { EmbedMode } from '../core/embed-mode';

/** Marco de la aplicación: cabecera y contenido. La cabecera se oculta con `?embed=1` (iframe en la web del restaurante). */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class ShellComponent {
  protected readonly embedded = inject(EmbedMode).embedded;
}
