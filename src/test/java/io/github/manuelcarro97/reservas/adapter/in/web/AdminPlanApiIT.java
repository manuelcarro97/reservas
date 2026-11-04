package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.TableShape;
import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.PostgresIT;

@AutoConfigureMockMvc
class AdminPlanApiIT extends PostgresIT {

	private static final String PLANS = "/api/v1/admin/restaurants";

	@Autowired
	private MockMvc mvc;

	private ResultActions as(String uid, MockHttpServletRequestBuilder request) throws Exception {
		return mvc.perform(request.with(AuthRequests.owner(uid)));
	}

	private ResultActions createPlan(String uid, String slug) throws Exception {
		return as(uid, post(PLANS).contentType(MediaType.APPLICATION_JSON).content("""
				{"slug":"%s","name":"Plano %s"}
				""".formatted(slug, slug)));
	}

	private ResultActions publish(String uid, String slug) throws Exception {
		return as(uid, post(PLANS + "/" + slug + "/publish"));
	}

	private Restaurant planOf(String slug) {
		return restaurants.findBySlug(slug).orElseThrow();
	}

	@Test
	void createPlanStartsAsDraftWithDefaultShifts() throws Exception {
		createPlan("owner-a", "mi-local").andExpect(status().isCreated())
			.andExpect(jsonPath("$.slug").value("mi-local"))
			.andExpect(jsonPath("$.status").value("DRAFT"))
			.andExpect(jsonPath("$.theme").value("AZUL"))
			.andExpect(jsonPath("$.bookingMode").value("FREE_CHOICE"))
			.andExpect(jsonPath("$.cancellationDeadlineHours").value(2))
			.andExpect(jsonPath("$.room.shape").value("RECTANGLE"))
			.andExpect(jsonPath("$.room.width").value(1200))
			.andExpect(jsonPath("$.room.height").value(800))
			.andExpect(jsonPath("$.tables").isEmpty())
			.andExpect(jsonPath("$.shifts.length()").value(2))
			.andExpect(jsonPath("$.shifts[0].name").value("Comida"))
			.andExpect(jsonPath("$.shifts[0].start").value(startsWith("13:00")))
			.andExpect(jsonPath("$.shifts[0].end").value(startsWith("16:00")))
			.andExpect(jsonPath("$.shifts[1].name").value("Cena"))
			.andExpect(jsonPath("$.shifts[1].start").value(startsWith("20:00")))
			.andExpect(jsonPath("$.shifts[1].end").value(startsWith("23:30")));

		Restaurant stored = planOf("mi-local");
		assertThat(stored.ownerUid()).isEqualTo("owner-a");
		assertThat(stored.zone().getId()).isEqualTo("Europe/Madrid");
	}

	@Test
	void responseNeverContainsOwnerUid() throws Exception {
		String created = createPlan("owner-a", "mi-local").andReturn().getResponse().getContentAsString();
		String read = as("owner-a", get(PLANS + "/mi-local")).andReturn().getResponse().getContentAsString();
		String list = as("owner-a", get(PLANS)).andReturn().getResponse().getContentAsString();
		String patched = as("owner-a", patch(PLANS + "/mi-local").contentType(MediaType.APPLICATION_JSON).content("""
				{"name":"Otro","theme":"NOCHE","bookingMode":"ASSIGNED","cancellationDeadlineHours":4}
				""")).andReturn().getResponse().getContentAsString();

		assertThat(created).contains("mi-local").doesNotContain("ownerUid").doesNotContain("owner-a");
		assertThat(read).contains("mi-local").doesNotContain("ownerUid").doesNotContain("owner-a");
		assertThat(list).contains("mi-local").doesNotContain("ownerUid").doesNotContain("owner-a");
		assertThat(patched).contains("mi-local").doesNotContain("ownerUid").doesNotContain("owner-a");
	}

	@Test
	void listShowsOnlyMyPlans() throws Exception {
		createPlan("owner-a", "plano-uno").andExpect(status().isCreated());
		createPlan("owner-b", "plano-dos").andExpect(status().isCreated());

		as("owner-a", get(PLANS)).andExpect(status().isOk())
			.andExpect(jsonPath("$.length()").value(1))
			.andExpect(jsonPath("$[0].slug").value("plano-uno"))
			.andExpect(jsonPath("$[0].name").value("Plano plano-uno"))
			.andExpect(jsonPath("$[0].status").value("DRAFT"));
	}

	@Test
	void getAnotherOwnersPlanReturns404() throws Exception {
		createPlan("owner-b", "plano-dos").andExpect(status().isCreated());

		as("owner-a", get(PLANS + "/plano-dos")).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
	}

	@Test
	void fourthPlanReturns409PlanLimit() throws Exception {
		createPlan("owner-a", "plano-1").andExpect(status().isCreated());
		createPlan("owner-a", "plano-2").andExpect(status().isCreated());
		createPlan("owner-a", "plano-3").andExpect(status().isCreated());

		createPlan("owner-a", "plano-4").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PLAN_LIMIT_REACHED"));
		createPlan("owner-b", "plano-5").andExpect(status().isCreated());
		assertThat(restaurants.findBySlug("plano-4")).isEmpty();
	}

	@Test
	void reservedSlugReturns409() throws Exception {
		createPlan("owner-a", "demo").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SLUG_RESERVED"));
		assertThat(restaurants.findBySlug("demo")).isEmpty();
	}

	@Test
	void panelRouteSlugReturns409() throws Exception {
		// /panel/cuenta es la página de la cuenta: un plano con ese slug quedaría tapado en /panel/:slug.
		createPlan("owner-a", "cuenta").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SLUG_RESERVED"));
		assertThat(restaurants.findBySlug("cuenta")).isEmpty();
	}

	@Test
	void duplicateSlugReturns409() throws Exception {
		createPlan("owner-a", "repetido").andExpect(status().isCreated());

		createPlan("owner-b", "repetido").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ALREADY_EXISTS"));
	}

	@Test
	void invalidSlugReturns400() throws Exception {
		createPlan("owner-a", "Mal Slug").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void settingsChangeThemeAndMode() throws Exception {
		createPlan("owner-a", "mi-local").andExpect(status().isCreated());

		as("owner-a", patch(PLANS + "/mi-local").contentType(MediaType.APPLICATION_JSON).content("""
				{"name":"Casa Manuel","theme":"NOCHE","bookingMode":"ASSIGNED","cancellationDeadlineHours":6}
				""")).andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Casa Manuel"))
			.andExpect(jsonPath("$.theme").value("NOCHE"))
			.andExpect(jsonPath("$.bookingMode").value("ASSIGNED"))
			.andExpect(jsonPath("$.cancellationDeadlineHours").value(6))
			.andExpect(jsonPath("$.status").value("DRAFT"));

		as("owner-a", get(PLANS + "/mi-local")).andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Casa Manuel"))
			.andExpect(jsonPath("$.theme").value("NOCHE"));
	}

	@Test
	void settingsWithUnknownThemeReturns400() throws Exception {
		createPlan("owner-a", "mi-local").andExpect(status().isCreated());

		as("owner-a", patch(PLANS + "/mi-local").contentType(MediaType.APPLICATION_JSON).content("""
				{"name":"Casa","theme":"ROSA","bookingMode":"ASSIGNED","cancellationDeadlineHours":6}
				""")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void publishWithoutTablesReturns422() throws Exception {
		createPlan("owner-a", "mi-local").andExpect(status().isCreated());

		publish("owner-a", "mi-local").andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("PLAN_NOT_PUBLISHABLE"));
		assertThat(planOf("mi-local").status().name()).isEqualTo("DRAFT");
	}

	@Test
	void publishWithOverlappingTablesReturns422() throws Exception {
		createPlan("owner-a", "mi-local").andExpect(status().isCreated());
		Restaurant plan = planOf("mi-local");
		tables.save(new DiningTable(null, plan.id(), "A", TableShape.SQUARE, 2, 0, 200, 200));
		tables.save(new DiningTable(null, plan.id(), "B", TableShape.SQUARE, 2, 0, 220, 200));

		publish("owner-a", "mi-local").andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("PLAN_NOT_PUBLISHABLE"));
	}

	@Test
	void publishWithValidTableMakesPlanPublic() throws Exception {
		createPlan("owner-a", "mi-local").andExpect(status().isCreated());
		givenTable(planOf("mi-local"), "M1", 2);

		publish("owner-a", "mi-local").andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PUBLISHED"))
			.andExpect(jsonPath("$.tables.length()").value(1))
			.andExpect(jsonPath("$.tables[0].label").value("M1"));

		mvc.perform(get("/api/v1/restaurants/mi-local/availability").param("date", "2026-12-02")
			.param("partySize", "2")).andExpect(status().isOk());
	}

	@Test
	void draftPlanIsNotPublic() throws Exception {
		createPlan("owner-a", "mi-local").andExpect(status().isCreated());

		mvc.perform(get("/api/v1/restaurants/mi-local/availability").param("date", "2026-12-02")
			.param("partySize", "2"))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
		mvc.perform(post("/api/v1/restaurants/mi-local/reservations").contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"date":"2026-12-02","shiftId":1,"partySize":2,"customerName":"Ana","customerPhone":"600000000"}
					"""))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
	}

}
