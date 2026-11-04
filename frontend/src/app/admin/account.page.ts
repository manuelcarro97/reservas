import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AdminAccountControllerService } from '../core/api/services/admin-account-controller.service';
import { errorCode } from '../core/api-errors';
import { AuthService } from '../core/auth/auth.service';
import { adminErrorMessage, blockingReservations } from './admin-errors';
import { MeStore } from './me.store';

/** Qué sale mal al borrar la cuenta, con los códigos de las reservas que lo impiden si es el caso. */
interface DeleteFailure {
  message: string;
  reservations: string[];
}

/** `/panel/cuenta`: datos de la cuenta y borrado de la cuenta con confirmación en la página. */
@Component({
  selector: 'app-account-page',
  templateUrl: './account.page.html',
  styleUrl: './account.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPage {
  protected readonly store = inject(MeStore);
  private readonly api = inject(AdminAccountControllerService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private request: Subscription | undefined;

  protected readonly confirming = signal(false);
  protected readonly deleting = signal(false);
  protected readonly failure = signal<DeleteFailure | null>(null);

  constructor() {
    this.store.refresh();
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  protected askConfirmation(): void {
    this.failure.set(null);
    this.confirming.set(true);
  }

  protected keepAccount(): void {
    this.confirming.set(false);
  }

  protected deleteAccount(): void {
    if (this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.failure.set(null);
    this.request = this.api.deleteAccount().subscribe({
      next: () => void this.leave(),
      error: (error: HttpErrorResponse) => {
        this.deleting.set(false);
        // Se cierra la confirmación: tras cancelar las reservas hay que pedirla de nuevo.
        this.confirming.set(false);
        this.failure.set({
          message:
            errorCode(error) === 'PLAN_HAS_RESERVATIONS'
              ? 'No se puede borrar la cuenta mientras haya reservas activas. Cancela estas reservas antes:'
              : adminErrorMessage(error, 'No se pudo borrar la cuenta. Inténtalo de nuevo.'),
          reservations: blockingReservations(error),
        });
      },
    });
  }

  /** La cuenta ya no existe: se cierra la sesión local y se va a la pantalla de acceso. */
  private async leave(): Promise<void> {
    try {
      await this.auth.signOut();
    } catch {
      // Sin cuenta, el token ya no vale: la siguiente petición dará 401 y el interceptor limpiará la sesión.
    }
    await this.router.navigateByUrl('/entrar');
  }
}
