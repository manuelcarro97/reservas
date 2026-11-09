package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.PostgresIT;

@AutoConfigureMockMvc
class LayoutApiIT extends PostgresIT {

	private static final String PLANS = "/api/v1/admin/restaurants";
	private static final String SLUG = "mi-local";
	private static final LocalDate DATE = LocalDate.of(2026, 12, 2);
	private static final String DEFAULT_ROOM = room("RECTANGLE", 1200, 800, 0, 0);

	@Autowired
	private MockMvc mvc;

	private Restaurant plan;
	private Shift shift;

	@BeforeEach
	void seed() {
		plan = givenRestaurant(SLUG, "owner-a");
		shift = givenDinnerShift(plan);
	}

	private static String room(String shape, int width, int height, int cutWidth, int cutDepth) {
		return """
				{"shape":"%s","width":%d,"height":%d,"cutWidth":%d,"cutDepth":%d,"rotation":0}
				""".formatted(shape, width, height, cutWidth, cutDepth);
	}

	/** Mesa cuadrada sin giro; {@code id} nulo es una mesa nueva. */
	private static String table(Long id, String label, int seats, int x, int y) {
		return """
				{"id":%s,"label":"%s","shape":"SQUARE","seats":%d,"rotation":0,"x":%d,"y":%d}
				""".formatted(id, label, seats, x, y);
	}

	private static String body(String room, String... tables) {
		return "{\"room\":%s,\"tables\":[%s]}".formatted(room, String.join(",", tables));
	}

	/** La misma mesa que {@code givenTable}, tal como la envía el editor. */
	private static String same(DiningTable table) {
		return table(table.id(), table.label(), table.seats(), table.x(), table.y());
	}

	private ResultActions save(String body) throws Exception {
		return saveAs("owner-a", body);
	}

	private ResultActions saveAs(String uid, String body) throws Exception {
		return mvc.perform(put(PLANS + "/" + SLUG + "/layout").with(AuthRequests.owner(uid))
			.contentType(MediaType.APPLICATION_JSON)
			.content(body));
	}

	private String read() throws Exception {
		return mvc.perform(get(PLANS + "/" + SLUG).with(AuthRequests.owner("owner-a")))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
	}

	private ResultActions readPlan() throws Exception {
		return mvc.perform(get(PLANS + "/" + SLUG).with(AuthRequests.owner("owner-a")));
	}

	private String statusInDatabase() {
		return jdbc.sql("SELECT status FROM restaurant WHERE id = :id")
			.param("id", plan.id())
			.query(String.class)
			.single();
	}

	@Test
	void savesRoomAndTablesAtOnce() throws Exception {
		mvc.perform(post(PLANS).with(AuthRequests.owner("owner-a"))
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"slug":"nuevo","name":"Nuevo"}
					""")).andExpect(status().isCreated());

		String saved = mvc
			.perform(put(PLANS + "/nuevo/layout").with(AuthRequests.owner("owner-a"))
				.contentType(MediaType.APPLICATION_JSON)
				.content(body(room("L", 1200, 800, 400, 300), table(null, "1", 2, 200, 100),
						table(null, "2", 2, 400, 100), table(null, "3", 2, 600, 100))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.room.shape").value("L"))
			.andExpect(jsonPath("$.room.cutWidth").value(400))
			.andExpect(jsonPath("$.room.cutDepth").value(300))
			.andExpect(jsonPath("$.tables", hasSize(3)))
			.andExpect(jsonPath("$.tables[*].id", hasSize(3)))
			.andExpect(jsonPath("$.tables[0].id").value(notNullValue()))
			.andExpect(jsonPath("$.tables[*].label", contains("1", "2", "3")))
			.andExpect(jsonPath("$.status").value("DRAFT"))
			.andReturn()
			.getResponse()
			.getContentAsString();

		String read = mvc.perform(get(PLANS + "/nuevo").with(AuthRequests.owner("owner-a")))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(read).isEqualTo(saved);
	}

	@Test
	void overlapReturns422AndSavesNothing() throws Exception {
		DiningTable first = givenTable(plan, "M1", 2);
		DiningTable second = givenTable(plan, "M2", 2);
		String before = read();

		save(body(DEFAULT_ROOM, table(first.id(), "M1", 2, 120, 120), table(second.id(), "M2", 2, 150, 120)))
			.andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("LAYOUT_INVALID"))
			.andExpect(jsonPath("$.problems[*].code", hasItem("OVERLAP")))
			.andExpect(jsonPath("$.problems[0].tableIndex").value(0))
			.andExpect(jsonPath("$.problems[0].label").value("M1"));

		assertThat(read()).isEqualTo(before);
	}

	@Test
	void unknownTableIdReturns422() throws Exception {
		DiningTable existing = givenTable(plan, "M1", 2);
		String before = read();

		save(body(DEFAULT_ROOM, same(existing), table(9999L, "M2", 2, 300, 120)))
			.andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("LAYOUT_INVALID"))
			.andExpect(jsonPath("$.problems[0].code").value("UNKNOWN_TABLE"))
			.andExpect(jsonPath("$.problems[0].tableIndex").value(1))
			.andExpect(jsonPath("$.problems[0].label").value("M2"));

		assertThat(read()).isEqualTo(before);
	}

	@Test
	void tableOfAnotherPlanReturns422AndTouchesNothing() throws Exception {
		DiningTable existing = givenTable(plan, "M1", 2);
		Restaurant other = givenRestaurant("otro-local", "owner-b");
		DiningTable foreign = givenTable(other, "X1", 2);

		save(body(DEFAULT_ROOM, same(existing), table(foreign.id(), "X1", 2, 300, 120)))
			.andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.problems[0].code").value("UNKNOWN_TABLE"));

		assertThat(tables.findAll(other.id())).extracting(DiningTable::label).containsExactly("X1");
	}

	@Test
	void removedTableIdCannotComeBack() throws Exception {
		DiningTable first = givenTable(plan, "M1", 2);
		DiningTable second = givenTable(plan, "M2", 2);
		save(body(DEFAULT_ROOM, same(first))).andExpect(status().isOk());

		save(body(DEFAULT_ROOM, same(first), same(second))).andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.problems[0].code").value("UNKNOWN_TABLE"))
			.andExpect(jsonPath("$.problems[0].tableIndex").value(1));

		assertThat(tables.findAll(plan.id())).extracting(DiningTable::label).containsExactly("M1");
	}

	@Test
	void sameIdTwiceReturns422() throws Exception {
		DiningTable existing = givenTable(plan, "M1", 2);

		save(body(DEFAULT_ROOM, same(existing), table(existing.id(), "M2", 2, 300, 120)))
			.andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.problems[0].code").value("UNKNOWN_TABLE"))
			.andExpect(jsonPath("$.problems[0].tableIndex").value(1));

		assertThat(tables.findAll(plan.id())).extracting(DiningTable::label).containsExactly("M1");
	}

	@Test
	void addMoveRenameWhilePublishedWithReservations() throws Exception {
		DiningTable first = givenTable(plan, "M1", 4);
		DiningTable second = givenTable(plan, "M2", 2);
		Reservation booked = givenReservation(plan, shift, first, DATE, 2);

		save(body(DEFAULT_ROOM, table(first.id(), "M1", 4, 120, 400), table(second.id(), "Terraza", 2, 300, 120),
				table(null, "M3", 2, 480, 120))).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PUBLISHED"))
			.andExpect(jsonPath("$.tables[*].label", containsInAnyOrder("M1", "Terraza", "M3")))
			.andExpect(jsonPath("$.tables[?(@.label=='M1')].y").value(400));

		assertThat(statusInDatabase()).isEqualTo("PUBLISHED");
		assertThat(reservations.findById(booked.id()).orElseThrow().tableId()).isEqualTo(first.id());
	}

	@Test
	void removingTableWithActiveReservationReturns409() throws Exception {
		DiningTable first = givenTable(plan, "M1", 2);
		DiningTable second = givenTable(plan, "M2", 2);
		Reservation booked = givenReservation(plan, shift, first, DATE, 2);
		String before = read();

		save(body(DEFAULT_ROOM, same(second))).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("TABLE_HAS_RESERVATIONS"))
			.andExpect(jsonPath("$.reservations", contains(booked.code())));

		assertThat(read()).isEqualTo(before);
	}

	@Test
	void lowerSeatsBelowPartyReturns409() throws Exception {
		DiningTable first = givenTable(plan, "M1", 4);
		Reservation booked = givenReservation(plan, shift, first, DATE, 4);

		save(body(DEFAULT_ROOM, table(first.id(), "M1", 2, 120, 120))).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("TABLE_HAS_RESERVATIONS"))
			.andExpect(jsonPath("$.reservations", contains(booked.code())));

		assertThat(tables.findAll(plan.id())).extracting(DiningTable::seats).containsExactly(4);
	}

	@Test
	void removingTableWithOnlyPastReservationsWorks() throws Exception {
		DiningTable first = givenTable(plan, "M1", 2);
		DiningTable second = givenTable(plan, "M2", 2);
		Reservation booked = givenReservation(plan, shift, first, DATE, 2);
		clock.set(Instant.parse("2026-12-03T09:00:00Z"));

		save(body(DEFAULT_ROOM, same(second))).andExpect(status().isOk())
			.andExpect(jsonPath("$.tables", hasSize(1)))
			.andExpect(jsonPath("$.tables[0].label").value("M2"));

		readPlan().andExpect(jsonPath("$.tables[*].label", contains("M2")));
		mvc.perform(get("/api/v1/reservations/" + booked.code()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.tableLabel").value("M1"));
	}

	@Test
	void changingRoomWithActiveReservationsReturns409RoomLocked() throws Exception {
		DiningTable first = givenTable(plan, "M1", 2);
		Reservation booked = givenReservation(plan, shift, first, DATE, 2);
		String before = read();

		save(body(room("RECTANGLE", 1400, 800, 0, 0), same(first))).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ROOM_LOCKED"))
			.andExpect(jsonPath("$.reservations", contains(booked.code())));

		assertThat(read()).isEqualTo(before);
	}

	@Test
	void changingRoomWithoutReservationsReturnsToDraft() throws Exception {
		DiningTable first = givenTable(plan, "M1", 2);

		save(body(room("RECTANGLE", 1400, 800, 0, 0), same(first))).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("DRAFT"))
			.andExpect(jsonPath("$.room.width").value(1400));

		assertThat(statusInDatabase()).isEqualTo("DRAFT");
	}

	@Test
	void keepingRoomKeepsPlanPublished() throws Exception {
		DiningTable first = givenTable(plan, "M1", 2);

		save(body(DEFAULT_ROOM, table(first.id(), "M1", 2, 200, 200))).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PUBLISHED"));
	}

	@Test
	void changingRoomWithOnlyPastReservationsIsAllowed() throws Exception {
		DiningTable first = givenTable(plan, "M1", 2);
		givenReservation(plan, shift, first, DATE, 2);
		clock.set(Instant.parse("2026-12-03T09:00:00Z"));

		save(body(room("RECTANGLE", 1400, 800, 0, 0), same(first))).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("DRAFT"));
	}

	@Test
	void swapLabelsInOneSave() throws Exception {
		DiningTable one = givenTable(plan, "1", 2);
		DiningTable two = givenTable(plan, "2", 2);

		save(body(DEFAULT_ROOM, table(one.id(), "2", 2, one.x(), one.y()), table(two.id(), "1", 2, two.x(), two.y())))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.tables[?(@.id==%d)].label".formatted(one.id())).value("2"))
			.andExpect(jsonPath("$.tables[?(@.id==%d)].label".formatted(two.id())).value("1"));

		assertThat(tables.findAll(plan.id())).extracting(DiningTable::id, DiningTable::label)
			.containsExactly(tuple(one.id(), "2"),
					tuple(two.id(), "1"));
	}

	@Test
	void labelOfRemovedTableCanBeReusedInSameSave() throws Exception {
		DiningTable three = givenTable(plan, "3", 2);
		DiningTable four = givenTable(plan, "4", 2);

		save(body(DEFAULT_ROOM, same(three), table(null, "4", 4, 480, 300))).andExpect(status().isOk())
			.andExpect(jsonPath("$.tables[*].label", contains("3", "4")));

		List<DiningTable> stored = tables.findAll(plan.id());
		assertThat(stored).hasSize(2);
		assertThat(stored.get(1).label()).isEqualTo("4");
		assertThat(stored.get(1).id()).isNotEqualTo(four.id());
		assertThat(jdbc.sql("SELECT count(*) FROM dining_table WHERE id = :id AND deleted_at IS NOT NULL")
			.param("id", four.id())
			.query(Integer.class)
			.single()).isEqualTo(1);
	}

	@Test
	void removingTableBreakingAssignedCapacityReturns409() throws Exception {
		restaurants.save(plan.withSettings(plan.name(), plan.theme(), BookingMode.ASSIGNED,
				plan.cancellationDeadlineHours()));
		DiningTable first = givenTable(plan, "M1", 4);
		DiningTable second = givenTable(plan, "M2", 4);
		Reservation one = givenReservation(plan, shift, null, DATE, 4);
		Reservation two = givenReservation(plan, shift, null, DATE, 4);

		save(body(DEFAULT_ROOM, same(first))).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("TABLE_HAS_RESERVATIONS"))
			.andExpect(jsonPath("$.reservations", containsInAnyOrder(one.code(), two.code())));

		assertThat(tables.findAll(plan.id())).hasSize(2);
		save(body(DEFAULT_ROOM, same(first), same(second))).andExpect(status().isOk());
	}

	@Test
	void assignedCapacityCountsTablesTakenByOtherReservations() throws Exception {
		DiningTable first = givenTable(plan, "M1", 4);
		DiningTable second = givenTable(plan, "M2", 4);
		givenReservation(plan, shift, first, DATE, 2);
		Reservation unassigned = givenReservation(plan, shift, null, DATE, 4);

		save(body(DEFAULT_ROOM, same(first), table(second.id(), "M2", 2, 300, 120))).andExpect(status().isConflict())
			.andExpect(jsonPath("$.reservations", contains(unassigned.code())));
	}

	@Test
	void reservationTodayAtMadridMidnightCountsAsActive() throws Exception {
		DiningTable first = givenTable(plan, "M1", 2);
		DiningTable second = givenTable(plan, "M2", 2);
		Reservation booked = givenReservation(plan, shift, first, DATE, 2);
		clock.set(Instant.parse("2026-12-01T23:30:00Z"));

		save(body(DEFAULT_ROOM, same(second))).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("TABLE_HAS_RESERVATIONS"))
			.andExpect(jsonPath("$.reservations", contains(booked.code())));
	}

	@Test
	void reservationYesterdayInMadridButTodayInUtcIsPast() throws Exception {
		DiningTable first = givenTable(plan, "M1", 2);
		DiningTable second = givenTable(plan, "M2", 2);
		givenReservation(plan, shift, first, LocalDate.of(2026, 12, 1), 2);
		clock.set(Instant.parse("2026-12-01T23:30:00Z"));

		save(body(DEFAULT_ROOM, same(second))).andExpect(status().isOk());
	}

	@Test
	void anotherOwnerGets404AndNothingChanges() throws Exception {
		givenTable(plan, "M1", 2);
		String before = read();

		saveAs("owner-b", body(DEFAULT_ROOM)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));

		assertThat(read()).isEqualTo(before);
	}

	@Test
	void missingTableShapeReturns400() throws Exception {
		save(body(DEFAULT_ROOM, """
				{"label":"1","seats":2,"rotation":0,"x":120,"y":120}
				""")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void missingTablesReturns400() throws Exception {
		save("{\"room\":%s}".formatted(DEFAULT_ROOM)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void hugeCoordinatesReturn400() throws Exception {
		save(body(DEFAULT_ROOM, table(null, "1", 2, 2_000_000_000, 120))).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		save(body(room("RECTANGLE", 2_000_000_000, 800, 0, 0))).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void tooLongLabelReturns400() throws Exception {
		save(body(DEFAULT_ROOM, table(null, "x".repeat(41), 2, 120, 120))).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void moreThanSixtyTablesReturns400() throws Exception {
		String[] many = new String[61];
		for (int i = 0; i < many.length; i++) {
			many[i] = table(null, "T" + i, 2, 120, 120);
		}

		save(body(DEFAULT_ROOM, many)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void invalidRoomReturns422() throws Exception {
		save(body(room("L", 1200, 800, 0, 0))).andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("LAYOUT_INVALID"))
			.andExpect(jsonPath("$.problems[0].code").value("INVALID_ROOM"));
	}

}
