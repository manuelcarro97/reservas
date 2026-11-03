package io.github.manuelcarro97.reservas.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Hilos propios para los avisos al dueño. Un canal externo lento no debe retrasar la respuesta al cliente ni retener
 * una conexión del pool, y un canal caído no debe acumular hilos: el pool y la cola están acotados.
 */
@Configuration(proxyBeanMethods = false)
@EnableAsync
public class AsyncConfig {

	public static final String NOTIFICATION_EXECUTOR = "notificationExecutor";

	private static final Logger log = LoggerFactory.getLogger(AsyncConfig.class);

	@Bean(NOTIFICATION_EXECUTOR)
	ThreadPoolTaskExecutor notificationExecutor() {
		ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
		executor.setThreadNamePrefix("owner-alert-");
		executor.setCorePoolSize(1);
		executor.setMaxPoolSize(2);
		executor.setQueueCapacity(100);
		// Cola llena: se descarta el aviso y se registra. Nunca bloquea ni lanza al hilo de la petición.
		executor.setRejectedExecutionHandler(
				(task, pool) -> log.warn("Owner notification queue is full, alert dropped"));
		executor.setWaitForTasksToCompleteOnShutdown(true);
		executor.setAwaitTerminationSeconds(5);
		return executor;
	}

}
