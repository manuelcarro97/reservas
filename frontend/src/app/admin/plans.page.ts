import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PlanResponse } from '../core/api/models/plan-response';
import { PlanSummaryResponse } from '../core/api/models/plan-summary-response';
import { AdminPlanControllerService } from '../core/api/services/admin-plan-controller.service';
import { errorCode } from '../core/api-errors';
import { IconComponent } from '../shared/icon.component';
import { toRoom, toTable } from '../plano/plan-mapping';
import { PlanoComponent } from '../plano/plano.component';
import { THEMES } from '../plano/themes';
import { adminErrorMessage } from './admin-errors';
import { currentPlanSlug, routerUrl } from './current-plan';
import { MeStore } from './me.store';
import { PLAN_STATUS_LABELS } from './plan-status';
import { slugProblem, suggestSlug } from './slug';

type BookingMode = NonNullable<PlanResponse['bookingMode']>;

const MODE_LABELS: Record<BookingMode, string> = {
  FREE_CHOICE: 'Elección libre',
  ASSIGNED: 'Asigno yo la mesa',
};

/** El `PlanResponse` de un plano, que la lista del dueño (`PlanSummaryResponse`) no trae. */
type PlanDetail =
  { state: 'loading' } | { state: 'error' } | { state: 'ready'; plan: PlanResponse };

/** Qué pasó al copiar el enlace público del plano `slug`. */
interface CopyResult {
  slug: string;
  result: 'copied' | 'manual';
}

function count(amount: number, one: string, many: string): string {
  return `${amount} ${amount === 1 ? one : many}`;
}

function seatsOf(plan: PlanResponse): number {
  return (plan.tables ?? []).reduce((total, table) => total + (table.seats ?? 0), 0);
}

/**
 * `/panel`: mis planos (hasta 3). La tarjeta grande es el plano actual (`currentPlanSlug`: el primero, o el que pide
 * `?plano=`) con su plano dibujado en solo lectura, su ficha y sus accesos; debajo, los demás con "Abrir", que los
 * sube a la tarjeta grande. A la derecha, el alta de un plano nuevo. Borrar un plano se hace en Configuración.
 *
 * Cada plano se pide una vez (`GET /admin/restaurants/{slug}`, como mucho 3) mientras la página vive.
 */
@Component({
  selector: 'app-plans-page',
  imports: [IconComponent, PlanoComponent, RouterLink],
  templateUrl: './plans.page.html',
  styleUrl: './plans.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'rise-stagger' },
})
export class PlansPage {
  protected readonly store = inject(MeStore);
  private readonly planApi = inject(AdminPlanControllerService);
  private readonly router = inject(Router);
  private readonly location = inject(DOCUMENT).location;
  private readonly requests = new Subscription();
  private request: Subscription | undefined;
  private readonly url = routerUrl(this.router);

  protected readonly statusLabels = PLAN_STATUS_LABELS;
  /** Servidor sin esquema, para enseñar el enlace público: `localhost:4200/r/kafe`. */
  protected readonly publicHost = this.location.host;

  protected readonly name = signal('');
  protected readonly slug = signal('');
  /** El dueño ha escrito el enlace a mano: deja de seguirse al nombre. */
  private slugEdited = false;
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  /** Plano de cada tarjeta, por slug. Se pide la primera vez que el plano aparece en la lista. */
  private readonly details = signal<Record<string, PlanDetail>>({});

  protected readonly featuredSlug = computed(() =>
    currentPlanSlug(this.url(), this.router, this.store.plans()),
  );
  protected readonly featured = computed(() =>
    this.store.plans().find((plan) => plan.slug === this.featuredSlug()),
  );
  protected readonly featuredDetail = computed(() => this.detailOf(this.featuredSlug()));

  /** El plano destacado listo para dibujar en solo lectura, o `null` mientras carga o si falló. */
  protected readonly drawing = computed(() => {
    const detail = this.featuredDetail();
    if (detail?.state !== 'ready') {
      return null;
    }
    const { plan } = detail;
    return {
      room: toRoom(plan.room),
      tables: (plan.tables ?? []).map(toTable),
      theme: plan.theme ?? 'AZUL',
    };
  });

  /** Las cifras de la ficha del plano destacado. */
  protected readonly figures = computed(() => {
    const detail = this.featuredDetail();
    if (detail?.state !== 'ready') {
      return null;
    }
    const { plan } = detail;
    const hours = plan.cancellationDeadlineHours;
    const shifts = plan.shifts ?? [];
    return {
      tables: (plan.tables ?? []).length,
      seats: seatsOf(plan),
      shifts: shifts.length,
      shiftNames: shifts.map((shift) => shift.name).join(' · ') || 'Sin turnos todavía',
      mode: MODE_LABELS[plan.bookingMode ?? 'FREE_CHOICE'],
      cancellation:
        hours === undefined
          ? null
          : hours === 0
            ? 'cancelación hasta la hora de la reserva'
            : `cancelación hasta ${hours} h antes`,
      theme: THEMES[plan.theme ?? 'AZUL'].name,
    };
  });

  /** Los demás planos, con el resumen de mesas y plazas cuando ya se conocen. */
  protected readonly others = computed(() =>
    this.store
      .plans()
      .filter((plan) => plan.slug !== this.featuredSlug())
      .map((plan) => {
        const detail = this.detailOf(plan.slug);
        return {
          plan,
          summary:
            detail?.state === 'ready'
              ? `${count((detail.plan.tables ?? []).length, 'mesa', 'mesas')} · ${count(seatsOf(detail.plan), 'plaza', 'plazas')}`
              : null,
        };
      }),
  );

  /** Planos que aún se pueden crear; 0 en la cuenta demo y en el tope. */
  protected readonly freeSlots = computed(() =>
    this.store.canCreatePlan() ? this.store.maxPlans() - this.store.plans().length : 0,
  );

  private readonly copyResult = signal<CopyResult | null>(null);
  /** Resultado de copiar el enlace del plano destacado; se olvida al pasar a otro plano. */
  protected readonly featuredCopy = computed(() => {
    const copy = this.copyResult();
    return copy && copy.slug === this.featuredSlug() ? copy.result : null;
  });

  constructor() {
    // Al volver desde otra sección el plano pudo cambiar (publicado, borrado…).
    this.store.refresh();
    effect(() => {
      for (const plan of this.store.plans()) {
        if (plan.slug) {
          untracked(() => this.load(plan.slug!));
        }
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.requests.unsubscribe();
      this.request?.unsubscribe();
    });
  }

  private detailOf(slug: string | null | undefined): PlanDetail | undefined {
    return slug ? this.details()[slug] : undefined;
  }

  /** Pide el plano si no se ha pedido ya: "Abrir" cambia el destacado sin repetir la petición. */
  private load(slug: string): void {
    if (this.details()[slug]) {
      return;
    }
    this.setDetail(slug, { state: 'loading' });
    this.requests.add(
      this.planApi.get({ slug }).subscribe({
        next: (plan) => this.setDetail(slug, { state: 'ready', plan }),
        error: () => this.setDetail(slug, { state: 'error' }),
      }),
    );
  }

  private setDetail(slug: string, detail: PlanDetail): void {
    this.details.update((details) => ({ ...details, [slug]: detail }));
  }

  /** Solo se ofrece con el plano publicado: un borrador no tiene página pública. */
  protected async copyLink(plan: PlanSummaryResponse): Promise<void> {
    const slug = plan.slug ?? '';
    try {
      await navigator.clipboard.writeText(`${this.location.origin}/r/${slug}`);
      this.copyResult.set({ slug, result: 'copied' });
    } catch {
      // Sin portapapeles (o sin permiso) no se puede copiar solo: se le dice dónde está el enlace.
      this.copyResult.set({ slug, result: 'manual' });
    }
  }

  protected onName(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.name.set(value);
    if (!this.slugEdited) {
      this.slug.set(suggestSlug(value));
    }
  }

  protected onSlug(event: Event): void {
    this.slugEdited = true;
    this.slug.set((event.target as HTMLInputElement).value);
  }

  protected create(event: Event): void {
    event.preventDefault();
    if (this.creating()) {
      return;
    }
    const name = this.name().trim();
    const slug = this.slug().trim();
    const problem = name ? slugProblem(slug) : 'Escribe el nombre del plano.';
    if (problem) {
      this.createError.set(problem);
      return;
    }

    this.creating.set(true);
    this.createError.set(null);
    this.request = this.planApi.create1({ body: { name, slug } }).subscribe({
      next: (created) => {
        this.creating.set(false);
        // El selector de la cabecera y el tope de planos salen del almacén: se recarga antes de entrar al editor.
        this.store.refresh();
        void this.router.navigate(['/panel', created.slug ?? slug, 'plano']);
      },
      error: (error: HttpErrorResponse) => {
        this.creating.set(false);
        this.createError.set(
          adminErrorMessage(error, 'No se pudo crear el plano. Inténtalo de nuevo.'),
        );
        if (errorCode(error) === 'PLAN_LIMIT_REACHED') {
          // La lista estaba desactualizada (otra pestaña creó planos): se ajusta el formulario al tope real.
          this.store.refresh();
        }
      },
    });
  }
}
