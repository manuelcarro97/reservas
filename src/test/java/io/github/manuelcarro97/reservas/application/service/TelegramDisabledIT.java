package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.test.web.servlet.MockMvc;

import io.github.manuelcarro97.reservas.application.port.in.TelegramLinkUseCase;
import io.github.manuelcarro97.reservas.application.port.out.NotificationPort;
import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/** Sin token de bot (el caso de local y de CI): avisos por log, sin job de consulta y sin vinculación. */
@AutoConfigureMockMvc
class TelegramDisabledIT extends PostgresIT {

	private static final String LINK = "/api/v1/admin/telegram/link";

	@Autowired
	private MockMvc mvc;

	@Autowired
	private ApplicationContext context;

	@Autowired
	private TelegramLinkUseCase telegram;

	@Test
	void appStartsWithLoggingAndNoPollingJob() {
		assertThat(context.getBeanNamesForType(NotificationPort.class)).containsExactly("loggingNotificationAdapter");
		assertThat(context.containsBean("telegramClient")).isFalse();
		assertThat(context.containsBean("telegramNotificationAdapter")).isFalse();
		assertThat(context.containsBean("telegramPollingJob")).isFalse();
	}

	@Test
	void linkWithoutBotTokenReturns404() throws Exception {
		assertThat(telegram.available()).isFalse();

		mvc.perform(post(LINK).with(AuthRequests.owner("owner-a")))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("TELEGRAM_UNAVAILABLE"));
		mvc.perform(delete(LINK).with(AuthRequests.owner("owner-a")))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("TELEGRAM_UNAVAILABLE"));
	}

}
