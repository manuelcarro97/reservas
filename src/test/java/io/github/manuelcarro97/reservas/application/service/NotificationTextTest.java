package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import io.github.manuelcarro97.reservas.application.port.in.FeedEvent;

class NotificationTextTest {

	private static final LocalDate FRIDAY = LocalDate.of(2026, 12, 4);

	private static FeedEvent event(String kind, int partySize, String tableLabel) {
		return new FeedEvent(kind, 1L, "PUERTO-ABCDEFGH23456789", "puerto", "La Mesa del Puerto", "Ana", partySize,
				FRIDAY, "Cena", tableLabel, Instant.parse("2026-12-01T09:00:00Z"), null);
	}

	@Test
	void newReservation() {
		assertThat(NotificationText.newReservation(event("NEW", 4, "3")))
			.isEqualTo("[La Mesa del Puerto] Nueva reserva: Ana, 4 personas, cena del viernes 4, mesa 3");
	}

	@Test
	void newReservationWithoutTable() {
		assertThat(NotificationText.newReservation(event("NEW", 4, null)))
			.isEqualTo("[La Mesa del Puerto] Nueva reserva: Ana, 4 personas, cena del viernes 4, sin mesa");
	}

	@Test
	void singlePersonIsSingular() {
		assertThat(NotificationText.newReservation(event("NEW", 1, "3"))).contains("Ana, 1 persona,");
	}

	@Test
	void cancelled() {
		assertThat(NotificationText.cancelled(event("CANCELLED_BY_CUSTOMER", 4, "3")))
			.isEqualTo("[La Mesa del Puerto] Reserva cancelada por el cliente: Ana, 4 personas, cena del viernes 4");
	}

}
