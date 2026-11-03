package io.github.manuelcarro97.reservas.domain.exception;

public class TableNotAllowedException extends DomainException {

	public TableNotAllowedException() {
		super("TABLE_NOT_ALLOWED", ErrorKind.UNPROCESSABLE, "The table is assigned by the restaurant in this booking mode");
	}

}
