package io.github.manuelcarro97.reservas.adapter.in.web;

import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.TableShape;

/** Mesa de un plano; {@code x} e {@code y} son su centro. */
record TableDto(Long id, String label, TableShape shape, int seats, int rotation, int x, int y) {

	static TableDto from(DiningTable table) {
		return new TableDto(table.id(), table.label(), table.shape(), table.seats(), table.rotation(), table.x(),
				table.y());
	}

}
