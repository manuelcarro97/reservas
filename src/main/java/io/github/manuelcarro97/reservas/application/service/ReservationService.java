package io.github.manuelcarro97.reservas.application.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
import io.github.manuelcarro97.reservas.domain.exception.TableNotAllowedException;
import io.github.manuelcarro97.reservas.domain.exception.TableNotFoundException;
import io.github.manuelcarro97.reservas.domain.exception.TableRequiredException;
import io.github.manuelcarro97.reservas.domain.exception.TableTakenException;
import io.github.manuelcarro97.reservas.domain.exception.TableTooSmallException;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.ReservationCode;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.service.BookingPolicy;
import io.github.manuelcarro97.reservas.domain.service.SeatingCapacity;

@Service
class ReservationService implements CreateReservationUseCase, GetReservationUseCase, CancelReservationUseCase,
		ManageReservationUseCase, ExpirePendingReservationsUseCase {

	private final RestaurantRepositoryPort restaurants;
	private final ShiftRepositoryPort shifts;
	private final TableRepositoryPort tables;
	private final ReservationRepositoryPort reservations;
	private final Clock clock;
	private final BookingPolicy bookingPolicy = new BookingPolicy();
	private final SeatingCapacity seatingCapacity = new SeatingCapacity();

	ReservationService(RestaurantRepositoryPort restaurants, ShiftRepositoryPort shifts, TableRepositoryPort tables,
			ReservationRepositoryPort reservations, Clock clock) {
		this.restaurants = restaurants;
		this.shifts = shifts;
		this.tables = tables;
		this.reservations = reservations;
		this.clock = clock;
	}

	/**
	 * Todo el alta va bajo el bloqueo del plano: la regla de capacidad del modo asignado y la carrera con guardar el
	 * plano o editar turnos son atómicas. El {@code ON CONFLICT} de {@code tryInsert} sigue siendo la garantía dura
	 * contra el doble reparto de una mesa.
	 */
	@Override
	@Transactional
	public Reservation create(String slug, CreateReservationCommand command) {
		// La lectura sin bloqueo solo da el id; el estado que vale es el de la fila ya bloqueada.
		long restaurantId = RestaurantAccess.published(restaurants, slug).id();
		Restaurant restaurant = restaurants.lock(restaurantId);
		if (restaurant.status() != PlanStatus.PUBLISHED) {
			throw new RestaurantNotFoundException();
		}
		// findAll y no findById: un turno oculto (borrado lógico) no admite reservas nuevas.
		Shift shift = shifts.findAll(restaurant.id())
			.stream()
			.filter(candidate -> candidate.id() == command.shiftId())
			.findFirst()
			.orElseThrow(ShiftNotFoundException::new);
		bookingPolicy.requireWithinWindow(restaurant, command.date(), clock);
		bookingPolicy.validate(restaurant, shift, command.date(), command.partySize(),
				restaurants.maxCapacity(restaurant.id()), restaurants.isClosed(restaurant.id(), command.date()), clock);

		List<DiningTable> free = tables.findFree(restaurant.id(), shift.id(), command.date());
		List<Integer> unassignedParties = reservations.findActiveFor(restaurant.id(), shift.id(), command.date())
			.stream()
			.filter(reservation -> reservation.tableId() == null)
			.map(Reservation::partySize)
			.toList();
		return switch (restaurant.bookingMode()) {
			case FREE_CHOICE -> createOnChosenTable(restaurant, free, unassignedParties, command);
			case ASSIGNED -> createWithoutTable(restaurant, free, unassignedParties, command);
		};
	}

	private Reservation createOnChosenTable(Restaurant restaurant, List<DiningTable> free,
			List<Integer> unassignedParties, CreateReservationCommand command) {
		if (command.tableId() == null) {
			throw new TableRequiredException();
		}
		// findAll y no findById: este solo trae las mesas vivas del plano, y findById también las borradas y ajenas.
		DiningTable table = tables.findAll(restaurant.id())
			.stream()
			.filter(candidate -> candidate.id().equals(command.tableId()))
			.findFirst()
			.orElseThrow(TableNotFoundException::new);
		if (table.seats() < command.partySize()) {
			throw new TableTooSmallException();
		}
		if (free.stream().noneMatch(candidate -> candidate.id().equals(table.id()))) {
			throw new TableTakenException();
		}
		// Un resto de cambio de modo (reserva sin mesa) sigue necesitando la suya: la elegida no puede quitársela.
		boolean leavesRoomForUnassigned = unassignedParties.isEmpty()
				|| seatingCapacity.canSeatAll(seatsOfOthers(free, table), unassignedParties);
		if (!leavesRoomForUnassigned) {
			throw new NoTableAvailableException();
		}
		return reservations.tryInsert(pendingReservation(restaurant, table.id(), command))
			.orElseThrow(TableTakenException::new);
	}

	private Reservation createWithoutTable(Restaurant restaurant, List<DiningTable> free,
			List<Integer> unassignedParties, CreateReservationCommand command) {
		if (command.tableId() != null) {
			throw new TableNotAllowedException();
		}
		List<Integer> parties = new ArrayList<>(unassignedParties);
		parties.add(command.partySize());
		List<Integer> freeSeats = free.stream().map(DiningTable::seats).toList();
		if (!seatingCapacity.canSeatAll(freeSeats, parties)) {
			throw new NoTableAvailableException();
		}
		// Sin mesa no hay clave en el índice único, así que el insert no puede chocar.
		return reservations.tryInsert(pendingReservation(restaurant, null, command))
			.orElseThrow(NoTableAvailableException::new);
	}

	private static List<Integer> seatsOfOthers(List<DiningTable> free, DiningTable chosen) {
		return free.stream().filter(candidate -> !candidate.id().equals(chosen.id())).map(DiningTable::seats).toList();
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

	private Reservation pendingReservation(Restaurant restaurant, Long tableId, CreateReservationCommand command) {
		return Reservation.newPending(ReservationCode.generate(restaurant.slug()), restaurant.id(), command.shiftId(),
				tableId, command.date(), command.partySize(), command.customerName(), command.customerPhone(),
				command.customerEmail(), clock.instant());
	}

}
