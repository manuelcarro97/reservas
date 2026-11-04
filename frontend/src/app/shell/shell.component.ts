import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';

/** Marco de la aplicación: cabecera y contenido. La cabecera se oculta con `?embed=1` (iframe en la web del restaurante). */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class ShellComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly embedded = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('embed') === '1')),
    { initialValue: false },
  );
}
