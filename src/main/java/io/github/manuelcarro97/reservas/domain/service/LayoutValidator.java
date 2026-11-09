package io.github.manuelcarro97.reservas.domain.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import io.github.manuelcarro97.reservas.domain.model.LayoutProblem;
import io.github.manuelcarro97.reservas.domain.model.Rect;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.TableDraft;
import io.github.manuelcarro97.reservas.domain.model.TableFootprint;

public class LayoutValidator {

	public static final int MAX_TABLES = 60;

	/** Prefijo reservado para los renombrados temporales al guardar un plano. */
	private static final String RESERVED_LABEL_PREFIX = "~";

	/**
	 * Devuelve los problemas del plano, vacío si es válido. Los del local llevan {@code tableIndex} null; los de
	 * mesa, la posición de la mesa en {@code tables}.
	 */
	public List<LayoutProblem> validate(RoomLayout room, List<TableDraft> tables) {
		List<LayoutProblem> problems = new ArrayList<>();
		List<String> roomProblems = room.problems();
		if (!roomProblems.isEmpty()) {
			problems.add(new LayoutProblem(null, null, "INVALID_ROOM"));
		}
		if (tables.size() > MAX_TABLES) {
			problems.add(new LayoutProblem(null, null, "TOO_MANY_TABLES"));
			return problems;
		}

		List<Rect> footprints = footprints(tables);
		List<Rect> roomRects = roomProblems.isEmpty() ? room.rects() : List.of();
		Map<String, Integer> labelCount = labelCount(tables);

		for (int i = 0; i < tables.size(); i++) {
			TableDraft table = tables.get(i);
			List<String> codes = new ArrayList<>();
			if (!TableFootprint.isSupportedSeats(table.seats())) {
				codes.add("INVALID_SEATS");
			}
			if (table.rotation() != 0 && table.rotation() != 90) {
				codes.add("INVALID_ROTATION");
			}
			if (table.x() % TableFootprint.GRID != 0 || table.y() % TableFootprint.GRID != 0) {
				codes.add("OFF_GRID");
			}
			if (hasNoUsableLabel(table.label())) {
				codes.add("BLANK_LABEL");
			}
			else if (labelCount.get(table.label().strip()) > 1) {
				codes.add("DUPLICATE_LABEL");
			}
			Rect footprint = footprints.get(i);
			if (footprint != null) {
				if (!roomRects.isEmpty() && !isInside(footprint, roomRects)) {
					codes.add("OUT_OF_ROOM");
				}
				if (overlapsAnother(i, footprints)) {
					codes.add("OVERLAP");
				}
			}
			for (String code : codes) {
				problems.add(new LayoutProblem(i, table.label(), code));
			}
		}
		return problems;
	}

	/** Huella de cada mesa; null si sus plazas o su giro no permiten calcularla. */
	private static List<Rect> footprints(List<TableDraft> tables) {
		List<Rect> footprints = new ArrayList<>();
		for (TableDraft table : tables) {
			boolean calculable = TableFootprint.isSupportedSeats(table.seats())
					&& (table.rotation() == 0 || table.rotation() == 90) && table.shape() != null;
			footprints.add(calculable
					? TableFootprint.of(table.shape(), table.seats(), table.rotation(), table.x(), table.y()) : null);
		}
		return footprints;
	}

	private static Map<String, Integer> labelCount(List<TableDraft> tables) {
		Map<String, Integer> count = new HashMap<>();
		for (TableDraft table : tables) {
			if (!hasNoUsableLabel(table.label())) {
				count.merge(table.label().strip(), 1, Integer::sum);
			}
		}
		return count;
	}

	private static boolean hasNoUsableLabel(String label) {
		return label == null || label.isBlank() || label.strip().startsWith(RESERVED_LABEL_PREFIX);
	}

	/** Los rectángulos del local son disjuntos, así que la huella cabe si las áreas que cubren suman la suya. */
	private static boolean isInside(Rect footprint, List<Rect> roomRects) {
		Rect withInset = footprint.expand(TableFootprint.WALL_INSET);
		int covered = roomRects.stream().mapToInt(rect -> rect.intersectionArea(withInset)).sum();
		return covered >= withInset.area();
	}

	private static boolean overlapsAnother(int index, List<Rect> footprints) {
		Rect own = footprints.get(index);
		for (int other = 0; other < footprints.size(); other++) {
			Rect candidate = footprints.get(other);
			if (other != index && candidate != null && own.overlaps(candidate)) {
				return true;
			}
		}
		return false;
	}

}
