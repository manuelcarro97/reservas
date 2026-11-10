import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlanResponse } from '../../core/api/models/plan-response';
import { BOOKING_WINDOW_DAYS } from '../../core/booking-policy';
import { calendarLeaf, longDateParts } from '../../core/time';
import { embedSnippet } from '../embed-snippet';
import { MeStore } from '../me.store';
import { BOOKING_MODE_LABELS } from '../plan-status';

/** Estado de la lectura de los cierres, para no decir "ninguno" mientras llega o si falló. */
export type ClosureStatus = 'loading' | 'failed' | 'ready';

/** `2026-11-15` → `dom 15 nov`. */
function closureText(isoDate: string): string {
  const weekday = longDateParts(isoDate).weekday.slice(0, 3).toLowerCase();
  const { day, month } = calendarLeaf(isoDate);
  return `${weekday} ${day} ${month}`;
}

/**
 * Tarjeta "Configuración" de Inicio: los valores actuales del plano (modo, cancelación, cierres, Telegram) y el
 * código para incrustar la página pública en una web. Solo lectura: `Editar →` lleva a Configuración.
 */
@Component({
  selector: 'app-home-settings',
  imports: [RouterLink],
  templateUrl: './home-settings.component.html',
  styleUrl: './home-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sheet' },
})
export class HomeSettingsComponent {
  readonly plan = input.required<PlanResponse>();
  /** Primer día cerrado de hoy en adelante, o `null` si no hay. */
  readonly nextClosure = input<string | null>(null);
  readonly closureStatus = input<ClosureStatus>('ready');

  private readonly me = inject(MeStore);
  private readonly origin = inject(DOCUMENT).location.origin;

  protected readonly windowDays = BOOKING_WINDOW_DAYS;
  protected readonly mode = computed(
    () => BOOKING_MODE_LABELS[this.plan().bookingMode ?? 'FREE_CHOICE'],
  );

  /** `hasta N h antes`, o `hasta la hora de la reserva` con 0 (mismo texto que Mis planos). `null` si el plano no lo trae. */
  protected readonly cancellation = computed(() => {
    const hours = this.plan().cancellationDeadlineHours;
    if (hours === undefined) {
      return null;
    }
    return hours === 0 ? 'hasta la hora de la reserva' : `hasta ${hours} h antes`;
  });

  protected readonly closure = computed(() => {
    switch (this.closureStatus()) {
      case 'loading':
        return 'Cargando…';
      case 'failed':
        return 'no disponible';
      case 'ready': {
        const date = this.nextClosure();
        return date ? closureText(date) : 'ninguno';
      }
    }
  });

  /** La fila de Telegram solo sale si el servidor lo tiene y la cuenta no es la demo (como en Configuración). */
  protected readonly telegramVisible = computed(
    () => this.me.telegramAvailable() && !this.me.demo(),
  );
  protected readonly telegramLinked = computed(() => this.me.me()?.telegramLinked === true);

  /** Un borrador no tiene página pública que incrustar. */
  protected readonly published = computed(() => this.plan().status === 'PUBLISHED');
  protected readonly snippet = computed(() =>
    embedSnippet(this.origin, this.plan().slug ?? '', this.plan().name ?? ''),
  );

  protected readonly copyStatus = signal<'copied' | 'manual' | null>(null);

  protected async copyEmbed(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.snippet());
      this.copyStatus.set('copied');
    } catch {
      // Sin portapapeles (o sin permiso) no se puede copiar solo: se enseña el código para copiarlo a mano.
      this.copyStatus.set('manual');
    }
  }

  protected select(event: Event): void {
    (event.target as HTMLTextAreaElement).select();
  }
}
