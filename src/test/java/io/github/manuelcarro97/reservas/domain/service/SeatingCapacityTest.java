package io.github.manuelcarro97.reservas.domain.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class SeatingCapacityTest {

	private final SeatingCapacity capacity = new SeatingCapacity();

	@Test
	void emptyPartiesFit() {
		assertThat(capacity.canSeatAll(List.of(), List.of())).isTrue();
		assertThat(capacity.canSeatAll(List.of(4), List.of())).isTrue();
	}

	@Test
	void largestFirstAvoidsWaste() {
		assertThat(capacity.canSeatAll(List.of(2, 4), List.of(2, 4))).isTrue();
		assertThat(capacity.canSeatAll(List.of(4, 2), List.of(2, 4))).isTrue();
	}

	@Test
	void notEnoughTables() {
		assertThat(capacity.canSeatAll(List.of(4), List.of(2, 2))).isFalse();
	}

	@Test
	void partyLargerThanAnyTable() {
		assertThat(capacity.canSeatAll(List.of(2, 4), List.of(6))).isFalse();
	}

	@Test
	void exactFit() {
		assertThat(capacity.canSeatAll(List.of(2, 4, 6), List.of(6, 4, 2))).isTrue();
	}

	@Test
	void doesNotModifyItsInputs() {
		List<Integer> tables = List.of(4, 2);
		List<Integer> parties = List.of(2, 4);

		capacity.canSeatAll(tables, parties);

		assertThat(tables).containsExactly(4, 2);
		assertThat(parties).containsExactly(2, 4);
	}

}
