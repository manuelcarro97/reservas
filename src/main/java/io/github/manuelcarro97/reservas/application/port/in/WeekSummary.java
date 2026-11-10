package io.github.manuelcarro97.reservas.application.port.in;

import java.time.LocalDate;
import java.util.List;

/** Una semana de lunes a domingo del plano: siete días, cada uno con la carga de los turnos que abren ese día. */
public record WeekSummary(LocalDate monday, List<Day> days) {

	/** {@code shifts} va por hora de inicio y vacío si el día está cerrado. */
	public record Day(LocalDate date, boolean closed, List<ShiftLoad> shifts) {
	}

	/**
	 * Reservas activas (PENDING o CONFIRMED) del turno ese día. {@code occupiedTables} cuenta mesas distintas con
	 * reserva y {@code unassigned} las reservas sin mesa.
	 */
	public record ShiftLoad(long shiftId, int occupiedTables, int unassigned, int reservations, int guests,
			int pending) {
	}

}
