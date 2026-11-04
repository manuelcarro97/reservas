package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * El caso sin {@code Content-Length}: MockMvc siempre conoce el tamaño del cuerpo, así que esta prueba usa un servidor
 * de verdad y un cliente que envía por trozos ({@code Transfer-Encoding: chunked}). El filtro solo puede cortar la
 * lectura al pasar el tope.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RequestSizeLimitStreamIT extends PostgresIT {

	private static final int LIMIT = 64 * 1024;

	@LocalServerPort
	private int port;

	private HttpResponse<String> postChunked(int bytes) throws Exception {
		String prefix = "{\"customerName\":\"";
		String suffix = "\"}";
		byte[] body = (prefix + "A".repeat(bytes - prefix.length() - suffix.length()) + suffix)
			.getBytes(StandardCharsets.UTF_8);
		HttpRequest request = HttpRequest
			.newBuilder(URI.create("http://localhost:" + port + "/api/v1/restaurants/demo/reservations"))
			.header("Content-Type", "application/json")
			// ofInputStream no conoce la longitud: el cliente envía por trozos.
			.POST(BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(body)))
			.build();
		return HttpClient.newHttpClient().send(request, BodyHandlers.ofString());
	}

	@Test
	void chunkedBodyLargerThanTheLimitReturns413() throws Exception {
		HttpResponse<String> response = postChunked(LIMIT * 4);

		assertThat(response.statusCode()).isEqualTo(413);
		assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(
				type -> assertThat(type).startsWith("application/problem+json"));
		assertThat(response.body()).contains("\"code\":\"PAYLOAD_TOO_LARGE\"");
	}

	@Test
	void chunkedBodyOfExactlyTheLimitIsNotRejectedForItsSize() throws Exception {
		HttpResponse<String> response = postChunked(LIMIT);

		assertThat(response.statusCode()).isEqualTo(400);
		assertThat(response.body()).contains("\"code\":\"INVALID_REQUEST\"");
	}

}
