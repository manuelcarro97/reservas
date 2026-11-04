package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.manuelcarro97.reservas.application.port.in.AnonymizeReservationsUseCase;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.PostgresIT;

class AnonymizationIT extends PostgresIT {

	// MutableClock.START es el 2026-12-01 a las 09:00 UTC: en Madrid sigue siendo 1 de diciembre.
	private static final LocalDate TODAY = LocalDate.of(2026, 12, 1);

	@Autowired
	private AnonymizeReservationsUseCase anonymize;

	private Restaurant restaurant;
	private Shift shift;
	private int tableCount;

	@BeforeEach
	void seed() {
		restaurant = givenRestaurant("demo");
		shift = givenDinnerShift(restaurant);
	}

	/** Cada reserva en su mesa: así caben varias en la misma fecha y turno sin chocar con el índice de solape. */
	private Reservation reservationOn(LocalDate date) {
		DiningTable table = givenTable(restaurant, "M" + (++tableCount), 2);
		return givenReservation(restaurant, shift, table, date, 2);
	}

	private Map<String, Object> row(Reservation reservation) {
		return jdbc.sql("""
				SELECT customer_name, customer_phone, customer_email, status, version FROM reservation WHERE id = ?
				""").param(reservation.id()).query().singleRow();
	}

	private void assertAnonymized(Reservation reservation) {
		Map<String, Object> row = row(reservation);
		assertThat(row.get("customer_name")).isEqualTo("Anonimizado");
		assertThat(row.get("customer_phone")).isEqualTo("-");
		assertThat(row.get("customer_email")).isNull();
	}

	private void assertUntouched(Reservation reservation) {
		Map<String, Object> row = row(reservation);
		assertThat(row.get("customer_name")).isEqualTo("Ana");
		assertThat(row.get("customer_phone")).isEqualTo("600000000");
	}

	@Test
	void anonymizesReservationsOlderThan30Days() {
		Reservation old = reservationOn(TODAY.minusDays(31));
		jdbc.sql("UPDATE reservation SET customer_email = 'ana@example.com' WHERE id = ?").param(old.id()).update();

		int changed = anonymize.anonymizeOld();

		assertThat(changed).isEqualTo(1);
		assertAnonymized(old);
	}

	@Test
	void keepsRecentReservations() {
		Reservation twentyNineDays = reservationOn(TODAY.minusDays(29));
		Reservation thirtyDays = reservationOn(TODAY.minusDays(30));
		Reservation future = reservationOn(TODAY.plusDays(3));

		int changed = anonymize.anonymizeOld();

		assertThat(changed).isZero();
		assertUntouched(twentyNineDays);
		assertUntouched(thirtyDays);
		assertUntouched(future);
	}

	@Test
	void isIdempotent() {
		Reservation old = reservationOn(TODAY.minusDays(40));
		reservationOn(TODAY.minusDays(2));

		assertThat(anonymize.anonymizeOld()).isEqualTo(1);
		Object versionAfterFirstRun = row(old).get("version");

		assertThat(anonymize.anonymizeOld()).isZero();
		assertThat(row(old).get("version")).isEqualTo(versionAfterFirstRun);
		assertAnonymized(old);
	}

	@Test
	void anonymizesOldPendingAndConfirmedWithoutChangingTheirStatusAndBumpsTheVersion() {
		Reservation pending = reservationOn(TODAY.minusDays(45));
		Reservation confirmed = reservationOn(TODAY.minusDays(45));
		jdbc.sql("UPDATE reservation SET status = 'CONFIRMED' WHERE id = ?").param(confirmed.id()).update();
		Object pendingVersion = row(pending).get("version");
		Object confirmedVersion = row(confirmed).get("version");

		assertThat(anonymize.anonymizeOld()).isEqualTo(2);

		assertAnonymized(pending);
		assertAnonymized(confirmed);
		assertThat(row(pending).get("status")).isEqualTo("PENDING");
		assertThat(row(confirmed).get("status")).isEqualTo("CONFIRMED");
		assertThat(((Number) row(pending).get("version")).longValue())
			.isEqualTo(((Number) pendingVersion).longValue() + 1);
		assertThat(((Number) row(confirmed).get("version")).longValue())
			.isEqualTo(((Number) confirmedVersion).longValue() + 1);
	}

	@Test
	void todayIsCountedInTheRestaurantZoneNotInUtc() {
		// 23:30 UTC del 31 de diciembre ya es 1 de enero en Madrid: el límite es 2 de diciembre, no 1.
		clock.set(ZonedDateTime.of(2026, 12, 31, 23, 30, 0, 0, ZoneId.of("UTC")).toInstant());
		Reservation onTheEdge = reservationOn(LocalDate.of(2026, 12, 1));
		Reservation older = reservationOn(LocalDate.of(2026, 11, 30));
		Reservation inside = reservationOn(LocalDate.of(2026, 12, 2));

		assertThat(anonymize.anonymizeOld()).isEqualTo(2);

		assertAnonymized(onTheEdge);
		assertAnonymized(older);
		assertUntouched(inside);
	}

	@Test
	void usesAnonymizeBeforeOnThePort() {
		Reservation old = reservationOn(TODAY.minusDays(5));

		assertThat(reservations.anonymizeBefore(TODAY.minusDays(5))).isZero();
		assertThat(reservations.anonymizeBefore(TODAY.minusDays(4))).isEqualTo(1);
		assertAnonymized(old);
	}

}
