package io.github.manuelcarro97.reservas.adapter.in.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.annotation.Scheduled;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import io.github.manuelcarro97.reservas.application.port.in.ResetDemoUseCase;
import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderException;

class DemoResetJobTest {

	private static final String UID = "demo-owner";
	private static final String SECRET = "super-secret-password-do-not-log";

	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
	private final Logger jobLogger = (Logger) LoggerFactory.getLogger(DemoResetJob.class);
	private final AtomicInteger resets = new AtomicInteger();

	@BeforeEach
	void captureLogs() {
		logs.start();
		jobLogger.addAppender(logs);
	}

	@AfterEach
	void releaseLogs() {
		jobLogger.detachAppender(logs);
	}

	private DemoResetJob jobThatFailsWith(RuntimeException failure) {
		return new DemoResetJob(() -> {
			resets.incrementAndGet();
			throw failure;
		}, UID);
	}

	private String warnings() {
		return logs.list.stream()
			.filter(event -> event.getLevel() == Level.WARN)
			.map(ILoggingEvent::getFormattedMessage)
			.reduce("", (all, message) -> all + message + "\n");
	}

	@Test
	void restoresOnStartupAndEveryNight() {
		DemoResetJob job = new DemoResetJob(() -> {
			resets.incrementAndGet();
			return UID;
		}, UID);

		job.resetOnStartup();
		job.resetNightly();

		assertThat(resets).hasValue(2);
	}

	@Test
	void nightlyCronIsFourInTheMorningInMadrid() throws NoSuchMethodException {
		Scheduled scheduled = DemoResetJob.class.getDeclaredMethod("resetNightly").getAnnotation(Scheduled.class);

		assertThat(scheduled.cron()).isEqualTo("0 0 4 * * *");
		assertThat(scheduled.zone()).isEqualTo("Europe/Madrid");
	}

	@Test
	void identityFailureIsLoggedWithUidAndCodesOnlyAndDoesNotEscape() {
		DemoResetJob job = jobThatFailsWith(new IdentityProviderException("ensureUser", "UNAVAILABLE, UNKNOWN"));

		assertThatCode(job::resetOnStartup).doesNotThrowAnyException();
		assertThatCode(job::resetNightly).doesNotThrowAnyException();

		assertThat(resets).hasValue(2);
		assertThat(warnings()).contains(UID).contains("ensureUser (UNAVAILABLE, UNKNOWN)");
	}

	@Test
	void otherFailuresLogOnlyTheClassAndNeverTheMessage() {
		DemoResetJob job = jobThatFailsWith(new IllegalStateException("password=" + SECRET));

		assertThatCode(job::resetOnStartup).doesNotThrowAnyException();

		assertThat(warnings()).contains(UID).contains(IllegalStateException.class.getName()).doesNotContain(SECRET);
		assertThat(logs.list).allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
	}

	@Test
	void errorsAreNotSwallowedAsFailures() {
		DemoResetJob job = new DemoResetJob(() -> {
			throw new OutOfMemoryError("boom");
		}, UID);

		assertThatThrownBy(job::resetNightly).isInstanceOf(OutOfMemoryError.class);
	}

	private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
		.withBean(ResetDemoUseCase.class, () -> () -> UID)
		.withUserConfiguration(DemoResetJob.class)
		.withPropertyValues("app.demo.uid=" + UID);

	@Test
	void withoutTheDemoFlagThereIsNoJob() {
		contextRunner.run(context -> assertThat(context).doesNotHaveBean(DemoResetJob.class));
		contextRunner.withPropertyValues("app.demo.enabled=false")
			.run(context -> assertThat(context).doesNotHaveBean(DemoResetJob.class));
		contextRunner.withPropertyValues("app.demo.enabled=")
			.run(context -> assertThat(context).doesNotHaveBean(DemoResetJob.class));
	}

	@Test
	void withTheDemoFlagThereIsAJob() {
		contextRunner.withPropertyValues("app.demo.enabled=true")
			.run(context -> assertThat(context).hasSingleBean(DemoResetJob.class));
	}

}
