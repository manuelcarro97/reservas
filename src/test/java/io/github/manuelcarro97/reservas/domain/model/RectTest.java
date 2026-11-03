package io.github.manuelcarro97.reservas.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RectTest {

	@Test
	void areaIsWidthTimesHeight() {
		assertThat(new Rect(10, 20, 40, 60).area()).isEqualTo(1200);
	}

	@Test
	void overlappingRectsOverlap() {
		assertThat(new Rect(0, 0, 100, 100).overlaps(new Rect(50, 50, 150, 150))).isTrue();
	}

	@Test
	void touchingRectsDoNotOverlap() {
		assertThat(new Rect(0, 0, 100, 100).overlaps(new Rect(100, 0, 200, 100))).isFalse();
		assertThat(new Rect(0, 0, 100, 100).overlaps(new Rect(0, 100, 100, 200))).isFalse();
		assertThat(new Rect(0, 0, 100, 100).overlaps(new Rect(100, 100, 200, 200))).isFalse();
	}

	@Test
	void intersectionAreaIsZeroWhenDisjointOrTouching() {
		assertThat(new Rect(0, 0, 100, 100).intersectionArea(new Rect(100, 0, 200, 100))).isZero();
		assertThat(new Rect(0, 0, 100, 100).intersectionArea(new Rect(300, 300, 400, 400))).isZero();
	}

	@Test
	void intersectionAreaOfPartialOverlap() {
		assertThat(new Rect(0, 0, 100, 100).intersectionArea(new Rect(50, 70, 150, 170))).isEqualTo(50 * 30);
	}

	@Test
	void expandGrowsEverySide() {
		assertThat(new Rect(10, 20, 40, 60).expand(5)).isEqualTo(new Rect(5, 15, 45, 65));
	}

}
