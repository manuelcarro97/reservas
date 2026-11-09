package io.github.manuelcarro97.reservas.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import io.github.manuelcarro97.reservas.domain.model.LayoutProblem;
import io.github.manuelcarro97.reservas.domain.model.Point;
import io.github.manuelcarro97.reservas.domain.model.Rect;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.RoomShape;
import io.github.manuelcarro97.reservas.domain.model.TableDraft;
import io.github.manuelcarro97.reservas.domain.model.TableFootprint;
import io.github.manuelcarro97.reservas.domain.model.TableShape;
import io.github.manuelcarro97.reservas.domain.service.LayoutValidator;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Casos compartidos con el frontend: el mismo fichero lo lee el test TypeScript, así que la geometría del
 * servidor y la del navegador no pueden separarse sin que falle alguno de los dos.
 */
class GeometryContractTest {

	private static final JsonNode CASES = JsonMapper.builder()
		.build()
		.readTree(Path.of("contracts/geometry-cases.json").toFile());

	private static RoomLayout room(JsonNode node) {
		return new RoomLayout(RoomShape.valueOf(node.get("shape").asString()), node.get("width").asInt(),
				node.get("height").asInt(), node.get("cutWidth").asInt(), node.get("cutDepth").asInt(),
				node.get("rotation").asInt());
	}

	private static Rect rect(JsonNode node) {
		return new Rect(node.get(0).asInt(), node.get(1).asInt(), node.get(2).asInt(), node.get(3).asInt());
	}

	private static Point point(JsonNode node) {
		return new Point(node.get(0).asInt(), node.get(1).asInt());
	}

	private static TableDraft table(JsonNode node) {
		return new TableDraft(node.get("label").asString(), TableShape.valueOf(node.get("shape").asString()),
				node.get("seats").asInt(), node.get("rotation").asInt(), node.get("x").asInt(), node.get("y").asInt());
	}

	private static <T> List<T> list(JsonNode array, java.util.function.Function<JsonNode, T> mapper) {
		List<T> out = new ArrayList<>();
		array.forEach(item -> out.add(mapper.apply(item)));
		return out;
	}

	private static String code(Integer tableIndex, String code) {
		return (tableIndex == null ? "-" : tableIndex.toString()) + ":" + code;
	}

	@Test
	void casesFileHasTheExpectedSections() {
		assertThat(CASES.get("rooms").size()).isGreaterThanOrEqualTo(5 + 6);
		assertThat(CASES.get("footprints").size()).isGreaterThanOrEqualTo(8);
		assertThat(CASES.get("layouts").size()).isGreaterThanOrEqualTo(4);
	}

	@Test
	void roomsMatch() {
		for (JsonNode node : CASES.get("rooms")) {
			String name = node.get("name").asString();
			RoomLayout room = room(node.get("room"));

			assertThat(room.problems()).as(name).isEmpty();
			assertThat(room.rects()).as(name + " rects").isEqualTo(list(node.get("rects"), GeometryContractTest::rect));
			assertThat(room.polygon()).as(name + " polygon")
				.isEqualTo(list(node.get("polygon"), GeometryContractTest::point));
		}
	}

	@Test
	void footprintsMatch() {
		for (JsonNode node : CASES.get("footprints")) {
			Rect actual = TableFootprint.of(TableShape.valueOf(node.get("shape").asString()), node.get("seats").asInt(),
					node.get("rotation").asInt(), node.get("x").asInt(), node.get("y").asInt());

			assertThat(actual).as(node.toString()).isEqualTo(rect(node.get("rect")));
		}
	}

	@Test
	void layoutsMatch() {
		LayoutValidator validator = new LayoutValidator();
		for (JsonNode node : CASES.get("layouts")) {
			String name = node.get("name").asString();
			Set<String> expected = list(node.get("problems"), problem -> code(
					problem.get("tableIndex").isNull() ? null : problem.get("tableIndex").asInt(),
					problem.get("code").asString())).stream().collect(Collectors.toSet());

			List<LayoutProblem> actual = validator.validate(room(node.get("room")),
					list(node.get("tables"), GeometryContractTest::table));

			assertThat(actual.stream().map(problem -> code(problem.tableIndex(), problem.code())).collect(Collectors.toSet()))
				.as(name)
				.isEqualTo(expected);
		}
	}

}
