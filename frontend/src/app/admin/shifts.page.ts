import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { PlanResponse } from '../core/api/models/plan-response';
import { ShiftResponse } from '../core/api/models/shift-response';
import { AdminPlanControllerService } from '../core/api/services/admin-plan-controller.service';
import { AdminShiftControllerService } from '../core/api/services/admin-shift-controller.service';
import { NOW, todayIn } from '../public/booking.store';
import { formatDate } from './reservations/whatsapp';
import { ActionFailureComponent } from './action-failure.component';
import { ActionFailure, actionFailure } from './admin-errors';

export type PageStatus = 'loading' | 'ready' | 'notFound' | 'error';

type Day = NonNullable<ShiftResponse['days']>[number];

/** Días de la semana en el orden de la interfaz (lunes primero), con su texto corto. */
const DAYS: readonly { value: Day; label: string }[] = [
  { value: 'MONDAY', label: 'Lun' },
  { value: 'TUESDAY', label: 'Mar' },
  { value: 'WEDNESDAY', label: 'Mié' },
  { value: 'THURSDAY', label: 'Jue' },
  { value: 'FRIDAY', label: 'Vie' },
  { value: 'SATURDAY', label: 'Sáb' },
  { value: 'SUNDAY', label: 'Dom' },
];

/** Hasta cuántos días por delante se puede cerrar (`ShiftAdminService.MAX_CLOSURE_DAYS_AHEAD` del backend). */
const MAX_CLOSURE_DAYS_AHEAD = 90;
const MAX_NAME_LENGTH = 60;

const SHIFT_FAILED = 'No se pudo guardar el turno. Inténtalo de nuevo.';
const DELETE_FAILED = 'No se pudo borrar el turno. Inténtalo de nuevo.';
const CLOSURE_FAILED = 'No se pudo cerrar el día. Inténtalo de nuevo.';
const REOPEN_FAILED = 'No se pudo quitar el cierre. Inténtalo de nuevo.';

/** Lo que se escribe en el formulario de un turno: horas `HH:mm`, como las pide el backend (sin segundos). */
interface ShiftDraft {
  name: string;
  start: string;
  end: string;
  days: Day[];
}

function emptyDraft(): ShiftDraft {
  return { name: '', start: '13:00', end: '16:00', days: DAYS.map((day) => day.value) };
}

/** Los días en el orden de la semana, para compararlos y enviarlos siempre igual. */
function inWeekOrder(days: readonly Day[]): Day[] {
  return DAYS.map((day) => day.value).filter((value) => days.includes(value));
}

/** `HH:mm` de una hora `HH:mm:ss` del backend. */
function hourMinute(time: string | undefined): string {
  return (time ?? '').slice(0, 5);
}

function byStart(a: ShiftResponse, b: ShiftResponse): number {
  return (a.start ?? '').localeCompare(b.start ?? '');
}

/** `YYYY-MM-DD` más `days` días, en UTC: sin horario de verano que desplace el día. */
function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/**
 * `/panel/:slug/turnos`: turnos del plano (alta, renombrar, cambiar horas y días, borrar) y días cerrados. Renombrar
 * se puede siempre; cambiar el horario o borrar con reservas activas futuras da 409 y se muestran sus códigos. Los
 * borrados piden confirmación dentro de la página.
 */
@Component({
  selector: 'app-shifts-page',
  imports: [ActionFailureComponent, RouterLink],
  templateUrl: './shifts.page.html',
  styleUrl: './shifts.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShiftsPage {
  private readonly plansApi = inject(AdminPlanControllerService);
  private readonly shiftsApi = inject(AdminShiftControllerService);
  private readonly now = inject(NOW);

  private slug = '';
  private loadRequest: Subscription | undefined;
  private reloadRequest: Subscription | undefined;
  private closuresRequest: Subscription | undefined;

  protected readonly days = DAYS;
  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly formatDate = formatDate;
  protected readonly hourMinute = hourMinute;

  protected readonly status = signal<PageStatus>('loading');
  protected readonly plan = signal<PlanResponse | null>(null);
  protected readonly failure = signal<ActionFailure | null>(null);
  protected readonly busy = signal(false);

  protected readonly shifts = computed(() => [...(this.plan()?.shifts ?? [])].sort(byStart));

  /** Formulario de turno: crea uno nuevo, o edita el turno `editingId`. */
  protected readonly draft = signal<ShiftDraft>(emptyDraft());
  protected readonly editingId = signal<number | null>(null);
  protected readonly editingName = computed(
    () => this.shifts().find((shift) => shift.id === this.editingId())?.name ?? '',
  );
  /** Turno para el que se pide confirmación de borrado. */
  protected readonly confirmingDelete = signal<number | null>(null);

  /** Hoy en la zona del plano y el último día que se puede cerrar. */
  protected readonly today = signal('');
  protected readonly lastClosableDay = computed(() =>
    this.today() ? addDays(this.today(), MAX_CLOSURE_DAYS_AHEAD) : '',
  );
  protected readonly closures = signal<string[]>([]);
  protected readonly closuresFailed = signal(false);
  protected readonly closureDate = signal('');
  /** Día cerrado para el que se pide confirmación de quitar el cierre. */
  protected readonly confirmingReopen = signal<string | null>(null);

  constructor() {
    // Cambiar de plano desde la cabecera reutiliza esta página: se recarga con cada slug, no solo con el primero.
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => this.load(params.get('slug') ?? ''));
    inject(DestroyRef).onDestroy(() => {
      this.loadRequest?.unsubscribe();
      this.reloadRequest?.unsubscribe();
      this.closuresRequest?.unsubscribe();
    });
  }

  protected load(slug: string = this.slug): void {
    this.slug = slug;
    this.loadRequest?.unsubscribe();
    this.reloadRequest?.unsubscribe();
    this.closuresRequest?.unsubscribe();
    this.status.set('loading');
    this.plan.set(null);
    this.failure.set(null);
    this.busy.set(false);
    this.draft.set(emptyDraft());
    this.editingId.set(null);
    this.confirmingDelete.set(null);
    this.today.set('');
    this.closures.set([]);
    this.closuresFailed.set(false);
    this.closureDate.set('');
    this.confirmingReopen.set(null);

    this.loadRequest = this.plansApi.get({ slug }).subscribe({
      next: (plan) => {
        this.plan.set(plan);
        // "Hoy" es el de la zona del local, no el del navegador.
        this.today.set(todayIn(plan.timeZone, this.now()));
        this.status.set('ready');
        this.loadClosures();
      },
      error: (error: HttpErrorResponse) =>
        this.status.set(error.status === 404 ? 'notFound' : 'error'),
    });
  }

  /** Vuelve a leer el plano (con sus turnos) sin tocar los formularios. */
  private reloadPlan(): void {
    this.reloadRequest?.unsubscribe();
    this.reloadRequest = this.plansApi.get({ slug: this.slug }).subscribe({
      next: (plan) => this.plan.set(plan),
      // Si falla se queda la lista que había; la próxima recarga lo intenta otra vez.
      error: () => undefined,
    });
  }

  protected loadClosures(): void {
    this.closuresRequest?.unsubscribe();
    this.closuresFailed.set(false);
    this.closuresRequest = this.shiftsApi
      .closures({ slug: this.slug, from: this.today() })
      .subscribe({
        next: (dates) => this.closures.set([...dates].sort()),
        error: () => this.closuresFailed.set(true),
      });
  }

  protected daysText(shift: ShiftResponse): string {
    const days = shift.days ?? [];
    if (days.length === DAYS.length) {
      return 'Todos los días';
    }
    return DAYS.filter((day) => days.includes(day.value))
      .map((day) => day.label)
      .join(', ');
  }

  // --- Formulario de turno ---

  protected onName(event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.draft.update((draft) => ({ ...draft, name }));
  }

  protected onStart(event: Event): void {
    const start = (event.target as HTMLInputElement).value;
    this.draft.update((draft) => ({ ...draft, start }));
  }

  protected onEnd(event: Event): void {
    const end = (event.target as HTMLInputElement).value;
    this.draft.update((draft) => ({ ...draft, end }));
  }

  protected onDay(day: Day, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.draft.update((draft) => ({
      ...draft,
      days: inWeekOrder(checked ? [...draft.days, day] : draft.days.filter((d) => d !== day)),
    }));
  }

  protected startEdit(shift: ShiftResponse): void {
    this.failure.set(null);
    this.confirmingDelete.set(null);
    this.editingId.set(shift.id ?? null);
    this.draft.set({
      name: shift.name ?? '',
      start: hourMinute(shift.start),
      end: hourMinute(shift.end),
      days: inWeekOrder(shift.days ?? []),
    });
  }

  protected stopEdit(): void {
    this.editingId.set(null);
    this.draft.set(emptyDraft());
  }

  /** Lo que está mal en el formulario, o `null` si se puede enviar. */
  private draftProblem(draft: ShiftDraft): string | null {
    if (!draft.name.trim()) {
      return 'Escribe el nombre del turno.';
    }
    if (!draft.start || !draft.end) {
      return 'Elige la hora de inicio y la de fin.';
    }
    if (draft.start >= draft.end) {
      return 'La hora de inicio tiene que ser antes de la hora de fin.';
    }
    if (draft.days.length === 0) {
      return 'Elige al menos un día.';
    }
    return null;
  }

  protected async submitShift(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    const draft = { ...this.draft(), name: this.draft().name.trim() };
    const problem = this.draftProblem(draft);
    if (problem) {
      this.failure.set({ message: problem, reservations: [] });
      return;
    }
    const id = this.editingId();
    if (id === null) {
      await this.createShift(draft);
    } else {
      await this.updateShift(id, draft);
    }
  }

  private async createShift(draft: ShiftDraft): Promise<void> {
    const slug = this.slug;
    this.busy.set(true);
    this.failure.set(null);
    try {
      await firstValueFrom(
        this.shiftsApi.add({
          slug,
          body: { name: draft.name, start: draft.start, end: draft.end, days: draft.days },
        }),
      );
    } catch (error) {
      this.fail(slug, error, SHIFT_FAILED);
      return;
    }
    if (slug !== this.slug) {
      return;
    }
    this.busy.set(false);
    this.draft.set(emptyDraft());
    this.reloadPlan();
  }

  /**
   * Guarda lo que cambió del turno: el nombre (PATCH, siempre se puede) y después el horario (PUT, da 409 con
   * reservas activas). En ese orden, para que un 409 del horario no pierda el nombre ya guardado.
   */
  private async updateShift(id: number, draft: ShiftDraft): Promise<void> {
    const slug = this.slug;
    const current = this.shifts().find((shift) => shift.id === id);
    if (!current) {
      this.stopEdit();
      return;
    }
    const renamed = draft.name !== current.name;
    const rescheduled =
      draft.start !== hourMinute(current.start) ||
      draft.end !== hourMinute(current.end) ||
      draft.days.join() !== inWeekOrder(current.days ?? []).join();
    if (!renamed && !rescheduled) {
      this.stopEdit();
      return;
    }

    this.busy.set(true);
    this.failure.set(null);
    let changed = false;
    try {
      if (renamed) {
        await firstValueFrom(this.shiftsApi.rename({ slug, id, body: { name: draft.name } }));
        changed = true;
      }
      if (rescheduled) {
        await firstValueFrom(
          this.shiftsApi.reschedule({
            slug,
            id,
            body: { start: draft.start, end: draft.end, days: draft.days },
          }),
        );
        changed = true;
      }
    } catch (error) {
      // Si el nombre ya se guardó, o el turno ya no existe, la lista se pone al día.
      this.fail(slug, error, SHIFT_FAILED, changed);
      return;
    }
    if (slug !== this.slug) {
      return;
    }
    this.busy.set(false);
    this.stopEdit();
    this.reloadPlan();
  }

  // --- Borrar un turno ---

  protected askDelete(shift: ShiftResponse): void {
    this.failure.set(null);
    this.confirmingDelete.set(shift.id ?? null);
  }

  protected keepShift(): void {
    this.confirmingDelete.set(null);
  }

  protected async deleteShift(id: number): Promise<void> {
    if (this.busy()) {
      return;
    }
    const slug = this.slug;
    this.busy.set(true);
    this.failure.set(null);
    try {
      await firstValueFrom(this.shiftsApi.delete({ slug, id }));
    } catch (error) {
      // Se cierra la confirmación: tras cancelar las reservas hay que pedirla de nuevo.
      this.fail(slug, error, DELETE_FAILED);
      return;
    }
    if (slug !== this.slug) {
      return;
    }
    this.busy.set(false);
    this.confirmingDelete.set(null);
    if (this.editingId() === id) {
      this.stopEdit();
    }
    this.reloadPlan();
  }

  /** Una escritura falló: se muestra el motivo y, si el servidor pudo cambiar algo o ya no hay turno, se relee. */
  private fail(slug: string, error: unknown, fallback: string, reload = false): void {
    if (slug !== this.slug) {
      return;
    }
    this.busy.set(false);
    this.confirmingDelete.set(null);
    this.confirmingReopen.set(null);
    if (error instanceof HttpErrorResponse) {
      this.failure.set(actionFailure(error, fallback));
      if (reload || error.status === 404) {
        this.reloadPlan();
      }
    } else {
      this.failure.set({ message: fallback, reservations: [] });
    }
  }

  // --- Días cerrados ---

  protected onClosureDate(event: Event): void {
    this.closureDate.set((event.target as HTMLInputElement).value);
  }

  protected async addClosure(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    const date = this.closureDate();
    if (!date) {
      this.failure.set({ message: 'Elige la fecha que quieres cerrar.', reservations: [] });
      return;
    }
    if (date < this.today() || date > this.lastClosableDay()) {
      this.failure.set({
        message: `Solo se pueden cerrar días desde hoy hasta dentro de ${MAX_CLOSURE_DAYS_AHEAD} días.`,
        reservations: [],
      });
      return;
    }
    const slug = this.slug;
    this.busy.set(true);
    this.failure.set(null);
    try {
      await firstValueFrom(this.shiftsApi.addClosure({ slug, body: { date } }));
    } catch (error) {
      this.fail(slug, error, CLOSURE_FAILED);
      return;
    }
    if (slug !== this.slug) {
      return;
    }
    this.busy.set(false);
    this.closureDate.set('');
    this.loadClosures();
  }

  protected askReopen(date: string): void {
    this.failure.set(null);
    this.confirmingReopen.set(date);
  }

  protected keepClosure(): void {
    this.confirmingReopen.set(null);
  }

  protected async reopen(date: string): Promise<void> {
    if (this.busy()) {
      return;
    }
    const slug = this.slug;
    this.busy.set(true);
    this.failure.set(null);
    try {
      await firstValueFrom(this.shiftsApi.removeClosure({ slug, date }));
    } catch (error) {
      this.fail(slug, error, REOPEN_FAILED);
      return;
    }
    if (slug !== this.slug) {
      return;
    }
    this.busy.set(false);
    this.confirmingReopen.set(null);
    this.loadClosures();
  }
}
