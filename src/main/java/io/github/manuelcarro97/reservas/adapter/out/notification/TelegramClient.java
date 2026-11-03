package io.github.manuelcarro97.reservas.adapter.out.notification;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Conditional;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import io.github.manuelcarro97.reservas.config.TelegramEnabled;

/**
 * Cliente mínimo de la API de bots de Telegram. La URL lleva el token ({@code /bot<token>/…}), así que toda excepción
 * de {@code RestClient} (su mensaje y su causa traen la URL) se convierte aquí en una {@link TelegramException} sin
 * URL, sin token y sin causa. Nada de esta clase escribe el token en un log.
 */
@Component
@Conditional(TelegramEnabled.class)
public class TelegramClient {

	private static final String API = "https://api.telegram.org";
	private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
	/** Más que la espera larga de {@code getUpdates}, para que Telegram conteste antes de que venza. */
	private static final Duration READ_TIMEOUT = Duration.ofSeconds(35);
	private static final int LONG_POLL_SECONDS = 30;
	/** Lo que usa un token de BotFather; se exige porque el token va dentro de la ruta de la URL. */
	private static final Pattern TOKEN_FORMAT = Pattern.compile("[A-Za-z0-9:_-]+");

	@JsonIgnoreProperties(ignoreUnknown = true)
	private record UpdatesResponse(boolean ok, List<Update> result) {
	}

	private final RestClient http;
	private final String botPath;

	@Autowired
	public TelegramClient(@Value("${app.telegram.bot-token}") String token) {
		this(RestClient.builder().requestFactory(requestFactory()), token);
	}

	/** El constructor de los tests: reciben el {@code Builder} para enlazarlo a un servidor simulado. */
	public TelegramClient(RestClient.Builder builder, String token) {
		if (token == null || !TOKEN_FORMAT.matcher(token).matches()) {
			// Sin el valor: es un secreto.
			throw new IllegalArgumentException("Telegram bot token is missing or has unexpected characters");
		}
		this.http = builder.baseUrl(API).build();
		this.botPath = "/bot" + token;
	}

	private static JdkClientHttpRequestFactory requestFactory() {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build());
		factory.setReadTimeout(READ_TIMEOUT);
		return factory;
	}

	/**
	 * Actualizaciones con {@code update_id >= offset}, esperando hasta 30 s a que haya alguna (espera larga). Telegram
	 * deja de entregar las anteriores a {@code offset}.
	 */
	public List<Update> getUpdates(long offset) {
		try {
			UpdatesResponse response = http.get()
				.uri(botPath + "/getUpdates?offset={offset}&timeout={timeout}", offset, LONG_POLL_SECONDS)
				.retrieve()
				.body(UpdatesResponse.class);
			if (response == null || !response.ok()) {
				throw new TelegramException("Telegram getUpdates failed (response is not ok)");
			}
			return response.result() == null ? List.of() : response.result();
		}
		catch (RestClientException failure) {
			throw failed("getUpdates", failure);
		}
	}

	public void sendMessage(long chatId, String text) {
		try {
			http.post()
				.uri(botPath + "/sendMessage")
				.contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("chat_id", chatId, "text", text))
				.retrieve()
				.toBodilessEntity();
		}
		catch (RestClientException failure) {
			throw failed("sendMessage", failure);
		}
	}

	/** Solo el método, el código HTTP o la clase de la causa: nunca el mensaje ni la causa del original. */
	private static TelegramException failed(String method, RestClientException failure) {
		String reason = failure instanceof RestClientResponseException response
				? "HTTP " + response.getStatusCode().value()
				: failure.getCause() != null ? failure.getCause().getClass().getSimpleName()
						: failure.getClass().getSimpleName();
		return new TelegramException("Telegram " + method + " failed (" + reason + ")");
	}

}
