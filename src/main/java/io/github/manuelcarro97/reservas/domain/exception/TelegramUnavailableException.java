package io.github.manuelcarro97.reservas.domain.exception;

public class TelegramUnavailableException extends DomainException {

	public TelegramUnavailableException() {
		super("TELEGRAM_UNAVAILABLE", ErrorKind.NOT_FOUND, "Telegram notifications are not configured");
	}

}
