package io.github.manuelcarro97.reservas.config;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.util.StringUtils;

/**
 * Hay bot de Telegram: {@code app.telegram.bot-token} tiene texto. No se usa {@code @ConditionalOnProperty}: con
 * {@code ${TELEGRAM_BOT_TOKEN:}} vacío la propiedad existe y también daría que sí. Es la única decisión sobre si hay
 * Telegram; {@link TelegramDisabled} es su negación, así que en cada arranque hay exactamente un canal de avisos.
 */
public class TelegramEnabled implements Condition {

	static final String TOKEN_PROPERTY = "app.telegram.bot-token";

	@Override
	public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
		return StringUtils.hasText(context.getEnvironment().getProperty(TOKEN_PROPERTY));
	}

}
