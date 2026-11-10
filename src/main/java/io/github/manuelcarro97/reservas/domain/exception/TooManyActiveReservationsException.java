package io.github.manuelcarro97.reservas.domain.exception;

public class TooManyActiveReservationsException extends DomainException {

	public TooManyActiveReservationsException() {
		super("TOO_MANY_ACTIVE_RESERVATIONS", ErrorKind.CONFLICT,
				"The phone number already has the maximum number of active reservations at this restaurant");
	}

}
