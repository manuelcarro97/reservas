package io.github.manuelcarro97.reservas.application.service;

import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.Locale;

import io.github.manuelcarro97.reservas.application.port.in.FeedEvent;

/** Redacta los avisos al dueño; el panel y los canales externos muestran este mismo texto. */
final class NotificationText {

	private static final Locale SPANISH = Locale.forLanguageTag("es");
	private static final DateTimeFormatter ARRIVAL_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

	private NotificationText() {
	}

	/** El texto que corresponde al tipo del evento. */
	static String of(FeedEvent event) {
		return switch (event.kind()) {
			case FeedEvent.NEW -> newReservation(event);
			case FeedEvent.CANCELLED_BY_CUSTOMER -> cancelled(event);
			default -> throw new IllegalArgumentException("Unknown feed event kind: " + event.kind());
		};
	}

	static String newReservation(FeedEvent event) {
		String table = event.tableLabel() == null ? "sin mesa" : "mesa " + event.tableLabel();
		return "[%s] Nueva reserva: %s, %s, %s, %s".formatted(event.restaurantName(), event.customerName(),
				people(event), when(event), table);
	}

	static String cancelled(FeedEvent event) {
		return "[%s] Reserva cancelada por el cliente: %s, %s, %s".formatted(event.restaurantName(),
				event.customerName(), people(event), when(event));
	}

	private static String people(FeedEvent event) {
		return event.partySize() == 1 ? "1 persona" : event.partySize() + " personas";
	}

	/**
	 * "cena del viernes 4 a las 20:30": turno en minúsculas, día de la semana y del mes, y la hora de llegada si la
	 * reserva la tiene (las anteriores a que existiera no).
	 */
	private static String when(FeedEvent event) {
		String weekday = event.date().getDayOfWeek().getDisplayName(TextStyle.FULL, SPANISH);
		String day = "%s del %s %d".formatted(event.shiftName().toLowerCase(SPANISH), weekday,
				event.date().getDayOfMonth());
		return event.arrivalTime() == null ? day : day + " a las " + ARRIVAL_FORMAT.format(event.arrivalTime());
	}

}
