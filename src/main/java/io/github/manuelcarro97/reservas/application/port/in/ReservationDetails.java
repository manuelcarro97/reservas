package io.github.manuelcarro97.reservas.application.port.in;

import java.time.LocalDate;
import java.time.LocalTime;

import io.github.manuelcarro97.reservas.domain.model.ReservationStatus;
import io.github.manuelcarro97.reservas.domain.model.Theme;

/**
 * Reserva tal como la ve quien tiene su código. Además de la reserva, trae los datos públicos del plano y del turno
 * para poder pintarla sin más peticiones: nada del dueño ni del cliente.
 */
public record ReservationDetails(String code, ReservationStatus status, LocalDate date, long shiftId, int partySize,
		String tableLabel, String restaurantName, String slug, Theme theme, String shiftName, LocalTime shiftStart,
		LocalTime shiftEnd) {
}
