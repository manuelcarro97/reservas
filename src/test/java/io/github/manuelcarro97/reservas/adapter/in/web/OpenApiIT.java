package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeMap;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import io.github.manuelcarro97.reservas.support.PostgresIT;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

@AutoConfigureMockMvc
class OpenApiIT extends PostgresIT {

	private static final Path SNAPSHOT = Path.of("contracts/openapi.json");

	private static final Path ACTUAL = Path.of("target/openapi.json");

	private static final String ADMIN_PREFIX = "/api/v1/admin/";

	private static final String SCHEMA_REF_PREFIX = "#/components/schemas/";

	/** Nunca en una respuesta, ni pública ni de administración: dueño, chat de Telegram, enlace de vinculación, token. */
	private static final Set<String> NEVER_IN_RESPONSES = Set.of("ownerUid", "owner_uid", "chatId", "chat_id",
			"linkToken", "link_token", "botToken", "bot_token", "token");

	/** Datos personales del cliente: solo en respuestas de administración, nunca en las públicas. */
	private static final Set<String> NEVER_IN_PUBLIC_RESPONSES = Set.of("customerPhone", "customer_phone",
			"customerEmail", "customer_email", "customerName", "customer_name");

	private static final JsonMapper JSON = JsonMapper.builder().build();

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

	/**
	 * El contrato congelado en {@code contracts/openapi.json} es el que consume el frontend para generar su cliente.
	 * Si la API cambia, hay que regenerarlo a propósito: el test deja el nuevo en {@code target/openapi.json}.
	 */
	@Test
	void snapshotIsUpToDate() throws Exception {
		String actual = normalizedApiDocs();
		String expected = Files.exists(SNAPSHOT) ? Files.readString(SNAPSHOT, StandardCharsets.UTF_8).replace("\r\n", "\n")
				: null;
		if (!actual.equals(expected)) {
			Files.writeString(ACTUAL, actual, StandardCharsets.UTF_8);
			throw new AssertionError("contracts/openapi.json no coincide con /v3/api-docs. "
					+ "Copia target/openapi.json a contracts/openapi.json");
		}
	}

	@Test
	void responseSchemasLeakNoPrivateFields() throws Exception {
		JsonNode docs = JSON.readTree(apiDocs());
		List<String> leaks = new ArrayList<>();
		docs.path("paths").properties().forEach(path -> {
			boolean admin = path.getKey().startsWith(ADMIN_PREFIX);
			path.getValue().properties().forEach(operation -> {
				operation.getValue().path("responses").properties().forEach(response -> {
					Set<String> schemas = new LinkedHashSet<>();
					collectSchemas(docs, response.getValue().path("content"), schemas);
					for (String schema : schemas) {
						for (String property : propertyNames(docs.path("components").path("schemas").path(schema))) {
							if (NEVER_IN_RESPONSES.contains(property)
									|| (!admin && NEVER_IN_PUBLIC_RESPONSES.contains(property))) {
								leaks.add(operation.getKey() + " " + path.getKey() + " -> " + schema + "." + property);
							}
						}
					}
				});
			});
		});
		assertThat(leaks).as("campos privados en esquemas de respuesta").isEmpty();
	}

	@Test
	void requestSchemasStillCarryCustomerContact() throws Exception {
		// Guarda del test anterior: si dejara de mirar bien los esquemas, este campo (que sí va en la petición) no se vería.
		JsonNode docs = JSON.readTree(apiDocs());
		assertThat(propertyNames(docs.path("components").path("schemas").path("CreateReservationRequest")))
			.contains("customerPhone", "customerEmail");
	}

	private String apiDocs() throws Exception {
		return mvc.perform(get("/v3/api-docs"))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString(StandardCharsets.UTF_8);
	}

	private String normalizedApiDocs() throws Exception {
		// Sin "servers": springdoc lo rellena con la URL de la petición (aquí un http://localhost de MockMvc, en otro
		// entorno el host y puerto reales). No pertenece al contrato y, en un cliente generado, sería una URL base falsa.
		ObjectNode docs = (ObjectNode) JSON.readTree(apiDocs());
		docs.remove("servers");
		StringBuilder out = new StringBuilder();
		write(docs, 0, out);
		return out.append('\n').toString();
	}

	/**
	 * JSON con claves ordenadas, sangría de 2 espacios y {@code \n} como único salto de línea: igual en cualquier
	 * sistema y entre ejecuciones, para que el diff del snapshot sea legible.
	 */
	private static void write(JsonNode node, int level, StringBuilder out) {
		if (node.isObject()) {
			TreeMap<String, JsonNode> sorted = new TreeMap<>();
			node.properties().forEach(entry -> sorted.put(entry.getKey(), entry.getValue()));
			if (sorted.isEmpty()) {
				out.append("{}");
				return;
			}
			out.append("{\n");
			int index = 0;
			for (var entry : sorted.entrySet()) {
				indent(level + 1, out);
				out.append(JSON.writeValueAsString(entry.getKey())).append(": ");
				write(entry.getValue(), level + 1, out);
				out.append(++index < sorted.size() ? ",\n" : "\n");
			}
			indent(level, out);
			out.append('}');
		}
		else if (node.isArray()) {
			if (node.isEmpty()) {
				out.append("[]");
				return;
			}
			out.append("[\n");
			for (int i = 0; i < node.size(); i++) {
				indent(level + 1, out);
				write(node.get(i), level + 1, out);
				out.append(i < node.size() - 1 ? ",\n" : "\n");
			}
			indent(level, out);
			out.append(']');
		}
		else {
			out.append(JSON.writeValueAsString(node));
		}
	}

	private static void indent(int level, StringBuilder out) {
		out.append("  ".repeat(level));
	}

	/** Nombres de los esquemas de {@code components.schemas} que cuelgan de este nodo, siguiendo cada {@code $ref}. */
	private static void collectSchemas(JsonNode root, JsonNode node, Set<String> found) {
		if (node.isObject()) {
			JsonNode ref = node.get("$ref");
			if (ref != null && ref.asString().startsWith(SCHEMA_REF_PREFIX)) {
				String name = ref.asString().substring(SCHEMA_REF_PREFIX.length());
				if (found.add(name)) {
					collectSchemas(root, root.path("components").path("schemas").path(name), found);
				}
			}
			node.properties().forEach(entry -> collectSchemas(root, entry.getValue(), found));
		}
		else if (node.isArray()) {
			node.forEach(item -> collectSchemas(root, item, found));
		}
	}

	private static Collection<String> propertyNames(JsonNode schema) {
		return schema.path("properties").propertyNames();
	}

}
