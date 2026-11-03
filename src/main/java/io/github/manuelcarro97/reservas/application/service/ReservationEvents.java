package io.github.manuelcarro97.reservas.application.service;

import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import io.github.manuelcarro97.reservas.application.port.in.FeedEvent;
import io.github.manuelcarro97.reservas.application.port.out.NotificationPort;
import io.github.manuelcarro97.reservas.config.AsyncConfig;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;

/**
 * Avisos al dueño por acciones del cliente. El servicio publica el aviso dentro de su transacción y este listener lo
 * envía solo si la transacción se confirma: un 409 o un 422 que hace rollback no avisa. Las acciones del propio dueño
 * no pasan por aquí. El envío es asíncrono.
 */
@Component
class ReservationEvents {

	private static final Logger log = LoggerFactory.getLogger(ReservationEvents.class);

	/** Aviso ya redactado para un dueño; no lleva datos de contacto del cliente. */
	record OwnerAlert(String ownerUid, String text) {
	}

	private final ApplicationEventPublisher publisher;
	private final NotificationPort notifications;

	ReservationEvents(ApplicationEventPublisher publisher, NotificationPort notifications) {
		this.publisher = publisher;
		this.notifications = notifications;
	}

	/** Evento del feed de una reserva con su texto; lo usan el feed del panel y los avisos. */
	static FeedEvent feedEvent(String kind, Restaurant restaurant, String shiftName, String tableLabel,
			Reservation reservation, Instant at) {
		FeedEvent draft = new FeedEvent(kind, reservation.id(), reservation.code(), restaurant.slug(),
				restaurant.name(), reservation.customerName(), reservation.partySize(), reservation.date(), shiftName,
				tableLabel, at, null);
		return draft.withText(NotificationText.of(draft));
	}

	/** Exige una transacción activa; fuera de ella el aviso se descarta. */
	void newReservation(Restaurant restaurant, String shiftName, String tableLabel, Reservation reservation) {
		publish(restaurant, feedEvent(FeedEvent.NEW, restaurant, shiftName, tableLabel, reservation,
				reservation.createdAt()));
	}

	/** Exige una transacción activa; fuera de ella el aviso se descarta. */
	void cancelledByCustomer(Restaurant restaurant, String shiftName, String tableLabel, Reservation reservation) {
		publish(restaurant, feedEvent(FeedEvent.CANCELLED_BY_CUSTOMER, restaurant, shiftName, tableLabel, reservation,
				reservation.cancelledByCustomerAt()));
	}

	private void publish(Restaurant restaurant, FeedEvent event) {
		// Un plano sin dueño (datos de demo antiguos) no tiene a quién avisar.
		if (restaurant.ownerUid() != null) {
			publisher.publishEvent(new OwnerAlert(restaurant.ownerUid(), event.text()));
		}
	}

	/**
	 * Después del commit y en segundo plano: una llamada lenta al canal no retrasa la respuesta al cliente. Si la cola de
	 * avisos está llena, el aviso se descarta y se registra (ver {@link AsyncConfig}).
	 */
	@Async(AsyncConfig.NOTIFICATION_EXECUTOR)
	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	void send(OwnerAlert alert) {
		try {
			notifications.notifyOwner(alert.ownerUid(), alert.text());
		}
		catch (RuntimeException failure) {
			// Nunca el mensaje ni la traza completa: el de un canal externo puede traer URLs con credenciales.
			// Clase y primer frame bastan para saber dónde falló.
			StackTraceElement[] frames = failure.getStackTrace();
			log.warn("Owner notification failed: {} at {}", failure.getClass().getName(),
					frames.length > 0 ? frames[0] : "unknown");
		}
	}

}
