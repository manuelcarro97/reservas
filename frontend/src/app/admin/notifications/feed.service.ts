import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  InjectionToken,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Observable, Subject, Subscription } from 'rxjs';
import { FeedEvent } from '../../core/api/models/feed-event';
import { AdminFeedControllerService } from '../../core/api/services/admin-feed-controller.service';
import { AuthService } from '../../core/auth/auth.service';
import { NOW } from '../../public/booking.store';
import { Chime } from './chime.service';

/** Cada cuánto se consulta `GET /admin/feed` (desde el fin de la respuesta anterior, no desde su inicio). */
const POLL_MS = 30_000;
const MAX_TOASTS = 3;
const TOAST_MS = 8_000;
/** Eventos ya mostrados que se recuerdan para no repetirlos: el servidor solapa las ventanas de consulta. */
const MAX_REMEMBERED = 500;
const PAGE_TITLE = 'Reservas';
const MUTED_KEY = 'reservas.muted';
/** Gestos que el navegador acepta para desbloquear el audio (`pointerup` es el de los toques). */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'keydown'] as const;

/** `Notification` del navegador, o `null` si no la tiene. Se inyecta para poder simularla en los tests. */
export const BROWSER_NOTIFICATION = new InjectionToken<typeof Notification | null>(
  'BROWSER_NOTIFICATION',
  {
    providedIn: 'root',
    factory: () => (typeof Notification === 'undefined' ? null : Notification),
  },
);

/**
 * El dueño tiene el panel delante: pestaña visible y con foco. Entonces basta el mensaje emergente; el contador del
 * título, el sonido y la notificación del navegador son para cuando no está mirando. Se inyecta para simularlo.
 */
export const TAB_IN_VIEW = new InjectionToken<() => boolean>('TAB_IN_VIEW', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.visibilityState === 'visible' && document.hasFocus();
  },
});

/** Mensaje emergente: `text` lo formatea el backend; `slug` es el plano al que lleva al hacer clic. */
export interface FeedToast {
  id: number;
  text: string;
  slug: string | null;
}

function eventKey(event: FeedEvent): string {
  return `${event.reservationId}:${event.kind}`;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    // Almacenamiento bloqueado (modo privado, política del navegador): no está silenciado.
    return false;
  }
}

/**
 * Avisos del panel: mientras haya sesión consulta `GET /admin/feed` cada 30 s y, por cada reserva nueva o
 * cancelación del cliente, avisa con un mensaje emergente, el título de la pestaña, un sonido (si no se silencia) y,
 * si el dueño lo permitió, una notificación del navegador. Lo provee `AdminShellComponent`, no la raíz: vive lo que
 * el panel y para al cerrar sesión o al salir de él.
 *
 * Se encadena un `setTimeout` tras cada respuesta (no un `setInterval`) para que una petición lenta no se solape con
 * la siguiente. Un fallo se reintenta a los 30 s con el mismo `since` y sin avisar. Sigue consultando con la pestaña
 * en segundo plano, que es cuando más falta hace.
 */
@Injectable()
export class FeedService {
  private readonly api = inject(AdminFeedControllerService);
  private readonly auth = inject(AuthService);
  private readonly chime = inject(Chime);
  private readonly pageTitle = inject(Title);
  private readonly now = inject(NOW);
  private readonly notification = inject(BROWSER_NOTIFICATION);
  private readonly document = inject(DOCUMENT);
  private readonly tabInView = inject(TAB_IN_VIEW);

  private readonly unseen = signal(0);
  private readonly toastList = signal<readonly FeedToast[]>([]);
  private readonly permission = signal(this.notification?.permission ?? null);
  private readonly newEvents = new Subject<FeedEvent>();

  private timer: ReturnType<typeof setTimeout> | undefined;
  private request: Subscription | undefined;
  private since = '';
  /** Ya respondió la consulta de referencia del arranque: desde entonces lo que llega son avisos. */
  private referenced = false;
  private titleChanged = false;
  private nextToastId = 1;
  private readonly remembered = new Set<string>();
  private readonly toastTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private removeListeners: () => void = () => undefined;

  /** Avisos que el dueño aún no ha visto: el mismo N del título de la pestaña. Vuelve a 0 al enfocarla. */
  readonly pendingCount = this.unseen.asReadonly();
  readonly toasts = this.toastList.asReadonly();
  readonly muted = signal(readMuted());
  /** El navegador tiene notificaciones y el dueño aún no ha decidido: toca ofrecer el botón de activarlas. */
  readonly canAskPermission = computed(() => this.permission() === 'default');
  /** Eventos nuevos, ya sin repetidos. Lo usa la lista de reservas para recargarse sin acoplarse a los mensajes. */
  readonly events: Observable<FeedEvent> = this.newEvents.asObservable();

  constructor() {
    // Solo cuenta quién es, no su email ni su token: renovarlos no debe reiniciar la consulta.
    const owner = computed(() => this.auth.user()?.uid ?? null);
    effect(() => {
      const uid = owner();
      untracked(() => {
        this.stop();
        if (uid !== null) {
          this.start();
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  toggleMute(): void {
    const muted = !this.muted();
    this.muted.set(muted);
    try {
      localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    } catch {
      // No se pudo recordar: vale para esta sesión.
    }
  }

  /** Pide permiso para las notificaciones del navegador. Solo debe llamarse desde un clic del dueño. */
  async askPermission(): Promise<void> {
    if (!this.notification) {
      return;
    }
    try {
      this.permission.set(await this.notification.requestPermission());
    } catch {
      this.permission.set(this.notification.permission);
    }
  }

  dismiss(id: number): void {
    clearTimeout(this.toastTimers.get(id));
    this.toastTimers.delete(id);
    this.toastList.update((list) => list.filter((toast) => toast.id !== id));
  }

  /** El dueño vuelve a mirar la pestaña: los avisos pasan a vistos y el título se restablece. */
  seen(): void {
    this.unseen.set(0);
    if (this.titleChanged) {
      this.pageTitle.setTitle(PAGE_TITLE);
      this.titleChanged = false;
    }
  }

  /**
   * La primera consulta es de referencia y sale al instante: con `since` = hora del navegador, que puede ir
   * adelantada, solo sirve para conocer la hora del servidor. Sus eventos no se avisan (ya existían al abrir el
   * panel) y su `now` es el primer `since` real; así un reloj adelantado no esconde reservas.
   */
  private start(): void {
    this.since = this.now().toISOString();
    this.referenced = false;
    this.listen();
    this.poll();
  }

  /** Para la consulta y deja el servicio como nuevo: el siguiente dueño no hereda avisos ni contador. */
  private stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.request?.unsubscribe();
    this.request = undefined;
    this.removeListeners();
    this.removeListeners = () => undefined;
    this.toastTimers.forEach((timer) => clearTimeout(timer));
    this.toastTimers.clear();
    this.toastList.set([]);
    this.remembered.clear();
    this.seen();
  }

  private schedule(): void {
    this.timer = setTimeout(() => this.poll(), POLL_MS);
  }

  private poll(): void {
    this.timer = undefined;
    this.request = this.api.feed({ since: this.since }).subscribe({
      next: (feed) => {
        try {
          this.since = feed.now ?? this.since;
          if (this.referenced) {
            this.receive(feed.events ?? []);
          } else {
            // Referencia: se marcan como vistos para que el solape del servidor no los avise después.
            (feed.events ?? []).forEach((event) => this.remember(event));
            this.referenced = true;
          }
        } finally {
          this.schedule();
        }
      },
      // Sin aviso de error: el dueño no puede hacer nada y la consulta siguiente suele funcionar.
      error: () => this.schedule(),
    });
  }

  private receive(events: FeedEvent[]): void {
    const fresh = events.filter((event) => this.remember(event));
    if (fresh.length === 0) {
      return;
    }
    // Con el panel delante basta el mensaje; el resto es para quien no está mirando.
    const inView = this.tabInView();
    if (!inView) {
      this.unseen.update((count) => count + fresh.length);
      this.pageTitle.setTitle(`(${this.unseen()}) ${PAGE_TITLE}`);
      this.titleChanged = true;
    }
    for (const event of fresh) {
      this.addToast(event);
      if (!inView) {
        this.browserNotification(event);
      }
      // La lista de reservas abierta se recarga también con el panel a la vista.
      this.newEvents.next(event);
    }
    if (!inView && !this.muted()) {
      this.chime.play();
    }
  }

  /** `true` si el evento es nuevo. El conjunto está acotado: al pasarse se olvida el más antiguo. */
  private remember(event: FeedEvent): boolean {
    const key = eventKey(event);
    if (this.remembered.has(key)) {
      return false;
    }
    this.remembered.add(key);
    if (this.remembered.size > MAX_REMEMBERED) {
      this.remembered.delete(this.remembered.values().next().value as string);
    }
    return true;
  }

  private addToast(event: FeedEvent): void {
    if (!event.text) {
      return;
    }
    const id = this.nextToastId++;
    this.toastList.update((list) =>
      [...list, { id, text: event.text ?? '', slug: event.restaurantSlug ?? null }].slice(
        -MAX_TOASTS,
      ),
    );
    this.toastTimers.set(
      id,
      setTimeout(() => this.dismiss(id), TOAST_MS),
    );
    // Los que se salen por arriba del máximo ya no necesitan su temporizador.
    const visible = new Set(this.toastList().map((toast) => toast.id));
    for (const [toastId, timer] of this.toastTimers) {
      if (!visible.has(toastId)) {
        clearTimeout(timer);
        this.toastTimers.delete(toastId);
      }
    }
  }

  private browserNotification(event: FeedEvent): void {
    // Se mira el permiso en vivo: el dueño pudo cambiarlo desde los ajustes del navegador.
    if (!this.notification || this.notification.permission !== 'granted' || !event.text) {
      return;
    }
    try {
      void new this.notification(event.restaurantName ?? PAGE_TITLE, {
        body: event.text,
        tag: eventKey(event),
      });
    } catch {
      // Algunos navegadores de móvil no dejan crear notificaciones desde la página.
    }
  }

  /** Enfocar la pestaña marca los avisos como vistos; el primer gesto del dueño desbloquea el sonido. */
  private listen(): void {
    const view = this.document.defaultView;
    if (!view) {
      return;
    }
    const onFocus = () => this.seen();
    const onVisibility = () => {
      if (this.document.visibilityState === 'visible') {
        this.seen();
      }
    };
    const onGesture = () => this.chime.unlock();
    view.addEventListener('focus', onFocus);
    this.document.addEventListener('visibilitychange', onVisibility);
    for (const name of UNLOCK_EVENTS) {
      this.document.addEventListener(name, onGesture, { capture: true, passive: true });
    }
    this.removeListeners = () => {
      view.removeEventListener('focus', onFocus);
      this.document.removeEventListener('visibilitychange', onVisibility);
      for (const name of UNLOCK_EVENTS) {
        this.document.removeEventListener(name, onGesture, { capture: true });
      }
    };
  }
}
