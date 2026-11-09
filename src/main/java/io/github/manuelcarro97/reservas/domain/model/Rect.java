package io.github.manuelcarro97.reservas.domain.model;

/** Rectángulo alineado con los ejes en unidades de plano; {@code x1 <= x2} e {@code y1 <= y2}. */
public record Rect(int x1, int y1, int x2, int y2) {

	public int area() {
		return (x2 - x1) * (y2 - y1);
	}

	/** Estricto: dos rectángulos que solo comparten borde no se solapan. */
	public boolean overlaps(Rect other) {
		return x1 < other.x2 && other.x1 < x2 && y1 < other.y2 && other.y1 < y2;
	}

	public int intersectionArea(Rect other) {
		int width = Math.min(x2, other.x2) - Math.max(x1, other.x1);
		int height = Math.min(y2, other.y2) - Math.max(y1, other.y1);
		return width > 0 && height > 0 ? width * height : 0;
	}

	public Rect expand(int distance) {
		return new Rect(x1 - distance, y1 - distance, x2 + distance, y2 + distance);
	}

}
