package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.manuelcarro97.reservas.application.port.in.CreateReservationCommand;
import io.github.manuelcarro97.reservas.application.port.in.CreateReservationUseCase;
import io.github.manuelcarro97.reservas.domain.exception.DomainException;
import io.github.manuelcarro97.reservas.domain.exception.NoTableAvailableException;
import io.github.manuelcarro97.reservas.domain.exception.TableTakenException;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.PostgresIT;

class OverbookingConcurrencyIT extends PostgresIT {

	private static final LocalDate DATE = LocalDate.of(2026, 12, 2);
	private static final int THREADS = 20;

	@Autowired
	private CreateReservationUseCase createReservation;

	/** Resultado de cada intento: la reserva creada o el error de dominio que lo rechazó. */
	private record Attempt(Reservation created, DomainException rejected) {
	}

	private List<Attempt> reserveInParallel(long shiftId, Long tableId, int partySize)
			throws InterruptedException, ExecutionException {
		CountDownLatch start = new CountDownLatch(1);
		Callable<Attempt> attempt = () -> {
			start.await();
			try {
				return new Attempt(createReservation.create("demo",
						new CreateReservationCommand(DATE, shiftId, partySize, "Ana", "600000000", null, tableId)),
						null);
			}
			catch (TableTakenException | NoTableAvailableException rejected) {
				return new Attempt(null, rejected);
			}
		};
		try (ExecutorService executor = Executors.newFixedThreadPool(THREADS)) {
			List<Future<Attempt>> futures = new ArrayList<>();
			for (int i = 0; i < THREADS; i++) {
				futures.add(executor.submit(attempt));
			}
			start.countDown();
			List<Attempt> attempts = new ArrayList<>();
			for (Future<Attempt> future : futures) {
				attempts.add(future.get());
			}
			return attempts;
		}
	}

	private static List<Reservation> created(List<Attempt> attempts) {
		return attempts.stream().map(Attempt::created).filter(java.util.Objects::nonNull).toList();
	}

	private long activeRows() {
		return jdbc.sql("SELECT count(*) FROM reservation WHERE status IN ('PENDING', 'CONFIRMED')")
			.query(Long.class)
			.single();
	}

	@Test
	void onlyOneWinsChosenTable() throws Exception {
		Restaurant restaurant = givenRestaurant("demo");
		Shift shift = givenDinnerShift(restaurant);
		DiningTable table = givenTable(restaurant, "M1", 2);

		List<Attempt> attempts = reserveInParallel(shift.id(), table.id(), 2);

		assertThat(created(attempts)).hasSize(1);
		assertThat(attempts).filteredOn(attempt -> attempt.rejected() != null)
			.hasSize(THREADS - 1)
			.allSatisfy(attempt -> assertThat(attempt.rejected()).isInstanceOf(TableTakenException.class));
		assertThat(activeRows()).isEqualTo(1);
	}

	@Test
	void assignedModeNeverExceedsCapacity() throws Exception {
		Restaurant restaurant = givenBookingMode(givenRestaurant("demo"), BookingMode.ASSIGNED);
		Shift shift = givenDinnerShift(restaurant);
		givenTable(restaurant, "M1", 4);
		givenTable(restaurant, "M2", 4);
		givenTable(restaurant, "M3", 4);

		List<Attempt> attempts = reserveInParallel(shift.id(), null, 4);

		assertThat(created(attempts)).hasSize(3);
		assertThat(attempts).filteredOn(attempt -> attempt.rejected() != null)
			.hasSize(THREADS - 3)
			.allSatisfy(attempt -> assertThat(attempt.rejected()).isInstanceOf(NoTableAvailableException.class));
		assertThat(activeRows()).isEqualTo(3);
	}

	@Test
	void indexStillRejectsDuplicateActiveSlot() {
		Restaurant restaurant = givenRestaurant("demo");
		Shift shift = givenDinnerShift(restaurant);
		DiningTable table = givenTable(restaurant, "M1", 2);
		givenReservation(restaurant, shift, table, DATE, 2);

		// Sin pasar por el servicio ni por el bloqueo: solo el índice parcial único impide el duplicado.
		assertThat(reservations.tryInsert(Reservation.newPending("DEMO-DUPLICADA0001", restaurant.id(), shift.id(),
				table.id(), DATE, 2, "Ana", "600000000", null, clock.instant()))).isEmpty();
		assertThat(activeRows()).isEqualTo(1);
	}

}
