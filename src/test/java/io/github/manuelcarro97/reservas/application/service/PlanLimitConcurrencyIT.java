package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.manuelcarro97.reservas.application.port.in.ManagePlanUseCase;
import io.github.manuelcarro97.reservas.domain.exception.PlanLimitReachedException;
import io.github.manuelcarro97.reservas.support.PostgresIT;

class PlanLimitConcurrencyIT extends PostgresIT {

	private static final int THREADS = 10;

	@Autowired
	private ManagePlanUseCase managePlan;

	@Test
	void tenSimultaneousCreationsForOneOwnerLeaveExactlyThreePlans() throws Exception {
		CountDownLatch start = new CountDownLatch(1);
		List<Callable<Boolean>> creations = new ArrayList<>();
		for (int i = 0; i < THREADS; i++) {
			String slug = "plano-" + i;
			creations.add(() -> {
				start.await();
				try {
					managePlan.create("owner-a", slug, "Plano " + slug);
					return true;
				}
				catch (PlanLimitReachedException limitReached) {
					return false;
				}
			});
		}

		int created = 0;
		int rejected = 0;
		try (ExecutorService executor = Executors.newFixedThreadPool(THREADS)) {
			List<Future<Boolean>> futures = creations.stream().map(executor::submit).toList();
			start.countDown();
			for (Future<Boolean> future : futures) {
				if (future.get()) {
					created++;
				}
				else {
					rejected++;
				}
			}
		}

		assertThat(created).isEqualTo(3);
		assertThat(rejected).isEqualTo(7);
		assertThat(restaurants.findByOwner("owner-a")).hasSize(3);
	}

}
