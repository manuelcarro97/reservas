package io.github.manuelcarro97.reservas.domain.exception;

/** El dueño ya creó el máximo de planos en las últimas 24 horas (cuentan también los que borró). */
public class PlanCreationLimitException extends DomainException {

	public PlanCreationLimitException() {
		super("PLAN_CREATION_LIMIT", ErrorKind.TOO_MANY_REQUESTS,
				"Too many plans were created in the last 24 hours");
	}

}
