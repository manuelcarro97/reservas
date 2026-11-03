package io.github.manuelcarro97.reservas.domain.exception;

/** La cuenta demo no puede hacer esto (borrar la cuenta, vincular Telegram). */
public class DemoReadOnlyException extends DomainException {

	public DemoReadOnlyException() {
		super("DEMO_READ_ONLY", ErrorKind.FORBIDDEN, "The demo account cannot do this");
	}

}
