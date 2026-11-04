package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.MutableClock;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * Límite de escrituras del panel: 60 por minuto y por usuario (el {@code sub} del token). Las rutas no existen: da
 * igual, lo que cuenta es que el filtro ya contó la petición (404 si cabe, 429 si no).
 */
@AutoConfigureMockMvc
class AdminWriteRateLimitIT extends PostgresIT {

	private static final String WRITE = "/api/v1/admin/restaurants/no-existe/closures/2026-12-25";

	@Autowired
	private MockMvc mvc;

	private ResultActions deleteAs(String uid) throws Exception {
		return mvc.perform(delete(WRITE).with(AuthRequests.owner(uid)));
	}

	private void writeSixtyTimes(String uid) throws Exception {
		for (int i = 0; i < 60; i++) {
			deleteAs(uid).andExpect(status().isNotFound());
		}
	}

	@Test
	void sixtyFirstWriteInAMinuteReturns429() throws Exception {
		writeSixtyTimes("owner-a");

		deleteAs("owner-a").andExpect(status().isTooManyRequests())
			.andExpect(header().string("Retry-After", "60"))
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.status").value(429))
			.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	@Test
	void everyWriteMethodCountsAgainstTheSameCounter() throws Exception {
		MockHttpServletRequestBuilder[] writes = { post(WRITE), put(WRITE), patch(WRITE), delete(WRITE) };
		for (int i = 0; i < 60; i++) {
			mvc.perform(writes[i % writes.length].with(AuthRequests.owner("owner-a")))
				.andExpect(status().is(not(429)));
		}

		deleteAs("owner-a").andExpect(status().isTooManyRequests());
	}

	@Test
	void anotherUserHasHisOwnCounter() throws Exception {
		writeSixtyTimes("owner-a");
		deleteAs("owner-a").andExpect(status().isTooManyRequests());

		deleteAs("owner-b").andExpect(status().isNotFound());
	}

	@Test
	void readsAreNeverLimited() throws Exception {
		writeSixtyTimes("owner-a");

		for (int i = 0; i < 100; i++) {
			mvc.perform(get("/api/v1/admin/restaurants").with(AuthRequests.owner("owner-a")))
				.andExpect(status().isOk());
		}
	}

	@Test
	void windowRotatesAfterAMinute() throws Exception {
		writeSixtyTimes("owner-a");
		deleteAs("owner-a").andExpect(status().isTooManyRequests());

		clock.set(MutableClock.START.plus(Duration.ofMinutes(1)));

		deleteAs("owner-a").andExpect(status().isNotFound());
	}

	@Test
	void requestsWithoutAValidTokenDoNotUseAnyonesQuota() throws Exception {
		for (int i = 0; i < 100; i++) {
			mvc.perform(delete(WRITE)).andExpect(status().isUnauthorized());
		}

		deleteAs("owner-a").andExpect(status().isNotFound());
	}

	@Test
	void publicWritesAreNotAffected() throws Exception {
		writeSixtyTimes("owner-a");

		mvc.perform(post("/api/v1/reservations/NOEXISTE/cancel")).andExpect(status().isNotFound());
	}

	@Test
	void limitedResponseCarriesCorsHeadersAndExposesRetryAfter() throws Exception {
		writeSixtyTimes("owner-a");

		mvc.perform(delete(WRITE).with(AuthRequests.owner("owner-a")).header("Origin", "http://localhost:4200"))
			.andExpect(status().isTooManyRequests())
			.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:4200"))
			.andExpect(header().string("Access-Control-Expose-Headers", containsString("Retry-After")));
	}

}
