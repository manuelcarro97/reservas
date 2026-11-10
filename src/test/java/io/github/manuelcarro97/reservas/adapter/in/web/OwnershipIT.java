package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import io.github.manuelcarro97.reservas.application.port.in.ManageReservationUseCase;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * Frontera de seguridad entre dueños: cada ruta de administración responde 2xx a su dueño y 404 con el código del
 * recurso a cualquier otro, sin tocar nada. Cada tarea que añada rutas de administración añade su fila a
 * {@link #routes()}.
 * <p>
 * Quedan fuera las rutas por dueño y no por plano ({@code GET /admin/me}, {@code DELETE /admin/account}, las de
 * Telegram): no hay recurso ajeno que dé 404. Las cubren {@code AccountApiIT} y {@code TelegramLinkIT}.
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
				new Route("GET shifts", it -> get("/api/v1/admin/restaurants/plano-a/shifts"), RESTAURANT_NOT_FOUND),
				new Route("PATCH shift", it -> patch(it.shiftPath())
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"name":"Otro nombre"}
							"""), RESTAURANT_NOT_FOUND),
				// Mover o borrar el turno exige que no tenga reservas activas futuras: se cancela la del escenario.
				new Route("PUT shift", it -> put(it.shiftPath())
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"start":"21:00","end":"23:00","days":["MONDAY"]}
							"""), RESTAURANT_NOT_FOUND, it -> it.manageReservation.cancel("owner-a", it.reservation.id())),
				new Route("DELETE shift", it -> delete(it.shiftPath()), RESTAURANT_NOT_FOUND,
						it -> it.manageReservation.cancel("owner-a", it.reservation.id())),
				new Route("GET closures",
						it -> get("/api/v1/admin/restaurants/plano-a/closures").param("from", "2026-12-01"),
						RESTAURANT_NOT_FOUND),
				new Route("DELETE closure", it -> delete("/api/v1/admin/restaurants/plano-a/closures/2026-12-25"),
						RESTAURANT_NOT_FOUND,
						it -> it.restaurants.addClosure(it.restaurant.id(), LocalDate.of(2026, 12, 25), "Navidad")),
				new Route("GET reservations",
						it -> get("/api/v1/admin/restaurants/plano-a/reservations").param("date", DATE.toString()),
						RESTAURANT_NOT_FOUND),
				new Route("GET pending reservations",
						it -> get("/api/v1/admin/restaurants/plano-a/reservations").param("status", "PENDING"),
						RESTAURANT_NOT_FOUND),
				new Route("GET summary",
						it -> get("/api/v1/admin/restaurants/plano-a/summary").param("week", DATE.toString()),
						RESTAURANT_NOT_FOUND),
				new Route("PUT reservation table",it -> put(it.reservationPath("table"))
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"tableId":%d}
							""".formatted(it.spare.id())), RESERVATION_NOT_FOUND),
				new Route("GET suggestions", it -> get(it.reservationPath("suggestions")), RESERVATION_NOT_FOUND),
				new Route("POST confirm", it -> post(it.reservationPath("confirm")), RESERVATION_NOT_FOUND),
				new Route("POST cancel", it -> post(it.reservationPath("cancel")), RESERVATION_NOT_FOUND),
				new Route("POST no-show", it -> post(it.reservationPath("no-show")), RESERVATION_NOT_FOUND,
						it -> {
							it.manageReservation.confirm("owner-a", it.reservation.id());
							it.clock.set(AFTER_DINNER_STARTS);
						}),
				// Borrar el plano exige que no tenga reservas activas futuras: se cancela la del escenario.
				new Route("DELETE plan", it -> delete("/api/v1/admin/restaurants/plano-a"), RESTAURANT_NOT_FOUND,
						it -> it.manageReservation.cancel("owner-a", it.reservation.id())));
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
	private DiningTable spare;

	@BeforeEach
	void seed() {
		restaurant = givenRestaurant("plano-a", "owner-a");
		shift = givenDinnerShift(restaurant);
		reservation = givenReservation(restaurant, shift, givenTable(restaurant, "M2", 2), DATE, 2);
		spare = givenTable(restaurant, "M3", 4);
	}

	private String shiftPath() {
		return "/api/v1/admin/restaurants/plano-a/shifts/" + shift.id();
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

	@Test
	void ownerCannotAssignTableOfAnotherOwnersPlan() throws Exception {
		Restaurant otherPlan = givenRestaurant("plano-b", "owner-b");
		DiningTable foreign = givenTable(otherPlan, "B1", 4);
		List<String> before = fingerprint();

		mvc.perform(put(reservationPath("table")).contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"tableId":%d}
					""".formatted(foreign.id())).with(AuthRequests.owner("owner-a")))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("TABLE_NOT_FOUND"));

		assertThat(fingerprint()).isEqualTo(before);
	}

	/** Foto del estado que las rutas de administración pueden modificar. */
	private List<String> fingerprint() {
		List<String> state = new java.util.ArrayList<>();
		state.addAll(jdbc.sql("SELECT name || '/' || status || '/' || theme || '/' || cancellation_deadline_hours "
				+ "|| '/' || coalesce(deleted_at::text, '-') FROM restaurant ORDER BY id").query(String.class).list());
		state.addAll(jdbc.sql("SELECT room_shape || '/' || room_width || '/' || room_height || '/' || room_cut_width "
				+ "|| '/' || room_cut_depth || '/' || room_rotation FROM restaurant ORDER BY id")
			.query(String.class)
			.list());
		state.addAll(jdbc.sql("SELECT id || '/' || label || '/' || shape || '/' || seats || '/' || rotation || '/' "
				+ "|| x || '/' || y || '/' || coalesce(deleted_at::text, '-') FROM dining_table ORDER BY id")
			.query(String.class)
			.list());
		state.addAll(jdbc.sql("SELECT status || '/' || version || '/' || coalesce(table_id::text, '-') "
				+ "|| '/' || customer_name FROM reservation ORDER BY id")
			.query(String.class)
			.list());
		state.addAll(jdbc.sql("SELECT id || '/' || name || '/' || start_time || '/' || end_time || '/' "
				+ "|| array_to_string(days_of_week, ',') || '/' || coalesce(deleted_at::text, '-') FROM shift "
				+ "ORDER BY id").query(String.class).list());
		state.addAll(jdbc.sql("SELECT restaurant_id || '/' || date FROM closure ORDER BY id")
			.query(String.class)
			.list());
		return state;
	}

}
