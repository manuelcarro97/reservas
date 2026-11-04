package io.github.manuelcarro97.reservas.adapter.in.scheduling;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.application.port.in.ResetDemoUseCase;
import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderException;

/**
 * Restaura la cuenta demo al arrancar y cada noche a las 4:00 de Madrid. Solo existe con {@code app.demo.enabled=true}
 * (el perfil {@code demo} lo activa): sin ello ni este job ni el seeder hacen nada.
 * <p>
 * Un fallo (el proveedor de identidad, la base de datos) no sale del método: la aplicación sigue arrancada y el
 * siguiente intento es el de la noche. Se registra un solo WARN con el uid y, si es de identidad, sus códigos
 * enumerados; de cualquier otra excepción solo la clase y el primer frame, nunca su mensaje (el de una librería puede
 * traer datos de la cuenta de servicio o de las credenciales).
 * <p>
 * La restauración de arranque corre en el hilo que publica el evento, sin {@code @Async}, para que la demo esté
 * sembrada cuando la aplicación termina de arrancar. La nocturna corre en el hilo del planificador, que comparten los
 * demás jobs: les retrasa lo que tarde la restauración.
 */
@Component
@ConditionalOnProperty(prefix = "app.demo", name = "enabled", havingValue = "true")
class DemoResetJob {

	private static final Logger log = LoggerFactory.getLogger(DemoResetJob.class);

	private final ResetDemoUseCase resetDemo;
	private final String uid;

	DemoResetJob(ResetDemoUseCase resetDemo, @Value("${app.demo.uid}") String uid) {
		this.resetDemo = resetDemo;
		this.uid = uid;
	}

	@EventListener(ApplicationReadyEvent.class)
	void resetOnStartup() {
		reset("on startup");
	}

	@Scheduled(cron = "0 0 4 * * *", zone = "Europe/Madrid")
	void resetNightly() {
		reset("nightly");
	}

	/** {@code synchronized}: dos restauraciones a la vez (arranque y noche, o una llamada directa) no se solapan. */
	private synchronized void reset(String when) {
		try {
			resetDemo.reset();
		}
		catch (IdentityProviderException failure) {
			// Su mensaje es seguro por contrato: operación y códigos enumerados.
			log.warn("Demo restore {} failed for uid {}: {}", when, uid, failure.getMessage());
		}
		catch (RuntimeException failure) {
			StackTraceElement[] frames = failure.getStackTrace();
			log.warn("Demo restore {} failed for uid {}: {} at {}", when, uid, failure.getClass().getName(),
					frames.length > 0 ? frames[0] : "unknown");
		}
	}

}
