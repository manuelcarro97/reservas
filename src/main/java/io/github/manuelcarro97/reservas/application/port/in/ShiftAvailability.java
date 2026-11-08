package io.github.manuelcarro97.reservas.application.port.in;

import java.time.LocalTime;
import java.util.List;

/** {@code arrivalTimes} son las horas de llegada que se pueden elegir; vacías si el turno no admite reservas. */
public record ShiftAvailability(long shiftId, String name, LocalTime start, boolean available,
		List<LocalTime> arrivalTimes) {
}
