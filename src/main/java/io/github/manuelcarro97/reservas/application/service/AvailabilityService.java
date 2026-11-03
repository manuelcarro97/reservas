package io.github.manuelcarro97.reservas.application.service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import io.github.manuelcarro97.reservas.application.port.in.GetAvailabilityUseCase;
import io.github.manuelcarro97.reservas.application.port.in.GetOccupancyUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ShiftAvailability;
import io.github.manuelcarro97.reservas.application.port.in.TableOccupancy;
import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.TableRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.RestaurantNotFoundException;
import io.github.manuelcarro97.reservas.domain.exception.ShiftNotFoundException;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.service.BookingPolicy;
import io.github.manuelcarro97.reservas.domain.service.TableAssigner;

@Service
class AvailabilityService implements GetAvailabilityUseCase, GetOccupancyUseCase {

	private final RestaurantRepositoryPort restaurants;
	private final ShiftRepositoryPort shifts;
	private final TableRepositoryPort tables;
	private final ReservationRepositoryPort reservations;
	private final Clock clock;
	private final BookingPolicy bookingPolicy = new BookingPolicy();
	private final TableAssigner tableAssigner = new TableAssigner();

	AvailabilityService(RestaurantRepositoryPort restaurants, ShiftRepositoryPort shifts, TableRepositoryPort tables,
			ReservationRepositoryPort reservations, Clock clock) {
		this.restaurants = restaurants;
		this.shifts = shifts;
		this.tables = tables;
		this.reservations = reservations;
		this.clock = clock;
	}

	@Override
	public List<ShiftAvailability> availability(String slug, LocalDate date, int partySize) {
		Restaurant restaurant = findRestaurant(slug);
		if (!bookingPolicy.isWithinWindow(restaurant, date, clock) || restaurants.isClosed(restaurant.id(), date)) {
			return List.of();
		}
		return shifts.findAll(restaurant.id())
			.stream()
			.filter(shift -> shift.opensOn(date))
			.map(shift -> new ShiftAvailability(shift.id(), shift.name(), shift.start(),
					isAvailable(restaurant, shift, date, partySize)))
			.toList();
	}

	@Override
	public List<TableOccupancy> occupancy(String slug, long shiftId, LocalDate date) {
		Restaurant restaurant = findRestaurant(slug);
		Shift shift = shifts.findById(restaurant.id(), shiftId).orElseThrow(ShiftNotFoundException::new);
		Set<Long> occupied = reservations.occupiedTableIds(restaurant.id(), shift.id(), date);
		return tables.findAll(restaurant.id())
			.stream()
			.map(table -> new TableOccupancy(table.id(), table.label(), table.seats(), table.x(), table.y(),
					occupied.contains(table.id())))
			.toList();
	}

	private boolean isAvailable(Restaurant restaurant, Shift shift, LocalDate date, int partySize) {
		if (!shift.startsAt(date, restaurant.zone()).isAfter(clock.instant())) {
			return false;
		}
		return !tableAssigner.candidates(tables.findFree(restaurant.id(), shift.id(), date), partySize).isEmpty();
	}

	private Restaurant findRestaurant(String slug) {
		return restaurants.findBySlug(slug).orElseThrow(RestaurantNotFoundException::new);
	}

}
