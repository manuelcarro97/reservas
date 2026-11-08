import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ApiConfiguration } from '../../core/api/api-configuration';
import { FeedEvent } from '../../core/api/models/feed-event';
import { AuthUser } from '../../core/auth/auth-sdk';
import { AuthService } from '../../core/auth/auth.service';
import { Chime } from './chime.service';
import { BROWSER_NOTIFICATION, FeedService, TAB_IN_VIEW } from './feed.service';

const START = new Date('2026-11-09T10:00:00.000Z');
const OWNER: AuthUser = { uid: 'uid-1', email: 'dueno@example.com' };
const POLL_MS = 30_000;
const MUTED_KEY = 'reservas.muted';

function event(id: number, kind = 'NEW', text = `Nueva reserva ${id}`): FeedEvent {
  return { kind, reservationId: id, restaurantSlug: 'kafe', restaurantName: 'Kafé', text };
}

/** Doble de `Notification`: anota las que se crean y concede el permiso al pedirlo. */
class FakeNotification {
  static permission: NotificationPermission = 'default';
  static readonly created: { title: string; options?: NotificationOptions }[] = [];
  static requestPermission = vi.fn((): Promise<NotificationPermission> => {
    FakeNotification.permission = 'granted';
    return Promise.resolve('granted');
  });

  constructor(title: string, options?: NotificationOptions) {
    FakeNotification.created.push({ title, options });
  }
}

describe('FeedService', () => {
  let http: HttpTestingController;
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let chime: { play: ReturnType<typeof vi.fn>; unlock: ReturnType<typeof vi.fn> };
  let title: Title;
  let feed: FeedService;
  /** Si el dueño tiene el panel a la vista (pestaña visible y con foco). Por defecto no: así avisa todo. */
  let inView: boolean;

  beforeEach(() => {
    inView = false;
    vi.useFakeTimers();
    vi.setSystemTime(START);
    localStorage.clear();
    FakeNotification.permission = 'default';
    FakeNotification.created.length = 0;
    FakeNotification.requestPermission.mockClear();
    document.title = 'Reservas';
    user = signal<AuthUser | null>(OWNER);
    chime = { play: vi.fn(), unlock: vi.fn() };
    configure(FakeNotification);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** `notification` es lo que el navegador ofrece como `Notification` (`null` si no tiene). */
  function configure(notification: unknown): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { user } },
        { provide: Chime, useValue: chime },
        { provide: BROWSER_NOTIFICATION, useValue: notification },
        { provide: TAB_IN_VIEW, useValue: () => inView },
        FeedService,
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
    title = TestBed.inject(Title);
  }

  /** Crea el servicio y deja que arranque (el efecto que mira la sesión corre en el primer `tick`). */
  function startRaw(): void {
    feed = TestBed.inject(FeedService);
    TestBed.tick();
  }

  /** Arranca y responde la consulta de referencia del primer instante (sin eventos); su `now` es el primer `since`. */
  function start(referenceNow = START.toISOString()): void {
    startRaw();
    expectFeed().flush({ events: [], now: referenceNow });
  }

  function expectFeed(): TestRequest {
    return http.expectOne((request) => request.url.endsWith('/api/v1/admin/feed'));
  }

  function expectNoFeed(): void {
    http.expectNone((request) => request.url.endsWith('/api/v1/admin/feed'));
  }

  /** Deja pasar el intervalo, comprueba que sale una consulta y la responde. */
  function poll(events: FeedEvent[], now = new Date(Date.now() + POLL_MS).toISOString()): string {
    vi.advanceTimersByTime(POLL_MS);
    const request = expectFeed();
    const since = request.request.params.get('since') ?? '';
    request.flush({ events, now });
    return since;
  }

  it('pollsEvery30Seconds', () => {
    startRaw();
    // La consulta de referencia sale al arrancar; las demás, cada 30 s desde que responde la anterior.
    expectFeed().flush({ events: [], now: new Date().toISOString() });

    vi.advanceTimersByTime(POLL_MS - 1);
    expectNoFeed();
    vi.advanceTimersByTime(1);
    const first = expectFeed();
    expect(first.request.method).toBe('GET');

    // Mientras la consulta no responde no sale otra, por lenta que sea.
    vi.advanceTimersByTime(POLL_MS * 3);
    expectNoFeed();

    first.flush({ events: [], now: new Date().toISOString() });
    vi.advanceTimersByTime(POLL_MS - 1);
    expectNoFeed();
    vi.advanceTimersByTime(1);
    expectFeed().flush({ events: [], now: new Date().toISOString() });
  });

  it('usesServerNowAsNextSince', () => {
    start('2026-11-09T10:00:00.250Z');

    // Siempre el `now` del servidor, empezando por el de la consulta de referencia.
    expect(poll([], '2026-11-09T10:00:30.500Z')).toBe('2026-11-09T10:00:00.250Z');
    expect(poll([], '2026-11-09T10:01:00.250Z')).toBe('2026-11-09T10:00:30.500Z');
    expect(poll([])).toBe('2026-11-09T10:01:00.250Z');
  });

  it('retriesWithTheSameSinceAfterAFailureWithoutAToast', () => {
    start();
    vi.advanceTimersByTime(POLL_MS);
    expectFeed().flush(null, { status: 500, statusText: 'Server Error' });

    expect(feed.toasts()).toEqual([]);
    expect(poll([event(1)])).toBe(START.toISOString());
    expect(feed.toasts()).toHaveLength(1);
  });

  it('keepsTheSinceWhenTheResponseHasNoNow', () => {
    start('2026-11-09T10:00:05.000Z');
    vi.advanceTimersByTime(POLL_MS);
    expectFeed().flush({ events: [] });

    expect(poll([])).toBe('2026-11-09T10:00:05.000Z');
  });

  it('referenceQueryRunsAtStartWithTheClientTimeAndShowsNothing', () => {
    const subscriber = vi.fn();
    FakeNotification.permission = 'granted';
    startRaw();
    feed.events.subscribe(subscriber);

    const reference = expectFeed();
    expect(reference.request.params.get('since')).toBe(START.toISOString());
    reference.flush({ events: [event(1)], now: '2026-11-09T10:00:00.400Z' });

    // Lo que ya existía al abrir el panel no es un aviso: ni mensaje, ni contador, ni sonido, ni evento.
    expect(feed.toasts()).toEqual([]);
    expect(feed.pendingCount()).toBe(0);
    expect(chime.play).not.toHaveBeenCalled();
    expect(FakeNotification.created).toEqual([]);
    expect(subscriber).not.toHaveBeenCalled();

    // Queda marcado como visto: el solape del servidor no lo avisa después. El `since` real es el `now` de la referencia.
    expect(poll([event(1)])).toBe('2026-11-09T10:00:00.400Z');
    expect(feed.toasts()).toEqual([]);
    poll([event(2)]);
    expect(feed.toasts().map((toast) => toast.text)).toEqual(['Nueva reserva 2']);
  });

  it('aFailedReferenceQueryIsRetriedAsAReferenceAfter30Seconds', () => {
    startRaw();
    expectFeed().flush(null, { status: 503, statusText: 'Unavailable' });
    expectNoFeed();

    // A los 30 s se reintenta con el mismo `since`, y lo que traiga sigue sin ser un aviso.
    expect(poll([event(1)], '2026-11-09T10:00:31.000Z')).toBe(START.toISOString());
    expect(feed.toasts()).toEqual([]);
    expect(feed.pendingCount()).toBe(0);

    expect(poll([event(2)])).toBe('2026-11-09T10:00:31.000Z');
    expect(feed.toasts().map((toast) => toast.text)).toEqual(['Nueva reserva 2']);
  });

  it('aClockAheadOfTheServerDoesNotHideReservations', () => {
    // El reloj del navegador va 90 s adelantado: la referencia devuelve la hora del servidor, que es la que vale.
    start('2026-11-09T09:58:30.000Z');

    expect(poll([event(7)])).toBe('2026-11-09T09:58:30.000Z');
    expect(feed.toasts()).toHaveLength(1);
  });

  it('doesNotPollWithoutASession', () => {
    user.set(null);
    startRaw();

    vi.advanceTimersByTime(POLL_MS * 2);

    expectNoFeed();
  });

  it('startsWhenTheSessionArrives', () => {
    user.set(null);
    startRaw();

    user.set(OWNER);
    TestBed.tick();

    expectFeed().flush({ events: [], now: new Date().toISOString() });
  });

  it('titleShowsUnseenCount', () => {
    start();

    poll([event(1), event(2)]);
    expect(feed.pendingCount()).toBe(2);
    expect(title.getTitle()).toBe('(2) Reservas');

    poll([event(3)]);
    expect(feed.pendingCount()).toBe(3);
    expect(title.getTitle()).toBe('(3) Reservas');
  });

  it('leavesTheTitleAloneWhileThereIsNothingToShow', () => {
    document.title = 'Cuenta · Reservas';
    start();

    poll([]);
    window.dispatchEvent(new Event('focus'));

    expect(title.getTitle()).toBe('Cuenta · Reservas');
  });

  it('focusResetsTitle', () => {
    start();
    poll([event(1), event(2)]);

    window.dispatchEvent(new Event('focus'));

    expect(feed.pendingCount()).toBe(0);
    expect(title.getTitle()).toBe('Reservas');
    // Un aviso posterior vuelve a contar desde uno.
    poll([event(3)]);
    expect(title.getTitle()).toBe('(1) Reservas');
  });

  it('keepsPollingWhileTheTabIsInTheBackground', () => {
    start();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      poll([event(1)]);
      poll([event(2)]);
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }

    expect(feed.pendingCount()).toBe(2);
  });

  it('playsTheChimeOncePerBatch', () => {
    start();

    poll([event(1), event(2)]);

    expect(chime.play).toHaveBeenCalledTimes(1);
    poll([]);
    expect(chime.play).toHaveBeenCalledTimes(1);
  });

  it('mutedDoesNotPlaySound', () => {
    localStorage.setItem(MUTED_KEY, '1');
    start();

    poll([event(1)]);

    expect(feed.muted()).toBe(true);
    expect(chime.play).not.toHaveBeenCalled();
    // Los avisos visuales siguen.
    expect(feed.toasts()).toHaveLength(1);
  });

  it('muteChoiceIsRemembered', () => {
    start();

    feed.toggleMute();
    expect(feed.muted()).toBe(true);
    expect(localStorage.getItem(MUTED_KEY)).toBe('1');

    feed.toggleMute();
    expect(feed.muted()).toBe(false);
    expect(localStorage.getItem(MUTED_KEY)).toBe('0');
  });

  it('brokenStorageMeansNotMutedAndNeverThrows', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denegado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denegado');
    });
    start();
    expect(feed.muted()).toBe(false);

    expect(() => feed.toggleMute()).not.toThrow();
    expect(feed.muted()).toBe(true);
    poll([event(1)]);
    expect(chime.play).not.toHaveBeenCalled();
  });

  it('toastUsesEventText', () => {
    start();

    poll([event(7, 'NEW', 'Nueva reserva: Ana, 4 personas, cena del viernes 7, mesa 3')]);

    expect(feed.toasts().map((toast) => toast.text)).toEqual([
      'Nueva reserva: Ana, 4 personas, cena del viernes 7, mesa 3',
    ]);
    expect(feed.toasts()[0].slug).toBe('kafe');
  });

  it('duplicateEventsShownOnce', () => {
    const subscriber = vi.fn();
    start();
    feed.events.subscribe(subscriber);

    // Repetida en la misma respuesta y de nuevo en la siguiente (el servidor solapa las ventanas).
    poll([event(1), event(1)]);
    expect(feed.toasts()).toHaveLength(1);
    // Entre consulta y consulta el mensaje ya se ha quitado solo: la repetida no vuelve a aparecer.
    poll([event(1)]);

    expect(feed.toasts()).toEqual([]);
    expect(feed.pendingCount()).toBe(1);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(chime.play).toHaveBeenCalledTimes(1);
  });

  it('theSameReservationShowsItsNewAndItsCancellation', () => {
    start();

    poll([event(1, 'NEW'), event(1, 'CANCELLED_BY_CUSTOMER', 'Cancelada: Ana')]);

    expect(feed.toasts().map((toast) => toast.text)).toEqual(['Nueva reserva 1', 'Cancelada: Ana']);
  });

  it('remembersOnlyTheLast500EventsToForget', () => {
    start();
    const many = Array.from({ length: 501 }, (_, index) => event(index + 1));
    poll(many);
    const subscriber = vi.fn();
    feed.events.subscribe(subscriber);

    // El 1 ya salió del conjunto acotado; el 501 sigue dentro.
    poll([event(501), event(1)]);

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ reservationId: 1 }));
  });

  it('showsAtMostThreeToastsAndDropsTheOldest', () => {
    start();

    poll([event(1), event(2), event(3), event(4)]);

    expect(feed.toasts().map((toast) => toast.text)).toEqual([
      'Nueva reserva 2',
      'Nueva reserva 3',
      'Nueva reserva 4',
    ]);
  });

  it('toastsDisappearAfterEightSeconds', () => {
    start();
    poll([event(1)]);

    vi.advanceTimersByTime(7_999);
    expect(feed.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(feed.toasts()).toHaveLength(0);
  });

  it('dismissRemovesOneToast', () => {
    start();
    poll([event(1), event(2)]);

    feed.dismiss(feed.toasts()[0].id);

    expect(feed.toasts().map((toast) => toast.text)).toEqual(['Nueva reserva 2']);
  });

  it('createsABrowserNotificationPerEventOnlyWithPermission', () => {
    start();
    poll([event(1)]);
    expect(FakeNotification.created).toEqual([]);

    FakeNotification.permission = 'granted';
    poll([event(2), event(3)]);

    expect(FakeNotification.created.map((created) => created.options?.body)).toEqual([
      'Nueva reserva 2',
      'Nueva reserva 3',
    ]);
  });

  it('aFailingBrowserNotificationDoesNotBreakThePolling', () => {
    class Broken {
      static permission: NotificationPermission = 'granted';
      constructor() {
        throw new TypeError('Illegal constructor');
      }
    }
    configure(Broken);
    start();

    poll([event(1)]);
    expect(feed.toasts()).toHaveLength(1);
    poll([event(2)]);

    expect(feed.toasts().map((toast) => toast.text)).toEqual(['Nueva reserva 2']);
  });

  it('neverAsksForPermissionOnItsOwn', () => {
    start();
    poll([event(1)]);

    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(feed.canAskPermission()).toBe(true);
  });

  it('askPermissionUpdatesTheState', async () => {
    start();

    await feed.askPermission();

    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(feed.canAskPermission()).toBe(false);
  });

  it('cannotAskWhenTheBrowserHasNoNotifications', () => {
    configure(null);
    start();

    expect(feed.canAskPermission()).toBe(false);
  });

  it('stopsOnSignOut', () => {
    start();
    poll([event(1)]);
    vi.advanceTimersByTime(POLL_MS);
    const inFlight = expectFeed();

    user.set(null);
    TestBed.tick();

    expect(inFlight.cancelled).toBe(true);
    vi.advanceTimersByTime(POLL_MS * 3);
    expectNoFeed();
    // No quedan avisos del dueño anterior ni su contador en la pestaña.
    expect(feed.toasts()).toEqual([]);
    expect(feed.pendingCount()).toBe(0);
    expect(title.getTitle()).toBe('Reservas');
  });

  it('anotherOwnerStartsFromScratch', () => {
    start();
    poll([event(1)]);
    user.set(null);
    TestBed.tick();

    vi.setSystemTime(new Date('2026-11-09T11:00:00.000Z'));
    user.set({ uid: 'uid-2', email: 'otro@example.com' });
    TestBed.tick();
    // La referencia vuelve a salir con la hora actual del navegador.
    const reference = expectFeed();
    expect(reference.request.params.get('since')).toBe('2026-11-09T11:00:00.000Z');
    reference.flush({ events: [], now: '2026-11-09T10:59:59.000Z' });

    // Su `since` es el `now` del servidor y la reserva 1 ya no cuenta como vista.
    expect(poll([event(1)])).toBe('2026-11-09T10:59:59.000Z');
    expect(feed.pendingCount()).toBe(1);
  });

  it('switchingDirectlyFromOneOwnerToAnotherRestartsASingleLoopFromScratch', () => {
    start();
    poll([event(1)]);
    expect(feed.toasts()).toHaveLength(1);
    expect(feed.pendingCount()).toBe(1);

    // A→B sin pasar por `null`.
    user.set({ uid: 'uid-2', email: 'otro@example.com' });
    TestBed.tick();
    expect(feed.toasts()).toEqual([]);
    expect(feed.pendingCount()).toBe(0);
    expect(title.getTitle()).toBe('Reservas');
    expectFeed().flush({ events: [], now: '2026-11-09T10:00:31.000Z' });

    // Un solo bucle: cada intervalo sale una consulta, no dos.
    poll([event(1)]);
    expect(feed.pendingCount()).toBe(1);
    poll([]);
    poll([]);
  });

  it('afterSignOutFocusAndGesturesDoNothing', () => {
    start();
    poll([event(1)]);
    user.set(null);
    TestBed.tick();
    document.title = 'Otra página';

    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new Event('keydown'));

    expect(chime.unlock).not.toHaveBeenCalled();
    expect(title.getTitle()).toBe('Otra página');
  });

  describe('whenThePanelIsInView', () => {
    it('showsTheToastButNoCounterSoundOrBrowserNotification', () => {
      const subscriber = vi.fn();
      FakeNotification.permission = 'granted';
      inView = true;
      start();
      feed.events.subscribe(subscriber);

      poll([event(1)]);

      expect(feed.toasts().map((toast) => toast.text)).toEqual(['Nueva reserva 1']);
      expect(feed.pendingCount()).toBe(0);
      expect(title.getTitle()).toBe('Reservas');
      expect(chime.play).not.toHaveBeenCalled();
      expect(FakeNotification.created).toEqual([]);
      // La lista de reservas abierta se recarga igualmente.
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('aTabOutOfViewGetsEverything', () => {
      const subscriber = vi.fn();
      FakeNotification.permission = 'granted';
      inView = false;
      start();
      feed.events.subscribe(subscriber);

      poll([event(1)]);

      expect(feed.toasts()).toHaveLength(1);
      expect(feed.pendingCount()).toBe(1);
      expect(title.getTitle()).toBe('(1) Reservas');
      expect(chime.play).toHaveBeenCalledTimes(1);
      expect(FakeNotification.created).toHaveLength(1);
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('theChoiceIsMadeForEachBatch', () => {
      start();

      inView = true;
      poll([event(1)]);
      inView = false;
      poll([event(2)]);

      expect(feed.pendingCount()).toBe(1);
      expect(chime.play).toHaveBeenCalledTimes(1);
    });
  });

  it('stopsWhenItsOwnerIsDestroyed', () => {
    start();
    vi.advanceTimersByTime(POLL_MS);
    const inFlight = expectFeed();

    TestBed.resetTestingModule();

    expect(inFlight.cancelled).toBe(true);
    // El temporizador de la siguiente consulta tampoco queda vivo.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('unlocksTheChimeOnTheFirstGesture', () => {
    start();
    expect(chime.unlock).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('pointerdown'));

    expect(chime.unlock).toHaveBeenCalledTimes(1);
  });
});

describe('TAB_IN_VIEW', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  function inView(visibility: DocumentVisibilityState, focused: boolean): boolean {
    Object.defineProperty(document, 'visibilityState', { value: visibility, configurable: true });
    vi.spyOn(document, 'hasFocus').mockReturnValue(focused);
    return TestBed.inject(TAB_IN_VIEW)();
  }

  it('isInViewOnlyWhenTheTabIsVisibleAndFocused', () => {
    expect(inView('visible', true)).toBe(true);
    expect(inView('visible', false)).toBe(false);
    expect(inView('hidden', true)).toBe(false);
    expect(inView('hidden', false)).toBe(false);
  });
});
