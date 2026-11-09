package io.github.manuelcarro97.reservas.domain.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.TableShape;

class TableAssignerTest {

	private final TableAssigner assigner = new TableAssigner();

	private static DiningTable table(long id, int seats) {
		return new DiningTable(id, 1L, "M" + id, TableShape.SQUARE, seats, 0, 0, 0);
	}

	private static List<Integer> seats(List<DiningTable> tables) {
		return tables.stream().map(DiningTable::seats).toList();
	}

	@Test
	void skipsTablesThatAreTooSmall() {
		assertThat(seats(assigner.candidates(List.of(table(1, 2), table(2, 4)), 3))).containsExactly(4);
	}

	@Test
	void ordersByCapacityAscending() {
		assertThat(seats(assigner.candidates(List.of(table(1, 4), table(2, 2), table(3, 6)), 2)))
				.containsExactly(2, 4, 6);
	}

	@Test
	void breaksCapacityTiesById() {
		assertThat(assigner.candidates(List.of(table(9, 4), table(3, 4)), 2)).extracting(DiningTable::id)
				.containsExactly(3L, 9L);
	}

	@Test
	void returnsEmptyWhenNoTableFits() {
		assertThat(assigner.candidates(List.of(table(1, 2)), 3)).isEmpty();
	}

}
