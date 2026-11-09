package io.github.manuelcarro97.reservas.domain.exception;

public class TableNotFoundException extends DomainException {

	public TableNotFoundException() {
		super("TABLE_NOT_FOUND", ErrorKind.NOT_FOUND, "Table not found");
	}

}
