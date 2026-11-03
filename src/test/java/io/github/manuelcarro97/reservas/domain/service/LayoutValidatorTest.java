package io.github.manuelcarro97.reservas.domain.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import io.github.manuelcarro97.reservas.domain.model.LayoutProblem;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.RoomShape;
import io.github.manuelcarro97.reservas.domain.model.TableDraft;
import io.github.manuelcarro97.reservas.domain.model.TableShape;

class LayoutValidatorTest {

	private static final RoomLayout ROOM = new RoomLayout(RoomShape.RECTANGLE, 1200, 800, 0, 0, 0);

	private final LayoutValidator validator = new LayoutValidator();

	private static TableDraft square(String label, int seats, int rotation, int x, int y) {
		return new TableDraft(label, TableShape.SQUARE, seats, rotation, x, y);
	}

	private static TableDraft round(String label, int seats, int x, int y) {
		return new TableDraft(label, TableShape.ROUND, seats, 0, x, y);
	}

	/** Pares "indice:codigo"; el indice es "-" para los problemas del local. */
	private static Set<String> codes(List<LayoutProblem> problems) {
		return problems.stream()
			.map(problem -> (problem.tableIndex() == null ? "-" : problem.tableIndex().toString()) + ":" + problem.code())
			.collect(Collectors.toSet());
	}

	@Test
	void validLayoutHasNoProblems() {
		List<TableDraft> tables = List.of(square("Mesa 1", 4, 0, 200, 200), round("Mesa 2", 6, 600, 400));

		assertThat(validator.validate(ROOM, tables)).isEmpty();
	}

	@Test
	void emptyLayoutHasNoProblems() {
		assertThat(validator.validate(ROOM, List.of())).isEmpty();
	}

	@Test
	void overlapMarksBothTables() {
		List<TableDraft> tables = List.of(square("Mesa 1", 4, 0, 200, 200), square("Mesa 2", 4, 0, 300, 200));

		assertThat(codes(validator.validate(ROOM, tables))).containsExactlyInAnyOrder("0:OVERLAP", "1:OVERLAP");
	}

	@Test
	void problemCarriesTheTableLabel() {
		List<TableDraft> tables = List.of(square("Mesa 1", 4, 0, 200, 200), square("Mesa 2", 4, 0, 300, 200));

		assertThat(validator.validate(ROOM, tables)).extracting(LayoutProblem::label)
			.containsExactlyInAnyOrder("Mesa 1", "Mesa 2");
	}

	@Test
	void touchingTablesAreAllowed() {
		List<TableDraft> tables = List.of(square("Mesa 1", 4, 0, 200, 200), square("Mesa 2", 4, 0, 200, 320));

		assertThat(validator.validate(ROOM, tables)).isEmpty();
	}

	@Test
	void tableInsideLNotchIsOutOfRoom() {
		RoomLayout lShape = new RoomLayout(RoomShape.L, 1000, 900, 480, 480, 0);
		List<TableDraft> tables = List.of(round("Mesa 1", 4, 800, 700));

		assertThat(codes(validator.validate(lShape, tables))).containsExactly("0:OUT_OF_ROOM");
	}

	@Test
	void tableStraddlingTheNotchCornerIsOutOfRoom() {
		RoomLayout lShape = new RoomLayout(RoomShape.L, 1000, 900, 480, 480, 0);
		List<TableDraft> tables = List.of(round("Mesa 1", 4, 600, 420));

		assertThat(codes(validator.validate(lShape, tables))).containsExactly("0:OUT_OF_ROOM");
	}

	@Test
	void tableTooCloseToWallIsOutOfRoom() {
		// Girada 90 mide 120 de ancho: en x=70 su huella queda a 10 de la pared izquierda.
		List<TableDraft> tables = List.of(square("Mesa 1", 4, 90, 70, 200));

		assertThat(codes(validator.validate(ROOM, tables))).containsExactly("0:OUT_OF_ROOM");
	}

	@Test
	void tableAtWallInsetIsInsideTheRoom() {
		// Sin girar mide 148 de ancho: en x=90 su huella queda justo a WALL_INSET (16) de la pared.
		List<TableDraft> tables = List.of(square("Mesa 1", 4, 0, 90, 200));

		assertThat(validator.validate(ROOM, tables)).isEmpty();
	}

	@Test
	void tableStickingOutOfTheRoomIsOutOfRoom() {
		List<TableDraft> tables = List.of(square("Mesa 1", 4, 0, 1190, 200));

		assertThat(codes(validator.validate(ROOM, tables))).containsExactly("0:OUT_OF_ROOM");
	}

	@Test
	void referenceTablesFit() {
		assertThat(validator.validate(new RoomLayout(RoomShape.SQUARE, 800, 800, 0, 0, 0), List.of(
				square("1", 4, 0, 170, 200), square("2", 4, 0, 400, 200), square("3", 4, 0, 630, 200),
				round("4", 6, 250, 560), round("5", 4, 560, 560)))).isEmpty();

		assertThat(validator.validate(new RoomLayout(RoomShape.RECTANGLE, 1200, 560, 0, 0, 0), List.of(
				square("1", 2, 0, 130, 150), square("2", 2, 0, 300, 150), square("3", 4, 90, 500, 150),
				square("4", 4, 90, 720, 150), square("5", 4, 90, 940, 150), round("6", 8, 250, 390),
				square("7", 6, 90, 600, 410), square("8", 8, 90, 940, 410)))).isEmpty();

		assertThat(validator.validate(new RoomLayout(RoomShape.L, 1000, 900, 480, 480, 0), List.of(
				square("1", 4, 0, 130, 200), square("2", 4, 0, 130, 420), square("3", 4, 0, 130, 640),
				square("4", 2, 0, 380, 180), square("5", 4, 90, 620, 130), square("6", 4, 90, 830, 130),
				round("7", 4, 730, 300), round("8", 6, 360, 560), round("9", 2, 360, 810)))).isEmpty();

		assertThat(validator.validate(new RoomLayout(RoomShape.U, 1100, 820, 420, 440, 0), List.of(
				square("1", 4, 90, 300, 130), square("2", 4, 90, 550, 130), square("3", 4, 90, 800, 130),
				square("4", 4, 0, 170, 500), square("5", 4, 0, 170, 700), round("6", 6, 930, 520),
				square("7", 2, 0, 930, 740)))).isEmpty();

		assertThat(validator.validate(new RoomLayout(RoomShape.T, 1100, 900, 340, 520, 0), List.of(
				square("1", 6, 90, 200, 130), round("2", 8, 550, 190), square("3", 6, 90, 900, 130),
				square("4", 4, 90, 200, 290), square("5", 4, 90, 900, 290), round("6", 4, 550, 520),
				square("7", 4, 90, 550, 700), square("8", 2, 0, 550, 840)))).isEmpty();
	}

	@Test
	void duplicateLabels() {
		List<TableDraft> tables = List.of(square("Mesa 1", 4, 0, 200, 200), square(" Mesa 1 ", 4, 0, 600, 400),
				square("mesa 1", 4, 0, 900, 200));

		assertThat(codes(validator.validate(ROOM, tables))).containsExactlyInAnyOrder("0:DUPLICATE_LABEL",
				"1:DUPLICATE_LABEL");
	}

	@Test
	void blankAndReservedLabels() {
		List<TableDraft> tables = List.of(square("  ", 4, 0, 200, 200), square("~tmp", 4, 0, 600, 400),
				square(null, 4, 0, 900, 200));

		assertThat(codes(validator.validate(ROOM, tables))).containsExactlyInAnyOrder("0:BLANK_LABEL",
				"1:BLANK_LABEL", "2:BLANK_LABEL");
	}

	@Test
	void invalidSeats() {
		List<TableDraft> tables = List.of(square("Mesa 1", 3, 0, 200, 200));

		assertThat(codes(validator.validate(ROOM, tables))).containsExactly("0:INVALID_SEATS");
	}

	@Test
	void invalidRotation() {
		List<TableDraft> tables = List.of(square("Mesa 1", 4, 180, 200, 200));

		assertThat(codes(validator.validate(ROOM, tables))).containsExactly("0:INVALID_ROTATION");
	}

	@Test
	void offGrid() {
		List<TableDraft> tables = List.of(square("Mesa 1", 4, 0, 105, 200), square("Mesa 2", 4, 0, 600, 405));

		assertThat(codes(validator.validate(ROOM, tables))).containsExactlyInAnyOrder("0:OFF_GRID", "1:OFF_GRID");
	}

	@Test
	void invalidRoomIsReportedWithoutTableIndex() {
		RoomLayout broken = new RoomLayout(RoomShape.L, 1000, 900, 100, 480, 0);

		assertThat(codes(validator.validate(broken, List.of(square("Mesa 1", 4, 0, 200, 200)))))
			.containsExactly("-:INVALID_ROOM");
	}

	@Test
	void moreThan60Tables() {
		List<TableDraft> tables = new ArrayList<>();
		for (int i = 0; i < 61; i++) {
			tables.add(square("Mesa " + i, 2, 0, 100 + 10 * i, 100));
		}

		assertThat(codes(validator.validate(ROOM, tables))).contains("-:TOO_MANY_TABLES");
	}

	@Test
	void sixtyTablesAreAllowed() {
		List<TableDraft> tables = new ArrayList<>();
		for (int i = 0; i < 60; i++) {
			// 6 columnas de 10 filas, separadas lo justo para no solaparse ni tocar las paredes.
			tables.add(round("Mesa " + i, 2, 120 + 180 * (i % 6), 100 + 160 * (i / 6)));
		}

		assertThat(validator.validate(new RoomLayout(RoomShape.RECTANGLE, 1200, 1800, 0, 0, 0), tables)).isEmpty();
	}

}
