package io.github.manuelcarro97.reservas.application.port.in;

import java.time.LocalDate;

/** {@code tableId} es obligatorio en elección libre y debe faltar en modo asignado. */
public record CreateReservationCommand(LocalDate date, long shiftId, int partySize, String customerName,
		String customerPhone, String customerEmail, Long tableId) {
}
