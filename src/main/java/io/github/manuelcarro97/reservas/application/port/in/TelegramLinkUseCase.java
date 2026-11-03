package io.github.manuelcarro97.reservas.application.port.in;

/** Vincular el chat de Telegram del dueño para recibir los avisos de reservas. */
public interface TelegramLinkUseCase {

	/** Hay bot configurado (token y nombre); sin él no se puede vincular. */
	boolean available();

	/**
	 * Genera un enlace de un solo uso, válido 15 minutos, {@code https://t.me/<bot>?start=<token>}; sustituye al
	 * pendiente anterior. Lanza {@code TelegramUnavailableException} si no hay bot.
	 */
	String link(String ownerUid);

	/** Borra el chat vinculado y el enlace pendiente. Lanza {@code TelegramUnavailableException} si no hay bot. */
	void unlink(String ownerUid);

	/**
	 * El usuario abrió el enlace en Telegram ({@code /start <token>}): vincula ese chat al dueño del enlace y gasta el
	 * enlace. Un enlace desconocido, caducado o ya usado no hace nada y no dice cuál de los tres es.
	 */
	void handleStart(long chatId, String token);

}
