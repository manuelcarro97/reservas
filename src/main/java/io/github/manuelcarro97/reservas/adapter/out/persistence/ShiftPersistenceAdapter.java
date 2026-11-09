package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.ShiftNotFoundException;
import io.github.manuelcarro97.reservas.domain.model.Shift;

@Component
class ShiftPersistenceAdapter implements ShiftRepositoryPort {

	private final ShiftJpaRepository shifts;
	private final ReservationJpaRepository reservations;

	ShiftPersistenceAdapter(ShiftJpaRepository shifts, ReservationJpaRepository reservations) {
		this.shifts = shifts;
		this.reservations = reservations;
	}

	@Override
	public Optional<Shift> findById(long restaurantId, long shiftId) {
		return shifts.findByIdAndRestaurantId(shiftId, restaurantId).map(ShiftEntity::toDomain);
	}

	@Override
	public List<Shift> findAll(long restaurantId) {
		return shifts.findByRestaurantIdAndDeletedAtIsNullOrderByStartTime(restaurantId).stream().map(ShiftEntity::toDomain).toList();
	}

	@Override
	public Shift save(Shift shift) {
		return shifts.save(ShiftEntity.from(shift)).toDomain();
	}

	@Override
	public void rename(long restaurantId, long shiftId, String name) {
		requireOneRow(shifts.rename(shiftId, restaurantId, name));
	}

	@Override
	public void reschedule(long restaurantId, long shiftId, LocalTime start, LocalTime end, Set<DayOfWeek> days) {
		requireOneRow(shifts.reschedule(shiftId, restaurantId, start, end, ShiftEntity.daysOf(days)));
	}

	@Override
	public void softDelete(long restaurantId, long shiftId, Instant at) {
		requireOneRow(shifts.softDelete(shiftId, restaurantId, at));
	}

	@Override
	public void delete(long restaurantId, long shiftId) {
		requireOneRow(shifts.delete(shiftId, restaurantId));
	}

	@Override
	public boolean hasAnyReservation(long shiftId) {
		return reservations.existsByShiftId(shiftId);
	}

	/** Ninguna fila tocada = el turno no es de este plano o ya está oculto. */
	private static void requireOneRow(int updated) {
		if (updated != 1) {
			throw new ShiftNotFoundException();
		}
	}

}
