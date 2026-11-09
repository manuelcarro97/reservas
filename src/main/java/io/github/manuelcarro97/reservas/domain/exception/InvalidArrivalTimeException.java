package io.github.manuelcarro97.reservas.domain.exception;

public class InvalidArrivalTimeException extends DomainException {

	public InvalidArrivalTimeException() {
		super("INVALID_ARRIVAL_TIME", ErrorKind.UNPROCESSABLE, "The arrival time is not one of the shift's arrival times");
	}

}
