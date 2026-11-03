package io.github.manuelcarro97.reservas.application.service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;

import org.springframework.stereotype.Service;

import io.github.manuelcarro97.reservas.application.port.in.ManageRestaurantUseCase;
import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.ClosureHasReservationsException;
import io.github.manuelcarro97.reservas.domain.exception.ShiftOverlapException;
import io.github.manuelcarro97.reservas.domain.model.Shift;

@Service
class RestaurantAdminService implements ManageRestaurantUseCase {

	private final RestaurantRepositoryPort restaurants;
	private final ShiftRepositoryPort shifts;
	private final ReservationRepositoryPort reservations;

	RestaurantAdminService(RestaurantRepositoryPort restaurants, ShiftRepositoryPort shifts,
			ReservationRepositoryPort reservations) {
		this.restaurants = restaurants;
		this.shifts = shifts;
		this.reservations = reservations;
	}

	@Override
	public Shift addShift(String ownerUid, String slug, String name, LocalTime start, LocalTime end,
			Set<DayOfWeek> days) {
		Shift shift = new Shift(null, RestaurantAccess.owned(restaurants, slug, ownerUid).id(), name, start, end, days);
		if (shifts.findAll(shift.restaurantId()).stream().anyMatch(shift::overlaps)) {
			throw new ShiftOverlapException();
		}
		return shifts.save(shift);
	}

	@Override
	public void addClosure(String ownerUid, String slug, LocalDate date, String reason) {
		long restaurantId = RestaurantAccess.owned(restaurants, slug, ownerUid).id();
		if (reservations.hasActive(restaurantId, date)) {
			throw new ClosureHasReservationsException();
		}
		restaurants.addClosure(restaurantId, date, reason);
	}

}
