import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FeedService, FeedToast } from './feed.service';

/**
 * Mensajes emergentes de los avisos (reserva nueva, cancelación). Solo texto: lo que dice el backend se muestra
 * con interpolación, nunca como HTML. Un clic lleva a las reservas del plano y cierra el mensaje.
 */
@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent {
  protected readonly feed = inject(FeedService);
  private readonly router = inject(Router);

  protected open(toast: FeedToast): void {
    this.feed.dismiss(toast.id);
    if (toast.slug) {
      void this.router.navigateByUrl(`/panel/${encodeURIComponent(toast.slug)}`);
    }
  }
}
