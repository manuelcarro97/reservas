package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.PostgresIT;

@AutoConfigureMockMvc
class PublicApiIT extends PostgresIT {

	private static final String DATE = "2026-12-02";
	private static final String RESERVATIONS = "/api/v1/restaurants/demo/reservations";

	@Autowired
	private MockMvc mvc;

	private Shift shift;
	private DiningTable table;

	@BeforeEach
	void seed() {
		Restaurant restaurant = givenRestaurant("demo");
		shift = givenDinnerShift(restaurant);
		table = givenTable(restaurant, "M2", 2);
	}

	private String body(int partySize) {
		return """
				{"date":"%s","shiftId":%d,"partySize":%d,"customerName":"Ana","customerPhone":"600000000","tableId":%d}
				""".formatted(DATE, shift.id(), partySize, table.id());
	}

	private ResultActions postReservation(String json) throws Exception {
		return mvc.perform(post(RESERVATIONS).contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private ResultActions postReservation(String json, MediaType accept) throws Exception {
		return mvc.perform(post(RESERVATIONS).contentType(MediaType.APPLICATION_JSON).accept(accept).content(json));
	}

	private String createReservation() throws Exception {
		String response = postReservation(body(2)).andReturn().getResponse().getContentAsString();
		return JsonPath.read(response, "$.code");
	}

	@Test
	void createReturns201WithCode() throws Exception {
		postReservation(body(2)).andExpect(status().isCreated())
			.andExpect(jsonPath("$.code").isNotEmpty())
			.andExpect(jsonPath("$.status").value("PENDING"))
			.andExpect(jsonPath("$.tableLabel").value("M2"));
	}

	@Test
	void availabilityListsShifts() throws Exception {
		mvc.perform(get("/api/v1/restaurants/demo/availability").param("date", DATE).param("partySize", "2"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$", hasSize(1)))
			.andExpect(jsonPath("$[0].available").value(true));
	}

	@Test
	void getByCodeDoesNotExposeContactData() throws Exception {
		String code = createReservation();

		mvc.perform(get("/api/v1/reservations/" + code))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.code").value(code))
			.andExpect(content().string(not(containsString("600000000"))))
			.andExpect(content().string(not(containsString("Ana"))));
	}

	@Test
	void cancelReturnsCancelledReservation() throws Exception {
		String code = createReservation();

		mvc.perform(post("/api/v1/reservations/" + code + "/cancel"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CANCELLED"));
	}

	@Test
	void cancelTwiceReturns409InvalidTransition() throws Exception {
		String code = createReservation();
		mvc.perform(post("/api/v1/reservations/" + code + "/cancel"));

		mvc.perform(post("/api/v1/reservations/" + code + "/cancel"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("INVALID_TRANSITION"));
	}

	@Test
	void cancelAfterDeadlineReturns409() throws Exception {
		String code = createReservation();
		clock.set(java.time.Instant.parse("2026-12-02T18:30:00Z"));

		mvc.perform(post("/api/v1/reservations/" + code + "/cancel"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("CANCELLATION_DEADLINE_PASSED"));
	}

	@Test
	void unknownSlugReturns404() throws Exception {
		mvc.perform(post("/api/v1/restaurants/nada/reservations").contentType(MediaType.APPLICATION_JSON)
			.content(body(2)))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
	}

	@Test
	void unknownCodeReturns404() throws Exception {
		mvc.perform(get("/api/v1/reservations/NOEXISTE"))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESERVATION_NOT_FOUND"));
	}

	@Test
	void invalidDateReturns400() throws Exception {
		mvc.perform(get("/api/v1/restaurants/demo/availability").param("date", "mañana").param("partySize", "2"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void partySizeZeroReturns400() throws Exception {
		postReservation(body(0)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void partySizeZeroInAvailabilityReturns400() throws Exception {
		mvc.perform(get("/api/v1/restaurants/demo/availability").param("date", DATE).param("partySize", "0"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void missingCustomerNameReturns400() throws Exception {
		postReservation("""
				{"date":"%s","shiftId":%d,"partySize":2,"customerPhone":"600000000"}
				""".formatted(DATE, shift.id()))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void malformedJsonReturns400() throws Exception {
		postReservation("{no es json").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void absurdlyFarDateReturns422() throws Exception {
		postReservation(body(2).replace(DATE, "+9999999-01-01")).andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("DATE_TOO_FAR"));
	}

	@Test
	void dateBeyondWindowReturns422() throws Exception {
		postReservation(body(2).replace(DATE, "2999-01-01")).andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("DATE_TOO_FAR"));
	}

	@Test
	void absurdlyFarDateInAvailabilityReturnsNoShifts() throws Exception {
		mvc.perform(get("/api/v1/restaurants/demo/availability").param("date", "+9999999-01-01")
			.param("partySize", "2")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
	}

	@Test
	void nulCharacterInNameReturns400() throws Exception {
		postReservation(body(2).replace("Ana", "A\\u0000")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void takenTableReturns409TableTaken() throws Exception {
		createReservation();

		postReservation(body(2)).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("TABLE_TAKEN"));
	}

	@Test
	void missingTableInFreeChoiceReturns422TableRequired() throws Exception {
		postReservation("""
				{"date":"%s","shiftId":%d,"partySize":2,"customerName":"Ana","customerPhone":"600000000"}
				""".formatted(DATE, shift.id()))
			.andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("TABLE_REQUIRED"));
	}

	/** El cliente Angular pide `Accept: application/json`: los errores de dominio deben seguir llegando con su `code`. */
	@Test
	void takenTableAcceptingJsonReturns409WithCode() throws Exception {
		createReservation();

		postReservation(body(2), MediaType.APPLICATION_JSON).andExpect(status().isConflict())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("TABLE_TAKEN"));
	}

	@Test
	void missingTableAcceptingJsonReturns422WithCode() throws Exception {
		postReservation("""
				{"date":"%s","shiftId":%d,"partySize":2,"customerName":"Ana","customerPhone":"600000000"}
				""".formatted(DATE, shift.id()), MediaType.APPLICATION_JSON)
			.andExpect(status().isUnprocessableContent())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("TABLE_REQUIRED"));
	}

	@Test
	void unknownTableReturns404TableNotFound() throws Exception {
		postReservation(body(2).replace("\"tableId\":" + table.id(), "\"tableId\":999999"))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("TABLE_NOT_FOUND"));
	}

	@Test
	void partyTooLargeReturns422() throws Exception {
		postReservation(body(3)).andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("PARTY_TOO_LARGE"));
	}

}
