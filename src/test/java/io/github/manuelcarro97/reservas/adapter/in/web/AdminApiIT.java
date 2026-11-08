package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.PostgresIT;

@AutoConfigureMockMvc
class AdminApiIT extends PostgresIT {

	private static final LocalDate DATE = LocalDate.of(2026, 12, 2);
	private static final Instant AFTER_DINNER_STARTS = Instant.parse("2026-12-02T19:30:00Z");

	@Autowired
	private MockMvc mvc;

	private Restaurant restaurant;
	private Shift shift;
	private DiningTable table;

	@BeforeEach
	void seed() {
		restaurant = givenRestaurant("demo");
		shift = givenDinnerShift(restaurant);
		table = givenTable(restaurant, "M2", 2);
	}

	private static String basic(String password) {
		return "Basic " + Base64.getEncoder().encodeToString(("admin:" + password).getBytes());
	}

	private ResultActions asAdmin(MockHttpServletRequestBuilder request) throws Exception {
		return mvc.perform(request.with(AuthRequests.owner("owner-a")));
	}

	private ResultActions adminPost(String path, String json) throws Exception {
		return asAdmin(post(path).contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private Reservation givenReservation() {
		return givenReservation(restaurant, shift, table, DATE, 2);
	}

	private String reservationPath(Reservation reservation, String action) {
		return "/api/v1/admin/reservations/" + reservation.id() + "/" + action;
	}

	@Test
	void adminWithoutTokenReturns401() throws Exception {
		mvc.perform(get("/api/v1/admin/restaurants/demo/reservations").param("date", DATE.toString()))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void adminWithBasicAuthReturns401() throws Exception {
		mvc.perform(get("/api/v1/admin/restaurants/demo/reservations").param("date", DATE.toString())
			.header(HttpHeaders.AUTHORIZATION, basic("test-password")))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void corsAllowsConfiguredOrigin() throws Exception {
		mvc.perform(options("/api/v1/admin/restaurants").header(HttpHeaders.ORIGIN, "http://localhost:4200")
			.header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
			.andExpect(status().isOk())
			.andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:4200"));
	}

	@Test
	void corsRejectsOtherOrigin() throws Exception {
		mvc.perform(options("/api/v1/admin/restaurants").header(HttpHeaders.ORIGIN, "https://evil.example")
			.header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
			.andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
	}

	@Test
	void createPlanThenAddShiftClosureAndPublish() throws Exception {
		adminPost("/api/v1/admin/restaurants", """
				{"slug":"nuevo","name":"Nuevo"}
				""").andExpect(status().isCreated());
		// Hasta que el guardado del plano (B5) cree las mesas por API, la mesa se inserta directamente.
		givenTable(restaurants.findBySlug("nuevo").orElseThrow(), "T1", 4);
		adminPost("/api/v1/admin/restaurants/nuevo/shifts", """
				{"name":"Merienda","start":"17:00","end":"19:00","days":["MONDAY","SUNDAY"]}
				""").andExpect(status().isCreated()).andExpect(jsonPath("$.id").isNumber());
		adminPost("/api/v1/admin/restaurants/nuevo/closures", """
				{"date":"2026-12-25","reason":"Navidad"}
				""").andExpect(status().isCreated());
		adminPost("/api/v1/admin/restaurants/nuevo/publish", "").andExpect(status().isOk());

		mvc.perform(get("/api/v1/restaurants/nuevo/availability").param("date", "2026-12-25").param("partySize", "2"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$").isEmpty());
	}

	@Test
	void absurdDateInReservationListReturns400() throws Exception {
		asAdmin(get("/api/v1/admin/restaurants/demo/reservations").param("date", "+9999999-01-01"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void absurdDateInOccupancyReturns400() throws Exception {
		asAdmin(get("/api/v1/admin/restaurants/demo/occupancy").param("date", "+9999999-01-01")
			.param("shiftId", shift.id().toString()))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void absurdDateInClosureReturns400() throws Exception {
		adminPost("/api/v1/admin/restaurants/demo/closures", """
				{"date":"+9999999-01-01","reason":"Nunca"}
				""").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void overlappingShiftReturns409() throws Exception {
		adminPost("/api/v1/admin/restaurants/demo/shifts", """
				{"name":"Tarde","start":"21:00","end":"23:00","days":["MONDAY"]}
				""").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SHIFT_OVERLAP"));
	}

	@Test
	void adjacentShiftIsAllowed() throws Exception {
		adminPost("/api/v1/admin/restaurants/demo/shifts", """
				{"name":"Tarde","start":"22:00","end":"23:00","days":["MONDAY"]}
				""").andExpect(status().isCreated());
	}

	@Test
	void closureOverActiveReservationReturns409() throws Exception {
		Reservation reservation = givenReservation();

		adminPost("/api/v1/admin/restaurants/demo/closures", """
				{"date":"2026-12-02","reason":"Reforma"}
				""").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("CLOSURE_HAS_RESERVATIONS"))
			.andExpect(jsonPath("$.reservations", contains(reservation.code())));
	}

	@Test
	void closureIsAllowedOnceReservationIsCancelled() throws Exception {
		asAdmin(post(reservationPath(givenReservation(), "cancel")));

		adminPost("/api/v1/admin/restaurants/demo/closures", """
				{"date":"2026-12-02","reason":"Reforma"}
				""").andExpect(status().isCreated());
	}

	@Test
	void confirmOnceShiftStartedReturns409() throws Exception {
		Reservation reservation = givenReservation();
		clock.set(AFTER_DINNER_STARTS);

		asAdmin(post(reservationPath(reservation, "confirm"))).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("INVALID_TRANSITION"));
	}

	@Test
	void shiftEndingBeforeItStartsReturns400() throws Exception {
		adminPost("/api/v1/admin/restaurants/demo/shifts", """
				{"name":"Mal","start":"15:00","end":"13:00","days":["MONDAY"]}
				""").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void reservationListShowsContactData() throws Exception {
		givenReservation();

		asAdmin(get("/api/v1/admin/restaurants/demo/reservations").param("date", DATE.toString()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[0].customerPhone").value("600000000"))
			.andExpect(jsonPath("$[0].tableLabel").value("M2"));
	}

	@Test
	void confirmThenNoShowFollowsStateMachine() throws Exception {
		Reservation reservation = givenReservation();

		asAdmin(post(reservationPath(reservation, "confirm"))).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CONFIRMED"));
		clock.set(AFTER_DINNER_STARTS);
		asAdmin(post(reservationPath(reservation, "no-show"))).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("NO_SHOW"));
	}

	@Test
	void noShowBeforeShiftStartsReturns409() throws Exception {
		Reservation reservation = givenReservation();
		asAdmin(post(reservationPath(reservation, "confirm")));

		asAdmin(post(reservationPath(reservation, "no-show"))).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("INVALID_TRANSITION"));
	}

	@Test
	void adminCanCancelAfterCustomerDeadline() throws Exception {
		Reservation reservation = givenReservation();
		clock.set(AFTER_DINNER_STARTS);

		asAdmin(post(reservationPath(reservation, "cancel"))).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CANCELLED"));
	}

	@Test
	void unknownReservationReturns404() throws Exception {
		asAdmin(post("/api/v1/admin/reservations/999/confirm")).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESERVATION_NOT_FOUND"));
	}

	@Test
	void occupancyReturnsPositions() throws Exception {
		givenReservation();

		asAdmin(get("/api/v1/admin/restaurants/demo/occupancy").param("date", DATE.toString())
			.param("shiftId", shift.id().toString()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[0].x").value(120))
			.andExpect(jsonPath("$[0].y").value(120))
			.andExpect(jsonPath("$[0].occupied").value(true));
	}

	@Test
	void concurrentConfirmsOneGets409() throws Exception {
		Reservation reservation = givenReservation();
		CountDownLatch start = new CountDownLatch(1);
		Callable<Integer> confirm = () -> {
			start.await();
			return asAdmin(post(reservationPath(reservation, "confirm"))).andReturn().getResponse().getStatus();
		};

		List<Integer> statuses = new ArrayList<>();
		try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
			List<Future<Integer>> futures = List.of(executor.submit(confirm), executor.submit(confirm));
			start.countDown();
			for (Future<Integer> future : futures) {
				statuses.add(future.get());
			}
		}

		assertThat(statuses).containsExactlyInAnyOrder(200, 409);
		assertThat(jdbc.sql("SELECT status FROM reservation").query(String.class).single()).isEqualTo("CONFIRMED");
	}

}
