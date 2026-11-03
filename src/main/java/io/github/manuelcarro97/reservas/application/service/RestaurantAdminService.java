package io.github.manuelcarro97.reservas.application.service;

import java.time.DateTimeException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Set;

import org.springframework.stereotype.Service;

import io.github.manuelcarro97.reservas.application.port.in.ManageRestaurantUseCase;
import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.TableRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.ClosureHasReservationsException;
import io.github.manuelcarro97.reservas.domain.exception.InvalidZoneException;
import io.github.manuelcarro97.reservas.domain.exception.RestaurantNotFoundException;
import io.github.manuelcarro97.reservas.domain.exception.ShiftOverlapException;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.model.TableShape;
import io.github.manuelcarro97.reservas.domain.model.Theme;

@Service
class RestaurantAdminService implements ManageRestaurantUseCase {

	private final RestaurantRepositoryPort restaurants;
	private final TableRepositoryPort tables;
	private final ShiftRepositoryPort shifts;
	private final ReservationRepositoryPort reservations;

	RestaurantAdminService(RestaurantRepositoryPort restaurants, TableRepositoryPort tables,
			ShiftRepositoryPort shifts, ReservationRepositoryPort reservations) {
		this.restaurants = restaurants;
		this.tables = tables;
		this.shifts = shifts;
		this.reservations = reservations;
	}

	@Override
	public Restaurant createRestaurant(String slug, String name, String zoneId, int cancellationDeadlineHours) {
		return restaurants.save(new Restaurant(null, slug, name, parseZone(zoneId), cancellationDeadlineHours, null,
				PlanStatus.PUBLISHED, RoomLayout.defaultRoom(), Theme.AZUL, BookingMode.FREE_CHOICE));
	}

	@Override
	public DiningTable addTable(String slug, String label, int seats, int x, int y) {
		return tables.save(new DiningTable(null, findRestaurant(slug).id(), label, TableShape.SQUARE, seats, 0, x, y));
	}

	@Override
	public Shift addShift(String slug, String name, LocalTime start, LocalTime end, Set<DayOfWeek> days) {
		Shift shift = new Shift(null, findRestaurant(slug).id(), name, start, end, days);
		if (shifts.findAll(shift.restaurantId()).stream().anyMatch(shift::overlaps)) {
			throw new ShiftOverlapException();
		}
		return shifts.save(shift);
	}

	@Override
	public void addClosure(String slug, LocalDate date, String reason) {
		long restaurantId = findRestaurant(slug).id();
		if (reservations.hasActive(restaurantId, date)) {
			throw new ClosureHasReservationsException();
		}
		restaurants.addClosure(restaurantId, date, reason);
	}

	private Restaurant findRestaurant(String slug) {
		return restaurants.findBySlug(slug).orElseThrow(RestaurantNotFoundException::new);
	}

	private static ZoneId parseZone(String zoneId) {
		try {
			return ZoneId.of(zoneId);
		}
		catch (DateTimeException unknownZone) {
			throw new InvalidZoneException();
		}
	}

}
