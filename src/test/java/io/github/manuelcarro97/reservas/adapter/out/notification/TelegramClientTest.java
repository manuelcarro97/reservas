package io.github.manuelcarro97.reservas.adapter.out.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** Cliente de la API de bots de Telegram contra un servidor simulado: nunca se llama a api.telegram.org. */
class TelegramClientTest {

	private static final String TOKEN = "123456:TEST-FAKE-TOKEN";
	private static final String BASE = "https://api.telegram.org/bot" + TOKEN;

	private MockRestServiceServer server;
	private TelegramClient client;

	@BeforeEach
	void setUp() {
		RestClient.Builder builder = RestClient.builder();
		server = MockRestServiceServer.bindTo(builder).build();
		client = new TelegramClient(builder, TOKEN);
	}

	@Test
	void sendMessagePostsJson() {
		server.expect(requestTo(BASE + "/sendMessage"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
			.andExpect(jsonPath("$.chat_id").value(4242))
			.andExpect(jsonPath("$.text").value("Nueva reserva: Ana"))
			.andRespond(withSuccess("{\"ok\":true,\"result\":{\"message_id\":1}}", MediaType.APPLICATION_JSON));

		client.sendMessage(4242, "Nueva reserva: Ana");

		server.verify();
	}

	/** Un salto de línea pegado al token en el hosting no cambia la URL ni rompe el cliente. */
	@Test
	void tokenWithSurroundingWhitespaceIsTrimmed() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer padded = MockRestServiceServer.bindTo(builder).build();
		TelegramClient paddedClient = new TelegramClient(builder, "  " + TOKEN + "\r\n");
		padded.expect(requestTo(BASE + "/sendMessage"))
			.andRespond(withSuccess("{\"ok\":true}", MediaType.APPLICATION_JSON));

		paddedClient.sendMessage(1, "hola");

		padded.verify();
	}

	@Test
	void tokenWithUnexpectedFormatIsRejectedWithoutPrintingIt() {
		assertThatThrownBy(() -> new TelegramClient(RestClient.builder(), "no es/un token SECRETO"))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageNotContaining("SECRETO");
	}

	@Test
	void getUpdatesParsesStartCommand() {
		server.expect(requestTo(BASE + "/getUpdates?offset=7&timeout=30"))
			.andExpect(method(HttpMethod.GET))
			.andRespond(withSuccess("""
					{"ok":true,"result":[
					  {"update_id":7,"message":{"message_id":1,"date":1,"from":{"id":42,"is_bot":false},
					   "chat":{"id":42,"type":"private"},"text":"/start abc-DEF_123"}},
					  {"update_id":8,"edited_message":{"message_id":2,"chat":{"id":42,"type":"private"}}}
					]}
					""", MediaType.APPLICATION_JSON));

		List<Update> updates = client.getUpdates(7);

		assertThat(updates).hasSize(2);
		assertThat(updates.get(0).updateId()).isEqualTo(7);
		assertThat(updates.get(0).message().chat().id()).isEqualTo(42);
		assertThat(updates.get(0).message().text()).isEqualTo("/start abc-DEF_123");
		// Un tipo de actualización que no es un mensaje llega sin message, no como error.
		assertThat(updates.get(1).updateId()).isEqualTo(8);
		assertThat(updates.get(1).message()).isNull();
		server.verify();
	}

	@Test
	void getUpdatesWithNoNewMessagesIsEmpty() {
		server.expect(requestTo(BASE + "/getUpdates?offset=0&timeout=30"))
			.andRespond(withSuccess("{\"ok\":true,\"result\":[]}", MediaType.APPLICATION_JSON));

		assertThat(client.getUpdates(0)).isEmpty();
	}

	@Test
	void httpErrorThrows() {
		server.expect(requestTo(BASE + "/sendMessage")).andRespond(withServerError());

		assertThatThrownBy(() -> client.sendMessage(1, "hola")).isInstanceOf(TelegramException.class)
			.hasMessageContaining("sendMessage")
			.hasMessageContaining("500");
	}

	@Test
	void notOkResponseThrows() {
		server.expect(requestTo(BASE + "/getUpdates?offset=0&timeout=30"))
			.andRespond(withSuccess("{\"ok\":false,\"description\":\"Unauthorized\"}", MediaType.APPLICATION_JSON));

		assertThatThrownBy(() -> client.getUpdates(0)).isInstanceOf(TelegramException.class)
			.hasMessageContaining("getUpdates");
	}

	@Test
	void httpErrorNeverCarriesTheTokenOrTheUrl() {
		server.expect(requestTo(BASE + "/sendMessage")).andRespond(withStatus(HttpStatus.FORBIDDEN)
			.contentType(MediaType.APPLICATION_JSON)
			.body("{\"ok\":false,\"error_code\":403,\"description\":\"Forbidden: bot was blocked by the user\"}"));

		assertThatThrownBy(() -> client.sendMessage(1, "hola")).isInstanceOf(TelegramException.class)
			.satisfies(failure -> assertCarriesNoSecret(failure));
	}

	@Test
	void connectionErrorNeverCarriesTheTokenOrTheUrl() {
		// El error de E/S de RestClient trae la URL completa (con el token) en su mensaje y en su causa.
		server.expect(requestTo(BASE + "/sendMessage"))
			.andRespond(request -> {
				throw new IOException("Connection reset by peer: " + request.getURI());
			});
		server.expect(requestTo(BASE + "/getUpdates?offset=3&timeout=30"))
			.andRespond(request -> {
				throw new IOException("Read timed out: " + request.getURI());
			});

		assertThatThrownBy(() -> client.sendMessage(1, "hola")).isInstanceOf(TelegramException.class)
			.satisfies(failure -> assertCarriesNoSecret(failure));
		assertThatThrownBy(() -> client.getUpdates(3)).isInstanceOf(TelegramException.class)
			.satisfies(failure -> assertCarriesNoSecret(failure));
	}

	/** Ni el mensaje, ni la traza completa con sus causas, ni el texto de la excepción llevan el token ni la URL. */
	private static void assertCarriesNoSecret(Throwable failure) {
		StringWriter trace = new StringWriter();
		failure.printStackTrace(new PrintWriter(trace));
		assertThat(failure.getCause()).isNull();
		assertThat(failure.getMessage() + failure + trace).doesNotContain(TOKEN)
			.doesNotContain("TEST-FAKE")
			.doesNotContain("api.telegram.org")
			.doesNotContain("/bot");
	}

}
