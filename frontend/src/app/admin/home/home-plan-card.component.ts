import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlanResponse } from '../../core/api/models/plan-response';
import { toRoom, toTable } from '../../plano/plan-mapping';
import { PlanoComponent } from '../../plano/plano.component';
import { knownTheme } from '../../plano/themes';
import { BOOKING_MODE_LABELS, PLAN_STATUS_LABELS } from '../plan-status';

/**
 * Tarjeta "Tu plano" de Inicio: el plano en miniatura, sus cifras, el enlace público con su botón de copiar y los
 * accesos al editor y a la página pública. Un borrador no tiene página pública: sin enlace ni "Ver página pública".
 */
@Component({
  selector: 'app-home-plan-card',
  imports: [PlanoComponent, RouterLink],
  templateUrl: './home-plan-card.component.html',
  styleUrl: './home-plan-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sheet' },
})
export class HomePlanCardComponent {
  readonly plan = input.required<PlanResponse>();
  /** Enlace público completo (`https://…/r/kafe`): es lo que se copia. */
  readonly publicUrl = input.required<string>();

  protected readonly statusLabels = PLAN_STATUS_LABELS;
  protected readonly published = computed(() => this.plan().status === 'PUBLISHED');
  /** El enlace sin el esquema, para enseñarlo: `localhost:4200/r/kafe`. */
  protected readonly publicHost = computed(() => this.publicUrl().replace(/^https?:\/\//, ''));

  protected readonly drawing = computed(() => ({
    room: toRoom(this.plan().room),
    tables: (this.plan().tables ?? []).map(toTable),
    theme: knownTheme(this.plan().theme),
  }));

  protected readonly figures = computed(() => {
    const plan = this.plan();
    const shifts = [...(plan.shifts ?? [])].sort((a, b) =>
      (a.start ?? '').localeCompare(b.start ?? ''),
    );
    return {
      tables: (plan.tables ?? []).length,
      seats: (plan.tables ?? []).reduce((total, table) => total + (table.seats ?? 0), 0),
      shifts: shifts.length,
      shiftNames: shifts.map((shift) => shift.name).join(' · ') || 'Sin turnos todavía',
      mode: BOOKING_MODE_LABELS[plan.bookingMode ?? 'FREE_CHOICE'],
    };
  });

  /** Qué pasó al copiar el enlace de un plano; se olvida al pasar a otro. */
  private readonly copyResult = signal<{ url: string; result: 'copied' | 'manual' } | null>(null);
  protected readonly copyStatus = computed(() => {
    const copy = this.copyResult();
    return copy?.url === this.publicUrl() ? copy.result : null;
  });

  protected async copyLink(): Promise<void> {
    const url = this.publicUrl();
    try {
      await navigator.clipboard.writeText(url);
      this.copyResult.set({ url, result: 'copied' });
    } catch {
      // Sin portapapeles (o sin permiso) no se puede copiar solo: se le dice dónde está el enlace.
      this.copyResult.set({ url, result: 'manual' });
    }
  }
}
