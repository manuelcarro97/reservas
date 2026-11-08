package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.LocalTime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.manuelcarro97.reservas.application.port.in.CreateReservationCommand;
import io.github.manuelcarro97.reservas.application.port.in.CreateReservationUseCase;
import io.github.manuelcarro97.reservas.domain.exception.InvalidArrivalTimeException;
import io.github.manuelcarro97.reservas.domain.exception.NoTableAvailableException;
import io.github.manuelcarro97.reservas.domain.exception.ShiftNotFoundException;
import io.github.manuelcarro97.reservas.domain.exception.TableNotAllowedException;
import io.github.manuelcarro97.reservas.domain.exception.TableNotFoundException;
import io.github.manuelcarro97.reservas.domain.exception.TableRequiredException;
import io.github.manuelcarro97.reservas.domain.exception.TableTakenException;
import io.github.manuelcarro97.reservas.domain.exception.TableTooSmallException;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.ReservationStatus;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.PostgresIT;

class ReservationServiceIT extends PostgresIT {

	private static final LocalDate DATE = LocalDate.of(2026, 12, 2);

	@Autowired
	private CreateReservationUseCase createReservation;

	private Restaurant restaurant;
	private Shift shift;
	private DiningTable small;
	private DiningTable big;

	@BeforeEach
	void seed() {
		restaurant = givenRestaurant("demo");
		shift = givenDinnerShift(restaurant);
		big = givenTable(restaurant, "M4", 4);
		small = givenTable(restaurant, "M2", 2);
	}

	private Reservation reserve(long shiftId, Long tableId, int partySize) {
		return createReservation.create("demo",
				new CreateReservationCommand(DATE, shiftId, partySize, "Ana", "600000000", null, tableId,
						shift.start()));
	}

	@Test
	void freeChoiceCreatesPendingOnChosenTable() {
		Reservation reservation = reserve(shift.id(), big.id(), 2);

		assertThat(reservation.status()).isEqualTo(ReservationStatus.PENDING);
		assertThat(reservation.tableId()).isEqualTo(big.id());
		assertThat(reservation.code()).matches("^DEMO-[2-9A-HJ-NP-Z]{16}$");
	}

	@Test
	void createStoresTheArrivalTimeAndReadsItBack() {
		Reservation created = createReservation.create("demo", new CreateReservationCommand(DATE, shift.id(), 2,
				"Ana", "600000000", null, big.id(), LocalTime.of(21, 0)));

		assertThat(created.arrivalTime()).isEqualTo(LocalTime.of(21, 0));
		assertThat(reservations.findByCode(created.code())).get()
			.extracting(Reservation::arrivalTime)
			.isEqualTo(LocalTime.of(21, 0));
	}

	@Test
	void arrivalTimeOutsideTheShiftGridIsRejectedWithoutInserting() {
		assertThatThrownBy(() -> createReservation.create("demo", new CreateReservationCommand(DATE, shift.id(), 2,
				"Ana", "600000000", null, big.id(), LocalTime.of(20, 15)))).isInstanceOf(InvalidArrivalTimeException.class);
		assertThat(jdbc.sql("SELECT count(*) FROM reservation").query(Long.class).single()).isZero();
	}

	@Test
	void missingArrivalTimeIsRejected() {
		assertThatThrownBy(() -> createReservation.create("demo", new CreateReservationCommand(DATE, shift.id(), 2,
				"Ana", "600000000", null, big.id(), null))).isInstanceOf(InvalidArrivalTimeException.class);
	}

	@Test
	void anotherArrivalTimeOnTheSameTableAndShiftStillConflicts() {
		reserve(shift.id(), big.id(), 2);

		assertThatThrownBy(() -> createReservation.create("demo", new CreateReservationCommand(DATE, shift.id(), 2,
				"Luis", "600000001", null, big.id(), LocalTime.of(21, 0)))).isInstanceOf(TableTakenException.class);
	}

	@Test
	void freeChoiceWithoutTableReturnsTableRequired() {
		assertThatThrownBy(() -> reserve(shift.id(), null, 2)).isInstanceOf(TableRequiredException.class);
	}

	@Test
	void freeChoiceTableTooSmall() {
		assertThatThrownBy(() -> reserve(shift.id(), small.id(), 3)).isInstanceOf(TableTooSmallException.class);
	}

	@Test
	void freeChoiceTableOfAnotherPlanIsNotFound() {
		Restaurant other = givenRestaurant("otro");
		DiningTable foreignTable = givenTable(other, "X1", 4);

		assertThatThrownBy(() -> reserve(shift.id(), foreignTable.id(), 2)).isInstanceOf(TableNotFoundException.class);
		assertThat(jdbc.sql("SELECT count(*) FROM reservation").query(Long.class).single()).isZero();
	}

	@Test
	void freeChoiceDeletedTableIsNotFound() {
		jdbc.sql("UPDATE dining_table SET deleted_at = now() WHERE id = :id").param("id", small.id()).update();

		assertThatThrownBy(() -> reserve(shift.id(), small.id(), 2)).isInstanceOf(TableNotFoundException.class);
	}

	@Test
	void freeChoiceTakenTableReturnsTableTaken() {
		givenReservation(restaurant, shift, small, DATE, 2);

		assertThatThrownBy(() -> reserve(shift.id(), small.id(), 2)).isInstanceOf(TableTakenException.class);
	}

	@Test
	void freeChoiceRejectsWhenUnassignedPartiesWouldNotFit() {
		// Resto de un cambio de modo: un grupo de 4 sin mesa necesita la de 4, así que no se puede dar a otro.
		givenReservation(restaurant, shift, null, DATE, 4);

		assertThatThrownBy(() -> reserve(shift.id(), big.id(), 2)).isInstanceOf(NoTableAvailableException.class);
		assertThat(reserve(shift.id(), small.id(), 2).tableId()).isEqualTo(small.id());
	}

	@Test
	void assignedCreatesWithoutTable() {
		givenBookingMode(restaurant, BookingMode.ASSIGNED);

		Reservation reservation = reserve(shift.id(), null, 2);

		assertThat(reservation.status()).isEqualTo(ReservationStatus.PENDING);
		assertThat(reservation.tableId()).isNull();
		assertThat(reservations.findByCode(reservation.code())).get().extracting(Reservation::tableId).isNull();
	}

	@Test
	void assignedRejectsTableId() {
		givenBookingMode(restaurant, BookingMode.ASSIGNED);

		assertThatThrownBy(() -> reserve(shift.id(), big.id(), 2)).isInstanceOf(TableNotAllowedException.class);
	}

	@Test
	void assignedRejectsWhenUnassignedPartiesWouldNotFit() {
		givenBookingMode(restaurant, BookingMode.ASSIGNED);
		givenReservation(restaurant, shift, null, DATE, 4);

		assertThatThrownBy(() -> reserve(shift.id(), null, 4)).isInstanceOf(NoTableAvailableException.class);
		assertThat(reserve(shift.id(), null, 2).tableId()).isNull();
	}

	@Test
	void shiftOfOtherRestaurantIs404() {
		Restaurant other = givenRestaurant("otro");
		Shift foreignShift = givenDinnerShift(other);

		assertThatThrownBy(() -> reserve(foreignShift.id(), big.id(), 2)).isInstanceOf(ShiftNotFoundException.class);
		assertThat(jdbc.sql("SELECT count(*) FROM reservation").query(Long.class).single()).isZero();
	}

}
