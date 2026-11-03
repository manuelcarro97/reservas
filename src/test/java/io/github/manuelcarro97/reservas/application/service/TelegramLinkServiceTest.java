package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.Clock;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import io.github.manuelcarro97.reservas.application.port.out.OwnerAccountRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.TelegramUnavailableException;

class TelegramLinkServiceTest {

	private static final String TOKEN = "123456:TEST-FAKE-TOKEN";

	private final OwnerAccountRepositoryPort accounts = mock(OwnerAccountRepositoryPort.class);

	private TelegramLinkService service(String botToken, String botUsername) {
		return new TelegramLinkService(accounts, Clock.systemUTC(), botToken, botUsername);
	}

	@Test
	void availableNeedsTokenAndBotName() {
		assertThat(service(TOKEN, "reservas_test_bot").available()).isTrue();
		assertThat(service("", "reservas_test_bot").available()).isFalse();
		assertThat(service("  ", "reservas_test_bot").available()).isFalse();
		// Sin nombre de bot el enlace saldría como t.me/?start=…
		assertThat(service(TOKEN, "").available()).isFalse();
	}

	@Test
	void unavailableServiceNeverTouchesTheAccounts() {
		TelegramLinkService unavailable = service("", "");

		assertThatThrownBy(() -> unavailable.link("owner-a")).isInstanceOf(TelegramUnavailableException.class);
		assertThatThrownBy(() -> unavailable.unlink("owner-a")).isInstanceOf(TelegramUnavailableException.class);
		verifyNoInteractions(accounts);
	}

	@Test
	void linkTokensAre32UrlSafeCharactersAndDoNotRepeat() {
		TelegramLinkService service = service(TOKEN, "reservas_test_bot");
		Set<String> tokens = new HashSet<>();

		for (int i = 0; i < 200; i++) {
			String url = service.link("owner-a");
			String token = url.substring(url.indexOf("?start=") + "?start=".length());
			assertThat(url).startsWith("https://t.me/reservas_test_bot?start=");
			assertThat(token).matches("[A-Za-z0-9_-]{32}");
			tokens.add(token);
		}

		assertThat(tokens).hasSize(200);
	}

}
