package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * Cuerpos de más de 64 KB se rechazan con 413 antes de deserializarse. Aquí, con el tamaño declarado; sin declararlo
 * (por trozos), {@link RequestSizeLimitStreamIT}.
 */
@AutoConfigureMockMvc
class RequestSizeLimitIT extends PostgresIT {

	private static final int LIMIT = 64 * 1024;
	private static final String BOOKINGS = "/api/v1/restaurants/demo/reservations";

	@Autowired
	private MockMvc mvc;

	/** JSON con un campo de texto larguísimo, del tamaño pedido en bytes. */
	private static byte[] jsonOfSize(int bytes) {
		String prefix = "{\"customerName\":\"";
		String suffix = "\"}";
		String padding = "A".repeat(bytes - prefix.length() - suffix.length());
		return (prefix + padding + suffix).getBytes(StandardCharsets.UTF_8);
	}

	private ResultActions book(byte[] body) throws Exception {
		return mvc.perform(post(BOOKINGS).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	@Test
	void bodyLargerThanTheLimitWithDeclaredLengthReturns413() throws Exception {
		book(jsonOfSize(LIMIT + 1)).andExpect(status().isContentTooLarge())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.status").value(413))
			.andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));
	}

	@Test
	void bodyOfExactlyTheLimitIsNotRejectedForItsSize() throws Exception {
		// Pasa el filtro y llega a la validación (el nombre es demasiado largo: 400, no 413).
		book(jsonOfSize(LIMIT)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void smallBodyIsUntouched() throws Exception {
		book("{}".getBytes(StandardCharsets.UTF_8)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void adminRoutesAreCoveredAndAnswerBeforeAuthentication() throws Exception {
		mvc.perform(post("/api/v1/admin/restaurants").contentType(MediaType.APPLICATION_JSON)
			.content(jsonOfSize(LIMIT + 1))).andExpect(status().isContentTooLarge());
		mvc.perform(post("/api/v1/admin/restaurants").with(AuthRequests.owner("owner-a"))
			.contentType(MediaType.APPLICATION_JSON)
			.content(jsonOfSize(LIMIT + 1))).andExpect(status().isContentTooLarge());
	}

	@Test
	void tooLargeResponseCarriesCorsHeadersSoTheBrowserCanReadIt() throws Exception {
		mvc.perform(post(BOOKINGS).contentType(MediaType.APPLICATION_JSON)
			.content(jsonOfSize(LIMIT + 1))
			.header("Origin", "http://localhost:4200"))
			.andExpect(status().isContentTooLarge())
			.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:4200"));
	}

	@Test
	void requestsOutsideTheApiAreNotCounted() throws Exception {
		mvc.perform(get("/actuator/health")).andExpect(status().is(not(413)));
	}

	/** El PUT /layout válido más grande: 60 mesas con etiqueta de 40 caracteres y ids de 19 dígitos. */
	@Test
	void largestLayoutFitsComfortablyUnderTheLimit() throws Exception {
		givenRestaurant("grande", "owner-a");
		List<String> tables = new ArrayList<>();
		for (int i = 0; i < 60; i++) {
			tables.add("""
					{"id":%d,"label":"%s","shape":"SQUARE","seats":8,"rotation":359,"x":4000,"y":4000}""".formatted(
					Long.MAX_VALUE - i, "L".repeat(40)));
		}
		String body = "{\"room\":{\"shape\":\"RECTANGLE\",\"width\":4000,\"height\":4000,\"cutWidth\":4000,"
				+ "\"cutDepth\":4000,\"rotation\":0},\"tables\":[" + String.join(",", tables) + "]}";

		assertThat(body.getBytes(StandardCharsets.UTF_8).length).isLessThan(10_000);
		mvc.perform(put("/api/v1/admin/restaurants/grande/layout").with(AuthRequests.owner("owner-a"))
			.contentType(MediaType.APPLICATION_JSON)
			.content(body)).andExpect(status().is(not(413)));
	}

}
