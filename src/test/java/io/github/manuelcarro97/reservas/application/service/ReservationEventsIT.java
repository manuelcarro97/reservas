package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import io.github.manuelcarro97.reservas.application.port.out.NotificationPort;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/** El aviso sale solo después de confirmar la transacción y un fallo del canal no deja secretos en el log. */
@ExtendWith(OutputCaptureExtension.class)
// En DEBUG saldría cualquier detalle extra que el listener escribiera.
@TestPropertySource(properties = "logging.level.io.github.manuelcarro97=DEBUG")
class ReservationEventsIT extends PostgresIT {

	private static final ReservationEvents.OwnerAlert ALERT = new ReservationEvents.OwnerAlert("owner-a", "aviso");

	@Autowired
	private ApplicationEventPublisher publisher;

	@Autowired
	private PlatformTransactionManager transactionManager;

	@MockitoBean
	private NotificationPort notifications;

	private void publishInTransaction(boolean rollback) {
		new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
			publisher.publishEvent(ALERT);
			// Dentro de la transacción todavía no se ha enviado nada.
			verifyNoInteractions(notifications);
			if (rollback) {
				status.setRollbackOnly();
			}
		});
	}

	@Test
	void alertIsSentOnceAfterCommit() {
		publishInTransaction(false);

		verify(notifications).notifyOwner("owner-a", "aviso");
	}

	/** Distingue AFTER_COMMIT de BEFORE_COMMIT: al enviar, lo escrito en la transacción ya lo ve otra conexión. */
	@Test
	void alertIsSentWhenTheTransactionsWritesAreVisibleToOthers() throws Exception {
		long restaurantId = givenRestaurant("demo").id();
		AtomicInteger closuresSeenByOthers = new AtomicInteger(-1);
		doAnswer(invocation -> {
			// Otro hilo, otra conexión: solo ve lo ya confirmado.
			ExecutorService other = Executors.newSingleThreadExecutor();
			try {
				closuresSeenByOthers.set(other
					.submit(() -> jdbc.sql("SELECT count(*) FROM closure").query(Integer.class).single())
					.get());
			}
			finally {
				other.shutdown();
			}
			return null;
		}).when(notifications).notifyOwner(any(), any());

		new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
			jdbc.sql("INSERT INTO closure (restaurant_id, date, reason) VALUES (:id, DATE '2026-12-25', 'Navidad')")
				.param("id", restaurantId)
				.update();
			publisher.publishEvent(ALERT);
		});

		verify(notifications).notifyOwner("owner-a", "aviso");
		assertThat(closuresSeenByOthers).hasValue(1);
	}

	@Test
	void alertIsNotSentOnRollback() {
		publishInTransaction(true);

		verifyNoInteractions(notifications);
	}

	@Test
	void failureLogsNeitherMessageNorStackTrace(CapturedOutput output) {
		doThrow(new IllegalStateException("POST https://api.telegram.org/bot123:SECRET/sendMessage failed"))
			.when(notifications)
			.notifyOwner(any(), any());

		publishInTransaction(false);

		verify(notifications).notifyOwner("owner-a", "aviso");
		assertThat(output.getAll()).contains("Owner notification failed").doesNotContain("SECRET")
			.doesNotContain("api.telegram.org")
			.doesNotContain("\tat ");
	}

}
