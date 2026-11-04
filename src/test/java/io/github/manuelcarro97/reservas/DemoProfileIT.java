package io.github.manuelcarro97.reservas;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import io.github.manuelcarro97.reservas.application.port.in.GetAvailabilityUseCase;
import io.github.manuelcarro97.reservas.application.port.in.GetPublicPlanUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ShiftAvailability;
import io.github.manuelcarro97.reservas.support.TestcontainersConfiguration;

// No hereda de PostgresIT: su limpieza entre tests borraría los datos de demo. Por eso fija aquí, como él, que no hay
// bot de Telegram (una TELEGRAM_BOT_TOKEN del entorno activaría el job de consulta contra la API real) ni cuenta de
// servicio de Firebase (nunca se llama a Firebase real), y que no hay credenciales de demo (un DEMO_EMAIL del entorno
// no debe llegar a ningún proveedor): sin ellas la restauración de arranque siembra el plano y no toca la identidad.
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("demo")
@TestPropertySource(properties = { "app.telegram.bot-token=", "app.telegram.bot-username=",
		"app.firebase.service-account-json=", "app.demo.email=", "app.demo.password=" })
class DemoProfileIT {

	@Autowired
	private GetAvailabilityUseCase availability;

	@Autowired
	private GetPublicPlanUseCase publicPlan;

	@Test
	void demoRestaurantHasAvailability() {
		assertThat(availability.availability("demo", LocalDate.now().plusDays(7), 2))
			.extracting(ShiftAvailability::available)
			.contains(true);
	}

	/** El plano lo siembra el job al arrancar con el perfil demo (ya no hay seed SQL). */
	@Test
	void startupRestoreSeededThePlan() {
		assertThat(publicPlan.plan("demo").tables()).hasSize(9);
	}

}
