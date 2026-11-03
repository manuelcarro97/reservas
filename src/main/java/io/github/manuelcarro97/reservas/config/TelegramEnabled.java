package io.github.manuelcarro97.reservas.config;

import java.util.regex.Pattern;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.env.Environment;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.util.StringUtils;

/**
 * Hay bot de Telegram: {@code app.telegram.bot-token} y {@code app.telegram.bot-username} tienen texto (sin contar
 * espacios ni saltos de línea de alrededor, que los hostings a veces pegan al valor) y el token tiene el formato de uno
 * de BotFather. Es el único criterio de activación (canal de avisos, job de consulta y vinculación); con solo uno de
 * los dos, o con un token de otro formato, no hay Telegram y la app arranca igual. No se usa
 * {@code @ConditionalOnProperty}: con {@code ${TELEGRAM_BOT_TOKEN:}} vacío la propiedad existe y también daría que sí.
 * {@link TelegramDisabled} es su negación, así que en cada arranque hay exactamente un canal de avisos.
 */
public class TelegramEnabled implements Condition {

	static final String TOKEN_PROPERTY = "app.telegram.bot-token";
	static final String USERNAME_PROPERTY = "app.telegram.bot-username";

	/** Lo que usa un token de BotFather; se exige porque el token va dentro de la ruta de la URL. */
	private static final Pattern BOT_TOKEN_FORMAT = Pattern.compile("[A-Za-z0-9:_-]+");

	/** El valor sin espacios ni saltos de línea de alrededor; nulo se trata como vacío. */
	public static String clean(String value) {
		return value == null ? "" : StringUtils.trimWhitespace(value);
	}

	/** El token (ya limpio) tiene el formato de un token de bot. */
	public static boolean isValidBotToken(String cleanToken) {
		return BOT_TOKEN_FORMAT.matcher(cleanToken).matches();
	}

	/** La regla, en un solo sitio: la usan esta condición, el servicio de vinculación y el aviso de arranque. */
	public static boolean configured(String botToken, String botUsername) {
		return isValidBotToken(clean(botToken)) && StringUtils.hasText(clean(botUsername));
	}

	@Override
	public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
		Environment environment = context.getEnvironment();
		return configured(environment.getProperty(TOKEN_PROPERTY), environment.getProperty(USERNAME_PROPERTY));
	}

}
