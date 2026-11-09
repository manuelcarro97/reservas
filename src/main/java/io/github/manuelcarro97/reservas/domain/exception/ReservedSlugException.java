package io.github.manuelcarro97.reservas.domain.exception;

public class ReservedSlugException extends DomainException {

	public ReservedSlugException() {
		super("SLUG_RESERVED", ErrorKind.CONFLICT, "The slug is reserved");
	}

}
