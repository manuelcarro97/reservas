package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.EnumSet;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import io.github.manuelcarro97.reservas.application.port.in.ManageReservationUseCase;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/** Resumen de la semana del panel de Inicio: una lectura con la carga de cada turno de los siete días. */
@AutoConfigureMockMvc
class WeekSummaryApiIT extends PostgresIT {

	private static final String SLUG = "kafe";
	private static final String SUMMARY = "/api/v1/admin/restaurants/" + SLUG + "/summary";
	/** Lunes 30 de noviembre de 2026; el miércoles 2 de diciembre es de esa semana. */
	private static final LocalDate MONDAY = LocalDate.of(2026, 11, 30);
	private static final LocalDate WEDNESDAY = LocalDate.of(2026, 12, 2);

	@Autowired
	private MockMvc mvc;

	@Autowired
	private ManageReservationUseCase manageReservation;

	private Restaurant plan;
	private Shift lunch;
	private Shift dinner;
	private DiningTable m1;
	private DiningTable m2;

	@BeforeEach
	void seed() {
		plan = givenRestaurant(SLUG, "owner-a");
		lunch = shifts.save(new Shift(null, plan.id(), "Comida", LocalTime.of(13, 0), LocalTime.of(15, 0),
				EnumSet.allOf(DayOfWeek.class)));
		dinner = shifts.save(new Shift(null, plan.id(), "Cena", LocalTime.of(20, 0), LocalTime.of(22, 0),
				EnumSet.complementOf(EnumSet.of(DayOfWeek.SUNDAY))));
		m1 = givenTable(plan, "M1", 2);
		m2 = givenTable(plan, "M2", 4);
	}

	private ResultActions summary(String uid, LocalDate week) throws Exception {
		return mvc.perform(get(SUMMARY).param("week", week.toString()).with(AuthRequests.owner(uid)));
	}

	@Test
	void ownerGetsSevenDays() throws Exception {
		Reservation confirmed = givenReservation(plan, dinner, m1, WEDNESDAY, 3);
		manageReservation.confirm("owner-a", confirmed.id());
		givenReservation(plan, dinner, m2, WEDNESDAY, 2);
		givenReservation(plan, dinner, null, WEDNESDAY, 5);
		Reservation cancelled = givenReservation(plan, lunch, m1, WEDNESDAY, 6);
		manageReservation.cancel("owner-a", cancelled.id());
		restaurants.addClosure(plan.id(), LocalDate.of(2026, 12, 3), "Obras");

		summary("owner-a", WEDNESDAY).andExpect(status().isOk())
			.andExpect(jsonPath("$.monday").value("2026-11-30"))
			.andExpect(jsonPath("$.days", hasSize(7)))
			.andExpect(jsonPath("$.days[*].date", contains("2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03",
					"2026-12-04", "2026-12-05", "2026-12-06")))
			// Miércoles: la comida cancelada no cuenta; la cena lleva 3 reservas en 2 mesas y 1 sin mesa.
			.andExpect(jsonPath("$.days[2].closed").value(false))
			.andExpect(jsonPath("$.days[2].shifts", hasSize(2)))
			.andExpect(jsonPath("$.days[2].shifts[0].shiftId").value(lunch.id()))
			.andExpect(jsonPath("$.days[2].shifts[0].reservations").value(0))
			.andExpect(jsonPath("$.days[2].shifts[0].occupiedTables").value(0))
			.andExpect(jsonPath("$.days[2].shifts[1].shiftId").value(dinner.id()))
			.andExpect(jsonPath("$.days[2].shifts[1].occupiedTables").value(2))
			.andExpect(jsonPath("$.days[2].shifts[1].unassigned").value(1))
			.andExpect(jsonPath("$.days[2].shifts[1].reservations").value(3))
			.andExpect(jsonPath("$.days[2].shifts[1].guests").value(10))
			.andExpect(jsonPath("$.days[2].shifts[1].pending").value(2))
			// Jueves cerrado: sin turnos. Domingo: la cena no abre.
			.andExpect(jsonPath("$.days[3].closed").value(true))
			.andExpect(jsonPath("$.days[3].shifts", hasSize(0)))
			.andExpect(jsonPath("$.days[6].closed").value(false))
			.andExpect(jsonPath("$.days[6].shifts[*].shiftId", contains(lunch.id().intValue())));
	}

	@Test
	void anyDayOfTheWeekGivesTheSameMonday() throws Exception {
		summary("owner-a", LocalDate.of(2026, 12, 6)).andExpect(status().isOk())
			.andExpect(jsonPath("$.monday").value("2026-11-30"));
	}

	@Test
	void reservationsOfOtherWeeksAreNotCounted() throws Exception {
		givenReservation(plan, dinner, m1, MONDAY.minusDays(1), 2);
		givenReservation(plan, dinner, m1, MONDAY.plusDays(7), 2);

		summary("owner-a", MONDAY).andExpect(status().isOk())
			.andExpect(jsonPath("$.days[*].shifts[*].reservations", everyItem(is(0))));
	}

	@Test
	void anotherOwnerGetsNotFound() throws Exception {
		summary("owner-b", MONDAY).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
	}

	@Test
	void missingOrInvalidWeekReturns400() throws Exception {
		mvc.perform(get(SUMMARY).with(AuthRequests.owner("owner-a"))).andExpect(status().isBadRequest());
		mvc.perform(get(SUMMARY).param("week", "2026-02-30").with(AuthRequests.owner("owner-a")))
			.andExpect(status().isBadRequest());
		mvc.perform(get(SUMMARY).param("week", "3000-01-01").with(AuthRequests.owner("owner-a")))
			.andExpect(status().isBadRequest());
	}

	@Test
	void withoutTokenReturns401() throws Exception {
		mvc.perform(get(SUMMARY).param("week", MONDAY.toString())).andExpect(status().isUnauthorized());
	}

}
