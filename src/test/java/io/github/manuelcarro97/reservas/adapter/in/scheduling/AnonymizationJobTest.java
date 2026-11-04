package io.github.manuelcarro97.reservas.adapter.in.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

class AnonymizationJobTest {

	private static final String SECRET = "Ana Lopez 600123456";

	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
	private final Logger jobLogger = (Logger) LoggerFactory.getLogger(AnonymizationJob.class);

	@BeforeEach
	void captureLogs() {
		logs.start();
		jobLogger.addAppender(logs);
	}

	@AfterEach
	void releaseLogs() {
		jobLogger.detachAppender(logs);
	}

	private String messages(Level level) {
		return logs.list.stream()
			.filter(event -> event.getLevel() == level)
			.map(ILoggingEvent::getFormattedMessage)
			.reduce("", (all, message) -> all + message + "\n");
	}

	@Test
	void runsAt0330MadridTime() throws Exception {
		Scheduled scheduled = AnonymizationJob.class.getDeclaredMethod("anonymizeOldReservations")
			.getAnnotation(Scheduled.class);

		assertThat(scheduled.cron()).isEqualTo("0 30 3 * * *");
		assertThat(scheduled.zone()).isEqualTo("Europe/Madrid");
	}

	@Test
	void alsoRunsWhenTheApplicationIsReady() throws Exception {
		EventListener listener = AnonymizationJob.class.getDeclaredMethod("anonymizeOnStartup")
			.getAnnotation(EventListener.class);

		assertThat(listener).isNotNull();
		assertThat(listener.value()).containsExactly(ApplicationReadyEvent.class);
	}

	@Test
	void startupRunAnonymizesOnceAndLogsOnlyTheNumberOfRows() {
		int[] calls = { 0 };
		AnonymizationJob job = new AnonymizationJob(() -> ++calls[0] + 4);

		job.anonymizeOnStartup();

		assertThat(calls[0]).isEqualTo(1);
		assertThat(messages(Level.INFO)).contains("5");
		assertThat(messages(Level.WARN)).isEmpty();
	}

	@Test
	void startupFailureWarnsWithoutMessageAndDoesNotStopTheApplication() {
		AnonymizationJob job = new AnonymizationJob(() -> {
			throw new IllegalStateException(SECRET, new IllegalArgumentException(SECRET));
		});

		assertThatCode(job::anonymizeOnStartup).doesNotThrowAnyException();

		assertThat(messages(Level.WARN)).contains(IllegalStateException.class.getName())
			.contains("caused by " + IllegalArgumentException.class.getName())
			.doesNotContain(SECRET);
	}

	@Test
	void logsOnlyTheNumberOfRows() {
		new AnonymizationJob(() -> 7).anonymizeOldReservations();

		assertThat(messages(Level.INFO)).contains("7");
		assertThat(messages(Level.WARN)).isEmpty();
	}

	@Test
	void failureLogsClassFirstFrameAndCauseClassesButNeverAMessage() {
		RuntimeException failure = new IllegalStateException(SECRET,
				new IllegalArgumentException(SECRET, new UnsupportedOperationException(SECRET)));
		AnonymizationJob job = new AnonymizationJob(() -> {
			throw failure;
		});

		assertThatCode(job::anonymizeOldReservations).doesNotThrowAnyException();

		String warning = messages(Level.WARN);
		assertThat(warning).contains(IllegalStateException.class.getName())
			.contains("caused by " + IllegalArgumentException.class.getName() + " <- "
					+ UnsupportedOperationException.class.getName())
			.contains("AnonymizationJobTest")
			.doesNotContain(SECRET);
		assertThat(logs.list).allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
	}

	@Test
	void afterAFailureTheNextRunStillWorks() {
		int[] calls = { 0 };
		AnonymizationJob job = new AnonymizationJob(() -> {
			if (calls[0]++ == 0) {
				throw new IllegalStateException(SECRET);
			}
			return 3;
		});

		job.anonymizeOldReservations();
		job.anonymizeOldReservations();

		assertThat(messages(Level.WARN)).isNotEmpty();
		assertThat(messages(Level.INFO)).contains("3");
	}

}
