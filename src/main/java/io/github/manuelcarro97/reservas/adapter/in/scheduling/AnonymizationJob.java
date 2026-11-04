package io.github.manuelcarro97.reservas.adapter.in.scheduling;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.application.port.in.AnonymizeReservationsUseCase;

/**
 * Cada noche a las 3:30 de Madrid anonimiza los datos del cliente de las reservas con más de 30 días. Corre en el
 * hilo del planificador, que comparten los demás jobs (la restauración de la demo es a las 4:00).
 * <p>
 * Solo registra cuántas filas cambió, nunca nombres ni teléfonos. Un fallo no sale del método: se registra un solo
 * WARN con la clase de la excepción, su primer frame y las clases de sus causas, nunca un mensaje (el de una librería
 * puede traer valores de la consulta), y el siguiente intento es el de la noche siguiente.
 */
@Component
class AnonymizationJob {

	private static final Logger log = LoggerFactory.getLogger(AnonymizationJob.class);

	private static final int MAX_CAUSE_DEPTH = 5;

	private final AnonymizeReservationsUseCase anonymize;

	AnonymizationJob(AnonymizeReservationsUseCase anonymize) {
		this.anonymize = anonymize;
	}

	@Scheduled(cron = "0 30 3 * * *", zone = "Europe/Madrid")
	void anonymizeOldReservations() {
		try {
			int rows = anonymize.anonymizeOld();
			log.info("Anonymized {} reservations older than 30 days", rows);
		}
		catch (RuntimeException failure) {
			StackTraceElement[] frames = failure.getStackTrace();
			log.warn("Anonymization failed: {} at {}{}", failure.getClass().getName(),
					frames.length > 0 ? frames[0] : "unknown", causeChain(failure));
		}
	}

	/**
	 * " caused by A <- B <- C": solo los nombres de clase de las causas, con tope de profundidad (una cadena larga o
	 * circular no alarga el log). Ningún mensaje.
	 */
	private static String causeChain(Throwable failure) {
		StringBuilder chain = new StringBuilder();
		Throwable cause = failure.getCause();
		for (int depth = 0; cause != null && depth < MAX_CAUSE_DEPTH; depth++) {
			chain.append(depth == 0 ? " caused by " : " <- ").append(cause.getClass().getName());
			cause = cause.getCause();
		}
		return chain.toString();
	}

}
