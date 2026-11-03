package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import io.github.manuelcarro97.reservas.application.port.in.ManageReservationUseCase;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * Frontera de seguridad entre dueños: cada ruta de administración responde 2xx a su dueño y 404 con el código del
 * recurso a cualquier otro, sin tocar nada. Cada tarea que añada rutas de administración añade su fila a
 * {@link #routes()}.
 */
@AutoConfigureMockMvc
class OwnershipIT extends PostgresIT {

	private static final LocalDate DATE = LocalDate.of(2026, 12, 2);
	private static final Instant AFTER_DINNER_STARTS = Instant.parse("2026-12-02T19:30:00Z");
	private static final String RESTAURANT_NOT_FOUND = "RESTAURANT_NOT_FOUND";
	private static final String RESERVATION_NOT_FOUND = "RESERVATION_NOT_FOUND";

	/** Una ruta de administración; {@code arrange} deja el estado listo para que el dueño la use con éxito. */
	private record Route(String name, Function<OwnershipIT, MockHttpServletRequestBuilder> request,
			String notFoundCode, Consumer<OwnershipIT> arrange) {

		Route(String name, Function<OwnershipIT, MockHttpServletRequestBuilder> request, String notFoundCode) {
			this(name, request, notFoundCode, ownershipIT -> {
			});
		}

		@Override
		public String toString() {
			return name;
		}
	}

	static List<Route> routes() {
		return List.of(
				new Route("GET plan", it -> get("/api/v1/admin/restaurants/plano-a"), RESTAURANT_NOT_FOUND),
				new Route("PATCH plan", it -> patch("/api/v1/admin/restaurants/plano-a")
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"name":"Otro","theme":"BOSQUE","bookingMode":"FREE_CHOICE","cancellationDeadlineHours":3}
							"""), RESTAURANT_NOT_FOUND),
				new Route("POST publish", it -> post("/api/v1/admin/restaurants/plano-a/publish"),
						RESTAURANT_NOT_FOUND),
				// Mueve M2 (con reserva activa) sin tocar el local: lo que cambia es solo su posición.
				new Route("PUT layout", it -> put("/api/v1/admin/restaurants/plano-a/layout")
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"room":{"shape":"RECTANGLE","width":1200,"height":800,"cutWidth":0,"cutDepth":0,"rotation":0},
							 "tables":[{"id":%d,"label":"M2","shape":"SQUARE","seats":2,"rotation":0,"x":200,"y":200}]}
							""".formatted(it.reservation.tableId())), RESTAURANT_NOT_FOUND),
				new Route("GET occupancy",
						it -> get("/api/v1/admin/restaurants/plano-a/occupancy").param("date", DATE.toString())
							.param("shiftId", it.shift.id().toString()),
						RESTAURANT_NOT_FOUND),
				new Route("POST shift", it -> post("/api/v1/admin/restaurants/plano-a/shifts")
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"name":"Tarde","start":"23:00","end":"23:30","days":["MONDAY"]}
							"""), RESTAURANT_NOT_FOUND),
				new Route("POST closure", it -> post("/api/v1/admin/restaurants/plano-a/closures")
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"date":"2026-12-25","reason":"Navidad"}
							"""), RESTAURANT_NOT_FOUND),
				new Route("GET reservations",
						it -> get("/api/v1/admin/restaurants/plano-a/reservations").param("date", DATE.toString()),
						RESTAURANT_NOT_FOUND),
				new Route("POST confirm", it -> post(it.reservationPath("confirm")), RESERVATION_NOT_FOUND),
				new Route("POST cancel", it -> post(it.reservationPath("cancel")), RESERVATION_NOT_FOUND),
				new Route("POST no-show", it -> post(it.reservationPath("no-show")), RESERVATION_NOT_FOUND,
						it -> {
							it.manageReservation.confirm("owner-a", it.reservation.id());
							it.clock.set(AFTER_DINNER_STARTS);
						}));
	}

	static Stream<Arguments> routeCases() {
		return routes().stream().map(route -> Arguments.of(route));
	}

	@Autowired
	private MockMvc mvc;

	@Autowired
	private ManageReservationUseCase manageReservation;

	private Restaurant restaurant;
	private Shift shift;
	private Reservation reservation;

	@BeforeEach
	void seed() {
		restaurant = givenRestaurant("plano-a", "owner-a");
		shift = givenDinnerShift(restaurant);
		reservation = givenReservation(restaurant, shift, givenTable(restaurant, "M2", 2), DATE, 2);
	}

	private String reservationPath(String action) {
		return "/api/v1/admin/reservations/" + reservation.id() + "/" + action;
	}

	@ParameterizedTest(name = "{0}: owner-a 2xx")
	@MethodSource("routeCases")
	void ownerGetsSuccess(Route route) throws Exception {
		route.arrange().accept(this);

		mvc.perform(route.request().apply(this).with(AuthRequests.owner("owner-a")))
			.andExpect(status().is2xxSuccessful());
	}

	@ParameterizedTest(name = "{0}: owner-b 404")
	@MethodSource("routeCases")
	void otherOwnerGetsNotFoundAndChangesNothing(Route route) throws Exception {
		route.arrange().accept(this);
		List<String> before = fingerprint();

		mvc.perform(route.request().apply(this).with(AuthRequests.owner("owner-b")))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value(route.notFoundCode()));

		assertThat(fingerprint()).isEqualTo(before);
	}

	/** Foto del estado que las rutas de administración pueden modificar. */
	private List<String> fingerprint() {
		List<String> state = new java.util.ArrayList<>();
		state.addAll(jdbc.sql("SELECT name || '/' || status || '/' || theme || '/' || cancellation_deadline_hours "
				+ "FROM restaurant ORDER BY id").query(String.class).list());
		state.addAll(jdbc.sql("SELECT room_shape || '/' || room_width || '/' || room_height || '/' || room_cut_width "
				+ "|| '/' || room_cut_depth || '/' || room_rotation FROM restaurant ORDER BY id")
			.query(String.class)
			.list());
		state.addAll(jdbc.sql("SELECT id || '/' || label || '/' || shape || '/' || seats || '/' || rotation || '/' "
				+ "|| x || '/' || y || '/' || coalesce(deleted_at::text, '-') FROM dining_table ORDER BY id")
			.query(String.class)
			.list());
		state.addAll(jdbc.sql("SELECT status || '/' || version FROM reservation ORDER BY id")
			.query(String.class)
			.list());
		state.add("shifts=" + jdbc.sql("SELECT count(*) FROM shift").query(Integer.class).single());
		state.add("closures=" + jdbc.sql("SELECT count(*) FROM closure").query(Integer.class).single());
		return state;
	}

}
