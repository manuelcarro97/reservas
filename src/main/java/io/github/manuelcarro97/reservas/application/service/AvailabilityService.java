package io.github.manuelcarro97.reservas.application.service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import io.github.manuelcarro97.reservas.application.port.in.GetAvailabilityUseCase;
import io.github.manuelcarro97.reservas.application.port.in.GetOccupancyUseCase;
import io.github.manuelcarro97.reservas.application.port.in.GetPublicPlanUseCase;
import io.github.manuelcarro97.reservas.application.port.in.PlanView;
import io.github.manuelcarro97.reservas.application.port.in.ShiftAvailability;
import io.github.manuelcarro97.reservas.application.port.in.TableOccupancy;
import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.TableRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.ShiftNotFoundException;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.service.ArrivalPolicy;
import io.github.manuelcarro97.reservas.domain.service.BookingPolicy;
import io.github.manuelcarro97.reservas.domain.service.SeatingCapacity;

@Service
class AvailabilityService implements GetAvailabilityUseCase, GetOccupancyUseCase, GetPublicPlanUseCase {

	private final RestaurantRepositoryPort restaurants;
	private final ShiftRepositoryPort shifts;
	private final TableRepositoryPort tables;
	private final ReservationRepositoryPort reservations;
	private final Clock clock;
	private final BookingPolicy bookingPolicy = new BookingPolicy();
	private final SeatingCapacity seatingCapacity = new SeatingCapacity();
	private final ArrivalPolicy arrivalPolicy = new ArrivalPolicy();

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
		Restaurant restaurant = RestaurantAccess.published(restaurants, slug);
		if (!bookingPolicy.isWithinWindow(restaurant, date, clock) || restaurants.isClosed(restaurant.id(), date)) {
			return List.of();
		}
		return shifts.findAll(restaurant.id())
			.stream()
			.filter(shift -> shift.opensOn(date))
			.map(shift -> shiftAvailability(restaurant, shift, date, partySize))
			.toList();
	}

	/** Un turno que no admite reservas tampoco ofrece horas de llegada. */
	private ShiftAvailability shiftAvailability(Restaurant restaurant, Shift shift, LocalDate date, int partySize) {
		boolean available = isAvailable(restaurant, shift, date, partySize);
		List<LocalTime> arrivalTimes = available
				? arrivalPolicy.availableSlots(shift, date, restaurant.zone(), clock.instant()) : List.of();
		return new ShiftAvailability(shift.id(), shift.name(), shift.start(), available, arrivalTimes);
	}

	@Override
	public List<TableOccupancy> occupancy(String ownerUid, String slug, long shiftId, LocalDate date) {
		Restaurant restaurant = RestaurantAccess.owned(restaurants, slug, ownerUid);
		Shift shift = shifts.findById(restaurant.id(), shiftId).orElseThrow(ShiftNotFoundException::new);
		Set<Long> occupied = reservations.occupiedTableIds(restaurant.id(), shift.id(), date);
		return tables.findAll(restaurant.id())
			.stream()
			.map(table -> new TableOccupancy(table.id(), table.label(), table.seats(), table.x(), table.y(),
					occupied.contains(table.id())))
			.toList();
	}

	@Override
	public PlanView plan(String slug) {
		Restaurant restaurant = RestaurantAccess.published(restaurants, slug);
		return new PlanView(restaurant, tables.findAll(restaurant.id()), shifts.findAll(restaurant.id()));
	}

	@Override
	public List<TableOccupancy> occupancy(String slug, long shiftId, LocalDate date) {
		Restaurant restaurant = RestaurantAccess.published(restaurants, slug);
		// findAll y no findById: un turno oculto, o de otro plano, no existe para el público.
		Shift shift = shifts.findAll(restaurant.id())
			.stream()
			.filter(candidate -> candidate.id() == shiftId)
			.findFirst()
			.orElseThrow(ShiftNotFoundException::new);
		boolean bookable = bookingPolicy.isWithinWindow(restaurant, date, clock)
				&& !restaurants.isClosed(restaurant.id(), date);
		Set<Long> occupied = bookable ? reservations.occupiedTableIds(restaurant.id(), shift.id(), date) : Set.of();
		return tables.findAll(restaurant.id())
			.stream()
			.map(table -> new TableOccupancy(table.id(), table.label(), table.seats(), table.x(), table.y(),
					!bookable || occupied.contains(table.id())))
			.toList();
	}

	/**
	 * Cada grupo necesita una mesa distinta con plazas suficientes. Los grupos sin mesa que ya hay en el turno (todos
	 * los del modo asignado, y los restos de un cambio de modo en elección libre) siguen necesitando la suya, así que
	 * el nuevo grupo se suma a ellos. Sin grupos sin mesa, esto es "queda una mesa libre donde cabe el grupo".
	 */
	private boolean isAvailable(Restaurant restaurant, Shift shift, LocalDate date, int partySize) {
		if (!shift.startsAt(date, restaurant.zone()).isAfter(clock.instant())) {
			return false;
		}
		List<Integer> freeSeats = tables.findFree(restaurant.id(), shift.id(), date)
			.stream()
			.map(DiningTable::seats)
			.toList();
		List<Integer> parties = new ArrayList<>();
		reservations.findActiveFor(restaurant.id(), shift.id(), date)
			.stream()
			.filter(reservation -> reservation.tableId() == null)
			.map(Reservation::partySize)
			.forEach(parties::add);
		parties.add(partySize);
		return seatingCapacity.canSeatAll(freeSeats, parties);
	}

}
