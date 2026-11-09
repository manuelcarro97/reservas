package io.github.manuelcarro97.reservas.domain.exception;

public class TableTakenException extends DomainException {

	public TableTakenException() {
		super("TABLE_TAKEN", ErrorKind.CONFLICT, "The table is already reserved for that shift");
	}

}
