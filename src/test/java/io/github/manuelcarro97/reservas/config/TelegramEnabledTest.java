package io.github.manuelcarro97.reservas.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.mock.env.MockEnvironment;

/** Un único criterio de activación: Telegram solo existe si hay token Y nombre de bot. */
@ExtendWith(OutputCaptureExtension.class)
class TelegramEnabledTest {

	private static final String TOKEN = "123456:TEST-FAKE-TOKEN";

	private static boolean enabled(String token, String username) {
		MockEnvironment environment = new MockEnvironment();
		if (token != null) {
			environment.setProperty("app.telegram.bot-token", token);
		}
		if (username != null) {
			environment.setProperty("app.telegram.bot-username", username);
		}
		ConditionContext context = mock(ConditionContext.class);
		when(context.getEnvironment()).thenReturn(environment);
		AnnotatedTypeMetadata metadata = mock(AnnotatedTypeMetadata.class);
		boolean enabled = new TelegramEnabled().matches(context, metadata);
		// Su negación da siempre lo contrario: nunca los dos canales ni ninguno.
		assertThat(new TelegramDisabled().matches(context, metadata)).isEqualTo(!enabled);
		return enabled;
	}

	@Test
	void enabledOnlyWithTokenAndBotName() {
		assertThat(enabled(TOKEN, "reservas_test_bot")).isTrue();
		assertThat(enabled(TOKEN, "")).isFalse();
		assertThat(enabled(TOKEN, "  ")).isFalse();
		assertThat(enabled(TOKEN, null)).isFalse();
		assertThat(enabled("", "reservas_test_bot")).isFalse();
		assertThat(enabled(null, "reservas_test_bot")).isFalse();
		assertThat(enabled("", "")).isFalse();
		assertThat(enabled(null, null)).isFalse();
	}

	@Test
	void warnsOnceWhichVariableIsMissingWithoutPrintingValues(CapturedOutput output) {
		new TelegramConfigurationCheck(TOKEN, "");
		new TelegramConfigurationCheck("", "reservas_test_bot");

		assertThat(output.getAll()).containsOnlyOnce("TELEGRAM_BOT_USERNAME is empty")
			.containsOnlyOnce("TELEGRAM_BOT_TOKEN is empty")
			.doesNotContain(TOKEN)
			.doesNotContain("reservas_test_bot");
	}

	@Test
	void staysQuietWhenBothOrNoneAreSet(CapturedOutput output) {
		new TelegramConfigurationCheck(TOKEN, "reservas_test_bot");
		new TelegramConfigurationCheck("", "");
		new TelegramConfigurationCheck(null, null);

		assertThat(output.getAll()).doesNotContain("Telegram");
	}

}
