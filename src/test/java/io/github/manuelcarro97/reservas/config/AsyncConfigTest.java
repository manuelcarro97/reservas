package io.github.manuelcarro97.reservas.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** El executor de avisos está acotado y, lleno, descarta y registra: nunca bloquea ni lanza a quien envía. */
@ExtendWith(OutputCaptureExtension.class)
class AsyncConfigTest {

	@Test
	void fullQueueDropsTheAlertAndLogsInsteadOfBlockingOrThrowing(CapturedOutput output) throws Exception {
		ThreadPoolTaskExecutor executor = new AsyncConfig().notificationExecutor();
		executor.initialize();
		CountDownLatch release = new CountDownLatch(1);
		AtomicBoolean droppedTaskRan = new AtomicBoolean();
		try {
			Runnable blocked = () -> {
				try {
					release.await(10, TimeUnit.SECONDS);
				}
				catch (InterruptedException interrupted) {
					Thread.currentThread().interrupt();
				}
			};
			// 1 en el hilo core, 100 en la cola y 1 más que abre el segundo hilo: el pool está al límite.
			for (int i = 0; i < 102; i++) {
				executor.execute(blocked);
			}
			assertThat(output.getAll()).doesNotContain("queue is full");

			long start = System.nanoTime();
			assertThatCode(() -> executor.execute(() -> droppedTaskRan.set(true))).doesNotThrowAnyException();
			Duration elapsed = Duration.ofNanos(System.nanoTime() - start);

			assertThat(elapsed).isLessThan(Duration.ofSeconds(1));
			assertThat(output.getAll()).contains("Owner notification queue is full, alert dropped");
		}
		finally {
			release.countDown();
			executor.shutdown();
		}
		assertThat(executor.getThreadPoolExecutor().awaitTermination(5, TimeUnit.SECONDS)).isTrue();
		assertThat(droppedTaskRan).isFalse();
	}

	/** Un executor ya parado (cierre de la app) rechaza por eso, no por cola llena: el log no debe mentir. */
	@Test
	void shutDownExecutorSaysSoInsteadOfQueueFull(CapturedOutput output) {
		ThreadPoolTaskExecutor executor = new AsyncConfig().notificationExecutor();
		executor.initialize();
		executor.shutdown();

		assertThatCode(() -> executor.execute(() -> {
		})).doesNotThrowAnyException();

		assertThat(output.getAll()).contains("Owner notification executor is shut down, alert dropped")
			.doesNotContain("queue is full");
	}

}
