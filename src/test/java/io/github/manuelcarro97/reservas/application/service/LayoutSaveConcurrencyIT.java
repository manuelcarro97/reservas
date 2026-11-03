package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.manuelcarro97.reservas.application.port.in.CreateReservationCommand;
import io.github.manuelcarro97.reservas.application.port.in.CreateReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ManagePlanUseCase;
import io.github.manuelcarro97.reservas.application.port.in.TableChange;
import io.github.manuelcarro97.reservas.domain.exception.TableHasReservationsException;
import io.github.manuelcarro97.reservas.domain.exception.TableNotFoundException;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * Guardar un plano que quita la mesa 1 y reservar esa mesa a la vez: con el bloqueo del plano, gana uno u otro y
 * nunca queda una reserva activa sobre una mesa borrada.
 */
class LayoutSaveConcurrencyIT extends PostgresIT {

	private static final int ITERATIONS = 20;
	private static final LocalDate DATE = LocalDate.of(2026, 12, 2);

	@Autowired
	private ManagePlanUseCase managePlan;

	@Autowired
	private CreateReservationUseCase createReservation;

	@Test
	void removingATableAndBookingItNeverLeavesAnActiveReservationOnADeletedTable() throws Exception {
		int saveWon = 0;
		int bookingWon = 0;
		try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
			for (int i = 0; i < ITERATIONS; i++) {
				Restaurant plan = givenRestaurant("plano-" + i, "owner-a");
				Shift shift = givenDinnerShift(plan);
				DiningTable first = givenTable(plan, "1", 2);
				DiningTable second = givenTable(plan, "2", 2);
				CountDownLatch start = new CountDownLatch(1);

				Future<Boolean> save = executor.submit(() -> {
					start.await();
					try {
						managePlan.saveLayout("owner-a", plan.slug(), plan.room(), List.of(change(second)));
						return true;
					}
					catch (TableHasReservationsException reservationWon) {
						return false;
					}
				});
				Future<Boolean> booking = executor.submit(() -> {
					start.await();
					return book(plan, shift, first);
				});
				start.countDown();

				boolean saved = save.get();
				boolean booked = booking.get();
				assertThat(saved).as("iteration %d: exactly one of save and booking wins", i).isNotEqualTo(booked);
				saveWon += saved ? 1 : 0;
				bookingWon += booked ? 1 : 0;
			}
		}

		assertThat(jdbc.sql("""
				SELECT count(*) FROM reservation r JOIN dining_table t ON t.id = r.table_id
				WHERE r.status IN ('PENDING', 'CONFIRMED') AND t.deleted_at IS NOT NULL
				""").query(Integer.class).single()).isZero();
		assertThat(saveWon + bookingWon).isEqualTo(ITERATIONS);
	}

	private static TableChange change(DiningTable table) {
		return new TableChange(table.id(), table.label(), table.shape(), table.seats(), table.rotation(), table.x(),
				table.y());
	}

	/** Reserva real con mesa elegida; falla con TABLE_NOT_FOUND si el guardado del plano ya quitó la mesa. */
	private boolean book(Restaurant plan, Shift shift, DiningTable table) {
		try {
			createReservation.create(plan.slug(),
					new CreateReservationCommand(DATE, shift.id(), 2, "Ana", "600000000", null, table.id()));
			return true;
		}
		catch (TableNotFoundException saveWon) {
			return false;
		}
	}

}
