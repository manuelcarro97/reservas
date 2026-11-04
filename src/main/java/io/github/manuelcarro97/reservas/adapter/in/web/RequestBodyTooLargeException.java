package io.github.manuelcarro97.reservas.adapter.in.web;

import java.io.IOException;

/**
 * El cuerpo de la petición pasó del tope mientras se leía. Es una {@link IOException} para que la lectura se corte en
 * seco; {@link ApiExceptionHandler} la reconoce en la cadena de causas del error de lectura y responde 413.
 */
class RequestBodyTooLargeException extends IOException {

	RequestBodyTooLargeException(long limit) {
		super("Request body exceeds " + limit + " bytes");
	}

}
