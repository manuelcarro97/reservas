package io.github.manuelcarro97.reservas.adapter.in.scheduling;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Conditional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.adapter.out.notification.TelegramClient;
import io.github.manuelcarro97.reservas.adapter.out.notification.TelegramException;
import io.github.manuelcarro97.reservas.adapter.out.notification.Update;
import io.github.manuelcarro97.reservas.application.port.in.TelegramLinkUseCase;
import io.github.manuelcarro97.reservas.config.TelegramEnabled;

/**
 * Consulta a Telegram (getUpdates) para recibir el {@code /start <token>} con que el dueño vincula su chat. Solo existe
 * si hay token de bot. Consultar en vez de recibir un webhook funciona igual en local y en cualquier hosting, sin URL
 * pública.
 * <p>
 * Nunca se escribe en el log el token del bot, el enlace de vinculación ni el chat. Ningún fallo sale del método: el
 * manejador por defecto de {@code @Scheduled} registraría la excepción entera.
 */
@Component
@Conditional(TelegramEnabled.class)
class TelegramPollingJob {

	private static final Logger log = LoggerFactory.getLogger(TelegramPollingJob.class);

	static final String LINKED_REPLY = "Avisos de reservas vinculados.";
	private static final String START = "/start";

	private final TelegramClient client;
	private final TelegramLinkUseCase telegram;
	/** Primera actualización por confirmar. En memoria: si la app se reinicia, Telegram reentrega las no confirmadas. */
	private volatile long offset = 0;

	TelegramPollingJob(TelegramClient client, TelegramLinkUseCase telegram) {
		this.client = client;
		this.telegram = telegram;
	}

	/** Una espera larga de hasta 30 s por ejecución; {@code fixedDelay} impide que dos ejecuciones se solapen. */
	@Scheduled(fixedDelayString = "PT5S")
	void poll() {
		List<Update> updates;
		try {
			updates = client.getUpdates(offset);
		}
		catch (RuntimeException failure) {
			log.warn("Telegram polling failed: {}", describe(failure));
			return;
		}
		for (Update update : updates) {
			try {
				process(update);
			}
			catch (RuntimeException failure) {
				// Sin confirmar: esta actualización y las siguientes se reintentan en la próxima ejecución.
				log.warn("Telegram update failed: {}", describe(failure));
				return;
			}
			offset = update.updateId() + 1;
		}
	}

	private void process(Update update) {
		if (update.message() == null || update.message().chat() == null) {
			return;
		}
		String token = startToken(update.message().text());
		if (token == null) {
			return;
		}
		long chatId = update.message().chat().id();
		telegram.handleStart(chatId, token);
		reply(chatId);
	}

	/** El aviso es un extra: si falla, la vinculación ya está hecha y la actualización no se reintenta. */
	private void reply(long chatId) {
		try {
			client.sendMessage(chatId, LINKED_REPLY);
		}
		catch (RuntimeException failure) {
			log.warn("Telegram reply failed: {}", describe(failure));
		}
	}

	/** El token de {@code /start <token>} o {@code /start@bot <token>}; nulo si el texto no es un /start con token. */
	private static String startToken(String text) {
		if (text == null) {
			return null;
		}
		String[] words = text.trim().split("\\s+");
		boolean isStart = words[0].equals(START) || words[0].startsWith(START + "@");
		return isStart && words.length == 2 ? words[1] : null;
	}

	/** Los de {@link TelegramException} no llevan URL ni token por construcción; de cualquier otra solo la clase. */
	private static String describe(RuntimeException failure) {
		return failure instanceof TelegramException ? failure.getMessage() : failure.getClass().getName();
	}

}
