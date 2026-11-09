package io.github.manuelcarro97.reservas.config;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

/** No hay bot de Telegram: la negación exacta de {@link TelegramEnabled}. */
public class TelegramDisabled implements Condition {

	private final TelegramEnabled enabled = new TelegramEnabled();

	@Override
	public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
		return !enabled.matches(context, metadata);
	}

}
