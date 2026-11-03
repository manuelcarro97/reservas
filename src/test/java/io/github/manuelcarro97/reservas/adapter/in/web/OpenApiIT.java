package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import io.github.manuelcarro97.reservas.support.PostgresIT;

@AutoConfigureMockMvc
class OpenApiIT extends PostgresIT {

	@Autowired
	private MockMvc mvc;

	@Test
	void apiDocsListPublicAndAdminPaths() throws Exception {
		mvc.perform(get("/v3/api-docs"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.paths['/api/v1/restaurants/{slug}/reservations']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/admin/reservations/{id}/confirm']").exists())
			.andExpect(jsonPath("$.components.securitySchemes.firebase.scheme").value("bearer"));
	}

}
