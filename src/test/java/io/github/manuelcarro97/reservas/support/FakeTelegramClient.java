package io.github.manuelcarro97.reservas.support;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.http.HttpMethod;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import io.github.manuelcarro97.reservas.adapter.out.notification.TelegramClient;
import io.github.manuelcarro97.reservas.adapter.out.notification.TelegramException;
import io.github.manuelcarro97.reservas.adapter.out.notification.Update;

/**
 * Cliente de Telegram falso: apunta los mensajes enviados y devuelve las actualizaciones que el test le dé; nunca
 * sale a la red. Con {@link #failSending()} el envío pasa por el código real del cliente contra un servidor que
 * responde 500, así el fallo (y lo que acaba en el log) es el de verdad.
 */
public class FakeTelegramClient extends TelegramClient {

	/** Token falso y evidente para los tests. */
	public static final String TOKEN = "123456:TEST-FAKE-TOKEN";

	public record Sent(long chatId, String text) {
	}

	private final MockRestServiceServer server;
	private final List<Sent> sent = new CopyOnWriteArrayList<>();
	private final List<Long> requestedOffsets = new CopyOnWriteArrayList<>();
	private final List<Update> pending = new CopyOnWriteArrayList<>();
	private volatile boolean failSending;
	private volatile RuntimeException getUpdatesFailure;

	public static FakeTelegramClient create() {
		RestClient.Builder builder = RestClient.builder();
		return new FakeTelegramClient(builder, MockRestServiceServer.bindTo(builder).ignoreExpectOrder(true).build());
	}

	private FakeTelegramClient(RestClient.Builder builder, MockRestServiceServer server) {
		super(builder, TOKEN);
		this.server = server;
	}

	/** Vuelve al estado inicial: sin mensajes, sin actualizaciones pendientes, sin fallos. */
	public void reset() {
		sent.clear();
		requestedOffsets.clear();
		pending.clear();
		failSending = false;
		getUpdatesFailure = null;
	}

	public List<Sent> sent() {
		return new ArrayList<>(sent);
	}

	public List<Long> requestedOffsets() {
		return new ArrayList<>(requestedOffsets);
	}

	/** Actualizaciones que Telegram entregará hasta que se pida un offset mayor que su id. */
	public void queue(Update... updates) {
		pending.addAll(List.of(updates));
	}

	public void failSending() {
		failSending = true;
	}

	public void failGetUpdates(RuntimeException failure) {
		getUpdatesFailure = failure;
	}

	public void stopFailingGetUpdates() {
		getUpdatesFailure = null;
	}

	@Override
	public List<Update> getUpdates(long offset) {
		requestedOffsets.add(offset);
		RuntimeException failure = getUpdatesFailure;
		if (failure != null) {
			throw failure;
		}
		// Como Telegram: entrega lo que no se ha confirmado todavía con un offset mayor.
		return pending.stream().filter(update -> update.updateId() >= offset).toList();
	}

	@Override
	public synchronized void sendMessage(long chatId, String text) {
		if (failSending) {
			server.reset();
			server.expect(method(HttpMethod.POST)).andRespond(withServerError());
			try {
				super.sendMessage(chatId, text);
			}
			catch (TelegramException failure) {
				sent.add(new Sent(chatId, text));
				throw failure;
			}
			throw new IllegalStateException("El servidor simulado debía responder 500");
		}
		sent.add(new Sent(chatId, text));
	}

}
