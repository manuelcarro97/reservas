package io.github.manuelcarro97.reservas.support;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.TableRepositoryPort;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.ReservationCode;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.model.TableShape;
import io.github.manuelcarro97.reservas.domain.model.Theme;

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

	@Autowired
	protected ReservationRepositoryPort reservations;

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
		return givenRestaurant(slug, "owner-a");
	}

	protected Restaurant givenRestaurant(String slug, String ownerUid) {
		return restaurants.save(new Restaurant(null, slug, slug, ZoneId.of("Europe/Madrid"), 2, ownerUid,
				PlanStatus.PUBLISHED, RoomLayout.defaultRoom(), Theme.AZUL, BookingMode.FREE_CHOICE));
	}

	/** Deja el plano en el modo indicado; devuelve el plano guardado. */
	protected Restaurant givenBookingMode(Restaurant restaurant, BookingMode mode) {
		return restaurants.save(restaurant.withSettings(restaurant.name(), restaurant.theme(), mode,
				restaurant.cancellationDeadlineHours()));
	}

	/** Mesa cuadrada sin giro; la n-ésima del restaurante cae en la rejilla de 1200x800 sin solaparse con las demás. */
	protected DiningTable givenTable(Restaurant restaurant, String label, int seats) {
		int n = jdbc.sql("SELECT count(*) FROM dining_table WHERE restaurant_id = :restaurantId")
			.param("restaurantId", restaurant.id())
			.query(Integer.class)
			.single();
		return tables.save(new DiningTable(null, restaurant.id(), label, TableShape.SQUARE, seats, 0,
				120 + 180 * (n % 5), 120 + 200 * (n / 5)));
	}

	/** Inserta con {@code tryInsert}; {@code table} puede ser nula (reserva sin mesa). */
	protected Reservation givenReservation(Restaurant restaurant, Shift shift, DiningTable table, LocalDate date,
			int party) {
		Long tableId = table == null ? null : table.id();
		String code = ReservationCode.generate(restaurant.slug());
		return reservations
			.tryInsert(Reservation.newPending(code, restaurant.id(), shift.id(), tableId, date, party, "Ana",
					"600000000", null, clock.instant()))
			.orElseThrow();
	}

	protected Shift givenDinnerShift(Restaurant restaurant) {
		return shifts.save(new Shift(null, restaurant.id(), "Cena", LocalTime.of(20, 0), LocalTime.of(22, 0),
				EnumSet.allOf(DayOfWeek.class)));
	}

}
