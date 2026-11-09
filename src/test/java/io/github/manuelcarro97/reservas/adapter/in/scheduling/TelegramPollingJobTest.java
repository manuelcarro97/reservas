package io.github.manuelcarro97.reservas.adapter.in.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import io.github.manuelcarro97.reservas.adapter.out.notification.TelegramException;
import io.github.manuelcarro97.reservas.adapter.out.notification.Update;
import io.github.manuelcarro97.reservas.application.port.in.TelegramLinkUseCase;
import io.github.manuelcarro97.reservas.support.FakeTelegramClient;

@ExtendWith(OutputCaptureExtension.class)
class TelegramPollingJobTest {

	private static final String REPLY = "Avisos de reservas vinculados.";
	private static final String INVALID_REPLY = "Enlace caducado o no válido. Genera uno nuevo desde el panel.";
	/** Enlaces con el formato real: 32 caracteres de {@code A-Za-z0-9_-}. */
	private static final String TOKEN = "abc-DEF_123abc-DEF_123abc-DEF_12";
	private static final String OTHER_TOKEN = "z".repeat(32);

	private final FakeTelegramClient client = FakeTelegramClient.create();
	private final TelegramLinkUseCase telegram = mock(TelegramLinkUseCase.class);
	private TelegramPollingJob job;

	@BeforeEach
	void setUp() {
		// Por defecto hay un enlace pendiente: sin él el job no consulta.
		when(telegram.hasPendingLinks()).thenReturn(true);
		job = new TelegramPollingJob(client, telegram);
	}

	/** El bot solo avisa: sin enlaces pendientes no se llama a Telegram, ni siquiera hay offset que pedir. */
	@Test
	void withoutPendingLinksTelegramIsNotCalled() {
		when(telegram.hasPendingLinks()).thenReturn(false);
		client.queue(message(5, 42, "/start " + TOKEN));

		job.poll();
		job.poll();

		assertThat(client.requestedOffsets()).isEmpty();
		verify(telegram, never()).handleStart(anyLong(), anyString());
		assertThat(client.sent()).isEmpty();
	}

	@Test
	void pollingStartsWhenALinkAppearsAndStopsWhenItIsGone() {
		when(telegram.hasPendingLinks()).thenReturn(false, true, true, false);

		job.poll();
		job.poll();
		job.poll();
		job.poll();

		assertThat(client.requestedOffsets()).hasSize(2);
	}

	/** Si no se puede ni saber si hay enlaces (base de datos caída) es un fallo más: se registra y no sale del job. */
	@Test
	void failureCheckingPendingLinksIsLoggedAndDoesNotEscape(CapturedOutput output) {
		when(telegram.hasPendingLinks()).thenThrow(new IllegalStateException("base de datos caída"));

		assertThatCode(job::poll).doesNotThrowAnyException();

		assertThat(output.getAll()).contains("Telegram polling failed").contains("IllegalStateException");
		assertThat(client.requestedOffsets()).isEmpty();
	}

	private static Update message(long updateId, long chatId, String text) {
		return new Update(updateId, new Update.Message(new Update.Chat(chatId), text));
	}

	@Test
	void startCommandLinksTheChatAndReplies() {
		when(telegram.handleStart(42, TOKEN)).thenReturn(true);
		client.queue(message(5, 42, "/start " + TOKEN));

		job.poll();

		verify(telegram).handleStart(42, TOKEN);
		assertThat(client.sent()).containsExactly(new FakeTelegramClient.Sent(42, REPLY));
	}

	@Test
	void startCommandThatDidNotLinkRepliesWithTheInvalidLinkText() {
		when(telegram.handleStart(42, TOKEN)).thenReturn(false);
		client.queue(message(5, 42, "/start " + TOKEN));

		job.poll();

		assertThat(client.sent()).containsExactly(new FakeTelegramClient.Sent(42, INVALID_REPLY));
	}

	/** Un /start sin enlace (quien abre el bot a mano) o cualquier otro texto: no vincula nada y no se contesta. */
	@Test
	void startWithoutTokenAndOtherCommandsAreIgnoredWithoutReply() {
		client.queue(message(1, 42, "/start"), message(2, 42, "/help"), message(3, 42, "hola"));

		job.poll();

		verify(telegram, never()).handleStart(anyLong(), anyString());
		assertThat(client.sent()).isEmpty();
	}

	@Test
	void startCommandAddressedToTheBotIsAccepted() {
		client.queue(message(5, 42, "/start@reservas_test_bot " + TOKEN));

		job.poll();

		verify(telegram).handleStart(42, TOKEN);
	}

	/**
	 * Un enlace con formato que este sistema nunca genera (0x00, que Postgres rechaza; demasiado corto o largo;
	 * caracteres fuera del alfabeto) no llega a la base de datos: se contesta el error genérico y se confirma. Si no, una
	 * actualización que siempre fallara bloquearía para siempre todos los /start de detrás.
	 */
	@Test
	void malformedTokensAreRejectedWithoutTouchingTheDatabaseAndDoNotBlockTheOnesBehind() {
		when(telegram.handleStart(44, TOKEN)).thenReturn(true);
		client.queue(message(1, 41, "/start ab\u0000cd"), message(2, 41, "/start " + TOKEN.substring(1)),
				message(3, 42, "/start " + TOKEN + "x"), message(4, 43, "/start " + "ñ".repeat(32)),
				message(5, 45, "/start " + "a".repeat(31) + "/"), message(6, 44, "/start " + TOKEN));

		job.poll();

		// Solo el legítimo llega a handleStart; los cinco malformados reciben el error y no tocan nada.
		verify(telegram, times(1)).handleStart(anyLong(), anyString());
		verify(telegram).handleStart(44, TOKEN);
		assertThat(client.sent()).containsExactly(new FakeTelegramClient.Sent(41, INVALID_REPLY),
				new FakeTelegramClient.Sent(41, INVALID_REPLY), new FakeTelegramClient.Sent(42, INVALID_REPLY),
				new FakeTelegramClient.Sent(43, INVALID_REPLY), new FakeTelegramClient.Sent(45, INVALID_REPLY),
				new FakeTelegramClient.Sent(44, REPLY));
		// El offset avanza hasta el último: nada se vuelve a pedir.
		job.poll();
		assertThat(client.requestedOffsets()).containsExactly(0L, 7L);
	}

	@Test
	void offsetAdvancesToLastUpdateIdPlusOneOnlyAfterProcessing() {
		client.queue(message(5, 42, "/start " + TOKEN), message(6, 42, "hola"));

		job.poll();
		job.poll();

		// La primera consulta pide desde 0; la segunda, desde el último procesado + 1.
		assertThat(client.requestedOffsets()).containsExactly(0L, 7L);
		// El /start no se procesa dos veces.
		verify(telegram, times(1)).handleStart(42, TOKEN);
	}

	@Test
	void otherMessagesAreIgnored() {
		client.queue(message(1, 42, "hola"), message(2, 42, "/start"), message(3, 42, "/start   "),
				message(4, 42, null), new Update(5, null));

		job.poll();

		verify(telegram, never()).handleStart(anyLong(), anyString());
		assertThat(client.sent()).isEmpty();
		// Aun así se confirman: no se vuelven a pedir.
		job.poll();
		assertThat(client.requestedOffsets()).containsExactly(0L, 6L);
	}

	@Test
	void getUpdatesFailureIsLoggedWithoutTheTokenAndTheNextRunContinues(CapturedOutput output) {
		client.failGetUpdates(new TelegramException("Telegram getUpdates failed (HTTP 502)"));

		assertThatCode(job::poll).doesNotThrowAnyException();

		assertThat(output.getAll()).contains("Telegram polling failed").contains("HTTP 502");
		assertThat(output.getAll()).doesNotContain(FakeTelegramClient.TOKEN).doesNotContain("api.telegram.org");

		// En la siguiente ejecución el job sigue y, como no se confirmó nada, vuelve a pedir desde el mismo offset.
		client.stopFailingGetUpdates();
		client.queue(message(9, 42, "/start " + TOKEN));
		job.poll();

		verify(telegram).handleStart(42, TOKEN);
		assertThat(client.requestedOffsets()).containsExactly(0L, 0L);
	}

	@Test
	void unexpectedFailureIsLoggedWithClassOnly(CapturedOutput output) {
		client.failGetUpdates(new IllegalStateException("POST https://api.telegram.org/bot123456:SECRET/getUpdates"));

		assertThatCode(job::poll).doesNotThrowAnyException();

		assertThat(output.getAll()).contains("Telegram polling failed").contains("IllegalStateException");
		assertThat(output.getAll()).doesNotContain("SECRET").doesNotContain("api.telegram.org");
	}

	@Test
	void failureWhileLinkingKeepsTheUpdateForTheNextRun(CapturedOutput output) {
		client.queue(message(5, 42, "/start " + TOKEN), message(6, 43, "/start " + OTHER_TOKEN));
		doThrow(new IllegalStateException("base de datos caída")).when(telegram).handleStart(42, TOKEN);

		assertThatCode(job::poll).doesNotThrowAnyException();

		assertThat(output.getAll()).contains("Telegram update failed");
		// No se avanzó: el /start fallido y los siguientes se reintentan.
		verify(telegram, never()).handleStart(43, OTHER_TOKEN);
		reset(telegram);
		when(telegram.hasPendingLinks()).thenReturn(true);
		job.poll();

		assertThat(client.requestedOffsets()).containsExactly(0L, 0L);
		verify(telegram).handleStart(42, TOKEN);
		verify(telegram).handleStart(43, OTHER_TOKEN);
	}

	@Test
	void failureSendingTheReplyDoesNotBlockTheOffset(CapturedOutput output) {
		client.queue(message(5, 42, "/start " + TOKEN));
		client.failSending();

		assertThatCode(job::poll).doesNotThrowAnyException();
		job.poll();

		// El aviso de vinculado es un extra: si falla, la actualización ya está procesada y no se repite.
		verify(telegram, times(1)).handleStart(42, TOKEN);
		assertThat(client.requestedOffsets()).containsExactly(0L, 6L);
		assertThat(output.getAll()).doesNotContain(FakeTelegramClient.TOKEN).doesNotContain("api.telegram.org");
	}

	@Test
	void neverLogsTheLinkTokenOrTheChatId(CapturedOutput output) {
		client.queue(message(5, 424242, "/start " + TOKEN));
		client.failSending();
		doThrow(new IllegalStateException("fallo")).when(telegram).handleStart(anyLong(), anyString());

		job.poll();

		assertThat(output.getAll()).doesNotContain(TOKEN).doesNotContain("424242");
	}

	/** Registro del job con sus niveles, para ver los DEBUG que la configuración normal no muestra. */
	@Test
	void repeatedFailuresWarnOnlyOnTheFirstAndRecoveryIsInfo() {
		Logger jobLogger = (Logger) LoggerFactory.getLogger(TelegramPollingJob.class);
		Level previousLevel = jobLogger.getLevel();
		ListAppender<ILoggingEvent> events = new ListAppender<>();
		events.start();
		jobLogger.setLevel(Level.DEBUG);
		jobLogger.addAppender(events);
		try {
			client.failGetUpdates(new TelegramException("Telegram getUpdates failed (HTTP 502)"));

			job.poll();
			job.poll();
			job.poll();

			// El primero avisa; los seguidos van a DEBUG con la misma descripción.
			assertThat(levelsOf(events)).containsExactly(Level.WARN, Level.DEBUG, Level.DEBUG);
			assertThat(events.list).extracting(ILoggingEvent::getFormattedMessage)
				.containsOnly("Telegram polling failed: Telegram getUpdates failed (HTTP 502)");

			// Al recuperarse, un INFO; un fallo nuevo después vuelve a avisar.
			client.stopFailingGetUpdates();
			job.poll();
			client.failGetUpdates(new TelegramException("Telegram getUpdates failed (HTTP 502)"));
			job.poll();

			assertThat(levelsOf(events)).containsExactly(Level.WARN, Level.DEBUG, Level.DEBUG, Level.INFO, Level.WARN);
			assertThat(events.list.get(3).getFormattedMessage()).isEqualTo("Telegram polling recovered");
		}
		finally {
			jobLogger.detachAppender(events);
			jobLogger.setLevel(previousLevel);
		}
	}

	private static List<Level> levelsOf(ListAppender<ILoggingEvent> events) {
		return events.list.stream().map(ILoggingEvent::getLevel).toList();
	}

}
