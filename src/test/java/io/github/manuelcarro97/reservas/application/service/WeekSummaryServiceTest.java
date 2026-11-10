package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import io.github.manuelcarro97.reservas.application.port.in.WeekSummary;
import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.RestaurantNotFoundException;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.ReservationStatus;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.model.Theme;

class WeekSummaryServiceTest {

	private static final long PLAN_ID = 7;
	private static final String OWNER = "owner-a";
	private static final String SLUG = "kafe";
	/** Lunes 9 de noviembre de 2026; el domingo de esa semana es el 15. */
	private static final LocalDate MONDAY = LocalDate.of(2026, 11, 9);
	private static final LocalDate SUNDAY = LocalDate.of(2026, 11, 15);

	private final RestaurantRepositoryPort restaurants = mock(RestaurantRepositoryPort.class);
	private final ShiftRepositoryPort shifts = mock(ShiftRepositoryPort.class);
	private final ReservationRepositoryPort reservations = mock(ReservationRepositoryPort.class);
	private final WeekSummaryService service = new WeekSummaryService(restaurants, shifts, reservations);

	private final Shift lunch = new Shift(10L, PLAN_ID, "Comida", LocalTime.of(13, 0), LocalTime.of(15, 0),
			EnumSet.allOf(DayOfWeek.class));
	private final Shift dinner = new Shift(11L, PLAN_ID, "Cena", LocalTime.of(20, 0), LocalTime.of(22, 0),
			EnumSet.allOf(DayOfWeek.class));

	WeekSummaryServiceTest() {
		Restaurant plan = new Restaurant(PLAN_ID, SLUG, "Kafé", ZoneId.of("Europe/Madrid"), 2, OWNER,
				PlanStatus.PUBLISHED, RoomLayout.defaultRoom(), Theme.AZUL, BookingMode.FREE_CHOICE);
		when(restaurants.findBySlug(SLUG)).thenReturn(Optional.of(plan));
		when(shifts.findAll(PLAN_ID)).thenReturn(List.of(lunch, dinner));
		when(restaurants.closuresFrom(PLAN_ID, MONDAY)).thenReturn(List.of());
		when(reservations.findActiveBetween(PLAN_ID, MONDAY, SUNDAY)).thenReturn(List.of());
	}

	private Reservation reservation(LocalDate date, Shift shift, Long tableId, int party, ReservationStatus status) {
		return new Reservation(null, "CODE", PLAN_ID, shift.id(), tableId, date, shift.start(), party, "Ana",
				"600000000", null, status, 0, Instant.parse("2026-11-01T10:00:00Z"), null);
	}

	private WeekSummary.Day day(WeekSummary summary, LocalDate date) {
		return summary.days().stream().filter(day -> day.date().equals(date)).findFirst().orElseThrow();
	}

	@Test
	void closedDayHasNoShifts() {
		LocalDate closed = LocalDate.of(2026, 11, 11);
		when(restaurants.closuresFrom(PLAN_ID, MONDAY)).thenReturn(List.of(closed));
		when(reservations.findActiveBetween(PLAN_ID, MONDAY, SUNDAY))
			.thenReturn(List.of(reservation(closed, dinner, 1L, 4, ReservationStatus.CONFIRMED)));

		WeekSummary summary = service.week(OWNER, SLUG, MONDAY);

		assertThat(day(summary, closed).closed()).isTrue();
		assertThat(day(summary, closed).shifts()).isEmpty();
		assertThat(day(summary, MONDAY).closed()).isFalse();
		assertThat(day(summary, MONDAY).shifts()).hasSize(2);
	}

	@Test
	void closureOutsideTheWeekDoesNotCloseAnyDay() {
		when(restaurants.closuresFrom(PLAN_ID, MONDAY)).thenReturn(List.of(SUNDAY.plusDays(1)));

		WeekSummary summary = service.week(OWNER, SLUG, MONDAY);

		assertThat(summary.days()).allMatch(day -> !day.closed());
	}

	@Test
	void countsDistinctTablesAndUnassigned() {
		when(reservations.findActiveBetween(PLAN_ID, MONDAY, SUNDAY)).thenReturn(List.of(
				reservation(MONDAY, dinner, 1L, 2, ReservationStatus.CONFIRMED),
				reservation(MONDAY, dinner, 1L, 3, ReservationStatus.PENDING),
				reservation(MONDAY, dinner, 2L, 4, ReservationStatus.CONFIRMED),
				reservation(MONDAY, dinner, null, 5, ReservationStatus.PENDING),
				reservation(MONDAY, lunch, 1L, 2, ReservationStatus.CONFIRMED)));

		WeekSummary.Day monday = day(service.week(OWNER, SLUG, MONDAY), MONDAY);

		assertThat(monday.shifts()).containsExactly(new WeekSummary.ShiftLoad(10, 1, 0, 1, 2, 0),
				new WeekSummary.ShiftLoad(11, 2, 1, 4, 14, 2));
	}

	@Test
	void ignoresCancelledAndNoShow() {
		when(reservations.findActiveBetween(PLAN_ID, MONDAY, SUNDAY)).thenReturn(List.of(
				reservation(MONDAY, dinner, 1L, 2, ReservationStatus.CONFIRMED),
				reservation(MONDAY, dinner, 2L, 8, ReservationStatus.CANCELLED),
				reservation(MONDAY, dinner, 3L, 8, ReservationStatus.NO_SHOW)));

		WeekSummary.Day monday = day(service.week(OWNER, SLUG, MONDAY), MONDAY);

		assertThat(monday.shifts().get(1)).isEqualTo(new WeekSummary.ShiftLoad(11, 1, 0, 1, 2, 0));
	}

	@Test
	void onlyShiftsThatOpenThatDayAreListed() {
		Shift weekends = new Shift(12L, PLAN_ID, "Brunch", LocalTime.of(10, 0), LocalTime.of(12, 0),
				EnumSet.of(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY));
		when(shifts.findAll(PLAN_ID)).thenReturn(List.of(weekends, lunch));

		WeekSummary summary = service.week(OWNER, SLUG, MONDAY);

		assertThat(day(summary, MONDAY).shifts()).extracting(WeekSummary.ShiftLoad::shiftId).containsExactly(10L);
		assertThat(day(summary, SUNDAY).shifts()).extracting(WeekSummary.ShiftLoad::shiftId)
			.containsExactly(12L, 10L);
	}

	@Test
	void normalizesToMonday() {
		WeekSummary fromSunday = service.week(OWNER, SLUG, SUNDAY);
		WeekSummary fromWednesday = service.week(OWNER, SLUG, LocalDate.of(2026, 11, 11));

		assertThat(fromSunday.monday()).isEqualTo(MONDAY);
		assertThat(fromWednesday.monday()).isEqualTo(MONDAY);
		assertThat(fromSunday.days()).extracting(WeekSummary.Day::date)
			.containsExactly(MONDAY, MONDAY.plusDays(1), MONDAY.plusDays(2), MONDAY.plusDays(3), MONDAY.plusDays(4),
					MONDAY.plusDays(5), SUNDAY);
	}

	@Test
	void readsTheWeekWithASingleReservationQuery() {
		service.week(OWNER, SLUG, MONDAY);

		verify(reservations).findActiveBetween(PLAN_ID, MONDAY, SUNDAY);
		verifyNoMoreInteractions(reservations);
	}

	@Test
	void anotherOwnersPlanIsNotFoundAndReadsNothing() {
		assertThatThrownBy(() -> service.week("owner-b", SLUG, MONDAY)).isInstanceOf(RestaurantNotFoundException.class);

		verifyNoInteractions(reservations, shifts);
		verify(restaurants, never()).closuresFrom(anyLong(), any());
	}

}
