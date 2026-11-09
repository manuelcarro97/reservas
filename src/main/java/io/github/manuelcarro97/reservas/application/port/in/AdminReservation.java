package io.github.manuelcarro97.reservas.application.port.in;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import io.github.manuelcarro97.reservas.domain.model.ReservationStatus;

/**
 * {@code tableId} y {@code tableLabel} son nulos mientras la reserva no tiene mesa (modo asignado); {@code arrivalTime},
 * en las reservas anteriores a que existiera la hora de llegada.
 */
public record AdminReservation(long id, String code, ReservationStatus status, LocalDate date, LocalTime arrivalTime,
		long shiftId, int partySize, Long tableId, String tableLabel, String customerName, String customerPhone,
		String customerEmail, Instant createdAt) {
}
