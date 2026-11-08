package io.github.manuelcarro97.reservas.application.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.manuelcarro97.reservas.application.port.in.ManageShiftsUseCase;
import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.ClosureDateOutOfRangeException;
import io.github.manuelcarro97.reservas.domain.exception.ClosureHasReservationsException;
import io.github.manuelcarro97.reservas.domain.exception.ShiftHasReservationsException;
import io.github.manuelcarro97.reservas.domain.exception.ShiftLimitReachedException;
import io.github.manuelcarro97.reservas.domain.exception.ShiftNotFoundException;
import io.github.manuelcarro97.reservas.domain.exception.ShiftOverlapException;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;

@Service
@Transactional
class ShiftAdminService implements ManageShiftsUseCase {

	/** Turnos visibles por plano: sin tope, un cliente con token podría crear filas sin límite en una base pequeña. */
	static final int MAX_SHIFTS = 10;
	/** Un cierre se puede poner hasta este número de días después de hoy. */
	static final int MAX_CLOSURE_DAYS_AHEAD = 90;

	private final RestaurantRepositoryPort restaurants;
	private final ShiftRepositoryPort shifts;
	private final ReservationRepositoryPort reservations;
	private final Clock clock;

	ShiftAdminService(RestaurantRepositoryPort restaurants, ShiftRepositoryPort shifts,
			ReservationRepositoryPort reservations, Clock clock) {
		this.restaurants = restaurants;
		this.shifts = shifts;
		this.reservations = reservations;
		this.clock = clock;
	}

	@Override
	@Transactional(readOnly = true)
	public List<Shift> list(String ownerUid, String slug) {
		return shifts.findAll(RestaurantAccess.owned(restaurants, slug, ownerUid).id());
	}

	@Override
	public Shift add(String ownerUid, String slug, String name, LocalTime start, LocalTime end, Set<DayOfWeek> days) {
		Restaurant plan = lockOwned(ownerUid, slug);
		// findAll solo trae los turnos visibles: uno borrado (oculto) no cuenta. El cupo se lee con el plano bloqueado,
		// así que dos altas a la vez no pasan del tope.
		if (shifts.findAll(plan.id()).size() >= MAX_SHIFTS) {
			throw new ShiftLimitReachedException(MAX_SHIFTS);
		}
		Shift shift = new Shift(null, plan.id(), name, start, end, days);
		requireNoOverlap(shift);
		return shifts.save(shift);
	}

	@Override
	public Shift rename(String ownerUid, String slug, long shiftId, String name) {
		Restaurant plan = lockOwned(ownerUid, slug);
		Shift shift = visibleShift(plan, shiftId);
		shifts.rename(plan.id(), shift.id(), name);
		return new Shift(shift.id(), shift.restaurantId(), name, shift.start(), shift.end(), shift.days());
	}

	@Override
	public Shift reschedule(String ownerUid, String slug, long shiftId, LocalTime start, LocalTime end,
			Set<DayOfWeek> days) {
		Restaurant plan = lockOwned(ownerUid, slug);
		Shift shift = visibleShift(plan, shiftId);
		requireNoActiveReservations(plan, shift);
		Shift moved = new Shift(shift.id(), shift.restaurantId(), shift.name(), start, end, days);
		requireNoOverlap(moved);
		shifts.reschedule(plan.id(), shift.id(), start, end, days);
		return moved;
	}

	@Override
	public void delete(String ownerUid, String slug, long shiftId) {
		Restaurant plan = lockOwned(ownerUid, slug);
		Shift shift = visibleShift(plan, shiftId);
		requireNoActiveReservations(plan, shift);
		if (shifts.hasAnyReservation(shift.id())) {
			shifts.softDelete(plan.id(), shift.id(), clock.instant());
		}
		else {
			shifts.delete(plan.id(), shift.id());
		}
	}

	@Override
	public void addClosure(String ownerUid, String slug, LocalDate date, String reason) {
		Restaurant plan = lockOwned(ownerUid, slug);
		// "Hoy" en la zona del plano, como en el resto de reglas de fechas.
		LocalDate today = LocalDate.ofInstant(clock.instant(), plan.zone());
		if (date.isBefore(today) || date.isAfter(today.plusDays(MAX_CLOSURE_DAYS_AHEAD))) {
			throw new ClosureDateOutOfRangeException(MAX_CLOSURE_DAYS_AHEAD);
		}
		List<String> codes = reservations.findActiveFrom(plan.id(), date)
			.stream()
			.filter(reservation -> reservation.date().equals(date))
			.map(Reservation::code)
			.toList();
		if (!codes.isEmpty()) {
			throw new ClosureHasReservationsException(codes);
		}
		// Cerrar un día ya cerrado no cambia nada; comprobarlo aquí evita una violación de unicidad que dejaría la
		// transacción abortada.
		if (!restaurants.isClosed(plan.id(), date)) {
			restaurants.addClosure(plan.id(), date, reason);
		}
	}

	@Override
	@Transactional(readOnly = true)
	public List<LocalDate> closures(String ownerUid, String slug, LocalDate from) {
		return restaurants.closuresFrom(RestaurantAccess.owned(restaurants, slug, ownerUid).id(), from);
	}

	@Override
	public void removeClosure(String ownerUid, String slug, LocalDate date) {
		restaurants.removeClosure(lockOwned(ownerUid, slug).id(), date);
	}

	private Restaurant lockOwned(String ownerUid, String slug) {
		Restaurant found = RestaurantAccess.owned(restaurants, slug, ownerUid);
		return RestaurantAccess.requireOwnedBy(restaurants.lock(found.id()), ownerUid);
	}

	/** Un turno oculto cuenta como inexistente: no se puede renombrar, mover ni borrar otra vez. */
	private Shift visibleShift(Restaurant plan, long shiftId) {
		return shifts.findAll(plan.id())
			.stream()
			.filter(shift -> shift.id() == shiftId)
			.findFirst()
			.orElseThrow(ShiftNotFoundException::new);
	}

	private void requireNoOverlap(Shift candidate) {
		boolean overlaps = shifts.findAll(candidate.restaurantId())
			.stream()
			.filter(other -> !other.id().equals(candidate.id()))
			.anyMatch(candidate::overlaps);
		if (overlaps) {
			throw new ShiftOverlapException();
		}
	}

	/** "Hoy" en la zona del plano: a las 23:30 UTC en Madrid ya es el día siguiente. */
	private void requireNoActiveReservations(Restaurant plan, Shift shift) {
		LocalDate today = LocalDate.ofInstant(clock.instant(), plan.zone());
		List<String> codes = reservations.findActiveFrom(plan.id(), today)
			.stream()
			.filter(reservation -> reservation.shiftId() == shift.id())
			.map(Reservation::code)
			.toList();
		if (!codes.isEmpty()) {
			throw new ShiftHasReservationsException(codes);
		}
	}

}
