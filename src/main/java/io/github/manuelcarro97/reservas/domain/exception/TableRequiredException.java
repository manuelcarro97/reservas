package io.github.manuelcarro97.reservas.domain.exception;

public class TableRequiredException extends DomainException {

	public TableRequiredException() {
		super("TABLE_REQUIRED", ErrorKind.UNPROCESSABLE, "A table must be chosen in this booking mode");
	}

}
