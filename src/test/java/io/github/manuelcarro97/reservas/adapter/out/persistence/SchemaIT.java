package io.github.manuelcarro97.reservas.adapter.out.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import io.github.manuelcarro97.reservas.support.PostgresIT;

class SchemaIT extends PostgresIT {

	private static final String INSERT_RESERVATION = """
			INSERT INTO reservation (code, restaurant_id, shift_id, table_id, reservation_date, party_size,
			                         customer_name, customer_phone, status, version, created_at)
			VALUES (:code, 1, :shiftId, 1, DATE '2026-12-01', 2, 'Ana', '600000000', 'PENDING', 0, now())
			ON CONFLICT (table_id, reservation_date, shift_id) WHERE status IN ('PENDING', 'CONFIRMED') DO NOTHING
			""";

	@BeforeEach
	void seed() {
		jdbc.sql("INSERT INTO restaurant (slug, name, zone_id) VALUES ('demo', 'Demo', 'Europe/Madrid')").update();
		jdbc.sql("""
				INSERT INTO dining_table (restaurant_id, label, seats, x, y)
				VALUES (1, 'M1', 4, 0, 0)
				""").update();
		jdbc.sql("""
				INSERT INTO shift (restaurant_id, name, start_time, end_time, days_of_week)
				VALUES (1, 'Comida', '13:00', '15:00', '{1,2,3,4,5,6,7}'),
				       (1, 'Cena', '20:00', '22:00', '{1,2,3,4,5,6,7}')
				""").update();
	}

	private int insertReservation(String code, long shiftId) {
		return jdbc.sql(INSERT_RESERVATION).param("code", code).param("shiftId", shiftId).update();
	}

	@Test
	void activeReservationBlocksSameTableDateAndShift() {
		assertThat(insertReservation("A", 1)).isEqualTo(1);

		assertThat(insertReservation("B", 1)).isZero();
	}

	@Test
	void cancelledReservationFreesTable() {
		insertReservation("A", 1);
		jdbc.sql("UPDATE reservation SET status = 'CANCELLED' WHERE code = 'A'").update();

		assertThat(insertReservation("B", 1)).isEqualTo(1);
	}

	@Test
	void sameTableInOtherShiftIsAllowed() {
		insertReservation("A", 1);

		assertThat(insertReservation("B", 2)).isEqualTo(1);
	}

}
