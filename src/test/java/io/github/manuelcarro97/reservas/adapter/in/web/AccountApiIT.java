package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderException;
import io.github.manuelcarro97.reservas.application.service.DemoAccount;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.FakeIdentityProvider;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * Cuenta del dueño: {@code GET /admin/me}, borrar un plano y borrar la cuenta (con su usuario de Firebase, simulado
 * por un proveedor de identidad de pruebas: nunca se llama a Firebase).
 * <p>
 * {@code DELETE /admin/restaurants/{slug}} es por plano y está en la tabla de {@code OwnershipIT}. {@code /me} y
 * {@code DELETE /account} son por dueño (su cuenta), no por plano: no caben en esa tabla, que espera 404 para el dueño
 * ajeno de un plano. La frontera entre dueños la cubren {@link #meShowsOnlyMyPlans()} y
 * {@link #deleteAccountDeletesPlansAndFirebaseUser()} (el plano y la cuenta de owner-b siguen intactos).
 */
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class AccountApiIT extends PostgresIT {

	private static final String PLANS = "/api/v1/admin/restaurants";
	private static final String ME = "/api/v1/admin/me";
	private static final String ACCOUNT = "/api/v1/admin/account";
	private static final String TELEGRAM_LINK = "/api/v1/admin/telegram/link";

	/** Dentro de la ventana de reserva y posterior al "hoy" del reloj de pruebas (2026-12-01). */
	private static final LocalDate FUTURE = LocalDate.of(2026, 12, 2);
	private static final LocalDate PAST = LocalDate.of(2026, 11, 25);

	@TestConfiguration(proxyBeanMethods = false)
	static class FakeIdentityConfiguration {

		@Bean
		@Primary
		FakeIdentityProvider fakeIdentityProvider() {
			return new FakeIdentityProvider();
		}

	}

	@Autowired
	private MockMvc mvc;

	@Autowired
	private FakeIdentityProvider identity;

	@Autowired
	private DemoAccount demoAccount;

	@BeforeEach
	void resetCollaborators() {
		identity.reset();
		demoAccount.setUid(null);
	}

	private ResultActions as(String uid, MockHttpServletRequestBuilder request) throws Exception {
		return mvc.perform(request.with(AuthRequests.owner(uid)));
	}

	private ResultActions createPlan(String uid, String slug) throws Exception {
		return as(uid, post(PLANS).contentType(MediaType.APPLICATION_JSON).content("""
				{"slug":"%s","name":"Plano %s"}
				""".formatted(slug, slug)));
	}

	/** Reserva de "Ana" (600000000) en una mesa nueva del plano. */
	private Reservation reserve(Restaurant plan, Shift shift, String tableLabel, LocalDate date) {
		return givenReservation(plan, shift, givenTable(plan, tableLabel, 2), date, 2);
	}

	private void cancelInDatabase(Reservation reservation) {
		jdbc.sql("UPDATE reservation SET status = 'CANCELLED' WHERE id = :id").param("id", reservation.id()).update();
	}

	private boolean isDeleted(String slug) {
		return jdbc.sql("SELECT deleted_at IS NOT NULL FROM restaurant WHERE slug = :slug")
			.param("slug", slug)
			.query(Boolean.class)
			.single();
	}

	private String customerOf(Reservation reservation) {
		return jdbc.sql("""
				SELECT customer_name || '/' || customer_phone || '/' || coalesce(customer_email, '-') || '/' || version
				FROM reservation WHERE id = :id
				""").param("id", reservation.id()).query(String.class).single();
	}

	private void linkTelegramChat(String uid) {
		jdbc.sql("INSERT INTO owner_account (uid, telegram_chat_id) VALUES (:uid, 4242)").param("uid", uid).update();
	}

	private long accountRows(String uid) {
		return jdbc.sql("SELECT count(*) FROM owner_account WHERE uid = :uid")
			.param("uid", uid)
			.query(Long.class)
			.single();
	}

	// --- GET /me ---

	@Test
	void meListsPlansAndFlags() throws Exception {
		createPlan("owner-a", "plano-uno").andExpect(status().isCreated());
		createPlan("owner-a", "plano-dos").andExpect(status().isCreated());
		linkTelegramChat("owner-a");

		mvc.perform(get(ME).with(AuthRequests.owner("owner-a", "ana@example.com")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.email").value("ana@example.com"))
			.andExpect(jsonPath("$.demo").value(false))
			// Sin bot configurado (PostgresIT), pero con un chat ya guardado: sale de lo mismo que /admin/telegram.
			.andExpect(jsonPath("$.telegramAvailable").value(false))
			.andExpect(jsonPath("$.telegramLinked").value(true))
			.andExpect(jsonPath("$.maxPlans").value(3))
			.andExpect(jsonPath("$.plans.length()").value(2))
			.andExpect(jsonPath("$.plans[0].slug").value("plano-uno"))
			.andExpect(jsonPath("$.plans[0].status").value("DRAFT"))
			.andExpect(jsonPath("$.plans[1].slug").value("plano-dos"))
			// Ni el uid ni el chat salen en la respuesta.
			.andExpect(content().string(not(containsString("owner-a"))))
			.andExpect(content().string(not(containsString("4242"))));
	}

	@Test
	void meMatchesTheTelegramStatusEndpoint() throws Exception {
		linkTelegramChat("owner-a");

		String telegram = as("owner-a", get("/api/v1/admin/telegram")).andReturn().getResponse().getContentAsString();
		String me = as("owner-a", get(ME)).andReturn().getResponse().getContentAsString();

		assertThat(com.jayway.jsonpath.JsonPath.<Boolean>read(me, "$.telegramAvailable"))
			.isEqualTo(com.jayway.jsonpath.JsonPath.<Boolean>read(telegram, "$.available"));
		assertThat(com.jayway.jsonpath.JsonPath.<Boolean>read(me, "$.telegramLinked"))
			.isEqualTo(com.jayway.jsonpath.JsonPath.<Boolean>read(telegram, "$.linked"));
	}

	@Test
	void meShowsOnlyMyPlans() throws Exception {
		givenRestaurant("plano-a", "owner-a");
		givenRestaurant("plano-b", "owner-b");

		as("owner-a", get(ME)).andExpect(status().isOk())
			.andExpect(jsonPath("$.plans.length()").value(1))
			.andExpect(jsonPath("$.plans[0].slug").value("plano-a"));
	}

	@Test
	void meWithoutPlansOrEmailStillAnswers() throws Exception {
		as("owner-a", get(ME)).andExpect(status().isOk())
			.andExpect(jsonPath("$.plans").isEmpty())
			.andExpect(jsonPath("$.telegramLinked").value(false));
	}

	@Test
	void meFlagsTheDemoAccount() throws Exception {
		demoAccount.setUid("owner-demo");

		as("owner-demo", get(ME)).andExpect(status().isOk()).andExpect(jsonPath("$.demo").value(true));
		as("owner-a", get(ME)).andExpect(status().isOk()).andExpect(jsonPath("$.demo").value(false));
	}

	// --- DELETE /restaurants/{slug} ---

	@Test
	void deletePlanWithActiveReservationReturns409() throws Exception {
		Restaurant plan = givenRestaurant("plano-a", "owner-a");
		Shift shift = givenDinnerShift(plan);
		Reservation active = reserve(plan, shift, "M1", FUTURE);
		String before = customerOf(active);

		as("owner-a", delete(PLANS + "/plano-a")).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PLAN_HAS_RESERVATIONS"))
			.andExpect(jsonPath("$.reservations[0]").value(active.code()));

		assertThat(isDeleted("plano-a")).isFalse();
		assertThat(customerOf(active)).isEqualTo(before);
	}

	@Test
	void activeReservationTodayInThePlanZoneBlocksTheDelete() throws Exception {
		Restaurant plan = givenRestaurant("plano-a", "owner-a");
		Shift shift = givenDinnerShift(plan);
		Reservation today = reserve(plan, shift, "M1", LocalDate.of(2026, 12, 2));
		// 00:30 del 2 de diciembre en Madrid, todavía 1 de diciembre en UTC.
		clock.set(Instant.parse("2026-12-01T23:30:00Z"));

		as("owner-a", delete(PLANS + "/plano-a")).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PLAN_HAS_RESERVATIONS"))
			.andExpect(jsonPath("$.reservations[0]").value(today.code()));

		// Un día después ya es pasada y el plano se borra.
		clock.set(Instant.parse("2026-12-02T23:30:00Z"));
		as("owner-a", delete(PLANS + "/plano-a")).andExpect(status().isNoContent());
	}

	@Test
	void deletePlanAnonymizesPastReservations() throws Exception {
		Restaurant plan = givenRestaurant("plano-a", "owner-a");
		Shift shift = givenDinnerShift(plan);
		Reservation past = reserve(plan, shift, "M1", PAST);
		Reservation cancelledFuture = reserve(plan, shift, "M2", FUTURE);
		cancelInDatabase(cancelledFuture);
		jdbc.sql("UPDATE reservation SET customer_email = 'ana@example.com' WHERE id = :id")
			.param("id", past.id())
			.update();
		Restaurant other = givenRestaurant("plano-b", "owner-b");
		Reservation foreign = reserve(other, givenDinnerShift(other), "B1", PAST);
		String foreignBefore = customerOf(foreign);

		as("owner-a", delete(PLANS + "/plano-a")).andExpect(status().isNoContent());

		// Nombre y teléfono neutros, sin email, y la versión sube exactamente una: el @Version protege assignTable.
		assertThat(customerOf(past)).isEqualTo("Anonimizado/-/-/1");
		assertThat(customerOf(cancelledFuture)).isEqualTo("Anonimizado/-/-/1");
		assertThat(customerOf(foreign)).isEqualTo(foreignBefore);
		assertThat(isDeleted("plano-a")).isTrue();
		assertThat(isDeleted("plano-b")).isFalse();
		as("owner-a", get(PLANS + "/plano-a")).andExpect(status().isNotFound());
		as("owner-a", get(PLANS)).andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void deletedPlanSlugCannotBeReused() throws Exception {
		createPlan("owner-a", "mi-local").andExpect(status().isCreated());
		as("owner-a", delete(PLANS + "/mi-local")).andExpect(status().isNoContent());

		// Ni otro dueño ni el mismo heredan el slug (un iframe ya incrustado seguiría apuntando a él): 409, no 500.
		createPlan("owner-b", "mi-local").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ALREADY_EXISTS"));
		createPlan("owner-a", "mi-local").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ALREADY_EXISTS"));
		// El slug borrado tampoco se sirve al público.
		mvc.perform(get("/api/v1/restaurants/mi-local")).andExpect(status().isNotFound());
	}

	@Test
	void deletedPlanDoesNotCountForLimit() throws Exception {
		createPlan("owner-a", "uno").andExpect(status().isCreated());
		createPlan("owner-a", "dos").andExpect(status().isCreated());
		createPlan("owner-a", "tres").andExpect(status().isCreated());
		createPlan("owner-a", "cuatro").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PLAN_LIMIT_REACHED"));

		as("owner-a", delete(PLANS + "/dos")).andExpect(status().isNoContent());

		createPlan("owner-a", "cuatro").andExpect(status().isCreated());
		as("owner-a", get(ME)).andExpect(jsonPath("$.plans[*].slug").value(hasItem("cuatro")))
			.andExpect(jsonPath("$.plans.length()").value(3));
	}

	@Test
	void deletePlanOfAnotherOwnerIsNotFound() throws Exception {
		givenRestaurant("plano-a", "owner-a");

		as("owner-b", delete(PLANS + "/plano-a")).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));

		assertThat(isDeleted("plano-a")).isFalse();
	}

	// --- DELETE /account ---

	@Test
	void deleteAccountDeletesPlansAndFirebaseUser() throws Exception {
		Restaurant planOne = givenRestaurant("plano-1", "owner-a");
		Restaurant planTwo = givenRestaurant("plano-2", "owner-a");
		Reservation first = reserve(planOne, givenDinnerShift(planOne), "M1", PAST);
		Reservation second = reserve(planTwo, givenDinnerShift(planTwo), "M1", PAST);
		linkTelegramChat("owner-a");
		Restaurant foreignPlan = givenRestaurant("plano-b", "owner-b");
		Reservation foreign = reserve(foreignPlan, givenDinnerShift(foreignPlan), "B1", PAST);
		linkTelegramChat("owner-b");
		String foreignBefore = customerOf(foreign);

		// Lo que otra conexión ve cuando se llama al proveedor: si la llamada fuera dentro de la transacción, vería los
		// planos vivos y la cuenta presente.
		AtomicReference<List<Long>> seenAtDeleteUser = new AtomicReference<>();
		identity.onDelete(uid -> seenAtDeleteUser.set(CompletableFuture.supplyAsync(() -> List.of(
				jdbc.sql("SELECT count(*) FROM restaurant WHERE owner_uid = 'owner-a' AND deleted_at IS NULL")
					.query(Long.class)
					.single(),
				jdbc.sql("SELECT count(*) FROM owner_account WHERE uid = 'owner-a'").query(Long.class).single()))
			.join()));

		as("owner-a", delete(ACCOUNT)).andExpect(status().isNoContent());

		assertThat(identity.deleted()).containsExactly("owner-a");
		assertThat(seenAtDeleteUser.get()).containsExactly(0L, 0L);
		assertThat(isDeleted("plano-1")).isTrue();
		assertThat(isDeleted("plano-2")).isTrue();
		assertThat(customerOf(first)).isEqualTo("Anonimizado/-/-/1");
		assertThat(customerOf(second)).isEqualTo("Anonimizado/-/-/1");
		assertThat(accountRows("owner-a")).isZero();
		// Los planos borrados conservan owner_uid (el slug sigue reservado); no hay ningún otro dato enlazado a él.
		assertThat(jdbc.sql("SELECT count(*) FROM restaurant WHERE owner_uid = 'owner-a' AND deleted_at IS NULL")
			.query(Long.class)
			.single()).isZero();
		// Nada de owner-b.
		assertThat(isDeleted("plano-b")).isFalse();
		assertThat(customerOf(foreign)).isEqualTo(foreignBefore);
		assertThat(accountRows("owner-b")).isEqualTo(1);
		as("owner-b", get(ME)).andExpect(jsonPath("$.plans.length()").value(1));
	}

	@Test
	void deleteAccountWithoutPlansOrAccountRowStillDeletesTheUser() throws Exception {
		as("owner-a", delete(ACCOUNT)).andExpect(status().isNoContent());

		assertThat(identity.deleted()).containsExactly("owner-a");
	}

	@Test
	void deleteAccountStaysNoContentWhenTheIdentityProviderFails(CapturedOutput output) throws Exception {
		givenRestaurant("plano-a", "owner-a");
		linkTelegramChat("owner-a");
		identity.failWith(new IllegalStateException("MARCA-SECRETA service-account-json"));

		as("owner-a", delete(ACCOUNT)).andExpect(status().isNoContent());

		// La cuenta ya está borrada en la base de datos aunque el proveedor fallara.
		assertThat(identity.deleted()).containsExactly("owner-a");
		assertThat(isDeleted("plano-a")).isTrue();
		assertThat(accountRows("owner-a")).isZero();
		// El fallo se registra con el uid (para limpiarlo a mano), sin el mensaje de la excepción ni la traza completa.
		assertThat(output.getAll()).contains("IllegalStateException", "owner-a").doesNotContain("MARCA-SECRETA");
	}

	@Test
	void identityProviderFailureLogsUidAndEnumeratedCodes(CapturedOutput output) throws Exception {
		givenRestaurant("plano-a", "owner-a");
		identity.failWith(new IdentityProviderException("deleteUser", "UNAVAILABLE, UNKNOWN"));

		as("owner-a", delete(ACCOUNT)).andExpect(status().isNoContent());

		// La excepción del puerto solo lleva operación y códigos enumerados: su mensaje sí se registra.
		assertThat(output.getAll()).contains("owner-a", "deleteUser", "UNAVAILABLE, UNKNOWN");
	}

	@Test
	void demoCannotDeletePlan() throws Exception {
		demoAccount.setUid("owner-demo");
		givenRestaurant("demo", "owner-demo");

		// El slug de un plano borrado no se reutiliza: si la demo borrara el suyo, el seeder no podría recrearlo.
		as("owner-demo", delete(PLANS + "/demo")).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));

		assertThat(isDeleted("demo")).isFalse();
	}

	@Test
	void demoCannotCreatePlan() throws Exception {
		demoAccount.setUid("owner-demo");

		createPlan("owner-demo", "otro").andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));

		assertThat(restaurants.findBySlug("otro")).isEmpty();
	}

	@Test
	void demoCannotPublishAPlanOtherThanDemo() throws Exception {
		demoAccount.setUid("owner-demo");
		givenRestaurant("otro", "owner-demo");

		as("owner-demo", post(PLANS + "/otro/publish")).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
		// Un plano ajeno sigue dando 404 y no revela nada.
		givenRestaurant("de-otro", "owner-b");
		as("owner-demo", post(PLANS + "/de-otro/publish")).andExpect(status().isNotFound());
	}

	@Test
	void demoCanStillEditAndPublishItsOwnPlan() throws Exception {
		demoAccount.setUid("owner-demo");
		givenRestaurant("demo", "owner-demo");
		String layout = """
				{"room":{"shape":"RECTANGLE","width":1200,"height":800,"cutWidth":0,"cutDepth":0,"rotation":0},
				 "tables":[{"label":"M1","shape":"SQUARE","seats":2,"rotation":0,"x":200,"y":200}]}
				""";

		as("owner-demo", put(PLANS + "/demo/layout").contentType(MediaType.APPLICATION_JSON).content(layout))
			.andExpect(status().isOk());
		as("owner-demo", post(PLANS + "/demo/publish")).andExpect(status().isOk());
	}

	@Test
	void byCodeOfDeletedPlanReturns404() throws Exception {
		Restaurant plan = givenRestaurant("plano-a", "owner-a");
		Reservation past = reserve(plan, givenDinnerShift(plan), "M1", PAST);
		mvc.perform(get("/api/v1/reservations/" + past.code())).andExpect(status().isOk());

		as("owner-a", delete(PLANS + "/plano-a")).andExpect(status().isNoContent());

		mvc.perform(get("/api/v1/reservations/" + past.code())).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESERVATION_NOT_FOUND"));
	}

	@Test
	void byCodeOfDraftPlanStillWorks() throws Exception {
		Restaurant plan = givenRestaurant("plano-a", "owner-a");
		Reservation reservation = reserve(plan, givenDinnerShift(plan), "M1", FUTURE);
		restaurants.save(restaurants.findBySlug("plano-a").orElseThrow().withRoomAsDraft(plan.room()));

		mvc.perform(get("/api/v1/reservations/" + reservation.code())).andExpect(status().isOk());
	}

	@Test
	void deleteAccountBlockedByActiveReservations() throws Exception {
		Restaurant planOne = givenRestaurant("plano-1", "owner-a");
		Restaurant planTwo = givenRestaurant("plano-2", "owner-a");
		Reservation past = reserve(planOne, givenDinnerShift(planOne), "M1", PAST);
		Reservation active = reserve(planTwo, givenDinnerShift(planTwo), "M1", FUTURE);
		linkTelegramChat("owner-a");
		String pastBefore = customerOf(past);

		as("owner-a", delete(ACCOUNT)).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PLAN_HAS_RESERVATIONS"))
			.andExpect(jsonPath("$.reservations[0]").value(active.code()));

		// Nada cambia, ni el plano sin activas, y el usuario de Firebase sigue.
		assertThat(identity.deleted()).isEmpty();
		assertThat(isDeleted("plano-1")).isFalse();
		assertThat(isDeleted("plano-2")).isFalse();
		assertThat(customerOf(past)).isEqualTo(pastBefore);
		assertThat(accountRows("owner-a")).isEqualTo(1);
	}

	@Test
	void demoCannotDeleteAccount() throws Exception {
		demoAccount.setUid("owner-demo");
		givenRestaurant("demo-plan", "owner-demo");

		as("owner-demo", delete(ACCOUNT)).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));

		assertThat(identity.deleted()).isEmpty();
		assertThat(isDeleted("demo-plan")).isFalse();
	}

	@Test
	void demoCannotLinkTelegram() throws Exception {
		demoAccount.setUid("owner-demo");

		// Sin bot configurado el resto de dueños recibe 404; la demo, 403 antes de mirar el bot.
		as("owner-demo", post(TELEGRAM_LINK)).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
		as("owner-a", post(TELEGRAM_LINK)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("TELEGRAM_UNAVAILABLE"));

		assertThat(accountRows("owner-demo")).isZero();
	}

	@Test
	void deletedPlanSlugIsReservedEvenWhenTheAccountIsGone() throws Exception {
		createPlan("owner-a", "mi-local").andExpect(status().isCreated());
		as("owner-a", delete(ACCOUNT)).andExpect(status().isNoContent());

		createPlan("owner-b", "mi-local").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ALREADY_EXISTS"));
	}

}
