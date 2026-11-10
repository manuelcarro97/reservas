package io.github.manuelcarro97.reservas.adapter.in.web;

import io.github.manuelcarro97.reservas.application.port.in.WeekSummary;

/** Carga de un turno un día: reservas activas, mesas distintas ocupadas y reservas sin mesa. */
record WeekShiftLoad(long shiftId, int occupiedTables, int unassigned, int reservations, int guests, int pending) {

	static WeekShiftLoad from(WeekSummary.ShiftLoad load) {
		return new WeekShiftLoad(load.shiftId(), load.occupiedTables(), load.unassigned(), load.reservations(),
				load.guests(), load.pending());
	}

}
