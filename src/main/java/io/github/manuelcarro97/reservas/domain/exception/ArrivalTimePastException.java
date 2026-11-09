package io.github.manuelcarro97.reservas.domain.exception;

public class ArrivalTimePastException extends DomainException {

	public ArrivalTimePastException() {
		super("ARRIVAL_TIME_PAST", ErrorKind.UNPROCESSABLE, "The arrival time has already passed");
	}

}
