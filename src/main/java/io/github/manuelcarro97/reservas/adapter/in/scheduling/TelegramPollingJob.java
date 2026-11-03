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
 * si hay token y nombre de bot. Consultar en vez de recibir un webhook funciona igual en local y en cualquier hosting,
 * sin URL pública.
 * <p>
 * El bot solo sirve para avisar: la única conversación que espera es el {@code /start} de un enlace recién generado.
 * Por eso solo se consulta mientras haya algún enlace pendiente sin caducar; sin ninguno, {@link #poll()} vuelve sin
 * llamar a Telegram. Al reanudar tras un rato sin consultar, Telegram puede entregar de golpe las actualizaciones
 * acumuladas (las guarda hasta 24 h) y de reinicios anteriores; se tratan igual que las demás: un {@code /start} con
 * enlace de formato inválido, caducado, usado o inexistente recibe {@link #INVALID_LINK_REPLY}, y todas se confirman.
 * <p>
 * Nunca se escribe en el log el token del bot, el enlace de vinculación ni el chat. Ningún fallo sale del método: el
 * manejador por defecto de {@code @Scheduled} registraría la excepción entera.
 */
@Component
@Conditional(TelegramEnabled.class)
class TelegramPollingJob {

	private static final Logger log = LoggerFactory.getLogger(TelegramPollingJob.class);

	static final String LINKED_REPLY = "Avisos de reservas vinculados.";
	/** El mismo texto para un enlace caducado, ya usado, inexistente o de formato inválido: no revela cuál. */
	static final String INVALID_LINK_REPLY = "Enlace caducado o no válido. Genera uno nuevo desde el panel.";
	private static final String START = "/start";

	private final TelegramClient client;
	private final TelegramLinkUseCase telegram;
	/** Primera actualización por confirmar. En memoria: si la app se reinicia, Telegram reentrega las no confirmadas. */
	private volatile long offset = 0;
	/** La ejecución anterior falló: los fallos seguidos no repiten el WARN. Solo se toca dentro de {@code poll()}. */
	private boolean failing = false;

	TelegramPollingJob(TelegramClient client, TelegramLinkUseCase telegram) {
		this.client = client;
		this.telegram = telegram;
	}

	/**
	 * Una espera larga de hasta 30 s por ejecución; {@code fixedDelay} impide que dos ejecuciones programadas se solapen y
	 * {@code synchronized} lo garantiza también frente a una llamada directa (los tests).
	 * <p>
	 * Un fallo avisa (WARN) solo al pasar de bien a mal; los seguidos van a DEBUG con la misma descripción, y al
	 * recuperarse se registra un INFO. Así una caída larga de Telegram no llena el log.
	 */
	@Scheduled(fixedDelayString = "PT5S")
	synchronized void poll() {
		List<Update> updates;
		try {
			if (!telegram.hasPendingLinks()) {
				return;
			}
			updates = client.getUpdates(offset);
		}
		catch (RuntimeException failure) {
			fail("Telegram polling failed", failure);
			return;
		}
		for (Update update : updates) {
			try {
				process(update);
			}
			catch (RuntimeException failure) {
				// Sin confirmar: esta actualización y las siguientes se reintentan en la próxima ejecución.
				fail("Telegram update failed", failure);
				return;
			}
			offset = update.updateId() + 1;
		}
		if (failing) {
			log.info("Telegram polling recovered");
			failing = false;
		}
	}

	private void fail(String what, RuntimeException failure) {
		if (failing) {
			log.debug("{}: {}", what, describe(failure));
		}
		else {
			log.warn("{}: {}", what, describe(failure));
			failing = true;
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
		// Un formato que este sistema nunca genera no se consulta: se contesta el error genérico y la actualización se
		// confirma. Si no, una que la base de datos rechazara siempre (un 0x00) bloquearía para siempre las de detrás.
		boolean linked = TelegramLinkUseCase.isWellFormedLinkToken(token) && telegram.handleStart(chatId, token);
		reply(chatId, linked ? LINKED_REPLY : INVALID_LINK_REPLY);
	}

	/** El aviso es un extra: si falla, la vinculación ya está hecha y la actualización no se reintenta. */
	private void reply(long chatId, String text) {
		try {
			client.sendMessage(chatId, text);
		}
		catch (RuntimeException failure) {
			log.warn("Telegram reply failed: {}", describe(failure));
		}
	}

	/**
	 * La segunda palabra de {@code /start <token>} o {@code /start@bot <token>}, sin validar. Nulo si el texto no es un
	 * /start con exactamente una palabra detrás (un /start a secas, otro comando o cualquier texto): se ignora sin
	 * responder, no hay nada que vincular.
	 */
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
