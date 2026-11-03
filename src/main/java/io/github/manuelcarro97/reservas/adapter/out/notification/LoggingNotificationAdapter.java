package io.github.manuelcarro97.reservas.adapter.out.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.application.port.out.NotificationPort;
import io.github.manuelcarro97.reservas.config.TelegramDisabled;
import io.github.manuelcarro97.reservas.config.TelegramEnabled;

/**
 * Aviso por log, el canal cuando no hay token de bot de Telegram (ver {@link TelegramEnabled}). El texto lleva el
 * nombre del cliente pero nunca su teléfono ni su email, y no se escribe el uid del dueño.
 */
@Component
@Conditional(TelegramDisabled.class)
class LoggingNotificationAdapter implements NotificationPort {

	private static final Logger log = LoggerFactory.getLogger(LoggingNotificationAdapter.class);

	@Override
	public void notifyOwner(String ownerUid, String text) {
		// El nombre lo escribe el cliente: sin saltos de línea ni otros controles, no puede falsear líneas del log.
		log.info("Owner notification: {}", text.replaceAll("\\p{Cntrl}", " "));
	}

}
