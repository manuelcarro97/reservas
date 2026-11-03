package io.github.manuelcarro97.reservas.adapter.out.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.manuelcarro97.reservas.application.port.in.GetReservationUseCase;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/** Una reserva sin mesa (modo asignado, o tras un cambio de modo) no debe romper ninguna lectura ni escritura. */
class NullTableReservationIT extends PostgresIT {

	private static final String NULL_TABLE_CODE = "SINMESA000000001";

	@Autowired
	private GetReservationUseCase getReservation;

	private Restaurant restaurant;
	private Shift dinner;
	private DiningTable first;
	private DiningTable second;
	private LocalDate tomorrow;

	@BeforeEach
	void seed() {
		restaurant = givenRestaurant("demo");
		dinner = givenDinnerShift(restaurant);
		first = givenTable(restaurant, "M1", 2);
		second = givenTable(restaurant, "M2", 4);
		tomorrow = LocalDate.ofInstant(clock.instant(), clock.getZone()).plusDays(1);
		jdbc.sql("""
				INSERT INTO reservation (code, restaurant_id, shift_id, table_id, reservation_date, party_size,
				                         customer_name, customer_phone, status, version, created_at)
				VALUES (:code, :restaurantId, :shiftId, NULL, :date, 2, 'Ana', '600000000', 'PENDING', 0, now())
				""")
			.param("code", NULL_TABLE_CODE)
			.param("restaurantId", restaurant.id())
			.param("shiftId", dinner.id())
			.param("date", tomorrow)
			.update();
	}

	private Reservation pendingWithoutTable(String code) {
		return Reservation.newPending(code, restaurant.id(), dinner.id(), null, tomorrow, 2, "Luis", "600000001",
				null, Instant.parse("2026-12-01T10:00:00Z"));
	}

	@Test
	void freeTablesIgnoreNullTableReservations() {
		assertThat(tables.findFree(restaurant.id(), dinner.id(), tomorrow)).containsExactly(first, second);
	}

	@Test
	void occupancyIgnoresNullTableReservations() {
		assertThat(reservations.occupiedTableIds(restaurant.id(), dinner.id(), tomorrow)).isEmpty();
	}

	@Test
	void detailsOfReservationWithoutTable() {
		assertThat(getReservation.byCode(NULL_TABLE_CODE).tableLabel()).isNull();
	}

	@Test
	void tryInsertAcceptsNullTable() {
		assertThat(reservations.tryInsert(pendingWithoutTable("SINMESA000000002"))).isPresent();
		assertThat(reservations.tryInsert(pendingWithoutTable("SINMESA000000003"))).isPresent();
	}

}
