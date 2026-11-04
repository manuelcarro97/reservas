package io.github.manuelcarro97.reservas.adapter.out.notification;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

class LoggingNotificationAdapterTest {

	private static final String TEXT = "[La Mesa del Puerto] Nueva reserva: Ana Lopez Garcia, 2 personas, "
			+ "cena del viernes 4, mesa 3";

	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
	private final Logger adapterLogger = (Logger) LoggerFactory.getLogger(LoggingNotificationAdapter.class);

	@BeforeEach
	void captureLogs() {
		logs.start();
		adapterLogger.addAppender(logs);
	}

	@AfterEach
	void releaseLogs() {
		adapterLogger.detachAppender(logs);
	}

	private String logged() {
		return logs.list.stream().map(ILoggingEvent::getFormattedMessage).reduce("", (all, line) -> all + line + "\n");
	}

	@Test
	void logsThatAnAlertWasRaisedButNeverTheCustomerName() {
		new LoggingNotificationAdapter().notifyOwner("owner-uid-123", TEXT);

		assertThat(logs.list).hasSize(1);
		assertThat(logged()).contains("Owner notification")
			.doesNotContain("Ana")
			.doesNotContain("Lopez")
			.doesNotContain(TEXT);
	}

	@Test
	void doesNotLogTheOwnerUid() {
		new LoggingNotificationAdapter().notifyOwner("owner-uid-123", TEXT);

		assertThat(logged()).doesNotContain("owner-uid-123");
	}

	@Test
	void controlCharactersInTheTextCannotForgeLogLines() {
		new LoggingNotificationAdapter().notifyOwner("owner-uid-123", "Ana\nERROR forged line");

		assertThat(logs.list).hasSize(1);
		assertThat(logged()).doesNotContain("forged");
	}

}
