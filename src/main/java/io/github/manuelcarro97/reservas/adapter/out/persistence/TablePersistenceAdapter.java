package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.application.port.out.TableRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.AlreadyExistsException;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;

@Component
class TablePersistenceAdapter implements TableRepositoryPort {

	private final DiningTableJpaRepository tables;

	TablePersistenceAdapter(DiningTableJpaRepository tables) {
		this.tables = tables;
	}

	@Override
	public List<DiningTable> findFree(long restaurantId, long shiftId, LocalDate date) {
		return tables.findFree(restaurantId, shiftId, date).stream().map(DiningTableEntity::toDomain).toList();
	}

	@Override
	public List<DiningTable> findAll(long restaurantId) {
		return tables.findByRestaurantIdAndDeletedAtIsNullOrderById(restaurantId).stream().map(DiningTableEntity::toDomain).toList();
	}

	@Override
	public Optional<DiningTable> findById(long id) {
		return tables.findById(id).map(DiningTableEntity::toDomain);
	}

	@Override
	public DiningTable save(DiningTable table) {
		try {
			return tables.save(DiningTableEntity.from(table)).toDomain();
		}
		catch (DataIntegrityViolationException labelTaken) {
			throw new AlreadyExistsException();
		}
	}

}
