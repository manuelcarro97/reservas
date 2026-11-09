package io.github.manuelcarro97.reservas.application.port.in;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * Aviso al dueño sobre una acción del cliente. {@code kind} es {@code NEW} o {@code CANCELLED_BY_CUSTOMER};
 * {@code tableLabel} es nulo si la reserva no tiene mesa y {@code arrivalTime} si es anterior a que existiera la hora de
 * llegada. Sin teléfono ni email del cliente. {@code text} es el aviso ya redactado: el panel lo muestra tal cual.
 */
public record FeedEvent(String kind, long reservationId, String code, String restaurantSlug, String restaurantName,
		String customerName, int partySize, LocalDate date, String shiftName, LocalTime arrivalTime, String tableLabel,
		Instant at, String text) {

	public static final String NEW = "NEW";
	public static final String CANCELLED_BY_CUSTOMER = "CANCELLED_BY_CUSTOMER";

	public FeedEvent withText(String newText) {
		return new FeedEvent(kind, reservationId, code, restaurantSlug, restaurantName, customerName, partySize, date,
				shiftName, arrivalTime, tableLabel, at, newText);
	}

}
