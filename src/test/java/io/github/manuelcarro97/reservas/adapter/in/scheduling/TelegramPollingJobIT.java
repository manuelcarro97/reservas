package io.github.manuelcarro97.reservas.adapter.in.scheduling;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;

import io.github.manuelcarro97.reservas.adapter.out.notification.Update;
import io.github.manuelcarro97.reservas.application.port.in.TelegramLinkUseCase;
import io.github.manuelcarro97.reservas.support.FakeTelegramClient;
import io.github.manuelcarro97.reservas.support.FakeTelegramClient.Sent;
import io.github.manuelcarro97.reservas.support.MutableClock;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * El job de consulta con el servicio de vinculación real: la respuesta del bot depende de si el enlace vinculó, y es la
 * misma para un enlace caducado, ya usado o inexistente (no revela cuál de los tres es).
 */
@TestPropertySource(properties = { "app.telegram.bot-token=" + FakeTelegramClient.TOKEN,
		"app.telegram.bot-username=reservas_test_bot" })
class TelegramPollingJobIT extends PostgresIT {

	private static final String LINKED = "Avisos de reservas vinculados.";
	private static final String INVALID = "Enlace caducado o no válido. Genera uno nuevo desde el panel.";
	/** El job guarda su offset en memoria durante todo el contexto: los ids de actualización no pueden repetirse. */
	private static final AtomicLong UPDATE_IDS = new AtomicLong(1000);

	@TestConfiguration(proxyBeanMethods = false)
	static class FakeClientConfiguration {

		@Bean
		@Primary
		FakeTelegramClient fakeTelegramClient() {
			return FakeTelegramClient.create();
		}

	}

	@Autowired
	private TelegramPollingJob job;

	@Autowired
	private TelegramLinkUseCase telegram;

	@Autowired
	private FakeTelegramClient client;

	@BeforeEach
	void resetClient() {
		client.reset();
	}

	private String newToken() {
		String url = telegram.link("owner-a");
		return url.substring(url.indexOf("?start=") + "?start=".length());
	}

	private Long chatOfOwnerA() {
		return jdbc.sql("SELECT telegram_chat_id FROM owner_account WHERE uid = 'owner-a'")
			.query(Long.class)
			.optional()
			.orElse(null);
	}

	/** El job programado corre en paralelo con el test (con el mismo offset): da igual cuál procese la actualización. */
	private void startWith(long chatId, String token) {
		client.queue(new Update(UPDATE_IDS.incrementAndGet(),
				new Update.Message(new Update.Chat(chatId), "/start " + token)));
		job.poll();
	}

	private void awaitReply(long chatId, String text) {
		Awaitility.await()
			.atMost(Duration.ofSeconds(5))
			.untilAsserted(() -> assertThat(client.sent()).containsExactly(new Sent(chatId, text)));
	}

	@Test
	void validLinkLinksAndRepliesLinked() {
		startWith(7, newToken());

		awaitReply(7, LINKED);
		assertThat(chatOfOwnerA()).isEqualTo(7L);
	}

	@Test
	void expiredLinkRepliesInvalid() {
		String token = newToken();
		clock.set(MutableClock.START.plus(Duration.ofMinutes(15)));

		startWith(7, token);

		awaitReply(7, INVALID);
		assertThat(chatOfOwnerA()).isNull();
	}

	@Test
	void alreadyUsedLinkRepliesInvalid() {
		String token = newToken();
		telegram.handleStart(7, token);

		startWith(8, token);

		awaitReply(8, INVALID);
		assertThat(chatOfOwnerA()).isEqualTo(7L);
	}

	@Test
	void unknownLinkRepliesInvalid() {
		startWith(7, "no-existe-no-existe-no-existe-12");

		awaitReply(7, INVALID);
		assertThat(chatOfOwnerA()).isNull();
	}

}
