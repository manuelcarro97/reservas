import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { MeResponse } from '../core/api/models/me-response';
import { AdminAccountControllerService } from '../core/api/services/admin-account-controller.service';

export type MeStatus = 'loading' | 'ready' | 'error';

/** Tope de planos si la respuesta no lo trae (`PlanService.MAX_PLANS_PER_OWNER` del backend). */
const DEFAULT_MAX_PLANS = 3;

/**
 * Datos del dueño (`GET /admin/me`): planos, tope de planos y si es la cuenta demo. Lo provee `AdminShellComponent`,
 * no la raíz: así vive lo que el panel y, al salir de él, desaparece; el siguiente dueño que entre en el mismo
 * navegador no ve ni un instante los planos del anterior.
 */
@Injectable()
export class MeStore {
  private readonly api = inject(AdminAccountControllerService);
  private request: Subscription | undefined;

  /** `loading` solo hasta la primera respuesta: una recarga posterior no vacía la pantalla. */
  readonly status = signal<MeStatus>('loading');
  readonly me = signal<MeResponse | null>(null);

  readonly plans = computed(() => this.me()?.plans ?? []);
  readonly email = computed(() => this.me()?.email ?? '');
  readonly demo = computed(() => this.me()?.demo === true);
  readonly maxPlans = computed(() => this.me()?.maxPlans ?? DEFAULT_MAX_PLANS);
  /** El servidor tiene configurado el bot de Telegram. */
  readonly telegramAvailable = computed(() => this.me()?.telegramAvailable === true);
  /** La demo no crea planos (el backend respondería 403) y nadie pasa del tope. */
  readonly canCreatePlan = computed(() => !this.demo() && this.plans().length < this.maxPlans());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  /** Pide los datos de nuevo. Si ya hay una petición en curso no lanza otra (cabecera y página lo piden a la vez). */
  refresh(): void {
    if (this.request && !this.request.closed) {
      return;
    }
    this.request = this.api.me().subscribe({
      next: (me) => {
        this.me.set(me);
        this.status.set('ready');
      },
      // Si ya había datos se conservan: un fallo de red al recargar no debe dejar la pantalla vacía.
      error: () => this.status.set(this.me() ? 'ready' : 'error'),
    });
  }

  /** Vuelve a mostrar "Cargando…" y pide los datos (botón "Reintentar"). */
  retry(): void {
    this.status.set('loading');
    this.refresh();
  }
}
