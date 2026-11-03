package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.domain.model.Shift;

@Component
class ShiftPersistenceAdapter implements ShiftRepositoryPort {

	private final ShiftJpaRepository shifts;

	ShiftPersistenceAdapter(ShiftJpaRepository shifts) {
		this.shifts = shifts;
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

}
