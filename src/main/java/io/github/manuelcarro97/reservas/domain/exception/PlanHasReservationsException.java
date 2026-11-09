package io.github.manuelcarro97.reservas.domain.exception;

import java.util.List;
import java.util.Map;

/** El plano (o algún plano de la cuenta) tiene reservas activas futuras; {@code reservationCodes} son esas reservas. */
public class PlanHasReservationsException extends DomainException {

	private final List<String> reservationCodes;

	public PlanHasReservationsException(List<String> reservationCodes) {
		super("PLAN_HAS_RESERVATIONS", ErrorKind.CONFLICT, "Active reservations prevent deleting the plan");
		this.reservationCodes = List.copyOf(reservationCodes);
	}

	@Override
	public Map<String, Object> details() {
		return Map.of("reservations", reservationCodes);
	}

}
