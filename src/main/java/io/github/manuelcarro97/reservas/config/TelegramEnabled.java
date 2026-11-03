package io.github.manuelcarro97.reservas.config;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.env.Environment;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.util.StringUtils;

/**
 * Hay bot de Telegram: {@code app.telegram.bot-token} y {@code app.telegram.bot-username} tienen texto. Es el único
 * criterio de activación (canal de avisos, job de consulta y vinculación); con solo uno de los dos no hay Telegram. No
 * se usa {@code @ConditionalOnProperty}: con {@code ${TELEGRAM_BOT_TOKEN:}} vacío la propiedad existe y también daría
 * que sí. {@link TelegramDisabled} es su negación, así que en cada arranque hay exactamente un canal de avisos.
 */
public class TelegramEnabled implements Condition {

	static final String TOKEN_PROPERTY = "app.telegram.bot-token";
	static final String USERNAME_PROPERTY = "app.telegram.bot-username";

	/** La regla, en un solo sitio: la usan esta condición, el servicio de vinculación y el aviso de arranque. */
	public static boolean configured(String botToken, String botUsername) {
		return StringUtils.hasText(botToken) && StringUtils.hasText(botUsername);
	}

	@Override
	public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
		Environment environment = context.getEnvironment();
		return configured(environment.getProperty(TOKEN_PROPERTY), environment.getProperty(USERNAME_PROPERTY));
	}

}
