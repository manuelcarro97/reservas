package io.github.manuelcarro97.reservas.domain.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import io.github.manuelcarro97.reservas.domain.exception.DateInPastException;
import io.github.manuelcarro97.reservas.domain.exception.DateTooFarException;
import io.github.manuelcarro97.reservas.domain.exception.PartyTooLargeException;
import io.github.manuelcarro97.reservas.domain.exception.RestaurantClosedException;
import io.github.manuelcarro97.reservas.domain.exception.ShiftNotOpenException;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.model.Theme;

class BookingPolicyTest {

	private static final Restaurant RESTAURANT = new Restaurant(1L, "demo", "Demo", ZoneId.of("Europe/Madrid"), 2,
			"owner-a", PlanStatus.PUBLISHED, RoomLayout.defaultRoom(), Theme.AZUL, BookingMode.FREE_CHOICE);
	private static final Clock NOON_MADRID = clockAt("2026-12-01T11:00:00Z");
	// 2026-12-02 es miércoles
	private static final LocalDate TOMORROW = LocalDate.of(2026, 12, 2);
	private static final int MAX_CAPACITY = 6;

	private final BookingPolicy policy = new BookingPolicy();

	private static Clock clockAt(String instant) {
		return Clock.fixed(Instant.parse(instant), ZoneOffset.UTC);
	}

	private static Shift shift(LocalTime start, LocalTime end, Set<DayOfWeek> days) {
		return new Shift(2L, 1L, "Cena", start, end, days);
	}

	private static Shift everyDay(LocalTime start, LocalTime end) {
		return shift(start, end, EnumSet.allOf(DayOfWeek.class));
	}

	@Test
	void acceptsValidBooking() {
		Shift shift = everyDay(LocalTime.of(20, 0), LocalTime.of(22, 0));

		assertThatCode(() -> policy.validate(RESTAURANT, shift, TOMORROW, 2, MAX_CAPACITY, false, NOON_MADRID))
				.doesNotThrowAnyException();
	}

	@Test
	void acceptsLastDayOfBookingWindow() {
		Shift shift = everyDay(LocalTime.of(20, 0), LocalTime.of(22, 0));
		LocalDate lastDay = LocalDate.of(2026, 12, 1).plusDays(BookingPolicy.BOOKING_WINDOW_DAYS);

		assertThatCode(() -> policy.validate(RESTAURANT, shift, lastDay, 2, MAX_CAPACITY, false, NOON_MADRID))
				.doesNotThrowAnyException();
	}

	@Test
	void rejectsDateBeyondBookingWindow() {
		LocalDate tooFar = LocalDate.of(2026, 12, 1).plusDays(BookingPolicy.BOOKING_WINDOW_DAYS + 1);

		assertThatThrownBy(() -> policy.requireWithinWindow(RESTAURANT, tooFar, NOON_MADRID))
				.isInstanceOf(DateTooFarException.class);
	}

	@Test
	void rejectsPastDateBeforeTouchingAnythingElse() {
		LocalDate past = LocalDate.of(2026, 11, 30);

		assertThatThrownBy(() -> policy.requireWithinWindow(RESTAURANT, past, NOON_MADRID))
				.isInstanceOf(DateInPastException.class);
	}

	@Test
	void rejectsClosedDay() {
		Shift shift = everyDay(LocalTime.of(20, 0), LocalTime.of(22, 0));

		assertThatThrownBy(() -> policy.validate(RESTAURANT, shift, TOMORROW, 2, MAX_CAPACITY, true, NOON_MADRID))
				.isInstanceOf(RestaurantClosedException.class);
	}

	@Test
	void rejectsShiftNotOpenOnWeekday() {
		Shift shift = shift(LocalTime.of(20, 0), LocalTime.of(22, 0), EnumSet.of(DayOfWeek.MONDAY));

		assertThatThrownBy(() -> policy.validate(RESTAURANT, shift, TOMORROW, 2, MAX_CAPACITY, false, NOON_MADRID))
				.isInstanceOf(ShiftNotOpenException.class);
	}

	@Test
	void rejectsPartyLargerThanBiggestTable() {
		Shift shift = everyDay(LocalTime.of(20, 0), LocalTime.of(22, 0));

		assertThatThrownBy(() -> policy.validate(RESTAURANT, shift, TOMORROW, 7, MAX_CAPACITY, false, NOON_MADRID))
				.isInstanceOf(PartyTooLargeException.class);
	}

	@Test
	void rejectsShiftAlreadyStarted() {
		Shift shift = everyDay(LocalTime.of(12, 0), LocalTime.of(15, 0));
		LocalDate today = LocalDate.of(2026, 12, 1);

		assertThatThrownBy(() -> policy.validate(RESTAURANT, shift, today, 2, MAX_CAPACITY, false, NOON_MADRID))
				.isInstanceOf(DateInPastException.class);
	}

	@Test
	void usesRestaurantZoneToDecideShiftAlreadyStarted() {
		// 22:30 UTC son las 23:30 en Madrid: en UTC el turno de las 23:00 aún no habría empezado.
		Shift shift = everyDay(LocalTime.of(23, 0), LocalTime.of(23, 59));
		LocalDate date = LocalDate.of(2026, 11, 1);

		assertThatThrownBy(() -> policy.validate(RESTAURANT, shift, date, 2, MAX_CAPACITY, false,
				clockAt("2026-11-01T22:30:00Z"))).isInstanceOf(DateInPastException.class);
	}

	@Test
	void usesRestaurantZoneToDecideDateAlreadyPassed() {
		// 23:30 UTC del día 31 ya es día 1 en Madrid: en UTC el turno de las 23:45 seguiría abierto.
		Shift shift = everyDay(LocalTime.of(23, 45), LocalTime.of(23, 59));
		LocalDate date = LocalDate.of(2026, 10, 31);

		assertThatThrownBy(() -> policy.validate(RESTAURANT, shift, date, 2, MAX_CAPACITY, false,
				clockAt("2026-10-31T23:30:00Z"))).isInstanceOf(DateInPastException.class);
	}

}
