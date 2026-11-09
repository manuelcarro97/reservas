package io.github.manuelcarro97.reservas.adapter.out.notification;

import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.application.port.out.NotificationPort;
import io.github.manuelcarro97.reservas.application.port.out.OwnerAccountRepositoryPort;
import io.github.manuelcarro97.reservas.config.TelegramEnabled;

/**
 * Aviso por Telegram al chat que el dueño vinculó; si no ha vinculado ninguno, no hace nada. Es el canal de avisos
 * cuando hay token de bot; si no, el de {@link LoggingNotificationAdapter}. Si Telegram falla lanza {@link
 * TelegramException} (sin URL ni token) y quien llama lo registra.
 */
@Component
@Conditional(TelegramEnabled.class)
class TelegramNotificationAdapter implements NotificationPort {

	private final OwnerAccountRepositoryPort accounts;
	private final TelegramClient client;

	TelegramNotificationAdapter(OwnerAccountRepositoryPort accounts, TelegramClient client) {
		this.accounts = accounts;
		this.client = client;
	}

	@Override
	public void notifyOwner(String ownerUid, String text) {
		accounts.findChatId(ownerUid).ifPresent(chatId -> client.sendMessage(chatId, text));
	}

}
