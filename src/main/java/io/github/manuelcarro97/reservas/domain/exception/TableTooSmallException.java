package io.github.manuelcarro97.reservas.domain.exception;

public class TableTooSmallException extends DomainException {

	public TableTooSmallException() {
		super("TABLE_TOO_SMALL", ErrorKind.UNPROCESSABLE, "The table has fewer seats than the party size");
	}

}
