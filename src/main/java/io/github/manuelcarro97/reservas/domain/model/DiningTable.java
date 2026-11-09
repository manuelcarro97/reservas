package io.github.manuelcarro97.reservas.domain.model;

/** Mesa colocada por su centro ({@code x}, {@code y}) en unidades de plano. */
public record DiningTable(Long id, long restaurantId, String label, TableShape shape, int seats, int rotation, int x,
		int y) {

	public Rect footprint() {
		return TableFootprint.of(shape, seats, rotation, x, y);
	}

}
