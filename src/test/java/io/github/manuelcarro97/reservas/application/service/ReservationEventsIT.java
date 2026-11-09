package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import io.github.manuelcarro97.reservas.application.port.out.NotificationPort;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * El aviso sale solo después de confirmar la transacción, en segundo plano, y un fallo del canal no deja secretos en
 * el log. Como el envío es asíncrono, lo que se espera se verifica con {@code timeout}; lo que no debe salir se
 * comprueba con un aviso posterior, que el hilo de avisos entrega por orden.
 */
@ExtendWith(OutputCaptureExtension.class)
// En DEBUG saldría cualquier detalle extra que el listener escribiera.
@TestPropertySource(properties = "logging.level.io.github.manuelcarro97=DEBUG")
class ReservationEventsIT extends PostgresIT {

	private static final long WAIT_MS = 5000;
	private static final ReservationEvents.OwnerAlert ALERT = new ReservationEvents.OwnerAlert("owner-a", "aviso");
	private static final ReservationEvents.OwnerAlert LATER = new ReservationEvents.OwnerAlert("owner-a", "despues");

	@Autowired
	private ApplicationEventPublisher publisher;

	@Autowired
	private PlatformTransactionManager transactionManager;

	@MockitoBean
	private NotificationPort notifications;

	private void publishInTransaction(ReservationEvents.OwnerAlert alert, boolean rollback) {
		new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
			publisher.publishEvent(alert);
			// Dentro de la transacción todavía no se ha enviado este aviso.
			verify(notifications, never()).notifyOwner(any(), eq(alert.text()));
			if (rollback) {
				status.setRollbackOnly();
			}
		});
	}

	@Test
	void alertIsSentOnceAfterCommit() {
		publishInTransaction(ALERT, false);

		verify(notifications, timeout(WAIT_MS)).notifyOwner("owner-a", "aviso");
		// Una sola vez: el aviso posterior llega después y no hay un segundo "aviso" por delante.
		publishInTransaction(LATER, false);
		verify(notifications, timeout(WAIT_MS)).notifyOwner("owner-a", "despues");
		verify(notifications).notifyOwner("owner-a", "aviso");
		verifyNoMoreInteractions(notifications);
	}

	/**
	 * Distingue AFTER_COMMIT de BEFORE_COMMIT: al enviar, lo escrito en la transacción ya lo ve otra conexión. El envío
	 * es asíncrono y con BEFORE_COMMIT el hilo de avisos arrancaría casi a la vez que el commit; para que la prueba no
	 * dependa de esa carrera, la transacción espera (hasta 1 s) a que el aviso haya consultado antes de confirmar.
	 * Con BEFORE_COMMIT el aviso consulta durante esa espera y ve 0; con AFTER_COMMIT la espera vence, se confirma y
	 * el aviso ve 1.
	 */
	@Test
	void alertIsSentWhenTheTransactionsWritesAreVisibleToOthers() {
		long restaurantId = givenRestaurant("demo").id();
		AtomicInteger closuresSeenByOthers = new AtomicInteger(-1);
		CountDownLatch queried = new CountDownLatch(1);
		doAnswer(invocation -> {
			// Hilo de avisos, sin transacción: otra conexión que solo ve lo ya confirmado.
			closuresSeenByOthers.set(jdbc.sql("SELECT count(*) FROM closure").query(Integer.class).single());
			queried.countDown();
			return null;
		}).when(notifications).notifyOwner(any(), any());

		new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
			jdbc.sql("INSERT INTO closure (restaurant_id, date, reason) VALUES (:id, DATE '2026-12-25', 'Navidad')")
				.param("id", restaurantId)
				.update();
			publisher.publishEvent(ALERT);
			// Se registra después del listener: su beforeCommit ya ha corrido cuando esta espera empieza.
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
				@Override
				public void beforeCompletion() {
					try {
						queried.await(1, TimeUnit.SECONDS);
					}
					catch (InterruptedException interrupted) {
						Thread.currentThread().interrupt();
					}
				}
			});
		});

		verify(notifications, timeout(WAIT_MS)).notifyOwner("owner-a", "aviso");
		Awaitility.await().atMost(Duration.ofSeconds(5)).until(() -> closuresSeenByOthers.get() != -1);
		assertThat(closuresSeenByOthers).hasValue(1);
	}

	@Test
	void alertIsNotSentOnRollback() {
		publishInTransaction(ALERT, true);
		// El aviso de una transacción confirmada después llega por el mismo hilo: si el anterior existiera, ya habría salido.
		publishInTransaction(LATER, false);

		verify(notifications, timeout(WAIT_MS)).notifyOwner("owner-a", "despues");
		verifyNoMoreInteractions(notifications);
	}

	@Test
	void failureLogsNeitherMessageNorStackTrace(CapturedOutput output) {
		doThrow(new IllegalStateException("POST https://api.telegram.org/bot123:SECRET/sendMessage failed"))
			.when(notifications)
			.notifyOwner(any(), any());

		publishInTransaction(ALERT, false);

		verify(notifications, timeout(WAIT_MS)).notifyOwner("owner-a", "aviso");
		Awaitility.await()
			.atMost(Duration.ofSeconds(5))
			.untilAsserted(() -> assertThat(output.getAll()).contains("Owner notification failed"));
		assertThat(output.getAll()).doesNotContain("SECRET").doesNotContain("api.telegram.org").doesNotContain("\tat ");
	}

}
