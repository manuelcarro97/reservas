package io.github.manuelcarro97.reservas.application.port.in;

public interface AnonymizeReservationsUseCase {

	/**
	 * Anonimiza los datos del cliente de las reservas con más de 30 días de antigüedad, contando "hoy" en
	 * Europe/Madrid, y devuelve cuántas cambió.
	 */
	int anonymizeOld();

}
