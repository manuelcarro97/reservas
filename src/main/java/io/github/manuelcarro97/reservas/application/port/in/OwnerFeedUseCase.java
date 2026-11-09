package io.github.manuelcarro97.reservas.application.port.in;

import java.time.Instant;
import java.util.List;

public interface OwnerFeedUseCase {

	/**
	 * Reservas nuevas y cancelaciones del cliente en los planos del dueño desde {@code since}, de más antiguo a más
	 * nuevo. {@code since} se acota a [ahora - 24 h, ahora] (uno futuro cuenta como ahora) y la consulta mira 10 s
	 * más atrás, por las reservas que se confirman tarde: el cliente deduplica por {@code reservationId} y
	 * {@code kind}. {@code now} es el {@code since} de la consulta siguiente.
	 */
	Feed feed(String ownerUid, Instant since);

	record Feed(Instant now, List<FeedEvent> events) {
	}

}
