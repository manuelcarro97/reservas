package io.github.manuelcarro97.reservas.domain.exception;

public class PlanLimitReachedException extends DomainException {

	public PlanLimitReachedException() {
		super("PLAN_LIMIT_REACHED", ErrorKind.CONFLICT, "The account already has the maximum number of plans");
	}

}
