package io.github.manuelcarro97.reservas.adapter.in.web;

import io.github.manuelcarro97.reservas.application.port.in.TableOccupancy;

/** Si una mesa está ocupada en un turno y fecha; nada de quién la ocupa. */
record PublicOccupancyResponse(long tableId, boolean occupied) {

	static PublicOccupancyResponse from(TableOccupancy table) {
		return new PublicOccupancyResponse(table.tableId(), table.occupied());
	}

}
