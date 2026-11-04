package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.EnumSet;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
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
class ShiftAdminApiIT extends PostgresIT {

	private static final String SLUG = "mi-local";
	private static final String SHIFTS = "/api/v1/admin/restaurants/" + SLUG + "/shifts";
	private static final String CLOSURES = "/api/v1/admin/restaurants/" + SLUG + "/closures";
	private static final LocalDate DATE = LocalDate.of(2026, 12, 2);
	private static final LocalDate PAST_DATE = LocalDate.of(2026, 11, 30);

	private static final String LATER_SLOT = """
			{"start":"21:00","end":"23:00","days":["MONDAY","TUESDAY"]}
			""";

	@Autowired
	private MockMvc mvc;

	private Restaurant plan;
	private Shift dinner;
	private DiningTable table;

	@BeforeEach
	void seed() {
		plan = givenRestaurant(SLUG, "owner-a");
		dinner = givenDinnerShift(plan);
		table = givenTable(plan, "M1", 2);
	}

	private ResultActions send(MockHttpServletRequestBuilder request)
			throws Exception {
		return mvc.perform(request.with(AuthRequests.owner("owner-a")));
	}

	private ResultActions rename(long shiftId, String name) throws Exception {
		return send(patch(SHIFTS + "/" + shiftId).contentType(MediaType.APPLICATION_JSON).content("""
				{"name":"%s"}
				""".formatted(name)));
	}

	private ResultActions reschedule(long shiftId, String body) throws Exception {
		return send(put(SHIFTS + "/" + shiftId).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private ResultActions deleteShift(long shiftId) throws Exception {
		return send(delete(SHIFTS + "/" + shiftId));
	}

	private Shift givenLunchShift() {
		return shifts.save(new Shift(null, plan.id(), "Comida", LocalTime.of(13, 0), LocalTime.of(15, 0),
				EnumSet.allOf(DayOfWeek.class)));
	}

	private String nameInDatabase(long shiftId) {
		return jdbc.sql("SELECT name FROM shift WHERE id = :id").param("id", shiftId).query(String.class).single();
	}

	private String scheduleInDatabase(long shiftId) {
		return jdbc.sql("SELECT start_time || '-' || end_time || '/' || array_length(days_of_week, 1) FROM shift "
				+ "WHERE id = :id").param("id", shiftId).query(String.class).single();
	}

	private int rowsInDatabase(long shiftId) {
		return jdbc.sql("SELECT count(*) FROM shift WHERE id = :id")
			.param("id", shiftId)
			.query(Integer.class)
			.single();
	}

	private boolean hiddenInDatabase(long shiftId) {
		return jdbc.sql("SELECT deleted_at IS NOT NULL FROM shift WHERE id = :id")
			.param("id", shiftId)
			.query(Boolean.class)
			.single();
	}

	@Test
	void listsShiftsByStartTime() throws Exception {
		givenLunchShift();

		send(get(SHIFTS)).andExpect(status().isOk())
			.andExpect(jsonPath("$[*].name", contains("Comida", "Cena")))
			.andExpect(jsonPath("$[1].start").value(startsWith("20:00")));
	}

	@Test
	void renameAlwaysAllowed() throws Exception {
		Reservation reservation = givenReservation(plan, dinner, table, DATE, 2);

		rename(dinner.id(), "Cena tarde").andExpect(status().isOk())
			.andExpect(jsonPath("$.id").value(dinner.id()))
			.andExpect(jsonPath("$.name").value("Cena tarde"))
			.andExpect(jsonPath("$.start").value(startsWith("20:00")));

		assertThat(nameInDatabase(dinner.id())).isEqualTo("Cena tarde");
		assertThat(reservations.findById(reservation.id()).orElseThrow().status()).isEqualTo(reservation.status());
	}

	@Test
	void renameWithBlankNameReturns400() throws Exception {
		rename(dinner.id(), " ").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void rescheduleWithActiveReservationReturns409() throws Exception {
		Reservation reservation = givenReservation(plan, dinner, table, DATE, 2);

		reschedule(dinner.id(), LATER_SLOT).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SHIFT_HAS_RESERVATIONS"))
			.andExpect(jsonPath("$.reservations", contains(reservation.code())));

		assertThat(scheduleInDatabase(dinner.id())).isEqualTo("20:00:00-22:00:00/7");
	}

	@Test
	void rescheduleWithoutReservations() throws Exception {
		reschedule(dinner.id(), LATER_SLOT).andExpect(status().isOk())
			.andExpect(jsonPath("$.id").value(dinner.id()))
			.andExpect(jsonPath("$.name").value("Cena"))
			.andExpect(jsonPath("$.start").value(startsWith("21:00")))
			.andExpect(jsonPath("$.end").value(startsWith("23:00")))
			.andExpect(jsonPath("$.days", contains("MONDAY", "TUESDAY")));

		assertThat(scheduleInDatabase(dinner.id())).isEqualTo("21:00:00-23:00:00/2");
	}

	@Test
	void rescheduleMayReuseItsOwnOldSlot() throws Exception {
		reschedule(dinner.id(), """
				{"start":"19:00","end":"21:00","days":["MONDAY"]}
				""").andExpect(status().isOk());
	}

	@Test
	void rescheduleWithOnlyPastOrCancelledReservationsIsAllowed() throws Exception {
		givenReservation(plan, dinner, table, PAST_DATE, 2);
		Reservation cancelled = givenReservation(plan, dinner, givenTable(plan, "M2", 2), DATE, 2);
		jdbc.sql("UPDATE reservation SET status = 'CANCELLED' WHERE id = :id").param("id", cancelled.id()).update();

		reschedule(dinner.id(), LATER_SLOT).andExpect(status().isOk());
	}

	@Test
	void reservationOfAnotherShiftDoesNotBlockReschedule() throws Exception {
		Shift lunch = givenLunchShift();
		givenReservation(plan, lunch, table, DATE, 2);

		reschedule(dinner.id(), LATER_SLOT).andExpect(status().isOk());
	}

	@Test
	void rescheduleOverlappingReturns409() throws Exception {
		givenLunchShift();

		reschedule(dinner.id(), """
				{"start":"14:00","end":"21:00","days":["MONDAY"]}
				""").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SHIFT_OVERLAP"));

		assertThat(scheduleInDatabase(dinner.id())).isEqualTo("20:00:00-22:00:00/7");
	}

	@Test
	void rescheduleEndingBeforeItStartsReturns400() throws Exception {
		reschedule(dinner.id(), """
				{"start":"23:00","end":"21:00","days":["MONDAY"]}
				""").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void rescheduleWithoutDaysReturns400() throws Exception {
		reschedule(dinner.id(), """
				{"start":"21:00","end":"23:00","days":[]}
				""").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void deleteWithActiveReservationReturns409() throws Exception {
		Reservation reservation = givenReservation(plan, dinner, table, DATE, 2);

		deleteShift(dinner.id()).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SHIFT_HAS_RESERVATIONS"))
			.andExpect(jsonPath("$.reservations", contains(reservation.code())));

		assertThat(rowsInDatabase(dinner.id())).isEqualTo(1);
		assertThat(hiddenInDatabase(dinner.id())).isFalse();
	}

	@Test
	void deleteWithPastReservationHidesShift() throws Exception {
		Shift lunch = givenLunchShift();
		Reservation past = givenReservation(plan, dinner, table, PAST_DATE, 2);

		deleteShift(dinner.id()).andExpect(status().isNoContent());

		assertThat(rowsInDatabase(dinner.id())).isEqualTo(1);
		assertThat(hiddenInDatabase(dinner.id())).isTrue();
		send(get(SHIFTS)).andExpect(status().isOk()).andExpect(jsonPath("$[*].name", contains("Comida")));
		mvc.perform(get("/api/v1/restaurants/" + SLUG + "/availability").param("date", DATE.toString())
			.param("partySize", "2"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].shiftId", contains(lunch.id().intValue())));
		mvc.perform(get("/api/v1/reservations/" + past.code()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.code").value(past.code()))
			.andExpect(jsonPath("$.shiftName").value("Cena"))
			.andExpect(jsonPath("$.shiftStart").value(startsWith("20:00")));
	}

	@Test
	void deletedShiftCannotBeBooked() throws Exception {
		givenReservation(plan, dinner, table, PAST_DATE, 2);
		deleteShift(dinner.id()).andExpect(status().isNoContent());

		mvc.perform(post("/api/v1/restaurants/" + SLUG + "/reservations").contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"date":"%s","shiftId":%d,"partySize":2,"customerName":"Ana","customerPhone":"600000000"}
					""".formatted(DATE, dinner.id())))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("SHIFT_NOT_FOUND"));
	}

	@Test
	void deleteWithCancelledReservationHidesInsteadOfRemoving() throws Exception {
		Reservation reservation = givenReservation(plan, dinner, table, DATE, 2);
		jdbc.sql("UPDATE reservation SET status = 'CANCELLED' WHERE id = :id").param("id", reservation.id()).update();

		deleteShift(dinner.id()).andExpect(status().isNoContent());

		assertThat(hiddenInDatabase(dinner.id())).isTrue();
	}

	@Test
	void deletedShiftCannotBeChangedOrDeletedAgain() throws Exception {
		givenReservation(plan, dinner, table, PAST_DATE, 2);
		deleteShift(dinner.id()).andExpect(status().isNoContent());

		deleteShift(dinner.id()).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("SHIFT_NOT_FOUND"));
		rename(dinner.id(), "Otra").andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("SHIFT_NOT_FOUND"));
		reschedule(dinner.id(), LATER_SLOT).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("SHIFT_NOT_FOUND"));

		assertThat(nameInDatabase(dinner.id())).isEqualTo("Cena");
		assertThat(scheduleInDatabase(dinner.id())).isEqualTo("20:00:00-22:00:00/7");
		assertThat(hiddenInDatabase(dinner.id())).isTrue();
	}

	@Test
	void deleteUnusedShiftRemovesRow() throws Exception {
		deleteShift(dinner.id()).andExpect(status().isNoContent());

		assertThat(rowsInDatabase(dinner.id())).isZero();
	}

	@Test
	void shiftOfAnotherPlanReturns404AndChangesNothing() throws Exception {
		Restaurant other = givenRestaurant("otro-local", "owner-a");
		Shift foreign = givenLunchShiftOf(other);

		deleteShift(foreign.id()).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("SHIFT_NOT_FOUND"));
		rename(foreign.id(), "Mia").andExpect(status().isNotFound());
		reschedule(foreign.id(), LATER_SLOT).andExpect(status().isNotFound());

		assertThat(rowsInDatabase(foreign.id())).isEqualTo(1);
		assertThat(nameInDatabase(foreign.id())).isEqualTo("Comida");
		assertThat(scheduleInDatabase(foreign.id())).isEqualTo("13:00:00-15:00:00/7");
	}

	private Shift givenLunchShiftOf(Restaurant restaurant) {
		return shifts.save(new Shift(null, restaurant.id(), "Comida", LocalTime.of(13, 0), LocalTime.of(15, 0),
				EnumSet.allOf(DayOfWeek.class)));
	}

	/** Reloj en 23:30Z: en Madrid ya es 2 de diciembre, pero en UTC todavía es 1. */
	@Test
	void shiftActiveCheckUsesRestaurantZone() throws Exception {
		clock.set(Instant.parse("2026-12-01T23:30:00Z"));
		givenReservation(plan, dinner, table, DATE, 2);

		reschedule(dinner.id(), LATER_SLOT).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SHIFT_HAS_RESERVATIONS"));
		deleteShift(dinner.id()).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SHIFT_HAS_RESERVATIONS"));
	}

	@Test
	void reservationYesterdayInMadridButTodayInUtcIsPast() throws Exception {
		clock.set(Instant.parse("2026-12-01T23:30:00Z"));
		givenReservation(plan, dinner, table, LocalDate.of(2026, 12, 1), 2);

		reschedule(dinner.id(), LATER_SLOT).andExpect(status().isOk());
		deleteShift(dinner.id()).andExpect(status().isNoContent());

		assertThat(hiddenInDatabase(dinner.id())).isTrue();
	}

	@Test
	void listAndRemoveClosures() throws Exception {
		addClosure("2026-12-25", "Navidad").andExpect(status().isCreated());
		addClosure("2026-12-24", "Nochebuena").andExpect(status().isCreated());
		// Un cierre pasado ya no se puede crear por la API: se inserta directamente para probar el filtro de la lista.
		restaurants.addClosure(plan.id(), LocalDate.of(2026, 11, 20), "Pasado");

		send(get(CLOSURES).param("from", "2026-12-01")).andExpect(status().isOk())
			.andExpect(jsonPath("$", contains("2026-12-24", "2026-12-25")));

		send(delete(CLOSURES + "/2026-12-24")).andExpect(status().isNoContent());

		send(get(CLOSURES).param("from", "2026-12-01")).andExpect(status().isOk())
			.andExpect(jsonPath("$", contains("2026-12-25")));
		send(get(CLOSURES).param("from", "2026-01-01")).andExpect(status().isOk())
			.andExpect(jsonPath("$", contains("2026-11-20", "2026-12-25")));
	}

	@Test
	void aPastClosureCanStillBeRemovedThroughTheApi() throws Exception {
		restaurants.addClosure(plan.id(), LocalDate.of(2026, 11, 20), "Pasado");

		send(delete(CLOSURES + "/2026-11-20")).andExpect(status().isNoContent());

		assertThat(restaurants.isClosed(plan.id(), LocalDate.of(2026, 11, 20))).isFalse();
	}

	@Test
	void removingAClosureThatDoesNotExistIsNoOp() throws Exception {
		send(delete(CLOSURES + "/2026-12-24")).andExpect(status().isNoContent());
	}

	@Test
	void removingAClosureOnlyAffectsThisPlan() throws Exception {
		Restaurant other = givenRestaurant("otro-local", "owner-b");
		restaurants.addClosure(other.id(), LocalDate.of(2026, 12, 24), "Suyo");

		send(delete(CLOSURES + "/2026-12-24")).andExpect(status().isNoContent());

		assertThat(restaurants.isClosed(other.id(), LocalDate.of(2026, 12, 24))).isTrue();
	}

	@Test
	void closingTheSameDayTwiceKeepsOneClosure() throws Exception {
		addClosure("2026-12-25", "Navidad").andExpect(status().isCreated());
		addClosure("2026-12-25", "Navidad otra vez").andExpect(status().isCreated());

		send(get(CLOSURES).param("from", "2026-12-01")).andExpect(jsonPath("$", contains("2026-12-25")));
	}

	@Test
	void closingADayWithActiveReservationReturns409() throws Exception {
		givenReservation(plan, dinner, table, DATE, 2);

		addClosure(DATE.toString(), "Reforma").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("CLOSURE_HAS_RESERVATIONS"));
	}

	@Test
	void closuresListNeedsFromDate() throws Exception {
		send(get(CLOSURES)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void addedShiftAppearsInList() throws Exception {
		send(post(SHIFTS).contentType(MediaType.APPLICATION_JSON).content("""
				{"name":"Merienda","start":"17:00","end":"19:00","days":["MONDAY"]}
				""")).andExpect(status().isCreated());

		send(get(SHIFTS)).andExpect(jsonPath("$[*].name", hasItem("Merienda")));
	}

	// --- topes de escritura ---

	/** Deja el plano con {@code count} turnos visibles: la cena y horas sueltas de una hora, sin solaparse. */
	private void givenShifts(int count) {
		for (int i = 0; i < count - 1; i++) {
			shifts.save(new Shift(null, plan.id(), "Hora " + i, LocalTime.of(6 + i, 0), LocalTime.of(7 + i, 0),
					EnumSet.allOf(DayOfWeek.class)));
		}
	}

	private ResultActions addShiftAt(String start, String end) throws Exception {
		return send(post(SHIFTS).contentType(MediaType.APPLICATION_JSON).content("""
				{"name":"Extra","start":"%s","end":"%s","days":["MONDAY"]}
				""".formatted(start, end)));
	}

	@Test
	void eleventhVisibleShiftReturns409ShiftLimit() throws Exception {
		givenShifts(10);

		addShiftAt("16:00", "17:00").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SHIFT_LIMIT"));

		send(get(SHIFTS)).andExpect(jsonPath("$.length()").value(10));
	}

	@Test
	void tenthVisibleShiftIsAllowed() throws Exception {
		givenShifts(9);

		addShiftAt("16:00", "17:00").andExpect(status().isCreated());
	}

	@Test
	void deletingAShiftMakesRoomForAnother() throws Exception {
		givenShifts(10);
		Shift removable = shifts.findAll(plan.id()).getFirst();
		deleteShift(removable.id()).andExpect(status().isNoContent());

		addShiftAt("16:00", "17:00").andExpect(status().isCreated());
	}

	@Test
	void hiddenShiftsDoNotCountForTheLimit() throws Exception {
		givenShifts(10);
		givenReservation(plan, dinner, table, PAST_DATE, 2);
		deleteShift(dinner.id()).andExpect(status().isNoContent());
		assertThat(hiddenInDatabase(dinner.id())).isTrue();

		addShiftAt("16:00", "17:00").andExpect(status().isCreated());
	}

	@Test
	void shiftLimitIsPerPlan() throws Exception {
		givenShifts(10);
		Restaurant other = givenRestaurant("otro-local", "owner-a");

		send(post("/api/v1/admin/restaurants/otro-local/shifts").contentType(MediaType.APPLICATION_JSON).content("""
				{"name":"Cena","start":"20:00","end":"22:00","days":["MONDAY"]}
				""")).andExpect(status().isCreated());
		assertThat(other.id()).isNotEqualTo(plan.id());
	}

	@Test
	void shiftTimesWithSecondsAreRejectedOnCreate() throws Exception {
		addShiftAt("16:00:30", "17:00").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		addShiftAt("16:00", "17:00:15").andExpect(status().isBadRequest());
		addShiftAt("16:00:00.500", "17:00").andExpect(status().isBadRequest());
	}

	@Test
	void shiftTimesWithSecondsAreRejectedOnReschedule() throws Exception {
		reschedule(dinner.id(), """
				{"start":"21:00:30","end":"23:00","days":["MONDAY"]}
				""").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		reschedule(dinner.id(), """
				{"start":"21:00","end":"23:00:01","days":["MONDAY"]}
				""").andExpect(status().isBadRequest());
	}

	@Test
	void shiftTimesInWholeMinutesAreAccepted() throws Exception {
		addShiftAt("16:00:00", "17:45").andExpect(status().isCreated());
	}

	@Test
	void closureOnTodayAndNinetyDaysAheadIsAllowed() throws Exception {
		// MutableClock.START: 2026-12-01 en Madrid.
		addClosure("2026-12-01", "Hoy").andExpect(status().isCreated());
		addClosure("2027-03-01", "En 90 dias").andExpect(status().isCreated());
	}

	@Test
	void closureYesterdayReturns422() throws Exception {
		addClosure("2026-11-30", "Ayer").andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("CLOSURE_DATE_OUT_OF_RANGE"));
	}

	@Test
	void closureBeyondNinetyDaysReturns422() throws Exception {
		addClosure("2027-03-02", "Muy lejos").andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("CLOSURE_DATE_OUT_OF_RANGE"));

		assertThat(restaurants.isClosed(plan.id(), LocalDate.of(2027, 3, 2))).isFalse();
	}

	/** A las 23:30Z en Madrid ya es el 2: "hoy" es el de la zona del plano y el 1 ya es pasado. */
	@Test
	void closureWindowStartsTodayInThePlanZone() throws Exception {
		clock.set(Instant.parse("2026-12-01T23:30:00Z"));

		addClosure("2026-12-01", "Ayer en Madrid").andExpect(status().isUnprocessableContent());
		addClosure("2026-12-02", "Hoy en Madrid").andExpect(status().isCreated());
		addClosure("2027-03-02", "En 90 dias en Madrid").andExpect(status().isCreated());
	}

	private ResultActions addClosure(String date, String reason) throws Exception {
		return send(post(CLOSURES).contentType(MediaType.APPLICATION_JSON).content("""
				{"date":"%s","reason":"%s"}
				""".formatted(date, reason)));
	}

}
