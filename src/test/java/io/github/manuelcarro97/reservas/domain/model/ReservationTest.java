package io.github.manuelcarro97.reservas.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import org.junit.jupiter.api.Test;

import io.github.manuelcarro97.reservas.domain.exception.CancellationDeadlinePassedException;
import io.github.manuelcarro97.reservas.domain.exception.InvalidTransitionException;
import io.github.manuelcarro97.reservas.domain.exception.TableRequiredToConfirmException;
import io.github.manuelcarro97.reservas.domain.exception.TableTooSmallException;

class ReservationTest {

	private static final Instant SHIFT_START = Instant.parse("2026-12-01T19:00:00Z");
	private static final int DEADLINE_HOURS = 2;

	private static Reservation pending() {
		return Reservation.newPending("ABCD", 1L, 2L, 3L, LocalDate.of(2026, 12, 1), LocalTime.of(20, 30), 2, "Ana",
				"600000000", null,
				Instant.parse("2026-11-01T10:00:00Z"));
	}

	private static Reservation pendingWithoutTable() {
		return Reservation.newPending("ABCD", 1L, 2L, null, LocalDate.of(2026, 12, 1), LocalTime.of(20, 30), 2, "Ana",
				"600000000", null,
				Instant.parse("2026-11-01T10:00:00Z"));
	}

	private static Reservation confirmed() {
		Reservation reservation = pending();
		reservation.confirm(SHIFT_START.minusSeconds(1), SHIFT_START);
		return reservation;
	}

	private static Reservation cancelled() {
		Reservation reservation = pending();
		reservation.cancel();
		return reservation;
	}

	@Test
	void newPendingKeepsTheArrivalTime() {
		assertThat(pending().arrivalTime()).isEqualTo(LocalTime.of(20, 30));
	}

	@Test
	void confirmFromPending() {
		assertThat(confirmed().status()).isEqualTo(ReservationStatus.CONFIRMED);
	}

	@Test
	void cancelFromPending() {
		assertThat(cancelled().status()).isEqualTo(ReservationStatus.CANCELLED);
	}

	@Test
	void cancelFromConfirmed() {
		Reservation reservation = confirmed();

		reservation.cancel();

		assertThat(reservation.status()).isEqualTo(ReservationStatus.CANCELLED);
	}

	@Test
	void noShowFromConfirmedAfterShiftStart() {
		Reservation reservation = confirmed();

		reservation.markNoShow(SHIFT_START, SHIFT_START);

		assertThat(reservation.status()).isEqualTo(ReservationStatus.NO_SHOW);
	}

	@Test
	void confirmCancelled() {
		assertThatThrownBy(() -> cancelled().confirm(SHIFT_START.minusSeconds(1), SHIFT_START))
				.isInstanceOf(InvalidTransitionException.class);
	}

	@Test
	void confirmOnceShiftStartedThrows() {
		assertThatThrownBy(() -> pending().confirm(SHIFT_START, SHIFT_START))
				.isInstanceOf(InvalidTransitionException.class);
	}

	@Test
	void cancelCancelled() {
		assertThatThrownBy(() -> cancelled().cancel()).isInstanceOf(InvalidTransitionException.class);
	}

	@Test
	void noShowPending() {
		assertThatThrownBy(() -> pending().markNoShow(SHIFT_START, SHIFT_START))
				.isInstanceOf(InvalidTransitionException.class);
	}

	@Test
	void noShowBeforeShiftStart() {
		assertThatThrownBy(() -> confirmed().markNoShow(SHIFT_START.minusSeconds(1), SHIFT_START))
				.isInstanceOf(InvalidTransitionException.class);
	}

	@Test
	void customerCancelExactlyAtDeadlineIsAllowed() {
		Reservation reservation = pending();

		reservation.cancelByCustomer(SHIFT_START.minusSeconds(2 * 3600), SHIFT_START, DEADLINE_HOURS);

		assertThat(reservation.status()).isEqualTo(ReservationStatus.CANCELLED);
	}

	@Test
	void customerCancelAfterDeadlineThrows() {
		Instant late = SHIFT_START.minusSeconds(2 * 3600 - 1);

		assertThatThrownBy(() -> pending().cancelByCustomer(late, SHIFT_START, DEADLINE_HOURS))
				.isInstanceOf(CancellationDeadlinePassedException.class);
	}

	@Test
	void customerCancelTwiceIsInvalidTransition() {
		Instant early = SHIFT_START.minusSeconds(10 * 3600);

		assertThatThrownBy(() -> cancelled().cancelByCustomer(early, SHIFT_START, DEADLINE_HOURS))
				.isInstanceOf(InvalidTransitionException.class);
	}

	@Test
	void assignTableToPending() {
		Reservation reservation = pendingWithoutTable();

		reservation.assignTable(7L, 2);

		assertThat(reservation.tableId()).isEqualTo(7L);
		assertThat(reservation.status()).isEqualTo(ReservationStatus.PENDING);
	}

	@Test
	void assignTableToConfirmedKeepsStatus() {
		Reservation reservation = confirmed();

		reservation.assignTable(7L, 4);

		assertThat(reservation.tableId()).isEqualTo(7L);
		assertThat(reservation.status()).isEqualTo(ReservationStatus.CONFIRMED);
	}

	@Test
	void assignTableTooSmall() {
		Reservation reservation = pendingWithoutTable();

		assertThatThrownBy(() -> reservation.assignTable(7L, 1)).isInstanceOf(TableTooSmallException.class);
		assertThat(reservation.tableId()).isNull();
	}

	@Test
	void assignTableToCancelledIsInvalid() {
		assertThatThrownBy(() -> cancelled().assignTable(7L, 4)).isInstanceOf(InvalidTransitionException.class);
	}

	@Test
	void confirmWithoutTableThrowsTableRequired() {
		assertThatThrownBy(() -> pendingWithoutTable().confirm(SHIFT_START.minusSeconds(1), SHIFT_START))
				.isInstanceOf(TableRequiredToConfirmException.class);
	}

}
