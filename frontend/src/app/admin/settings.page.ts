import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { PlanResponse } from '../core/api/models/plan-response';
import { TelegramStatusResponse } from '../core/api/models/telegram-status-response';
import { AdminAccountControllerService } from '../core/api/services/admin-account-controller.service';
import { AdminPlanControllerService } from '../core/api/services/admin-plan-controller.service';
import { AdminTelegramControllerService } from '../core/api/services/admin-telegram-controller.service';
import { errorCode } from '../core/api-errors';
import { ActionFailureComponent } from './action-failure.component';
import { ActionFailure, actionFailure } from './admin-errors';
import { embedSnippet } from './embed-snippet';
import { MeStore } from './me.store';
import { OPEN_WINDOW } from '../core/open-window';
import { IconComponent } from '../shared/icon.component';

export type PageStatus = 'loading' | 'ready' | 'notFound' | 'error';
type BookingMode = NonNullable<PlanResponse['bookingMode']>;
type Theme = NonNullable<PlanResponse['theme']>;

/** Valores por defecto del plano nuevo si la respuesta no los trae (como en el editor). */
const DEFAULT_MODE: BookingMode = 'FREE_CHOICE';
const DEFAULT_THEME: Theme = 'AZUL';
const DEFAULT_CANCELLATION_HOURS = 2;

/** El plazo es un `int` de Java con `@Min(0)`: sin tope propio más allá del tipo. */
const MAX_CANCELLATION_HOURS = 2_147_483_647;
const MAX_NAME_LENGTH = 120;

const MODES: readonly { value: BookingMode; label: string; help: string }[] = [
  {
    value: 'FREE_CHOICE',
    label: 'Elección libre',
    help: 'El cliente elige su mesa en el plano.',
  },
  {
    value: 'ASSIGNED',
    label: 'Mesa asignada',
    help: 'El cliente indica turno y personas; tú asignas la mesa desde Reservas.',
  },
];

const SAVE_FAILED = 'No se pudieron guardar los ajustes. Inténtalo de nuevo.';
/** El 400 `INVALID_REQUEST` de los ajustes: el texto general habla del enlace de un plano nuevo, que aquí no se toca. */
const INVALID_SETTINGS = 'Revisa el nombre y el plazo de cancelación.';
const DELETE_FAILED = 'No se pudo borrar el plano. Inténtalo de nuevo.';
const TELEGRAM_LINK_FAILED = 'No se pudo vincular Telegram. Inténtalo de nuevo.';
const TELEGRAM_UNLINK_FAILED = 'No se pudo desvincular Telegram. Inténtalo de nuevo.';

type CopyStatus = 'idle' | 'copied' | 'manual';

/**
 * `/panel/:slug/ajustes`: nombre, modo de reserva y plazo de cancelación; código para incrustar y enlace público;
 * Telegram (si el servidor lo tiene y no es la demo) y borrado del plano. Solo texto: el código para incrustar se
 * muestra en un `<textarea>`, nunca como HTML.
 */
@Component({
  selector: 'app-settings-page',
  imports: [ActionFailureComponent, IconComponent, RouterLink],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'rise-stagger' },
})
export class SettingsPage {
  protected readonly store = inject(MeStore);
  private readonly plansApi = inject(AdminPlanControllerService);
  private readonly accountApi = inject(AdminAccountControllerService);
  private readonly telegramApi = inject(AdminTelegramControllerService);
  private readonly router = inject(Router);
  private readonly openWindow = inject(OPEN_WINDOW);
  private readonly origin = inject(DOCUMENT).location.origin;
  /** Servidor sin esquema, para enseñar el enlace público: `localhost:4200/r/kafe`. */
  protected readonly publicHost = inject(DOCUMENT).location.host;

  /** Plano de la URL. Es una señal porque lo leen los `computed` (código para incrustar, botón de borrar). */
  protected readonly currentSlug = signal('');
  private get slug(): string {
    return this.currentSlug();
  }
  private loadRequest: Subscription | undefined;
  private telegramRequest: Subscription | undefined;

  protected readonly modes = MODES;
  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly snippetField = viewChild<ElementRef<HTMLTextAreaElement>>('snippetField');

  protected readonly status = signal<PageStatus>('loading');
  /** El plano tal como lo tiene el servidor. */
  protected readonly plan = signal<PlanResponse | null>(null);

  // Formulario de ajustes.
  protected readonly name = signal('');
  protected readonly mode = signal<BookingMode>(DEFAULT_MODE);
  protected readonly hours = signal(String(DEFAULT_CANCELLATION_HOURS));
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly failure = signal<ActionFailure | null>(null);
  /** El modo elegido no es el guardado: avisa de que solo vale para las reservas nuevas. */
  protected readonly modeChanged = computed(
    () => this.mode() !== (this.plan()?.bookingMode ?? DEFAULT_MODE),
  );

  // Incrustar y enlace público.
  protected readonly snippet = computed(() =>
    embedSnippet(this.origin, this.plan()?.slug ?? this.slug, this.plan()?.name ?? ''),
  );
  protected readonly copyStatus = signal<CopyStatus>('idle');
  protected readonly published = computed(() => this.plan()?.status === 'PUBLISHED');

  // Telegram: solo si el servidor lo tiene y no es la cuenta demo.
  private readonly telegramEligible = computed(
    () => this.store.status() === 'ready' && this.store.telegramAvailable() && !this.store.demo(),
  );
  protected readonly telegramVisible = computed(
    () => this.telegramEligible() && this.telegram()?.available !== false,
  );
  protected readonly telegram = signal<TelegramStatusResponse | null>(null);
  protected readonly telegramFailed = signal(false);
  protected readonly telegramBusy = signal(false);
  protected readonly telegramUrl = signal<string | null>(null);
  protected readonly telegramFailure = signal<ActionFailure | null>(null);
  protected readonly confirmingUnlink = signal(false);

  // Borrar el plano.
  protected readonly confirmSlug = signal('');
  protected readonly deleting = signal(false);
  protected readonly deleteFailure = signal<ActionFailure | null>(null);
  protected readonly canDelete = computed(
    () => this.slug !== '' && this.confirmSlug() === this.slug && !this.deleting(),
  );

  constructor() {
    // Cambiar de plano desde la cabecera reutiliza esta página: se recarga con cada slug, no solo con el primero.
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => this.load(params.get('slug') ?? ''));
    // El estado de Telegram se pide cuando ya se sabe que la sección se va a ver, no antes.
    effect(() => {
      if (this.telegramEligible()) {
        untracked(() => this.loadTelegram());
      }
    });
    this.store.refresh();
    inject(DestroyRef).onDestroy(() => {
      this.loadRequest?.unsubscribe();
      this.telegramRequest?.unsubscribe();
    });
  }

  protected load(slug: string = this.slug): void {
    this.currentSlug.set(slug);
    this.loadRequest?.unsubscribe();
    this.status.set('loading');
    this.plan.set(null);
    this.saving.set(false);
    this.saved.set(false);
    this.failure.set(null);
    this.copyStatus.set('idle');
    this.confirmSlug.set('');
    this.deleting.set(false);
    this.deleteFailure.set(null);

    this.loadRequest = this.plansApi.get({ slug }).subscribe({
      next: (plan) => {
        this.show(plan);
        this.status.set('ready');
      },
      error: (error: HttpErrorResponse) =>
        this.status.set(error.status === 404 ? 'notFound' : 'error'),
    });
  }

  /** El plano guardado pasa al formulario. */
  private show(plan: PlanResponse): void {
    this.plan.set(plan);
    this.name.set(plan.name ?? '');
    this.mode.set(plan.bookingMode ?? DEFAULT_MODE);
    this.hours.set(String(plan.cancellationDeadlineHours ?? DEFAULT_CANCELLATION_HOURS));
  }

  // --- Ajustes ---

  protected onName(event: Event): void {
    this.saved.set(false);
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected onMode(mode: BookingMode): void {
    this.saved.set(false);
    this.mode.set(mode);
  }

  protected onHours(event: Event): void {
    this.saved.set(false);
    this.hours.set((event.target as HTMLInputElement).value);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const plan = this.plan();
    if (this.saving() || !plan) {
      return;
    }
    const name = this.name().trim();
    const hours = this.hours().trim();
    if (!name) {
      this.failure.set({ message: 'Escribe el nombre del plano.', reservations: [] });
      return;
    }
    if (!/^\d+$/.test(hours) || Number(hours) > MAX_CANCELLATION_HOURS) {
      this.failure.set({
        message: 'Escribe el plazo de cancelación en horas: un número entero, 0 o más.',
        reservations: [],
      });
      return;
    }

    const slug = this.slug;
    this.saving.set(true);
    this.saved.set(false);
    this.failure.set(null);
    try {
      const updated = await firstValueFrom(
        this.plansApi.updateSettings({
          slug,
          body: {
            name,
            // El tema se reenvía tal como se cargó: el PATCH es completo y aquí no se toca.
            theme: plan.theme ?? DEFAULT_THEME,
            bookingMode: this.mode(),
            cancellationDeadlineHours: Number(hours),
          },
        }),
      );
      if (slug !== this.slug) {
        return;
      }
      this.show(updated);
      this.saved.set(true);
      // La cabecera del panel lee el nombre de MeStore.
      this.store.refresh();
    } catch (error) {
      if (slug === this.slug) {
        this.failure.set(
          error instanceof HttpErrorResponse && errorCode(error) === 'INVALID_REQUEST'
            ? { message: INVALID_SETTINGS, reservations: [] }
            : this.failureOf(error, SAVE_FAILED),
        );
      }
    } finally {
      if (slug === this.slug) {
        this.saving.set(false);
      }
    }
  }

  // --- Incrustar ---

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.snippet());
      this.copyStatus.set('copied');
    } catch {
      // Sin portapapeles (o sin permiso) se deja el código seleccionado para copiarlo a mano.
      this.snippetField()?.nativeElement.select();
      this.copyStatus.set('manual');
    }
  }

  // --- Telegram ---

  private loadTelegram(): void {
    this.telegramRequest?.unsubscribe();
    this.telegramFailed.set(false);
    this.telegramRequest = this.telegramApi.status().subscribe({
      next: (status) => this.telegram.set(status),
      error: () => this.telegramFailed.set(true),
    });
  }

  protected retryTelegram(): void {
    this.loadTelegram();
  }

  protected async linkTelegram(): Promise<void> {
    if (this.telegramBusy()) {
      return;
    }
    this.telegramBusy.set(true);
    this.telegramFailure.set(null);
    try {
      const { url } = await firstValueFrom(this.telegramApi.link());
      // Solo se abre un enlace https: lo que llega de la API no se abre a ciegas.
      if (!url?.startsWith('https://')) {
        this.telegramFailure.set({ message: TELEGRAM_LINK_FAILED, reservations: [] });
        return;
      }
      this.telegramUrl.set(url);
      // `window.open` llega después de una respuesta HTTP, ya no es un clic: si el navegador lo bloquea queda el enlace.
      this.openWindow(url);
    } catch (error) {
      this.telegramFailure.set(this.failureOf(error, TELEGRAM_LINK_FAILED));
    } finally {
      this.telegramBusy.set(false);
    }
  }

  protected askUnlink(): void {
    this.telegramFailure.set(null);
    this.confirmingUnlink.set(true);
  }

  protected keepTelegram(): void {
    this.confirmingUnlink.set(false);
  }

  protected async unlinkTelegram(): Promise<void> {
    if (this.telegramBusy()) {
      return;
    }
    this.telegramBusy.set(true);
    this.telegramFailure.set(null);
    try {
      await firstValueFrom(this.telegramApi.unlink());
      this.telegramUrl.set(null);
      this.loadTelegram();
    } catch (error) {
      this.telegramFailure.set(this.failureOf(error, TELEGRAM_UNLINK_FAILED));
    } finally {
      this.telegramBusy.set(false);
      this.confirmingUnlink.set(false);
    }
  }

  // --- Borrar el plano ---

  protected onConfirmSlug(event: Event): void {
    this.confirmSlug.set((event.target as HTMLInputElement).value);
  }

  protected async deletePlan(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canDelete()) {
      return;
    }
    const slug = this.slug;
    this.deleting.set(true);
    this.deleteFailure.set(null);
    try {
      await firstValueFrom(this.accountApi.deletePlan({ slug }));
    } catch (error) {
      if (error instanceof HttpErrorResponse && errorCode(error) === 'RESTAURANT_NOT_FOUND') {
        // Ya no existe (borrado desde otra pestaña): la cabecera y la lista de planos se ponen al día.
        this.store.refresh();
      }
      if (slug === this.slug) {
        // Se vacía el campo: tras cancelar las reservas hay que volver a escribir el enlace.
        this.confirmSlug.set('');
        this.deleteFailure.set(this.failureOf(error, DELETE_FAILED));
        this.deleting.set(false);
      }
      return;
    }
    // La cabecera y la lista de planos salen de MeStore.
    this.store.refresh();
    // Si mientras tanto el dueño pasó a otro plano, se queda en él: solo se actualizan sus datos.
    if (slug === this.slug) {
      await this.router.navigate(['/panel']);
    }
  }

  private failureOf(error: unknown, fallback: string): ActionFailure {
    return error instanceof HttpErrorResponse
      ? actionFailure(error, fallback)
      : { message: fallback, reservations: [] };
  }
}
