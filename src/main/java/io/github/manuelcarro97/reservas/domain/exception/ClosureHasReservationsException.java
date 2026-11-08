package io.github.manuelcarro97.reservas.domain.exception;

import java.util.List;
import java.util.Map;

/** Cerrar el día dejaría en el aire reservas activas; {@code reservationCodes} son las de ese día. */
public class ClosureHasReservationsException extends DomainException {

	private final List<String> reservationCodes;

	public ClosureHasReservationsException(List<String> reservationCodes) {
		super("CLOSURE_HAS_RESERVATIONS", ErrorKind.CONFLICT, "Active reservations exist on that date");
		this.reservationCodes = List.copyOf(reservationCodes);
	}

	@Override
	public Map<String, Object> details() {
		return Map.of("reservations", reservationCodes);
	}

}
