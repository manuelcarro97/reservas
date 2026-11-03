package io.github.manuelcarro97.reservas.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class TableFootprintTest {

	@Test
	void squareTwoSeats() {
		assertThat(TableFootprint.of(TableShape.SQUARE, 2, 0, 200, 200)).isEqualTo(new Rect(131, 165, 269, 235));
	}

	@Test
	void squareFourSixAndEightSeats() {
		assertThat(TableFootprint.of(TableShape.SQUARE, 4, 0, 200, 200)).isEqualTo(new Rect(126, 140, 274, 260));
		assertThat(TableFootprint.of(TableShape.SQUARE, 6, 0, 200, 200)).isEqualTo(new Rect(126, 115, 274, 285));
		assertThat(TableFootprint.of(TableShape.SQUARE, 8, 0, 200, 200)).isEqualTo(new Rect(126, 90, 274, 310));
	}

	@Test
	void rectEightRotated90() {
		Rect rect = TableFootprint.of(TableShape.SQUARE, 8, 90, 300, 400);

		assertThat(rect).isEqualTo(new Rect(190, 326, 410, 474));
		assertThat(rect.x2() - rect.x1()).isEqualTo(220);
		assertThat(rect.y2() - rect.y1()).isEqualTo(148);
	}

	@Test
	void roundSixIsBoundingSquare() {
		Rect rect = TableFootprint.of(TableShape.ROUND, 6, 0, 300, 300);

		assertThat(rect).isEqualTo(new Rect(200, 200, 400, 400));
		assertThat(rect.x2() - rect.x1()).isEqualTo(200);
		assertThat(rect.y2() - rect.y1()).isEqualTo(200);
	}

	@Test
	void roundFootprintsAre2rPlus68AndIgnoreRotation() {
		assertThat(TableFootprint.of(TableShape.ROUND, 2, 0, 200, 200)).isEqualTo(new Rect(128, 128, 272, 272));
		assertThat(TableFootprint.of(TableShape.ROUND, 4, 90, 200, 200)).isEqualTo(new Rect(114, 114, 286, 286));
		assertThat(TableFootprint.of(TableShape.ROUND, 8, 0, 200, 200)).isEqualTo(new Rect(86, 86, 314, 314));
	}

	@Test
	void constants() {
		assertThat(TableFootprint.GRID).isEqualTo(10);
		assertThat(TableFootprint.WALL_INSET).isEqualTo(16);
	}

	@Test
	void rejectsUnsupportedSeatsAndRotation() {
		assertThatThrownBy(() -> TableFootprint.of(TableShape.SQUARE, 3, 0, 200, 200))
			.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> TableFootprint.of(TableShape.SQUARE, 4, 180, 200, 200))
			.isInstanceOf(IllegalArgumentException.class);
	}

}
