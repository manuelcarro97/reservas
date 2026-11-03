package io.github.manuelcarro97.reservas.support;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.TableRepositoryPort;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;

@SpringBootTest
@Import({ TestcontainersConfiguration.class, TestClockConfiguration.class })
public abstract class PostgresIT {

	@Autowired
	protected JdbcClient jdbc;

	@Autowired
	protected MutableClock clock;

	@Autowired
	protected RestaurantRepositoryPort restaurants;

	@Autowired
	protected TableRepositoryPort tables;

	@Autowired
	protected ShiftRepositoryPort shifts;

	@BeforeEach
	void cleanDatabase() {
		clock.reset();
		List<String> names = jdbc.sql("""
				SELECT quote_ident(tablename) FROM pg_tables
				WHERE schemaname = 'public' AND tablename <> 'flyway_schema_history'
				""").query(String.class).list();
		if (!names.isEmpty()) {
			jdbc.sql("TRUNCATE " + String.join(", ", names) + " RESTART IDENTITY CASCADE").update();
		}
	}

	protected Restaurant givenRestaurant(String slug) {
		return restaurants.save(new Restaurant(null, slug, slug, ZoneId.of("Europe/Madrid"), 2));
	}

	protected DiningTable givenTable(Restaurant restaurant, String label, int capacity) {
		return tables.save(new DiningTable(null, restaurant.id(), label, capacity, 1, 2));
	}

	protected Shift givenDinnerShift(Restaurant restaurant) {
		return shifts.save(new Shift(null, restaurant.id(), "Cena", LocalTime.of(20, 0), LocalTime.of(22, 0),
				EnumSet.allOf(DayOfWeek.class)));
	}

}
