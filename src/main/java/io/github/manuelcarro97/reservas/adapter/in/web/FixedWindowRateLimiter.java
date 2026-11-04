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

	private record Window(long startMillis, int count) {
	}

	private final Clock clock;
	private final int limit;
	private final long windowMillis;
	private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
	private final AtomicLong nextPurgeAtMillis = new AtomicLong();

	public FixedWindowRateLimiter(Clock clock, int limit, Duration window) {
		this.clock = clock;
		this.limit = limit;
		this.windowMillis = window.toMillis();
	}

	/** Cuenta una petición de {@code key} y dice si cabe en su ventana; si no cabe, no la cuenta. */
	public boolean tryAcquire(String key) {
		long now = clock.millis();
		purgeIfNeeded(now);
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

	/** Segundos hasta que rota la ventana de {@code key}, redondeados hacia arriba y nunca menos de 1. */
	public long retryAfterSeconds(String key) {
		Window window = windows.get(key);
		if (window == null) {
			return 1;
		}
		long remainingMillis = window.startMillis() + windowMillis - clock.millis();
		return Math.max(1, Math.ceilDiv(remainingMillis, 1000));
	}

	/** Olvida todas las claves. Para tests: el reloj fijo de la suite nunca rota la ventana. */
	public void clear() {
		windows.clear();
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
			windows.entrySet().removeIf(entry -> isExpired(entry.getValue(), now));
		}
	}

}
