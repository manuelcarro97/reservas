package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.manuelcarro97.reservas.application.port.in.ExpirePendingReservationsUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ManageReservationUseCase;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.PostgresIT;

class ExpirePendingReservationsIT extends PostgresIT {

	private static final LocalDate DATE = LocalDate.of(2026, 12, 2);
	// 20:00 en Madrid son las 19:00 UTC en diciembre.
	private static final Instant SHIFT_START = Instant.parse("2026-12-02T19:00:00Z");

	@Autowired
	private ExpirePendingReservationsUseCase expirePending;

	@Autowired
	private ManageReservationUseCase manageReservation;

	private Restaurant restaurant;
	private Shift shift;
	private DiningTable table;

	@BeforeEach
	void seed() {
		restaurant = givenRestaurant("demo");
		shift = givenDinnerShift(restaurant);
		table = givenTable(restaurant, "M1", 2);
		givenTable(restaurant, "M2", 2);
	}

	private Reservation reserve() {
		return givenReservation(restaurant, shift, table, DATE, 2);
	}

	private String statusOf(Reservation reservation) {
		return jdbc.sql("SELECT status FROM reservation WHERE id = ?")
			.param(reservation.id())
			.query(String.class)
			.single();
	}

	@Test
	void pendingIsCancelledOnceShiftStarts() {
		Reservation reservation = reserve();
		clock.set(SHIFT_START);

		assertThat(expirePending.expire()).isEqualTo(1);
		assertThat(statusOf(reservation)).isEqualTo("CANCELLED");
	}

	@Test
	void pendingStaysBeforeShiftStart() {
		Reservation reservation = reserve();
		clock.set(SHIFT_START.minusSeconds(60));

		assertThat(expirePending.expire()).isZero();
		assertThat(statusOf(reservation)).isEqualTo("PENDING");
	}

	@Test
	void confirmedIsNotTouched() {
		Reservation reservation = reserve();
		manageReservation.confirm("owner-a", reservation.id());
		clock.set(SHIFT_START);

		assertThat(expirePending.expire()).isZero();
		assertThat(statusOf(reservation)).isEqualTo("CONFIRMED");
	}

}
