package io.github.manuelcarro97.reservas.adapter.out.notification;

/**
 * Fallo al hablar con Telegram. El mensaje nunca lleva la URL ni el token del bot (las excepciones de {@code
 * RestClient} traen la URL completa, que incluye el token) y esta excepción no encadena la causa por la misma razón.
 */
public class TelegramException extends RuntimeException {

	public TelegramException(String message) {
		super(message);
	}

}
