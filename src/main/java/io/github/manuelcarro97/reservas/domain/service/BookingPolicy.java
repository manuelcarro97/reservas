package io.github.manuelcarro97.reservas.domain.service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import io.github.manuelcarro97.reservas.domain.exception.DateInPastException;
import io.github.manuelcarro97.reservas.domain.exception.DateTooFarException;
import io.github.manuelcarro97.reservas.domain.exception.PartyTooLargeException;
import io.github.manuelcarro97.reservas.domain.exception.RestaurantClosedException;
import io.github.manuelcarro97.reservas.domain.exception.ShiftNotOpenException;
import io.github.manuelcarro97.reservas.domain.exception.TooManyActiveReservationsException;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;

public class BookingPolicy {

	public static final int BOOKING_WINDOW_DAYS = 90;
	public static final int MAX_ACTIVE_RESERVATIONS_PER_PHONE = 3;

	public boolean isWithinWindow(Restaurant restaurant, LocalDate date, Clock clock) {
		LocalDate today = LocalDate.ofInstant(clock.instant(), restaurant.zone());
		return !date.isBefore(today) && !date.isAfter(today.plusDays(BOOKING_WINDOW_DAYS));
	}

	public void requireWithinWindow(Restaurant restaurant, LocalDate date, Clock clock) {
		LocalDate today = LocalDate.ofInstant(clock.instant(), restaurant.zone());
		if (date.isBefore(today)) {
			throw new DateInPastException();
		}
		if (date.isAfter(today.plusDays(BOOKING_WINDOW_DAYS))) {
			throw new DateTooFarException();
		}
	}

	/**
	 * Un mismo teléfono no puede tener más de {@value #MAX_ACTIVE_RESERVATIONS_PER_PHONE} reservas activas en el plano.
	 * {@code activeReservations} son las activas del plano (PENDING o CONFIRMED de hoy en adelante). Los teléfonos se
	 * comparan solo por sus dígitos, porque el campo es texto libre ("600 111 222" y "600111222" son el mismo). Las
	 * reservas anonimizadas (teléfono "-") no tienen dígitos y no cuentan; un teléfono nuevo sin dígitos tampoco se limita.
	 */
	public void requireBelowPhoneLimit(String phone, List<Reservation> activeReservations) {
		String digits = digitsOf(phone);
		if (digits.isEmpty()) {
			return;
		}
		long active = activeReservations.stream()
			.filter(reservation -> digits.equals(digitsOf(reservation.customerPhone())))
			.count();
		if (active >= MAX_ACTIVE_RESERVATIONS_PER_PHONE) {
			throw new TooManyActiveReservationsException();
		}
	}

	private static String digitsOf(String phone) {
		return phone == null ? "" : phone.replaceAll("\\D", "");
	}

	public void validate(Restaurant restaurant, Shift shift, LocalDate date, int partySize, int maxCapacity,
			boolean closed, Clock clock) {
		requireWithinWindow(restaurant, date, clock);
		if (!shift.startsAt(date, restaurant.zone()).isAfter(clock.instant())) {
			throw new DateInPastException();
		}
		if (closed) {
			throw new RestaurantClosedException();
		}
		if (!shift.opensOn(date)) {
			throw new ShiftNotOpenException();
		}
		if (partySize > maxCapacity) {
			throw new PartyTooLargeException();
		}
	}

}
