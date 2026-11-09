package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/** Operaciones del dueño sobre reservas: asignar o cambiar mesa, sugerencias y listados. */
@AutoConfigureMockMvc
class AdminReservationApiIT extends PostgresIT {

	private static final String SLUG = "demo";
	private static final String RESERVATIONS = "/api/v1/admin/restaurants/" + SLUG + "/reservations";
	private static final LocalDate TODAY = LocalDate.of(2026, 12, 1);
	private static final LocalDate DATE = LocalDate.of(2026, 12, 2);

	@Autowired
	private MockMvc mvc;

	private Restaurant restaurant;
	private Shift dinner;

	@BeforeEach
	void seed() {
		restaurant = givenBookingMode(givenRestaurant(SLUG), BookingMode.ASSIGNED);
		dinner = givenDinnerShift(restaurant);
	}

	private ResultActions send(MockHttpServletRequestBuilder request) throws Exception {
		return mvc.perform(request.with(AuthRequests.owner("owner-a")));
	}

	private ResultActions assign(Reservation reservation, long tableId) throws Exception {
		return send(put("/api/v1/admin/reservations/" + reservation.id() + "/table")
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"tableId":%d}
					""".formatted(tableId)));
	}

	/** Borrado lógico por SQL: el puerto exige transacción y aquí solo se prepara el estado. */
	private void softDelete(DiningTable table) {
		jdbc.sql("UPDATE dining_table SET deleted_at = now() WHERE id = :id").param("id", table.id()).update();
	}

	private Long tableIdOf(Reservation reservation) {
		return jdbc.sql("SELECT table_id FROM reservation WHERE id = :id")
			.param("id", reservation.id())
			.query(Long.class)
			.optional()
			.orElse(null);
	}

	@Test
	void assignTableToUnassignedReservation() throws Exception {
		DiningTable table = givenTable(restaurant, "M4", 4);
		Reservation reservation = givenReservation(restaurant, dinner, null, DATE, 3);

		assign(reservation, table.id()).andExpect(status().isOk())
			.andExpect(jsonPath("$.tableLabel").value("M4"))
			.andExpect(jsonPath("$.status").value("PENDING"));

		assertThat(tableIdOf(reservation)).isEqualTo(table.id());
	}

	@Test
	void assignKeepsCancelledByCustomerAndOtherColumns() throws Exception {
		DiningTable table = givenTable(restaurant, "M4", 4);
		Reservation reservation = givenReservation(restaurant, dinner, null, DATE, 3);
		jdbc.sql("UPDATE reservation SET cancelled_by_customer_at = :at WHERE id = :id")
			.param("at", Timestamp.from(Instant.parse("2026-11-20T10:00:00Z")))
			.param("id", reservation.id())
			.update();

		assign(reservation, table.id()).andExpect(status().isOk());

		assertThat(jdbc.sql("SELECT cancelled_by_customer_at FROM reservation WHERE id = :id")
			.param("id", reservation.id())
			.query(Timestamp.class)
			.single()
			.toInstant()).isEqualTo(Instant.parse("2026-11-20T10:00:00Z"));
	}

	@Test
	void reassignFreeChoiceReservation() throws Exception {
		givenBookingMode(restaurant, BookingMode.FREE_CHOICE);
		DiningTable small = givenTable(restaurant, "M2", 2);
		DiningTable big = givenTable(restaurant, "M4", 4);
		Reservation reservation = givenReservation(restaurant, dinner, small, DATE, 2);

		assign(reservation, big.id()).andExpect(status().isOk()).andExpect(jsonPath("$.tableLabel").value("M4"));

		assertThat(tableIdOf(reservation)).isEqualTo(big.id());
		// La mesa vieja queda libre: otra reserva activa puede ocuparla.
		assertThat(givenReservation(restaurant, dinner, small, DATE, 2).tableId()).isEqualTo(small.id());
	}

	@Test
	void assignTakenTableReturns409() throws Exception {
		DiningTable table = givenTable(restaurant, "M4", 4);
		givenReservation(restaurant, dinner, table, DATE, 2);
		Reservation unassigned = givenReservation(restaurant, dinner, null, DATE, 3);

		assign(unassigned, table.id()).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("TABLE_TAKEN"));

		assertThat(tableIdOf(unassigned)).isNull();
	}

	@Test
	void concurrentAssignOfSameTableOneGets409() throws Exception {
		DiningTable table = givenTable(restaurant, "M4", 4);
		Reservation first = givenReservation(restaurant, dinner, null, DATE, 3);
		Reservation second = givenReservation(restaurant, dinner, null, DATE, 4);
		CountDownLatch start = new CountDownLatch(1);
		List<Callable<Integer>> attempts = List.of(first, second).stream().<Callable<Integer>>map(reservation -> () -> {
			start.await();
			return assign(reservation, table.id()).andReturn().getResponse().getStatus();
		}).toList();

		List<Integer> statuses = new ArrayList<>();
		try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
			List<Future<Integer>> futures = attempts.stream().map(executor::submit).toList();
			start.countDown();
			for (Future<Integer> future : futures) {
				statuses.add(future.get());
			}
		}

		assertThat(statuses).containsExactlyInAnyOrder(200, 409);
		assertThat(jdbc.sql("SELECT count(*) FROM reservation WHERE table_id = :id")
			.param("id", table.id())
			.query(Integer.class)
			.single()).isEqualTo(1);
	}

	@Test
	void assignTableOfOtherPlanReturns404() throws Exception {
		Restaurant other = givenRestaurant("otro", "owner-a");
		DiningTable foreign = givenTable(other, "X1", 4);
		Reservation reservation = givenReservation(restaurant, dinner, null, DATE, 2);

		assign(reservation, foreign.id()).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("TABLE_NOT_FOUND"));

		assertThat(tableIdOf(reservation)).isNull();
	}

	@Test
	void assignDeletedTableReturns404() throws Exception {
		DiningTable table = givenTable(restaurant, "M4", 4);
		softDelete(table);
		Reservation reservation = givenReservation(restaurant, dinner, null, DATE, 2);

		assign(reservation, table.id()).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("TABLE_NOT_FOUND"));
	}

	@Test
	void assignTooSmallTableReturns422() throws Exception {
		DiningTable table = givenTable(restaurant, "M2", 2);
		Reservation reservation = givenReservation(restaurant, dinner, null, DATE, 3);

		assign(reservation, table.id()).andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("TABLE_TOO_SMALL"));
	}

	@Test
	void assignToCancelledReservationReturns409() throws Exception {
		DiningTable table = givenTable(restaurant, "M4", 4);
		Reservation reservation = givenReservation(restaurant, dinner, null, DATE, 3);
		send(post("/api/v1/admin/reservations/" + reservation.id() + "/cancel")).andExpect(status().isOk());

		assign(reservation, table.id()).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("INVALID_TRANSITION"));
	}

	@Test
	void assignUnknownReservationReturns404() throws Exception {
		DiningTable table = givenTable(restaurant, "M4", 4);

		send(put("/api/v1/admin/reservations/999/table").contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"tableId":%d}
					""".formatted(table.id()))).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESERVATION_NOT_FOUND"));
	}

	@Test
	void assignWithoutTableIdReturns400() throws Exception {
		Reservation reservation = givenReservation(restaurant, dinner, null, DATE, 2);

		send(put("/api/v1/admin/reservations/" + reservation.id() + "/table").contentType(MediaType.APPLICATION_JSON)
			.content("{}")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void confirmWithoutTableReturns409TableRequired() throws Exception {
		Reservation reservation = givenReservation(restaurant, dinner, null, DATE, 2);

		send(post("/api/v1/admin/reservations/" + reservation.id() + "/confirm")).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("TABLE_REQUIRED"));
	}

	@Test
	void confirmAfterAssigningTableSucceeds() throws Exception {
		DiningTable table = givenTable(restaurant, "M4", 4);
		Reservation reservation = givenReservation(restaurant, dinner, null, DATE, 2);
		assign(reservation, table.id()).andExpect(status().isOk());

		send(post("/api/v1/admin/reservations/" + reservation.id() + "/confirm")).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CONFIRMED"))
			.andExpect(jsonPath("$.tableLabel").value("M4"));
	}

	@Test
	void suggestionsSmallestFittingFirst() throws Exception {
		givenTable(restaurant, "M2", 2);
		DiningTable eight = givenTable(restaurant, "M8", 8);
		DiningTable four = givenTable(restaurant, "M4", 4);
		DiningTable six = givenTable(restaurant, "M6", 6);
		DiningTable busyFour = givenTable(restaurant, "M4b", 4);
		givenReservation(restaurant, dinner, busyFour, DATE, 4);
		Reservation reservation = givenReservation(restaurant, dinner, null, DATE, 3);

		send(get("/api/v1/admin/reservations/" + reservation.id() + "/suggestions")).andExpect(status().isOk())
			.andExpect(jsonPath("$", hasSize(3)))
			.andExpect(jsonPath("$[0].tableId").value(four.id()))
			.andExpect(jsonPath("$[0].label").value("M4"))
			.andExpect(jsonPath("$[0].seats").value(4))
			.andExpect(jsonPath("$[1].tableId").value(six.id()))
			.andExpect(jsonPath("$[2].tableId").value(eight.id()));
	}

	@Test
	void suggestionsAreCappedAtFive() throws Exception {
		for (int i = 1; i <= 7; i++) {
			givenTable(restaurant, "M" + i, 4);
		}
		Reservation reservation = givenReservation(restaurant, dinner, null, DATE, 2);

		send(get("/api/v1/admin/reservations/" + reservation.id() + "/suggestions")).andExpect(status().isOk())
			.andExpect(jsonPath("$", hasSize(5)));
	}

	@Test
	void pendingListFromToday() throws Exception {
		Shift lunch = shifts.save(new Shift(null, restaurant.id(), "Comida", LocalTime.of(13, 0), LocalTime.of(16, 0),
				EnumSet.allOf(DayOfWeek.class)));
		DiningTable table = givenTable(restaurant, "M4", 4);
		givenReservation(restaurant, dinner, table, TODAY.minusDays(1), 2);
		Reservation confirmed = givenReservation(restaurant, dinner, table, TODAY.plusDays(5), 2);
		send(post("/api/v1/admin/reservations/" + confirmed.id() + "/confirm")).andExpect(status().isOk());
		Reservation cancelled = givenReservation(restaurant, dinner, table, TODAY.plusDays(6), 2);
		send(post("/api/v1/admin/reservations/" + cancelled.id() + "/cancel")).andExpect(status().isOk());
		Reservation laterDinner = givenReservation(restaurant, dinner, table, DATE.plusDays(1), 2);
		Reservation dinnerToday = givenReservation(restaurant, dinner, table, DATE, 2);
		Reservation lunchToday = givenReservation(restaurant, lunch, table, DATE, 2);
		Reservation todayExactly = givenReservation(restaurant, dinner, table, TODAY, 2);

		send(get(RESERVATIONS).param("status", "PENDING")).andExpect(status().isOk())
			.andExpect(jsonPath("$", hasSize(4)))
			.andExpect(jsonPath("$[0].id").value(todayExactly.id()))
			.andExpect(jsonPath("$[1].id").value(lunchToday.id()))
			.andExpect(jsonPath("$[2].id").value(dinnerToday.id()))
			.andExpect(jsonPath("$[3].id").value(laterDinner.id()))
			.andExpect(jsonPath("$[0].status").value("PENDING"))
			.andExpect(jsonPath("$[0].arrivalTime").value(startsWith("20:00")));
	}

	@Test
	void listWithoutFilterReturns400() throws Exception {
		send(get(RESERVATIONS)).andExpect(status().isBadRequest());
	}

	@Test
	void listByUnsupportedStatusReturns400() throws Exception {
		send(get(RESERVATIONS).param("status", "CONFIRMED")).andExpect(status().isBadRequest());
	}

	@Test
	void listShowsTableIdAndNullForUnassigned() throws Exception {
		DiningTable table = givenTable(restaurant, "M4", 4);
		givenReservation(restaurant, dinner, table, DATE, 2);
		givenReservation(restaurant, dinner, null, DATE, 3);

		send(get(RESERVATIONS).param("date", DATE.toString())).andExpect(status().isOk())
			.andExpect(jsonPath("$[0].tableId").value(table.id()))
			.andExpect(jsonPath("$[0].tableLabel").value("M4"))
			.andExpect(jsonPath("$[0].createdAt", notNullValue()))
			.andExpect(jsonPath("$[0].arrivalTime").value(startsWith("20:00")))
			.andExpect(jsonPath("$[1].tableId").doesNotExist())
			.andExpect(jsonPath("$[1].tableLabel").doesNotExist());
	}

	@Test
	void listKeepsLabelOfDeletedTable() throws Exception {
		DiningTable table = givenTable(restaurant, "M4", 4);
		givenReservation(restaurant, dinner, table, DATE, 2);
		softDelete(table);

		send(get(RESERVATIONS).param("date", DATE.toString())).andExpect(status().isOk())
			.andExpect(jsonPath("$[0].tableId").value(table.id()))
			.andExpect(jsonPath("$[0].tableLabel").value("M4"));
	}

}
