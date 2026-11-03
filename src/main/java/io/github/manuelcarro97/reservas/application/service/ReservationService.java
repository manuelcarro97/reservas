package io.github.manuelcarro97.reservas.application.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import io.github.manuelcarro97.reservas.application.port.in.AdminReservation;
import io.github.manuelcarro97.reservas.application.port.in.CancelReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.CreateReservationCommand;
import io.github.manuelcarro97.reservas.application.port.in.CreateReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ExpirePendingReservationsUseCase;
import io.github.manuelcarro97.reservas.application.port.in.GetReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ManageReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ReservationDetails;
import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.TableRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.NoTableAvailableException;
import io.github.manuelcarro97.reservas.domain.exception.ReservationNotFoundException;
import io.github.manuelcarro97.reservas.domain.exception.RestaurantNotFoundException;
import io.github.manuelcarro97.reservas.domain.exception.ShiftNotFoundException;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.ReservationCode;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.service.BookingPolicy;
import io.github.manuelcarro97.reservas.domain.service.TableAssigner;

@Service
class ReservationService implements CreateReservationUseCase, GetReservationUseCase, CancelReservationUseCase,
		ManageReservationUseCase, ExpirePendingReservationsUseCase {

	private final RestaurantRepositoryPort restaurants;
	private final ShiftRepositoryPort shifts;
	private final TableRepositoryPort tables;
	private final ReservationRepositoryPort reservations;
	private final Clock clock;
	private final BookingPolicy bookingPolicy = new BookingPolicy();
	private final TableAssigner tableAssigner = new TableAssigner();

	ReservationService(RestaurantRepositoryPort restaurants, ShiftRepositoryPort shifts, TableRepositoryPort tables,
			ReservationRepositoryPort reservations, Clock clock) {
		this.restaurants = restaurants;
		this.shifts = shifts;
		this.tables = tables;
		this.reservations = reservations;
		this.clock = clock;
	}

	// Sin @Transactional: cada tryInsert confirma por sí mismo, y perder una mesa debe pasar a la siguiente.
	@Override
	public Reservation create(String slug, CreateReservationCommand command) {
		Restaurant restaurant = RestaurantAccess.published(restaurants, slug);
		Shift shift = shifts.findById(restaurant.id(), command.shiftId()).orElseThrow(ShiftNotFoundException::new);
		bookingPolicy.requireWithinWindow(restaurant, command.date(), clock);
		bookingPolicy.validate(restaurant, shift, command.date(), command.partySize(),
				restaurants.maxCapacity(restaurant.id()), restaurants.isClosed(restaurant.id(), command.date()), clock);

		List<DiningTable> free = tables.findFree(restaurant.id(), shift.id(), command.date());
		for (DiningTable table : tableAssigner.candidates(free, command.partySize())) {
			Optional<Reservation> inserted = reservations.tryInsert(pendingReservation(restaurant, table, command));
			if (inserted.isPresent()) {
				return inserted.get();
			}
		}
		throw new NoTableAvailableException();
	}

	@Override
	public ReservationDetails byCode(String code) {
		return details(findByCode(code));
	}

	@Override
	public ReservationDetails cancelByCode(String code) {
		Reservation reservation = findByCode(code);
		Restaurant restaurant = restaurantOf(reservation);
		reservation.cancelByCustomer(clock.instant(), shiftStart(reservation, restaurant),
				restaurant.cancellationDeadlineHours());
		return details(reservations.update(reservation));
	}

	@Override
	public List<AdminReservation> listByDate(String ownerUid, String slug, LocalDate date) {
		Restaurant restaurant = RestaurantAccess.owned(restaurants, slug, ownerUid);
		Map<Long, String> labels = tables.findAll(restaurant.id())
			.stream()
			.collect(Collectors.toMap(DiningTable::id, DiningTable::label));
		return reservations.findByDate(restaurant.id(), date)
			.stream()
			.map(reservation -> adminView(reservation, labels.get(reservation.tableId())))
			.toList();
	}

	@Override
	public ReservationDetails confirm(String ownerUid, long id) {
		Reservation reservation = ownedReservation(id, ownerUid);
		reservation.confirm(clock.instant(), shiftStart(reservation, restaurantOf(reservation)));
		return details(reservations.update(reservation));
	}

	@Override
	public ReservationDetails cancel(String ownerUid, long id) {
		Reservation reservation = ownedReservation(id, ownerUid);
		reservation.cancel();
		return details(reservations.update(reservation));
	}

	@Override
	public ReservationDetails markNoShow(String ownerUid, long id) {
		Reservation reservation = ownedReservation(id, ownerUid);
		reservation.markNoShow(clock.instant(), shiftStart(reservation, restaurantOf(reservation)));
		return details(reservations.update(reservation));
	}

	/** Reserva de un plano del dueño; la de un plano ajeno o borrado da el mismo error que una que no existe. */
	private Reservation ownedReservation(long id, String ownerUid) {
		Reservation reservation = reservations.findById(id).orElseThrow(ReservationNotFoundException::new);
		restaurants.findById(reservation.restaurantId())
			.filter(restaurant -> restaurant.isOwnedBy(ownerUid))
			.orElseThrow(ReservationNotFoundException::new);
		return reservation;
	}

	@Override
	public int expire() {
		return reservations.cancelPendingStartedBefore(clock.instant());
	}

	private Restaurant restaurantOf(Reservation reservation) {
		return restaurants.findById(reservation.restaurantId()).orElseThrow(RestaurantNotFoundException::new);
	}

	private Instant shiftStart(Reservation reservation, Restaurant restaurant) {
		Shift shift = shifts.findById(restaurant.id(), reservation.shiftId())
			.orElseThrow(ShiftNotFoundException::new);
		return shift.startsAt(reservation.date(), restaurant.zone());
	}

	private AdminReservation adminView(Reservation reservation, String tableLabel) {
		return new AdminReservation(reservation.id(), reservation.code(), reservation.status(), reservation.date(),
				reservation.shiftId(), reservation.partySize(), tableLabel, reservation.customerName(),
				reservation.customerPhone(), reservation.customerEmail());
	}

	private String tableLabel(Reservation reservation) {
		if (reservation.tableId() == null) {
			return null;
		}
		return tables.findById(reservation.tableId()).map(DiningTable::label).orElse(null);
	}

	private Reservation findByCode(String code) {
		return reservations.findByCode(code).orElseThrow(ReservationNotFoundException::new);
	}

	private ReservationDetails details(Reservation reservation) {
		return new ReservationDetails(reservation.code(), reservation.status(), reservation.date(),
				reservation.shiftId(), reservation.partySize(), tableLabel(reservation));
	}

	private Reservation pendingReservation(Restaurant restaurant, DiningTable table, CreateReservationCommand command) {
		return Reservation.newPending(ReservationCode.generate(), restaurant.id(), command.shiftId(), table.id(),
				command.date(), command.partySize(), command.customerName(), command.customerPhone(),
				command.customerEmail(), clock.instant());
	}

}
