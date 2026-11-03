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
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import io.github.manuelcarro97.reservas.adapter.out.notification.TelegramException;
import io.github.manuelcarro97.reservas.adapter.out.notification.Update;
import io.github.manuelcarro97.reservas.application.port.in.TelegramLinkUseCase;
import io.github.manuelcarro97.reservas.support.FakeTelegramClient;

@ExtendWith(OutputCaptureExtension.class)
class TelegramPollingJobTest {

	private static final String REPLY = "Avisos de reservas vinculados.";
	private static final String INVALID_REPLY = "Enlace caducado o no válido. Genera uno nuevo desde el panel.";

	private final FakeTelegramClient client = FakeTelegramClient.create();
	private final TelegramLinkUseCase telegram = mock(TelegramLinkUseCase.class);
	private TelegramPollingJob job;

	@BeforeEach
	void setUp() {
		job = new TelegramPollingJob(client, telegram);
	}

	private static Update message(long updateId, long chatId, String text) {
		return new Update(updateId, new Update.Message(new Update.Chat(chatId), text));
	}

	@Test
	void startCommandLinksTheChatAndReplies() {
		when(telegram.handleStart(42, "abc-DEF_123")).thenReturn(true);
		client.queue(message(5, 42, "/start abc-DEF_123"));

		job.poll();

		verify(telegram).handleStart(42, "abc-DEF_123");
		assertThat(client.sent()).containsExactly(new FakeTelegramClient.Sent(42, REPLY));
	}

	@Test
	void startCommandThatDidNotLinkRepliesWithTheInvalidLinkText() {
		when(telegram.handleStart(42, "abc")).thenReturn(false);
		client.queue(message(5, 42, "/start abc"));

		job.poll();

		assertThat(client.sent()).containsExactly(new FakeTelegramClient.Sent(42, INVALID_REPLY));
	}

	/** Un /start sin enlace (quien abre el bot a mano) o cualquier otro texto: no vincula nada y no se contesta. */
	@Test
	void startWithoutTokenAndOtherCommandsAreIgnoredWithoutReply() {
		client.queue(message(1, 42, "/start"), message(2, 42, "/help"), message(3, 42, "hola"));

		job.poll();

		verifyNoInteractions(telegram);
		assertThat(client.sent()).isEmpty();
	}

	@Test
	void startCommandAddressedToTheBotIsAccepted() {
		client.queue(message(5, 42, "/start@reservas_test_bot abc"));

		job.poll();

		verify(telegram).handleStart(42, "abc");
	}

	@Test
	void offsetAdvancesToLastUpdateIdPlusOneOnlyAfterProcessing() {
		client.queue(message(5, 42, "/start abc"), message(6, 42, "hola"));

		job.poll();
		job.poll();

		// La primera consulta pide desde 0; la segunda, desde el último procesado + 1.
		assertThat(client.requestedOffsets()).containsExactly(0L, 7L);
		// El /start no se procesa dos veces.
		verify(telegram, times(1)).handleStart(42, "abc");
	}

	@Test
	void otherMessagesAreIgnored() {
		client.queue(message(1, 42, "hola"), message(2, 42, "/start"), message(3, 42, "/start   "),
				message(4, 42, null), new Update(5, null));

		job.poll();

		verifyNoInteractions(telegram);
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
		client.queue(message(9, 42, "/start abc"));
		job.poll();

		verify(telegram).handleStart(42, "abc");
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
		client.queue(message(5, 42, "/start abc"), message(6, 43, "/start def"));
		doThrow(new IllegalStateException("base de datos caída")).when(telegram).handleStart(42, "abc");

		assertThatCode(job::poll).doesNotThrowAnyException();

		assertThat(output.getAll()).contains("Telegram update failed");
		// No se avanzó: el /start fallido y los siguientes se reintentan.
		verify(telegram, never()).handleStart(43, "def");
		reset(telegram);
		job.poll();

		assertThat(client.requestedOffsets()).containsExactly(0L, 0L);
		verify(telegram).handleStart(42, "abc");
		verify(telegram).handleStart(43, "def");
	}

	@Test
	void failureSendingTheReplyDoesNotBlockTheOffset(CapturedOutput output) {
		client.queue(message(5, 42, "/start abc"));
		client.failSending();

		assertThatCode(job::poll).doesNotThrowAnyException();
		job.poll();

		// El aviso de vinculado es un extra: si falla, la actualización ya está procesada y no se repite.
		verify(telegram, times(1)).handleStart(42, "abc");
		assertThat(client.requestedOffsets()).containsExactly(0L, 6L);
		assertThat(output.getAll()).doesNotContain(FakeTelegramClient.TOKEN).doesNotContain("api.telegram.org");
	}

	@Test
	void neverLogsTheLinkTokenOrTheChatId(CapturedOutput output) {
		client.queue(message(5, 424242, "/start SECRETLINKTOKEN"));
		client.failSending();
		doThrow(new IllegalStateException("fallo")).when(telegram).handleStart(anyLong(), anyString());

		job.poll();

		assertThat(output.getAll()).doesNotContain("SECRETLINKTOKEN").doesNotContain("424242");
	}

}
