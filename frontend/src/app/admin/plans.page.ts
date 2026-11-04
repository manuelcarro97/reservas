import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AdminAccountControllerService } from '../core/api/services/admin-account-controller.service';
import { AdminPlanControllerService } from '../core/api/services/admin-plan-controller.service';
import { errorCode } from '../core/api-errors';
import { adminErrorMessage, blockingReservations } from './admin-errors';
import { MeStore } from './me.store';
import { slugProblem, suggestSlug } from './slug';

const PLAN_STATUS_LABELS = { DRAFT: 'Borrador', PUBLISHED: 'Publicado' } as const;

/** Qué sale mal al borrar un plano, con los códigos de las reservas que lo impiden si es el caso. */
interface DeleteFailure {
  message: string;
  reservations: string[];
}

/** `/panel`: mis planos (hasta 3) con accesos, alta de un plano nuevo y borrado de planos. */
@Component({
  selector: 'app-plans-page',
  imports: [RouterLink],
  templateUrl: './plans.page.html',
  styleUrl: './plans.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlansPage {
  protected readonly store = inject(MeStore);
  private readonly planApi = inject(AdminPlanControllerService);
  private readonly accountApi = inject(AdminAccountControllerService);
  private readonly router = inject(Router);
  private request: Subscription | undefined;

  protected readonly statusLabels = PLAN_STATUS_LABELS;

  protected readonly name = signal('');
  protected readonly slug = signal('');
  /** El dueño ha escrito el enlace a mano: deja de seguirse al nombre. */
  private slugEdited = false;
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  /** Slug del plano para el que se pide confirmación de borrado. */
  protected readonly confirmingDelete = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteFailure = signal<DeleteFailure | null>(null);

  constructor() {
    // Al volver desde otra sección el plano pudo cambiar (publicado, borrado…).
    this.store.refresh();
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
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

  protected askDeleteConfirmation(slug: string): void {
    this.deleteFailure.set(null);
    this.confirmingDelete.set(slug);
  }

  protected keepPlan(): void {
    this.confirmingDelete.set(null);
  }

  protected deletePlan(slug: string): void {
    if (this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.deleteFailure.set(null);
    this.request = this.accountApi.deletePlan({ slug }).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmingDelete.set(null);
        this.store.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.deleting.set(false);
        this.confirmingDelete.set(null);
        this.deleteFailure.set({
          message:
            errorCode(error) === 'PLAN_HAS_RESERVATIONS'
              ? 'No se puede borrar el plano mientras tenga reservas activas. Cancela estas reservas antes:'
              : adminErrorMessage(error, 'No se pudo borrar el plano. Inténtalo de nuevo.'),
          reservations: blockingReservations(error),
        });
        if (errorCode(error) === 'RESTAURANT_NOT_FOUND') {
          // Ya no existe (borrado desde otra pestaña): la lista se pone al día.
          this.store.refresh();
        }
      },
    });
  }
}
