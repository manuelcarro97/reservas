package io.github.manuelcarro97.reservas.application.port.in;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * {@code tableId} es obligatorio en elección libre y debe faltar en modo asignado. {@code arrivalTime} es obligatoria
 * y debe ser una hora de llegada del turno (ver {@link io.github.manuelcarro97.reservas.domain.service.ArrivalPolicy}).
 */
public record CreateReservationCommand(LocalDate date, long shiftId, int partySize, String customerName,
		String customerPhone, String customerEmail, Long tableId, LocalTime arrivalTime) {
}
