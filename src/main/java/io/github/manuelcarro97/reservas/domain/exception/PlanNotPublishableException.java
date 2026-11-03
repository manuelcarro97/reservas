package io.github.manuelcarro97.reservas.domain.exception;

public class PlanNotPublishableException extends DomainException {

	public PlanNotPublishableException(String message) {
		super("PLAN_NOT_PUBLISHABLE", ErrorKind.UNPROCESSABLE, message);
	}

}
