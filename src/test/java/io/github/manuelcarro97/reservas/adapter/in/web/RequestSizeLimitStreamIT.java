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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;
import org.springframework.web.filter.FormContentFilter;

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

	@Autowired
	private ApplicationContext context;

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

	private HttpResponse<String> sendForm(String method, String path, int bytes, boolean chunked) throws Exception {
		byte[] body = ("a=" + "A".repeat(bytes - 2)).getBytes(StandardCharsets.UTF_8);
		HttpRequest.BodyPublisher publisher = chunked ? BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(body))
				: BodyPublishers.ofByteArray(body);
		HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
			.header("Content-Type", "application/x-www-form-urlencoded")
			.method(method, publisher)
			.build();
		return HttpClient.newHttpClient().send(request, BodyHandlers.ofString());
	}

	/**
	 * Spring Boot registra un filtro que lee entero el cuerpo de un PUT, PATCH o DELETE con formulario antes de la
	 * cadena de seguridad, y se saltaría el tope. La API es solo JSON: ese filtro no debe existir.
	 */
	@Test
	void formContentFilterIsNotRegistered() {
		assertThat(context.getBeanNamesForType(FormContentFilter.class)).isEmpty();
	}

	@Test
	void formBodyLargerThanTheLimitOnDeleteReturns413() throws Exception {
		HttpResponse<String> response = sendForm("DELETE", "/api/v1/reservations/XXXX", LIMIT * 4, false);

		assertThat(response.statusCode()).isEqualTo(413);
		assertThat(response.body()).contains("\"code\":\"PAYLOAD_TOO_LARGE\"");
	}

	@Test
	void formBodyLargerThanTheLimitOnAdminPutReturns413() throws Exception {
		HttpResponse<String> response = sendForm("PUT", "/api/v1/admin/restaurants/x/layout", LIMIT * 4, false);

		assertThat(response.statusCode()).isEqualTo(413);
		assertThat(response.body()).contains("\"code\":\"PAYLOAD_TOO_LARGE\"");
	}

	/** Por trozos y sin nadie que lo lea (la API no usa formularios): la petición llega al enrutado (405: ese DELETE no existe) sin tocar el cuerpo. */
	@Test
	void chunkedFormBodyOnDeleteIsNeverReadIntoMemory() throws Exception {
		HttpResponse<String> response = sendForm("DELETE", "/api/v1/reservations/XXXX", LIMIT * 4, true);

		assertThat(response.statusCode()).isEqualTo(405);
	}

	@Test
	void smallFormBodyDoesNotBreakTheEndpoint() throws Exception {
		HttpResponse<String> response = sendForm("DELETE", "/api/v1/reservations/XXXX", 10, false);

		assertThat(response.statusCode()).isEqualTo(405);
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
