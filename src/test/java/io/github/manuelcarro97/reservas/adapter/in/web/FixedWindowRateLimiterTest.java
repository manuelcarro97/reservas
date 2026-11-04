package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;

import io.github.manuelcarro97.reservas.support.MutableClock;

class FixedWindowRateLimiterTest {

	private static final Duration WINDOW = Duration.ofMinutes(1);

	private final MutableClock clock = new MutableClock();

	@Test
	void allowsUpToLimit() {
		FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(clock, 3, WINDOW);

		assertThat(limiter.tryAcquire("a")).isTrue();
		assertThat(limiter.tryAcquire("a")).isTrue();
		assertThat(limiter.tryAcquire("a")).isTrue();
	}

	@Test
	void blocksAfterLimit() {
		FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(clock, 3, WINDOW);
		for (int i = 0; i < 3; i++) {
			limiter.tryAcquire("a");
		}

		assertThat(limiter.tryAcquire("a")).isFalse();
		assertThat(limiter.tryAcquire("a")).isFalse();
	}

	@Test
	void resetsAfterWindow() {
		FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(clock, 1, WINDOW);
		assertThat(limiter.tryAcquire("a")).isTrue();
		assertThat(limiter.tryAcquire("a")).isFalse();

		clock.set(MutableClock.START.plus(WINDOW).minusMillis(1));
		assertThat(limiter.tryAcquire("a")).isFalse();

		clock.set(MutableClock.START.plus(WINDOW));
		assertThat(limiter.tryAcquire("a")).isTrue();
	}

	@Test
	void keysAreIndependent() {
		FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(clock, 1, WINDOW);
		assertThat(limiter.tryAcquire("a")).isTrue();

		assertThat(limiter.tryAcquire("a")).isFalse();
		assertThat(limiter.tryAcquire("b")).isTrue();
	}

	@Test
	void retryAfterIsSecondsUntilTheWindowRotatesRoundedUpWithMinimumOne() {
		FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(clock, 1, WINDOW);
		limiter.tryAcquire("a");
		assertThat(limiter.retryAfterSeconds("a")).isEqualTo(60);

		clock.set(MutableClock.START.plusMillis(1_500));
		assertThat(limiter.retryAfterSeconds("a")).isEqualTo(59);

		clock.set(MutableClock.START.plus(WINDOW).minusMillis(1));
		assertThat(limiter.retryAfterSeconds("a")).isEqualTo(1);

		// Una clave desconocida o ya rotada: el mínimo, nunca 0 ni negativo.
		assertThat(limiter.retryAfterSeconds("nunca-vista")).isEqualTo(1);
	}

	@Test
	void clearForgetsEveryKey() {
		FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(clock, 1, WINDOW);
		limiter.tryAcquire("a");
		assertThat(limiter.tryAcquire("a")).isFalse();

		limiter.clear();

		assertThat(limiter.tryAcquire("a")).isTrue();
	}

	@Test
	void concurrentCallersWithTheSameKeyGetExactlyTheLimit() throws Exception {
		int limit = 10;
		int threads = 64;
		FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(clock, limit, WINDOW);
		CountDownLatch start = new CountDownLatch(1);
		List<Future<Boolean>> results = new ArrayList<>();
		try (ExecutorService executor = Executors.newFixedThreadPool(threads)) {
			for (int i = 0; i < threads; i++) {
				Callable<Boolean> call = () -> {
					start.await();
					return limiter.tryAcquire("same");
				};
				results.add(executor.submit(call));
			}
			start.countDown();
		}

		long accepted = 0;
		for (Future<Boolean> result : results) {
			if (result.get()) {
				accepted++;
			}
		}
		assertThat(accepted).isEqualTo(limit);
	}

	@Test
	void purgesExpiredKeysOnceThereAreMoreThanTenThousand() {
		FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(clock, 1, WINDOW);
		for (int i = 0; i <= 10_000; i++) {
			limiter.tryAcquire("ip-" + i);
		}
		assertThat(limiter.trackedKeys()).isEqualTo(10_001);

		clock.set(MutableClock.START.plus(WINDOW).plusSeconds(1));
		limiter.tryAcquire("nueva");

		assertThat(limiter.trackedKeys()).isEqualTo(1);
	}

	@Test
	void purgeRunningAlongsideCallersNeverLetsMoreThanTheLimitThrough() throws Exception {
		int limit = 5;
		int threads = 32;
		FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(clock, limit, WINDOW);
		// Más de 10 000 claves ya caducadas: cada llamada que cruza el umbral dispara la purga mientras los demás
		// hilos siguen contando la clave compartida de la ventana nueva.
		for (int i = 0; i <= 10_000; i++) {
			limiter.tryAcquire("old-" + i);
		}
		clock.set(MutableClock.START.plus(WINDOW).plusSeconds(1));
		CountDownLatch start = new CountDownLatch(1);
		List<Future<Boolean>> results = new ArrayList<>();
		try (ExecutorService executor = Executors.newFixedThreadPool(threads)) {
			for (int i = 0; i < threads; i++) {
				Callable<Boolean> call = () -> {
					start.await();
					return limiter.tryAcquire("same");
				};
				results.add(executor.submit(call));
			}
			start.countDown();
		}

		long accepted = 0;
		for (Future<Boolean> result : results) {
			if (result.get()) {
				accepted++;
			}
		}
		assertThat(accepted).isEqualTo(limit);
	}

}
