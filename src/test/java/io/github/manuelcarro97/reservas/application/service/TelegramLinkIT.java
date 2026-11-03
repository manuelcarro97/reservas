package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

import io.github.manuelcarro97.reservas.application.port.in.TelegramLinkUseCase;
import io.github.manuelcarro97.reservas.application.port.out.NotificationPort;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.FakeTelegramClient;
import io.github.manuelcarro97.reservas.support.FakeTelegramClient.Sent;
import io.github.manuelcarro97.reservas.support.MutableClock;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * Vinculación del chat de Telegram del dueño y avisos a ese chat, con el bot configurado con un token falso y un
 * cliente falso (nunca se llama a Telegram).
 * <p>
 * Las rutas de Telegram son por dueño (su cuenta), no por plano: no caben en la tabla de {@code OwnershipIT}, que
 * espera 404 para el dueño ajeno de un plano. La frontera entre dueños la cubren {@link #linkIsPerOwner()} y
 * {@link #unlinkOfAnotherOwnerLeavesMyChat()}.
 */
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
@TestPropertySource(properties = { "app.telegram.bot-token=" + FakeTelegramClient.TOKEN,
		"app.telegram.bot-username=reservas_test_bot" })
class TelegramLinkIT extends PostgresIT {

	private static final String TELEGRAM = "/api/v1/admin/telegram";
	private static final String LINK = TELEGRAM + "/link";
	private static final String DATE = "2026-12-02";
	private static final long WAIT_MS = 5000;

	@TestConfiguration(proxyBeanMethods = false)
	static class FakeClientConfiguration {

		@Bean
		@Primary
		FakeTelegramClient fakeTelegramClient() {
			return FakeTelegramClient.create();
		}

	}

	@Autowired
	private MockMvc mvc;

	@Autowired
	private TelegramLinkUseCase telegram;

	@Autowired
	private NotificationPort notifications;

	@Autowired
	private FakeTelegramClient client;

	@Autowired
	private ApplicationContext context;

	private Shift shift;
	private DiningTable table;

	@BeforeEach
	void seed() {
		client.reset();
		var restaurant = givenRestaurant("demo");
		shift = givenDinnerShift(restaurant);
		table = givenTable(restaurant, "M2", 2);
	}

	private String linkUrl(String ownerUid) throws Exception {
		String response = mvc.perform(post(LINK).with(AuthRequests.owner(ownerUid)))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(response, "$.url");
	}

	private String tokenOf(String url) {
		return url.substring(url.indexOf("?start=") + "?start=".length());
	}

	private Long chatOf(String ownerUid) {
		return jdbc.sql("SELECT telegram_chat_id FROM owner_account WHERE uid = :uid")
			.param("uid", ownerUid)
			.query(Long.class)
			.optional()
			.orElse(null);
	}

	private void book() throws Exception {
		mvc.perform(post("/api/v1/restaurants/demo/reservations").contentType(MediaType.APPLICATION_JSON).content("""
				{"date":"%s","shiftId":%d,"partySize":2,"customerName":"Ana","customerPhone":"600000000",
				 "tableId":%d}
				""".formatted(DATE, shift.id(), table.id()))).andExpect(status().isCreated());
	}

	@Test
	void linkReturnsBotUrlWithToken() throws Exception {
		mvc.perform(post(LINK).with(AuthRequests.owner("owner-a")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.url")
				.value(matchesPattern("https://t\\.me/reservas_test_bot\\?start=[A-Za-z0-9_-]{32}")))
			// Solo la url: nada del chat ni del dueño.
			.andExpect(content().string(not(containsString("owner-a"))));

		// El token se guarda con caducidad a los 15 minutos según el reloj.
		assertThat(jdbc.sql("SELECT link_token FROM owner_account WHERE uid = 'owner-a'")
			.query(String.class)
			.single()).hasSize(32);
		assertThat(jdbc.sql("SELECT link_token_expires_at FROM owner_account WHERE uid = 'owner-a'")
			.query(java.time.OffsetDateTime.class)
			.single()
			.toInstant()).isEqualTo(MutableClock.START.plus(Duration.ofMinutes(15)));
	}

	@Test
	void linkTokensDifferEachTimeAndTheNewOneReplacesThePending() throws Exception {
		String first = tokenOf(linkUrl("owner-a"));
		String second = tokenOf(linkUrl("owner-a"));

		assertThat(second).isNotEqualTo(first);
		assertThat(telegram.handleStart(1, first)).isFalse();
		assertThat(chatOf("owner-a")).isNull();
		telegram.handleStart(2, second);
		assertThat(chatOf("owner-a")).isEqualTo(2L);
	}

	@Test
	void startWithValidTokenStoresChatId() throws Exception {
		String token = tokenOf(linkUrl("owner-a"));

		assertThat(telegram.handleStart(424242L, token)).isTrue();

		assertThat(chatOf("owner-a")).isEqualTo(424242L);
		// El token queda gastado.
		assertThat(jdbc.sql("SELECT link_token FROM owner_account WHERE uid = 'owner-a'")
			.query(String.class)
			.optional()).isEmpty();
	}

	private String statusOf(String ownerUid) throws Exception {
		return mvc.perform(get(TELEGRAM).with(AuthRequests.owner(ownerUid)))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
	}

	private void expectStatus(String ownerUid, boolean linked, boolean linkPending) throws Exception {
		mvc.perform(get(TELEGRAM).with(AuthRequests.owner(ownerUid)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.available").value(true))
			.andExpect(jsonPath("$.linked").value(linked))
			.andExpect(jsonPath("$.linkPending").value(linkPending));
	}

	@Test
	void statusFollowsTheLinkLifecycle() throws Exception {
		expectStatus("owner-a", false, false);

		String token = tokenOf(linkUrl("owner-a"));
		expectStatus("owner-a", false, true);

		telegram.handleStart(424242L, token);
		expectStatus("owner-a", true, false);

		// Vinculado y con un enlace nuevo pendiente a la vez.
		String second = tokenOf(linkUrl("owner-a"));
		expectStatus("owner-a", true, true);

		// Un enlace caducado ya no está pendiente.
		clock.set(MutableClock.START.plus(Duration.ofMinutes(15)));
		expectStatus("owner-a", true, false);

		mvc.perform(delete(LINK).with(AuthRequests.owner("owner-a"))).andExpect(status().isNoContent());
		expectStatus("owner-a", false, false);
		assertThat(second).isNotBlank();
	}

	@Test
	void eachOwnerOnlySeesTheirOwnStatus() throws Exception {
		telegram.handleStart(7, tokenOf(linkUrl("owner-a")));
		linkUrl("owner-b");

		expectStatus("owner-a", true, false);
		expectStatus("owner-b", false, true);
		expectStatus("owner-c", false, false);
	}

	@Test
	void statusNeverExposesChatTokenOrOwner() throws Exception {
		String token = tokenOf(linkUrl("owner-a"));
		telegram.handleStart(424242L, token);
		String pending = tokenOf(linkUrl("owner-a"));

		String body = statusOf("owner-a");

		assertThat(body).doesNotContain("424242").doesNotContain(token).doesNotContain(pending)
			.doesNotContain("owner-a")
			.doesNotContain("chat")
			.doesNotContain("token");
		assertThat(JsonPath.<java.util.Map<String, Object>>read(body, "$")).containsOnlyKeys("available", "linked",
				"linkPending");
	}

	@Test
	void statusRequiresAuthentication() throws Exception {
		mvc.perform(get(TELEGRAM)).andExpect(status().isUnauthorized());
	}

	@Test
	void pendingLinksFollowTheLifecycleOfTheLink() throws Exception {
		assertThat(telegram.hasPendingLinks()).isFalse();

		String token = tokenOf(linkUrl("owner-a"));
		assertThat(telegram.hasPendingLinks()).isTrue();

		// Usado: ya no queda pendiente.
		telegram.handleStart(7, token);
		assertThat(telegram.hasPendingLinks()).isFalse();

		// Sin usar pero caducado: tampoco.
		linkUrl("owner-a");
		assertThat(telegram.hasPendingLinks()).isTrue();
		clock.set(MutableClock.START.plus(Duration.ofMinutes(15)));
		assertThat(telegram.hasPendingLinks()).isFalse();

		// Desvincular borra el pendiente.
		clock.set(MutableClock.START);
		assertThat(telegram.hasPendingLinks()).isTrue();
		telegram.unlink("owner-a");
		assertThat(telegram.hasPendingLinks()).isFalse();
	}

	@Test
	void tokenStillValidJustBeforeItExpires() throws Exception {
		String token = tokenOf(linkUrl("owner-a"));
		clock.set(MutableClock.START.plus(Duration.ofMinutes(15)).minusSeconds(1));

		assertThat(telegram.handleStart(7, token)).isTrue();

		assertThat(chatOf("owner-a")).isEqualTo(7L);
	}

	@Test
	void expiredTokenIsIgnored() throws Exception {
		String token = tokenOf(linkUrl("owner-a"));
		clock.set(MutableClock.START.plus(Duration.ofMinutes(15)));

		assertThat(telegram.handleStart(7, token)).isFalse();

		assertThat(chatOf("owner-a")).isNull();
	}

	@Test
	void tokenIsSingleUse() throws Exception {
		String token = tokenOf(linkUrl("owner-a"));
		assertThat(telegram.handleStart(7, token)).isTrue();

		// Otro chat con el mismo enlace ya usado no se lleva los avisos.
		assertThat(telegram.handleStart(8, token)).isFalse();

		assertThat(chatOf("owner-a")).isEqualTo(7L);
	}

	@Test
	void unknownOrBlankTokenIsIgnored() throws Exception {
		linkUrl("owner-a");

		assertThat(telegram.handleStart(7, "no-existe-no-existe-no-existe-12")).isFalse();
		assertThat(telegram.handleStart(7, "")).isFalse();
		assertThat(telegram.handleStart(7, "   ")).isFalse();

		assertThat(chatOf("owner-a")).isNull();
	}

	@Test
	void relinkingOverwritesThePreviousChat() throws Exception {
		telegram.handleStart(7, tokenOf(linkUrl("owner-a")));
		assertThat(chatOf("owner-a")).isEqualTo(7L);

		// Pedir un enlace nuevo no desvincula el chat actual hasta que se use.
		String second = tokenOf(linkUrl("owner-a"));
		assertThat(chatOf("owner-a")).isEqualTo(7L);
		telegram.handleStart(9, second);

		assertThat(chatOf("owner-a")).isEqualTo(9L);
	}

	@Test
	void unlinkClearsChatIdAndPendingToken() throws Exception {
		telegram.handleStart(7, tokenOf(linkUrl("owner-a")));
		String pending = tokenOf(linkUrl("owner-a"));

		mvc.perform(delete(LINK).with(AuthRequests.owner("owner-a"))).andExpect(status().isNoContent());

		assertThat(chatOf("owner-a")).isNull();
		assertThat(jdbc.sql("SELECT link_token FROM owner_account WHERE uid = 'owner-a'")
			.query(String.class)
			.optional()).isEmpty();
		// El enlace pendiente ya no sirve.
		telegram.handleStart(8, pending);
		assertThat(chatOf("owner-a")).isNull();
	}

	@Test
	void unlinkWithoutAccountIsNoContent() throws Exception {
		mvc.perform(delete(LINK).with(AuthRequests.owner("owner-nuevo"))).andExpect(status().isNoContent());
	}

	@Test
	void linkIsPerOwner() throws Exception {
		String forA = tokenOf(linkUrl("owner-a"));
		String forB = tokenOf(linkUrl("owner-b"));

		telegram.handleStart(7, forB);

		assertThat(forA).isNotEqualTo(forB);
		assertThat(chatOf("owner-b")).isEqualTo(7L);
		assertThat(chatOf("owner-a")).isNull();
	}

	@Test
	void unlinkOfAnotherOwnerLeavesMyChat() throws Exception {
		telegram.handleStart(7, tokenOf(linkUrl("owner-a")));
		linkUrl("owner-b");

		mvc.perform(delete(LINK).with(AuthRequests.owner("owner-b"))).andExpect(status().isNoContent());

		assertThat(chatOf("owner-a")).isEqualTo(7L);
	}

	@Test
	void endpointsRequireAuthentication() throws Exception {
		mvc.perform(post(LINK)).andExpect(status().isUnauthorized());
		mvc.perform(delete(LINK)).andExpect(status().isUnauthorized());
	}

	@Test
	void notificationGoesToLinkedChat() throws Exception {
		telegram.handleStart(424242L, tokenOf(linkUrl("owner-a")));

		book();

		Awaitility.await()
			.atMost(Duration.ofMillis(WAIT_MS))
			.untilAsserted(() -> assertThat(client.sent())
				.containsExactly(new Sent(424242L, "[demo] Nueva reserva: Ana, 2 personas, cena del miércoles 2, mesa M2")));
	}

	@Test
	void notificationWithoutLinkedChatDoesNothing() {
		notifications.notifyOwner("owner-a", "aviso");
		notifications.notifyOwner("owner-sin-cuenta", "aviso");

		assertThat(client.sent()).isEmpty();
	}

	@Test
	void notificationAfterUnlinkDoesNothing() throws Exception {
		telegram.handleStart(7, tokenOf(linkUrl("owner-a")));
		telegram.unlink("owner-a");

		notifications.notifyOwner("owner-a", "aviso");

		assertThat(client.sent()).isEmpty();
	}

	@Test
	void telegramFailureDoesNotBreakBooking(CapturedOutput output) throws Exception {
		telegram.handleStart(424242L, tokenOf(linkUrl("owner-a")));
		client.failSending();

		book();

		// El aviso se intentó y falló; la reserva está guardada.
		Awaitility.await()
			.atMost(Duration.ofMillis(WAIT_MS))
			.untilAsserted(() -> assertThat(output.getAll()).contains("Owner notification failed"));
		assertThat(client.sent()).hasSize(1);
		assertThat(jdbc.sql("SELECT count(*) FROM reservation").query(Long.class).single()).isEqualTo(1L);
		// Ni el token del bot, ni la URL de la API, ni el chat salen en el log.
		assertThat(output.getAll()).doesNotContain(FakeTelegramClient.TOKEN)
			.doesNotContain("TEST-FAKE")
			.doesNotContain("api.telegram.org")
			.doesNotContain("424242");
	}

	@Test
	void telegramBeansAreActiveWithAToken() {
		assertThat(context.getBeanNamesForType(NotificationPort.class)).containsExactly("telegramNotificationAdapter");
		assertThat(context.containsBean("telegramPollingJob")).isTrue();
		assertThat(context.containsBean("loggingNotificationAdapter")).isFalse();
	}

	@Test
	void linkIsAvailableWithTokenAndBotName() {
		assertThat(telegram.available()).isTrue();
	}

}
