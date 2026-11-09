package io.github.manuelcarro97.reservas.domain.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Forma del local en unidades de plano. {@code width} y {@code height} son el ancho y el alto sin girar;
 * {@code cutWidth} y {@code cutDepth} miden el hueco de la L, la U o la T; {@code rotation} gira el local en pasos de
 * 90 grados en sentido horario (coordenadas SVG, con y hacia abajo).
 * <p>
 * {@link #rects()} y {@link #polygon()} solo tienen sentido si {@link #problems()} está vacía.
 */
public record RoomLayout(RoomShape shape, int width, int height, int cutWidth, int cutDepth, int rotation) {

	private static final int STEP = 20;

	private static final int MIN_SIDE = 400;

	private static final int MAX_SIDE = 2000;

	private static final int MIN_CUT = 200;

	public static RoomLayout defaultRoom() {
		return new RoomLayout(RoomShape.RECTANGLE, 1200, 800, 0, 0, 0);
	}

	/** Motivos por los que la forma no es válida; vacía si lo es. */
	public List<String> problems() {
		List<String> problems = new ArrayList<>();
		if (shape == null) {
			problems.add("Falta la forma del local");
			return problems;
		}
		if (width < MIN_SIDE || width > MAX_SIDE || height < MIN_SIDE || height > MAX_SIDE) {
			problems.add("El ancho y el alto deben estar entre " + MIN_SIDE + " y " + MAX_SIDE);
		}
		if (width % STEP != 0 || height % STEP != 0 || cutWidth % STEP != 0 || cutDepth % STEP != 0) {
			problems.add("Las medidas deben ser múltiplos de " + STEP);
		}
		if (rotation != 0 && rotation != 90 && rotation != 180 && rotation != 270) {
			problems.add("El giro debe ser 0, 90, 180 o 270");
		}
		switch (shape) {
			case SQUARE -> {
				if (width != height) {
					problems.add("El local cuadrado necesita el mismo ancho y alto");
				}
				requireNoCut(problems);
			}
			case RECTANGLE -> requireNoCut(problems);
			case L -> requireCuts(problems, width - MIN_CUT);
			case U, T -> requireCuts(problems, width - 2 * MIN_CUT);
		}
		return problems;
	}

	private void requireNoCut(List<String> problems) {
		if (cutWidth != 0 || cutDepth != 0) {
			problems.add("Esta forma no lleva hueco");
		}
	}

	private void requireCuts(List<String> problems, int maxCutWidth) {
		if (cutWidth < MIN_CUT || cutWidth > maxCutWidth) {
			problems.add("El ancho del hueco debe estar entre " + MIN_CUT + " y " + maxCutWidth);
		}
		if (cutDepth < MIN_CUT || cutDepth > height - MIN_CUT) {
			problems.add("El fondo del hueco debe estar entre " + MIN_CUT + " y " + (height - MIN_CUT));
		}
	}

	/** Rectángulos disjuntos que cubren el local, con el giro aplicado. */
	public List<Rect> rects() {
		return unrotatedRects().stream().map(this::rotate).toList();
	}

	/** Contorno del local, con el giro aplicado. */
	public List<Point> polygon() {
		return unrotatedPolygon().stream().map(this::rotate).toList();
	}

	private List<Rect> unrotatedRects() {
		int notchTop = height - cutDepth;
		return switch (shape) {
			case SQUARE, RECTANGLE -> List.of(new Rect(0, 0, width, height));
			case L -> List.of(new Rect(0, 0, width, notchTop), new Rect(0, notchTop, width - cutWidth, height));
			case U -> List.of(new Rect(0, 0, width, notchTop), new Rect(0, notchTop, (width - cutWidth) / 2, height),
					new Rect((width + cutWidth) / 2, notchTop, width, height));
			case T -> List.of(new Rect(0, 0, width, notchTop),
					new Rect((width - cutWidth) / 2, notchTop, (width + cutWidth) / 2, height));
		};
	}

	private List<Point> unrotatedPolygon() {
		int notchTop = height - cutDepth;
		int left = (width - cutWidth) / 2;
		int right = (width + cutWidth) / 2;
		return switch (shape) {
			case SQUARE, RECTANGLE -> List.of(new Point(0, 0), new Point(width, 0), new Point(width, height),
					new Point(0, height));
			case L -> List.of(new Point(0, 0), new Point(width, 0), new Point(width, notchTop),
					new Point(width - cutWidth, notchTop), new Point(width - cutWidth, height), new Point(0, height));
			case U -> List.of(new Point(0, 0), new Point(width, 0), new Point(width, height), new Point(right, height),
					new Point(right, notchTop), new Point(left, notchTop), new Point(left, height),
					new Point(0, height));
			case T -> List.of(new Point(0, 0), new Point(width, 0), new Point(width, notchTop),
					new Point(right, notchTop), new Point(right, height), new Point(left, height),
					new Point(left, notchTop), new Point(0, notchTop));
		};
	}

	private Point rotate(Point point) {
		return switch (rotation) {
			case 90 -> new Point(height - point.y(), point.x());
			case 180 -> new Point(width - point.x(), height - point.y());
			case 270 -> new Point(point.y(), width - point.x());
			default -> point;
		};
	}

	private Rect rotate(Rect rect) {
		Point a = rotate(new Point(rect.x1(), rect.y1()));
		Point b = rotate(new Point(rect.x2(), rect.y2()));
		return new Rect(Math.min(a.x(), b.x()), Math.min(a.y(), b.y()), Math.max(a.x(), b.x()),
				Math.max(a.y(), b.y()));
	}

}
