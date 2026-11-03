package io.github.manuelcarro97.reservas.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

class RoomLayoutTest {

	private static List<Point> points(int... coordinates) {
		return IntStream.range(0, coordinates.length / 2)
			.mapToObj(i -> new Point(coordinates[2 * i], coordinates[2 * i + 1]))
			.toList();
	}

	private static int totalArea(RoomLayout room) {
		return room.rects().stream().mapToInt(Rect::area).sum();
	}

	@Test
	void lShapeMatchesReference() {
		RoomLayout room = new RoomLayout(RoomShape.L, 1000, 900, 480, 480, 0);

		assertThat(room.problems()).isEmpty();
		assertThat(room.polygon()).isEqualTo(points(0, 0, 1000, 0, 1000, 420, 520, 420, 520, 900, 0, 900));
		assertThat(room.rects()).containsExactly(new Rect(0, 0, 1000, 420), new Rect(0, 420, 520, 900));
	}

	@Test
	void uShapeMatchesReference() {
		RoomLayout room = new RoomLayout(RoomShape.U, 1100, 820, 420, 440, 0);

		assertThat(room.problems()).isEmpty();
		assertThat(room.polygon())
			.isEqualTo(points(0, 0, 1100, 0, 1100, 820, 760, 820, 760, 380, 340, 380, 340, 820, 0, 820));
		assertThat(room.rects()).containsExactly(new Rect(0, 0, 1100, 380), new Rect(0, 380, 340, 820),
				new Rect(760, 380, 1100, 820));
	}

	@Test
	void tShapeMatchesReference() {
		RoomLayout room = new RoomLayout(RoomShape.T, 1100, 900, 340, 520, 0);

		assertThat(room.problems()).isEmpty();
		assertThat(room.polygon())
			.isEqualTo(points(0, 0, 1100, 0, 1100, 380, 720, 380, 720, 900, 380, 900, 380, 380, 0, 380));
		assertThat(room.rects()).containsExactly(new Rect(0, 0, 1100, 380), new Rect(380, 380, 720, 900));
	}

	@Test
	void rectangleAndSquareAreASingleRect() {
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 1200, 560, 0, 0, 0).rects())
			.containsExactly(new Rect(0, 0, 1200, 560));
		assertThat(new RoomLayout(RoomShape.SQUARE, 800, 800, 0, 0, 0).polygon())
			.isEqualTo(points(0, 0, 800, 0, 800, 800, 0, 800));
	}

	@Test
	void defaultRoomIsValidRectangle() {
		RoomLayout room = RoomLayout.defaultRoom();

		assertThat(room).isEqualTo(new RoomLayout(RoomShape.RECTANGLE, 1200, 800, 0, 0, 0));
		assertThat(room.problems()).isEmpty();
	}

	@Test
	void rotation90SwapsBoundingBox() {
		RoomLayout straight = new RoomLayout(RoomShape.L, 1000, 900, 480, 480, 0);
		RoomLayout rotated = new RoomLayout(RoomShape.L, 1000, 900, 480, 480, 90);

		assertThat(rotated.problems()).isEmpty();
		Rect box = new Rect(0, 0, 900, 1000);
		assertThat(rotated.rects()).allSatisfy(rect -> assertThat(rect.intersectionArea(box)).isEqualTo(rect.area()));
		assertThat(totalArea(rotated)).isEqualTo(totalArea(straight));
		assertThat(rotated.rects()).containsExactly(new Rect(480, 0, 900, 1000), new Rect(0, 0, 480, 520));
	}

	@Test
	void rotationsKeepRectsDisjointAndPolygonInsideBox() {
		for (int rotation : new int[] { 0, 90, 180, 270 }) {
			RoomLayout room = new RoomLayout(RoomShape.U, 1100, 820, 420, 440, rotation);
			List<Rect> rects = room.rects();

			for (int i = 0; i < rects.size(); i++) {
				for (int j = i + 1; j < rects.size(); j++) {
					assertThat(rects.get(i).overlaps(rects.get(j))).as("rotation %d", rotation).isFalse();
				}
			}
			assertThat(totalArea(room)).as("rotation %d", rotation).isEqualTo(1100 * 380 + 2 * 340 * 440);
			assertThat(room.polygon()).hasSize(8);
		}
	}

	@Test
	void squareRequiresEqualSides() {
		assertThat(new RoomLayout(RoomShape.SQUARE, 800, 800, 0, 0, 0).problems()).isEmpty();
		assertThat(new RoomLayout(RoomShape.SQUARE, 800, 600, 0, 0, 0).problems()).isNotEmpty();
	}

	@Test
	void rectangleAndSquareRejectCuts() {
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 1200, 800, 200, 0, 0).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.SQUARE, 800, 800, 0, 200, 0).problems()).isNotEmpty();
	}

	@Test
	void cutsOutOfRangeAreRejected() {
		assertThat(new RoomLayout(RoomShape.L, 1000, 900, 100, 480, 0).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.L, 1000, 900, 480, 100, 0).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.L, 1000, 900, 820, 480, 0).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.L, 1000, 900, 800, 700, 0).problems()).isEmpty();
	}

	@Test
	void uAndTNeedRoomForBothSides() {
		assertThat(new RoomLayout(RoomShape.U, 1100, 820, 700, 440, 0).problems()).isEmpty();
		assertThat(new RoomLayout(RoomShape.U, 1100, 820, 720, 440, 0).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.T, 1100, 900, 700, 520, 0).problems()).isEmpty();
		assertThat(new RoomLayout(RoomShape.T, 1100, 900, 720, 520, 0).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.T, 1100, 900, 340, 720, 0).problems()).isNotEmpty();
	}

	@Test
	void dimensionsMustBeMultiplesOf20() {
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 1210, 800, 0, 0, 0).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 1200, 810, 0, 0, 0).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.L, 1000, 900, 490, 480, 0).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.L, 1000, 900, 480, 490, 0).problems()).isNotEmpty();
	}

	@Test
	void dimensionsMustBeWithinLimits() {
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 380, 800, 0, 0, 0).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 400, 400, 0, 0, 0).problems()).isEmpty();
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 2000, 2000, 0, 0, 0).problems()).isEmpty();
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 2020, 800, 0, 0, 0).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 1200, 2020, 0, 0, 0).problems()).isNotEmpty();
	}

	@Test
	void rotationMustBeAMultipleOf90() {
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 1200, 800, 0, 0, 270).problems()).isEmpty();
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 1200, 800, 0, 0, 45).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 1200, 800, 0, 0, 360).problems()).isNotEmpty();
		assertThat(new RoomLayout(RoomShape.RECTANGLE, 1200, 800, 0, 0, -90).problems()).isNotEmpty();
	}

	@Test
	void missingShapeIsRejected() {
		assertThat(new RoomLayout(null, 1200, 800, 0, 0, 0).problems()).isNotEmpty();
	}

}
