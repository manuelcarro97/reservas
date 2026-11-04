package io.github.manuelcarro97.reservas.domain.exception;

/** Un cierre solo puede ponerse de hoy en adelante y hasta unos meses vista (hoy en la zona del plano). */
public class ClosureDateOutOfRangeException extends DomainException {

	public ClosureDateOutOfRangeException(int maxDaysAhead) {
		super("CLOSURE_DATE_OUT_OF_RANGE", ErrorKind.UNPROCESSABLE,
				"A closure date must be between today and " + maxDaysAhead + " days ahead");
	}

}
