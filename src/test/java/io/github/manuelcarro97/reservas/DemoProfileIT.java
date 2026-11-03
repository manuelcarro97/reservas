package io.github.manuelcarro97.reservas;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import io.github.manuelcarro97.reservas.application.port.in.GetAvailabilityUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ShiftAvailability;
import io.github.manuelcarro97.reservas.support.TestcontainersConfiguration;

// No hereda de PostgresIT: su limpieza entre tests borraría los datos de demo.
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("demo")
class DemoProfileIT {

	@Autowired
	private GetAvailabilityUseCase availability;

	@Test
	void demoRestaurantHasAvailability() {
		assertThat(availability.availability("demo", LocalDate.now().plusDays(7), 2))
			.extracting(ShiftAvailability::available)
			.contains(true);
	}

}
