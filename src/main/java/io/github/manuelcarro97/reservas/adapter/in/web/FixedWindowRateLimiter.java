package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Límite de peticiones por clave con ventana fija en memoria: la ventana de una clave empieza en su primera petición y
 * dura {@code window}; dentro de ella caben {@code limit} peticiones. Sin dependencias y por proceso: con varias
 * instancias cada una cuenta aparte.
 * <p>
 * Seguro entre hilos: cada clave se actualiza de forma atómica con {@code compute}, y la purga de ventanas caducadas
 * solo quita una entrada si sigue siendo la misma que vio caducada, así que nunca borra una ventana viva.
 */
public class FixedWindowRateLimiter {

	/** Por encima de este número de claves se purgan las ventanas caducadas, a lo sumo una vez por ventana. */
	static final int PURGE_THRESHOLD = 10_000;

	/**
	 * Tope duro de claves vivas: unos 50 000 (una clave y su ventana pesan unos cientos de bytes) son pocos MB, que caben
	 * en el hosting gratuito. Con ese número de claves vivas, una clave nueva se rechaza.
	 */
	static final int MAX_KEYS = 50_000;

	private static final long FORCED_PURGE_SPACING_MILLIS = 1_000;

	private record Window(long startMillis, int count) {
	}

	private final Clock clock;
	private final int limit;
	private final long windowMillis;
	private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
	private final int maxKeys;
	private final AtomicLong nextPurgeAtMillis = new AtomicLong();
	private final AtomicLong nextForcedPurgeAtMillis = new AtomicLong();

	public FixedWindowRateLimiter(Clock clock, int limit, Duration window) {
		this(clock, limit, window, MAX_KEYS);
	}

	FixedWindowRateLimiter(Clock clock, int limit, Duration window, int maxKeys) {
		this.clock = clock;
		this.limit = limit;
		this.windowMillis = window.toMillis();
		this.maxKeys = maxKeys;
	}

	/**
	 * Cuenta una petición de {@code key} y dice si cabe en su ventana; si no cabe, no la cuenta. Con el limitador lleno
	 * de ventanas vivas, una clave nueva tampoco cabe (ver {@link #MAX_KEYS}).
	 */
	public boolean tryAcquire(String key) {
		long now = clock.millis();
		purgeIfNeeded(now);
		if (isFullFor(key, now)) {
			return false;
		}
		boolean[] accepted = { false };
		windows.compute(key, (ignored, window) -> {
			if (window == null || isExpired(window, now)) {
				accepted[0] = true;
				return new Window(now, 1);
			}
			if (window.count() < limit) {
				accepted[0] = true;
				return new Window(window.startMillis(), window.count() + 1);
			}
			return window;
		});
		return accepted[0];
	}

	/**
	 * Devuelve la unidad que contó un {@link #tryAcquire} aceptado, para una petición que al final no debe gastar cupo.
	 * Si era la única de la ventana, la clave se olvida y deja de ocupar sitio. Si la ventana ya caducó, también se
	 * olvida. No distingue una ventana nueva abierta entre el acquire y el release (solo ocurre al rotar la ventana
	 * justo en ese intervalo y a lo sumo da una petición de más).
	 */
	public void release(String key) {
		long now = clock.millis();
		windows.computeIfPresent(key, (ignored, window) -> {
			if (isExpired(window, now) || window.count() <= 1) {
				return null;
			}
			return new Window(window.startMillis(), window.count() - 1);
		});
	}

	/**
	 * Segundos hasta que rota la ventana de {@code key}, redondeados hacia arriba y nunca menos de 1. Una clave que el
	 * tope dejó fuera no tiene ventana: se le dice que espere una ventana entera, lo que tarda en caducar con certeza
	 * cualquiera de las que lo llenan.
	 */
	public long retryAfterSeconds(String key) {
		Window window = windows.get(key);
		if (window == null) {
			return windows.size() >= maxKeys ? Math.max(1, Math.ceilDiv(windowMillis, 1000)) : 1;
		}
		long remainingMillis = window.startMillis() + windowMillis - clock.millis();
		return Math.max(1, Math.ceilDiv(remainingMillis, 1000));
	}

	/** Olvida todas las claves. Para tests: el reloj fijo de la suite nunca rota la ventana. */
	public void clear() {
		windows.clear();
		nextForcedPurgeAtMillis.set(0);
	}

	int trackedKeys() {
		return windows.size();
	}

	private boolean isExpired(Window window, long now) {
		return now >= window.startMillis() + windowMillis;
	}

	private void purgeIfNeeded(long now) {
		if (windows.size() <= PURGE_THRESHOLD) {
			return;
		}
		long due = nextPurgeAtMillis.get();
		if (now >= due && nextPurgeAtMillis.compareAndSet(due, now + windowMillis)) {
			purgeExpired(now);
		}
	}

	/**
	 * Lleno y {@code key} sin ventana propia: se purgan las caducadas ya (como mucho una vez por segundo, para que una
	 * ráfaga de claves nuevas no recorra el mapa entero en cada petición) y, si sigue lleno, no hay sitio. Falla
	 * cerrado a propósito: aceptar sin contar dejaría al atacante que llena el limitador sin límite alguno. El coste es
	 * que, mientras dura el ataque, los clientes nuevos reciben 429 hasta que caduquen ventanas; los que ya están
	 * contados no se ven afectados. El tope es blando: hilos concurrentes pueden pasarlo por unas pocas claves.
	 */
	private boolean isFullFor(String key, long now) {
		if (windows.size() < maxKeys || windows.containsKey(key)) {
			return false;
		}
		long due = nextForcedPurgeAtMillis.get();
		if (now >= due && nextForcedPurgeAtMillis.compareAndSet(due, now + FORCED_PURGE_SPACING_MILLIS)) {
			purgeExpired(now);
		}
		return windows.size() >= maxKeys && !windows.containsKey(key);
	}

	private void purgeExpired(long now) {
		windows.entrySet().removeIf(entry -> isExpired(entry.getValue(), now));
	}

}
