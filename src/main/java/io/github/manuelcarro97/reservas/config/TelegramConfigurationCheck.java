package io.github.manuelcarro97.reservas.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Avisa una vez al arrancar si Telegram está a medio configurar (solo token, solo nombre de bot o un token con otro
 * formato): en ese caso no se activa y, sin este aviso, nadie sabría por qué. Dice qué variable falla; nunca escribe
 * valores.
 */
@Component
class TelegramConfigurationCheck {

	private static final Logger log = LoggerFactory.getLogger(TelegramConfigurationCheck.class);

	TelegramConfigurationCheck(@Value("${app.telegram.bot-token:}") String botToken,
			@Value("${app.telegram.bot-username:}") String botUsername) {
		String token = TelegramEnabled.clean(botToken);
		boolean hasToken = StringUtils.hasText(token);
		boolean hasUsername = StringUtils.hasText(TelegramEnabled.clean(botUsername));
		if (hasToken && !TelegramEnabled.isValidBotToken(token)) {
			log.warn("Telegram is disabled: TELEGRAM_BOT_TOKEN has an unexpected format");
		}
		else if (hasToken && !hasUsername) {
			log.warn("Telegram is disabled: TELEGRAM_BOT_USERNAME is empty (TELEGRAM_BOT_TOKEN is set)");
		}
		else if (hasUsername && !hasToken) {
			log.warn("Telegram is disabled: TELEGRAM_BOT_TOKEN is empty (TELEGRAM_BOT_USERNAME is set)");
		}
	}

}
