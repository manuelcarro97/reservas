package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.manuelcarro97.reservas.application.port.in.CreateReservationCommand;
import io.github.manuelcarro97.reservas.application.port.in.CreateReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.GetAvailabilityUseCase;
import io.github.manuelcarro97.reservas.application.port.in.GetOccupancyUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ShiftAvailability;
import io.github.manuelcarro97.reservas.application.port.in.TableOccupancy;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.PostgresIT;

class AvailabilityServiceIT extends PostgresIT {

	// 2026-12-02 es miércoles
	private static final LocalDate WEDNESDAY = LocalDate.of(2026, 12, 2);

	@Autowired
	private GetAvailabilityUseCase availability;

	@Autowired
	private GetOccupancyUseCase occupancy;

	@Autowired
	private CreateReservationUseCase createReservation;

	private Restaurant restaurant;
	private Shift dinner;
	private DiningTable table;

	@BeforeEach
	void seed() {
		restaurant = givenRestaurant("demo");
		dinner = givenDinnerShift(restaurant);
		table = givenTable(restaurant, "M2", 2);
	}

	private void reserve() {
		createReservation.create("demo",
				new CreateReservationCommand(WEDNESDAY, dinner.id(), 2, "Ana", "600000000", null));
	}

	@Test
	void freeShiftIsAvailable() {
		List<ShiftAvailability> result = availability.availability("demo", WEDNESDAY, 2);

		assertThat(result).extracting(ShiftAvailability::shiftId, ShiftAvailability::available)
				.containsExactly(org.assertj.core.groups.Tuple.tuple(dinner.id(), true));
	}

	@Test
	void closedDayReturnsEmptyList() {
		restaurants.addClosure(restaurant.id(), WEDNESDAY, "Festivo");

		assertThat(availability.availability("demo", WEDNESDAY, 2)).isEmpty();
	}

	@Test
	void onlyShiftsOpenOnThatWeekdayAppear() {
		shifts.save(new Shift(null, restaurant.id(), "Lunes", LocalTime.of(13, 0), LocalTime.of(15, 0),
				EnumSet.of(DayOfWeek.MONDAY)));

		assertThat(availability.availability("demo", WEDNESDAY, 2)).extracting(ShiftAvailability::name)
				.containsExactly("Cena");
	}

	@Test
	void shiftIsUnavailableWhenNoTableFits() {
		assertThat(availability.availability("demo", WEDNESDAY, 3)).extracting(ShiftAvailability::available)
				.containsExactly(false);
	}

	@Test
	void shiftIsUnavailableWhenTablesAreTaken() {
		reserve();

		assertThat(availability.availability("demo", WEDNESDAY, 2)).extracting(ShiftAvailability::available)
				.containsExactly(false);
	}

	@Test
	void shiftAlreadyStartedIsUnavailable() {
		LocalDate today = LocalDate.of(2026, 12, 1);
		clock.set(today.atTime(21, 0).atZone(restaurant.zone()).toInstant());

		assertThat(availability.availability("demo", today, 2)).extracting(ShiftAvailability::available)
				.containsExactly(false);
	}

	@Test
	void occupancyMarksReservedTables() {
		DiningTable free = givenTable(restaurant, "M4", 4);
		reserve();

		List<TableOccupancy> result = occupancy.occupancy("owner-a", "demo", dinner.id(), WEDNESDAY);

		assertThat(result).extracting(TableOccupancy::tableId, TableOccupancy::occupied).containsExactly(
				org.assertj.core.groups.Tuple.tuple(table.id(), true),
				org.assertj.core.groups.Tuple.tuple(free.id(), false));
	}

}
