package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.EnumSet;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.model.Theme;
import io.github.manuelcarro97.reservas.support.PostgresIT;

@AutoConfigureMockMvc
class PublicPlanApiIT extends PostgresIT {

	// 2026-12-02 es miércoles; el reloj de los tests arranca el 2026-12-01
	private static final String DATE = "2026-12-02";
	private static final String PLAN = "/api/v1/restaurants/demo";

	@Autowired
	private MockMvc mvc;

	private Restaurant restaurant;
	private Shift dinner;

	@BeforeEach
	void seed() {
		restaurant = givenRestaurant("demo");
		dinner = givenDinnerShift(restaurant);
	}

	private ResultActions occupancy(String slug, long shiftId, String date) throws Exception {
		return mvc.perform(
				get("/api/v1/restaurants/" + slug + "/occupancy").param("date", date).param("shiftId", "" + shiftId));
	}

	private ResultActions availability(int partySize) throws Exception {
		return mvc.perform(get(PLAN + "/availability").param("date", DATE).param("partySize", "" + partySize));
	}

	/** Borrado lógico por SQL: las operaciones del puerto que lo hacen exigen una transacción. */
	private void hide(String tableName, long id) {
		jdbc.sql("UPDATE " + tableName + " SET deleted_at = now() WHERE id = :id").param("id", id).update();
	}

	private void switchToAssignedMode() {
		restaurants.save(restaurant.withSettings(restaurant.name(), Theme.AZUL, BookingMode.ASSIGNED, 2));
	}

	@Test
	void publicPlanHasLayoutAndShifts() throws Exception {
		givenTable(restaurant, "M2", 2);
		givenTable(restaurant, "M4", 4);

		mvc.perform(get(PLAN))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.slug").value("demo"))
			.andExpect(jsonPath("$.name").value("demo"))
			.andExpect(jsonPath("$.theme").value("AZUL"))
			.andExpect(jsonPath("$.bookingMode").value("FREE_CHOICE"))
			.andExpect(jsonPath("$.cancellationDeadlineHours").value(2))
			.andExpect(jsonPath("$.timeZone").value("Europe/Madrid"))
			.andExpect(jsonPath("$.room.shape").value("RECTANGLE"))
			.andExpect(jsonPath("$.room.width").value(1200))
			.andExpect(jsonPath("$.room.height").value(800))
			.andExpect(jsonPath("$.tables.length()").value(2))
			.andExpect(jsonPath("$.tables[0].label").value("M2"))
			.andExpect(jsonPath("$.tables[0].shape").value("SQUARE"))
			.andExpect(jsonPath("$.tables[0].seats").value(2))
			.andExpect(jsonPath("$.tables[1].label").value("M4"))
			.andExpect(jsonPath("$.shifts.length()").value(1))
			.andExpect(jsonPath("$.shifts[0].id").value(dinner.id()))
			.andExpect(jsonPath("$.shifts[0].name").value("Cena"))
			.andExpect(jsonPath("$.shifts[0].start").value(startsWith("20:00")))
			.andExpect(jsonPath("$.shifts[0].end").value(startsWith("22:00")));
	}

	@Test
	void publicPlanHidesHiddenShiftsAndDeletedTables() throws Exception {
		DiningTable gone = givenTable(restaurant, "M2", 2);
		givenTable(restaurant, "M4", 4);
		hide("dining_table", gone.id());
		Shift hidden = shifts.save(new Shift(null, restaurant.id(), "Brunch", LocalTime.of(10, 0),
				LocalTime.of(12, 0), EnumSet.allOf(DayOfWeek.class)));
		hide("shift", hidden.id());

		mvc.perform(get(PLAN))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.tables.length()").value(1))
			.andExpect(jsonPath("$.tables[0].label").value("M4"))
			.andExpect(jsonPath("$.shifts.length()").value(1))
			.andExpect(jsonPath("$.shifts[0].name").value("Cena"));
	}

	@Test
	void publicPlanHasNoCustomerOrOwnerData() throws Exception {
		DiningTable table = givenTable(restaurant, "M2", 2);
		givenReservation(restaurant, dinner, table, LocalDate.parse(DATE), 2);

		String json = mvc.perform(get(PLAN)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

		assertThat(json).contains("demo")
			.doesNotContain("ownerUid")
			.doesNotContain("owner-a")
			.doesNotContain("customerName")
			.doesNotContain("customerPhone")
			.doesNotContain("customerEmail")
			.doesNotContain("Ana")
			.doesNotContain("600000000");
	}

	@Test
	void occupancyMarksTablesWithReservations() throws Exception {
		DiningTable taken = givenTable(restaurant, "M2", 2);
		DiningTable free = givenTable(restaurant, "M4", 4);
		givenReservation(restaurant, dinner, taken, LocalDate.parse(DATE), 2);

		occupancy("demo", dinner.id(), DATE).andExpect(status().isOk())
			.andExpect(jsonPath("$.length()").value(2))
			.andExpect(jsonPath("$[0].tableId").value(taken.id()))
			.andExpect(jsonPath("$[0].occupied").value(true))
			.andExpect(jsonPath("$[1].tableId").value(free.id()))
			.andExpect(jsonPath("$[1].occupied").value(false));
	}

	@Test
	void occupancyOfAnotherShiftOrDateIsFree() throws Exception {
		DiningTable table = givenTable(restaurant, "M2", 2);
		givenReservation(restaurant, dinner, table, LocalDate.parse(DATE), 2);

		occupancy("demo", dinner.id(), "2026-12-03").andExpect(status().isOk())
			.andExpect(jsonPath("$[0].occupied").value(false));
	}

	@Test
	void occupancyHasNoCustomerData() throws Exception {
		DiningTable table = givenTable(restaurant, "M2", 2);
		givenReservation(restaurant, dinner, table, LocalDate.parse(DATE), 2);

		String json = occupancy("demo", dinner.id(), DATE).andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();

		assertThat(json).contains("tableId")
			.contains("occupied")
			.doesNotContain("customerName")
			.doesNotContain("customerPhone")
			.doesNotContain("Ana")
			.doesNotContain("600000000")
			.doesNotContain("ownerUid")
			.doesNotContain("owner-a")
			.doesNotContain("code");
	}

	@Test
	void occupancyOutsideTheBookingWindowIsAllOccupied() throws Exception {
		givenTable(restaurant, "M2", 2);
		givenTable(restaurant, "M4", 4);

		occupancy("demo", dinner.id(), "2026-11-30").andExpect(status().isOk())
			.andExpect(jsonPath("$.length()").value(2))
			.andExpect(jsonPath("$[0].occupied").value(true))
			.andExpect(jsonPath("$[1].occupied").value(true));
		occupancy("demo", dinner.id(), "2027-03-15").andExpect(status().isOk())
			.andExpect(jsonPath("$[0].occupied").value(true))
			.andExpect(jsonPath("$[1].occupied").value(true));
	}

	@Test
	void occupancyOnAClosedDayIsAllOccupied() throws Exception {
		givenTable(restaurant, "M2", 2);
		restaurants.addClosure(restaurant.id(), LocalDate.parse(DATE), "Festivo");

		occupancy("demo", dinner.id(), DATE).andExpect(status().isOk())
			.andExpect(jsonPath("$[0].occupied").value(true));
	}

	@Test
	void occupancyOfAHiddenShiftReturns404() throws Exception {
		givenTable(restaurant, "M2", 2);
		hide("shift", dinner.id());

		occupancy("demo", dinner.id(), DATE).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("SHIFT_NOT_FOUND"));
	}

	@Test
	void occupancyOfAShiftFromAnotherPlanReturns404() throws Exception {
		Restaurant other = givenRestaurant("otro", "owner-b");
		Shift otherShift = givenDinnerShift(other);

		occupancy("demo", otherShift.id(), DATE).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("SHIFT_NOT_FOUND"));
	}

	@Test
	void draftPlanReturns404() throws Exception {
		Restaurant draft = restaurants.save(new Restaurant(null, "borrador", "Borrador", ZoneId.of("Europe/Madrid"), 2,
				"owner-a", PlanStatus.DRAFT, RoomLayout.defaultRoom(), Theme.AZUL, BookingMode.FREE_CHOICE));
		Shift draftShift = givenDinnerShift(draft);

		mvc.perform(get("/api/v1/restaurants/borrador")).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
		occupancy("borrador", draftShift.id(), DATE).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
	}

	@Test
	void deletedPlanReturns404() throws Exception {
		jdbc.sql("UPDATE restaurant SET deleted_at = now() WHERE id = :id").param("id", restaurant.id()).update();

		mvc.perform(get(PLAN)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
		occupancy("demo", dinner.id(), DATE).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
	}

	@Test
	void unknownSlugReturns404() throws Exception {
		mvc.perform(get("/api/v1/restaurants/nada")).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
		occupancy("nada", dinner.id(), DATE).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
	}

	@Test
	void assignedModeAvailabilityCountsUnassignedReservations() throws Exception {
		switchToAssignedMode();
		givenTable(restaurant, "M4a", 4);
		givenTable(restaurant, "M4b", 4);
		LocalDate date = LocalDate.parse(DATE);
		givenReservation(restaurant, dinner, null, date, 4);

		availability(2).andExpect(status().isOk()).andExpect(jsonPath("$[0].available").value(true));

		givenReservation(restaurant, dinner, null, date, 4);

		availability(2).andExpect(status().isOk()).andExpect(jsonPath("$[0].available").value(false));
	}

	@Test
	void assignedModeAvailabilityUsesTheLargestGroupFirst() throws Exception {
		switchToAssignedMode();
		givenTable(restaurant, "M2", 2);
		givenTable(restaurant, "M4", 4);
		givenReservation(restaurant, dinner, null, LocalDate.parse(DATE), 2);

		// El grupo de 2 ya reservado cabe en la mesa de 2; la de 4 sigue sirviendo a un grupo de 4.
		availability(4).andExpect(status().isOk()).andExpect(jsonPath("$[0].available").value(true));
		// Un grupo de 3 solo cabe en la de 4 y el de 2 sigue cabiendo en la de 2.
		availability(3).andExpect(status().isOk()).andExpect(jsonPath("$[0].available").value(true));
	}

	@Test
	void freeChoiceAvailabilityNeedsFittingFreeTable() throws Exception {
		DiningTable small = givenTable(restaurant, "M2", 2);
		givenTable(restaurant, "M4", 4);
		LocalDate date = LocalDate.parse(DATE);

		availability(4).andExpect(jsonPath("$[0].available").value(true));
		availability(5).andExpect(jsonPath("$[0].available").value(false));

		givenReservation(restaurant, dinner, small, date, 2);
		availability(2).andExpect(jsonPath("$[0].available").value(true));
		availability(4).andExpect(jsonPath("$[0].available").value(true));

		// Con la de 4 también ocupada ya no queda ninguna mesa libre.
		DiningTable big = tables.findAll(restaurant.id()).stream().filter(t -> t.seats() == 4).findFirst().orElseThrow();
		givenReservation(restaurant, dinner, big, date, 4);
		availability(2).andExpect(jsonPath("$[0].available").value(false));
	}

}
