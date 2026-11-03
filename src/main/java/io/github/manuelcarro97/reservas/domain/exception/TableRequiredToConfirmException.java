package io.github.manuelcarro97.reservas.domain.exception;

/** Confirmar una reserva sin mesa; el dueño debe asignarla antes. Comparte código con {@link TableRequiredException}. */
public class TableRequiredToConfirmException extends DomainException {

	public TableRequiredToConfirmException() {
		super("TABLE_REQUIRED", ErrorKind.CONFLICT, "A table must be assigned before confirming the reservation");
	}

}
