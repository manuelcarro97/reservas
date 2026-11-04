package io.github.manuelcarro97.reservas.domain.exception;

/** El plano ya tiene el máximo de turnos visibles; es un conflicto con el estado del plano, como el tope de planos. */
public class ShiftLimitReachedException extends DomainException {

	public ShiftLimitReachedException(int max) {
		super("SHIFT_LIMIT", ErrorKind.CONFLICT, "The plan already has the maximum number of shifts (" + max + ")");
	}

}
