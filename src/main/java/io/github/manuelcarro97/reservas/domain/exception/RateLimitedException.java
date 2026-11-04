package io.github.manuelcarro97.reservas.domain.exception;

/** Demasiadas peticiones desde la misma IP en el último minuto. */
public class RateLimitedException extends DomainException {

	public RateLimitedException() {
		super("RATE_LIMITED", ErrorKind.TOO_MANY_REQUESTS, "Too many requests, try again later");
	}

}
