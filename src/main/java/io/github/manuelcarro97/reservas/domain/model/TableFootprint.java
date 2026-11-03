package io.github.manuelcarro97.reservas.domain.model;

import java.util.Map;

/** Huella de una mesa con sus sillas, en unidades de plano. */
public final class TableFootprint {

	/** Cuadrícula de imán: las mesas se colocan en múltiplos de GRID. */
	public static final int GRID = 10;

	/** Distancia mínima entre la huella de una mesa y el contorno del local. */
	public static final int WALL_INSET = 16;

	/** Las sillas suman 34 por cada lado que las lleva. */
	private static final int CHAIR_DEPTH = 34;

	/** Largo de la mesa cuadrada según las plazas; el ancho es 70 con 2 plazas y 80 con las demás. */
	private static final Map<Integer, Integer> SQUARE_LENGTH = Map.of(2, 70, 4, 120, 6, 170, 8, 220);

	private static final Map<Integer, Integer> ROUND_RADIUS = Map.of(2, 38, 4, 52, 6, 66, 8, 80);

	private TableFootprint() {
	}

	public static boolean isSupportedSeats(int seats) {
		return SQUARE_LENGTH.containsKey(seats);
	}

	/**
	 * Huella centrada en ({@code x}, {@code y}). La cuadrada lleva las sillas en los dos lados largos; la redonda
	 * cuenta como su cuadrado envolvente (2r + 68) y no depende del giro.
	 *
	 * @throws IllegalArgumentException si las plazas no son 2, 4, 6 u 8 o el giro no es 0 ni 90
	 */
	public static Rect of(TableShape shape, int seats, int rotation, int x, int y) {
		if (!isSupportedSeats(seats)) {
			throw new IllegalArgumentException("Plazas no soportadas: " + seats);
		}
		if (rotation != 0 && rotation != 90) {
			throw new IllegalArgumentException("Giro de mesa no soportado: " + rotation);
		}
		int width;
		int height;
		if (shape == TableShape.ROUND) {
			width = 2 * ROUND_RADIUS.get(seats) + 2 * CHAIR_DEPTH;
			height = width;
		}
		else {
			width = (seats == 2 ? 70 : 80) + 2 * CHAIR_DEPTH;
			height = SQUARE_LENGTH.get(seats);
		}
		if (rotation == 90) {
			int swap = width;
			width = height;
			height = swap;
		}
		return new Rect(x - width / 2, y - height / 2, x + width / 2, y + height / 2);
	}

}
