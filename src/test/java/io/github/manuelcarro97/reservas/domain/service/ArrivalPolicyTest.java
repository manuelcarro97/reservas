package io.github.manuelcarro97.reservas.domain.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.EnumSet;

import org.junit.jupiter.api.Test;

import io.github.manuelcarro97.reservas.domain.exception.ArrivalTimePastException;
import io.github.manuelcarro97.reservas.domain.exception.InvalidArrivalTimeException;
import io.github.manuelcarro97.reservas.domain.model.Shift;

class ArrivalPolicyTest {

	private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");
	// 2026-12-02: invierno, Madrid = UTC+1
	private static final LocalDate DAY = LocalDate.of(2026, 12, 2);
	private static final Instant LONG_BEFORE = Instant.parse("2026-12-01T11:00:00Z");

	private final ArrivalPolicy policy = new ArrivalPolicy();

	private static Shift shift(LocalTime start, LocalTime end) {
		return new Shift(1L, 1L, "Turno", start, end, EnumSet.allOf(DayOfWeek.class));
	}

	private static Shift dinner() {
		return shift(LocalTime.of(20, 0), LocalTime.of(23, 30));
	}

	private static Shift lunch() {
		return shift(LocalTime.of(13, 0), LocalTime.of(16, 0));
	}

	@Test
	void dinnerSlotsGoFromStartToOneHourBeforeEnd() {
		assertThat(policy.arrivalSlots(dinner())).containsExactly(LocalTime.of(20, 0), LocalTime.of(20, 30),
				LocalTime.of(21, 0), LocalTime.of(21, 30), LocalTime.of(22, 0), LocalTime.of(22, 30));
	}

	@Test
	void lunchSlotsGoFromStartToOneHourBeforeEnd() {
		assertThat(policy.arrivalSlots(lunch())).containsExactly(LocalTime.of(13, 0), LocalTime.of(13, 30),
				LocalTime.of(14, 0), LocalTime.of(14, 30), LocalTime.of(15, 0));
	}

	@Test
	void gridIsAnchoredToShiftStartNotToTheClock() {
		assertThat(policy.arrivalSlots(shift(LocalTime.of(13, 15), LocalTime.of(16, 0)))).containsExactly(
				LocalTime.of(13, 15), LocalTime.of(13, 45), LocalTime.of(14, 15), LocalTime.of(14, 45));
	}

	@Test
	void lastSlotIsInclusiveWhenItFallsExactlyOneHourBeforeEnd() {
		assertThat(policy.arrivalSlots(shift(LocalTime.of(20, 0), LocalTime.of(22, 0)))).containsExactly(
				LocalTime.of(20, 0), LocalTime.of(20, 30), LocalTime.of(21, 0));
	}

	@Test
	void ninetyMinuteShiftHasTwoSlots() {
		assertThat(policy.arrivalSlots(shift(LocalTime.of(20, 0), LocalTime.of(21, 30)))).containsExactly(
				LocalTime.of(20, 0), LocalTime.of(20, 30));
	}

	@Test
	void shiftOfExactlyOneHourHasOnlyItsStart() {
		assertThat(policy.arrivalSlots(shift(LocalTime.of(20, 0), LocalTime.of(21, 0))))
			.containsExactly(LocalTime.of(20, 0));
	}

	@Test
	void shiftShorterThanOneHourHasOnlyItsStart() {
		assertThat(policy.arrivalSlots(shift(LocalTime.of(20, 0), LocalTime.of(20, 20))))
			.containsExactly(LocalTime.of(20, 0));
	}

	@Test
	void shiftEndingAtTheLastMinuteOfTheDayKeepsItsSlots() {
		assertThat(policy.arrivalSlots(shift(LocalTime.of(22, 0), LocalTime.of(23, 59)))).containsExactly(
				LocalTime.of(22, 0), LocalTime.of(22, 30));
	}

	@Test
	void availableSlotsOnAFutureDayAreAllOfThem() {
		assertThat(policy.availableSlots(dinner(), DAY, MADRID, LONG_BEFORE)).isEqualTo(policy.arrivalSlots(dinner()));
	}

	@Test
	void availableSlotsTodayDropTheOnesAlreadyPast() {
		// 20:45 en Madrid
		Instant now = Instant.parse("2026-12-02T19:45:00Z");

		assertThat(policy.availableSlots(dinner(), DAY, MADRID, now)).containsExactly(LocalTime.of(21, 0),
				LocalTime.of(21, 30), LocalTime.of(22, 0), LocalTime.of(22, 30));
	}

	@Test
	void availableSlotsAtTheExactSlotInstantDropThatSlot() {
		// 21:00 en Madrid
		Instant now = Instant.parse("2026-12-02T20:00:00Z");

		assertThat(policy.availableSlots(dinner(), DAY, MADRID, now)).containsExactly(LocalTime.of(21, 30),
				LocalTime.of(22, 0), LocalTime.of(22, 30));
	}

	@Test
	void availableSlotsAfterTheLastOneAreEmpty() {
		Instant now = Instant.parse("2026-12-02T22:00:00Z");

		assertThat(policy.availableSlots(dinner(), DAY, MADRID, now)).isEmpty();
	}

	@Test
	void availableSlotsUseTheRestaurantZoneNotUtc() {
		// 22:30 UTC del 1 de diciembre son las 23:30 en Madrid, pero el día 2 aún no ha empezado.
		Instant now = Instant.parse("2026-12-01T22:30:00Z");

		assertThat(policy.availableSlots(dinner(), DAY, MADRID, now)).hasSize(6);
	}

	@Test
	void validAcceptsEveryGridSlot() {
		for (LocalTime slot : policy.arrivalSlots(dinner())) {
			assertThatCode(() -> policy.requireValid(dinner(), slot, DAY, MADRID, LONG_BEFORE))
				.doesNotThrowAnyException();
		}
	}

	@Test
	void validRejectsATimeOffTheGrid() {
		assertThatThrownBy(() -> policy.requireValid(dinner(), LocalTime.of(20, 15), DAY, MADRID, LONG_BEFORE))
			.isInstanceOf(InvalidArrivalTimeException.class)
			.hasFieldOrPropertyWithValue("code", "INVALID_ARRIVAL_TIME");
	}

	@Test
	void validRejectsATimeWithSeconds() {
		assertThatThrownBy(() -> policy.requireValid(dinner(), LocalTime.of(20, 30, 15), DAY, MADRID, LONG_BEFORE))
			.isInstanceOf(InvalidArrivalTimeException.class);
	}

	@Test
	void validRejectsATimeBeforeTheShift() {
		assertThatThrownBy(() -> policy.requireValid(dinner(), LocalTime.of(19, 30), DAY, MADRID, LONG_BEFORE))
			.isInstanceOf(InvalidArrivalTimeException.class);
	}

	@Test
	void validRejectsATimeInTheLastHourOfTheShift() {
		assertThatThrownBy(() -> policy.requireValid(dinner(), LocalTime.of(23, 0), DAY, MADRID, LONG_BEFORE))
			.isInstanceOf(InvalidArrivalTimeException.class);
	}

	@Test
	void validRejectsTheShiftEnd() {
		assertThatThrownBy(() -> policy.requireValid(dinner(), LocalTime.of(23, 30), DAY, MADRID, LONG_BEFORE))
			.isInstanceOf(InvalidArrivalTimeException.class);
	}

	@Test
	void validRejectsAMissingTime() {
		assertThatThrownBy(() -> policy.requireValid(dinner(), null, DAY, MADRID, LONG_BEFORE))
			.isInstanceOf(InvalidArrivalTimeException.class);
	}

	@Test
	void validRejectsAGridTimeAlreadyPastToday() {
		// 21:10 en Madrid
		Instant now = Instant.parse("2026-12-02T20:10:00Z");

		assertThatThrownBy(() -> policy.requireValid(dinner(), LocalTime.of(21, 0), DAY, MADRID, now))
			.isInstanceOf(ArrivalTimePastException.class)
			.hasFieldOrPropertyWithValue("code", "ARRIVAL_TIME_PAST");
		assertThatCode(() -> policy.requireValid(dinner(), LocalTime.of(21, 30), DAY, MADRID, now))
			.doesNotThrowAnyException();
	}

	@Test
	void offGridTimeIsInvalidEvenWhenItIsAlsoPast() {
		Instant now = Instant.parse("2026-12-02T20:10:00Z");

		assertThatThrownBy(() -> policy.requireValid(dinner(), LocalTime.of(20, 15), DAY, MADRID, now))
			.isInstanceOf(InvalidArrivalTimeException.class);
	}

}
