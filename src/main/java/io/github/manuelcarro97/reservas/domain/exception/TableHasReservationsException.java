package io.github.manuelcarro97.reservas.domain.exception;

import java.util.List;
import java.util.Map;

/** El cambio de mesas dejaría sin sitio a reservas activas; {@code reservationCodes} son las afectadas. */
public class TableHasReservationsException extends DomainException {

	private final List<String> reservationCodes;

	public TableHasReservationsException(List<String> reservationCodes) {
		super("TABLE_HAS_RESERVATIONS", ErrorKind.CONFLICT, "Active reservations depend on these tables");
		this.reservationCodes = List.copyOf(reservationCodes);
	}

	@Override
	public Map<String, Object> details() {
		return Map.of("reservations", reservationCodes);
	}

}
