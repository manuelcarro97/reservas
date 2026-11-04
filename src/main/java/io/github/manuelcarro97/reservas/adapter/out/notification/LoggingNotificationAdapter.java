package io.github.manuelcarro97.reservas.adapter.out.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.application.port.out.NotificationPort;
import io.github.manuelcarro97.reservas.config.TelegramDisabled;
import io.github.manuelcarro97.reservas.config.TelegramEnabled;

/**
 * Aviso por log, el canal cuando no hay token de bot de Telegram (ver {@link TelegramEnabled}). Solo deja constancia de
 * que hubo un aviso y de su tamaño: el texto lleva el nombre del cliente y los logs del hosting no son un sitio para
 * datos personales (se conservan y los ve quien tenga acceso al panel). No se escribe tampoco el uid del dueño. El
 * puerto solo recibe el texto ya redactado, así que no hay tipo ni plano que registrar sin cambiar su contrato.
 */
@Component
@Conditional(TelegramDisabled.class)
class LoggingNotificationAdapter implements NotificationPort {

	private static final Logger log = LoggerFactory.getLogger(LoggingNotificationAdapter.class);

	@Override
	public void notifyOwner(String ownerUid, String text) {
		log.info("Owner notification raised ({} characters, no channel configured)", text.length());
	}

}
