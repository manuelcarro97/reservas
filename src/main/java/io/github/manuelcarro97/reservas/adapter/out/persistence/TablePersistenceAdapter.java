package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
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
	private final ReservationJpaRepository reservations;

	TablePersistenceAdapter(DiningTableJpaRepository tables, ReservationJpaRepository reservations) {
		this.tables = tables;
		this.reservations = reservations;
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
	public List<DiningTable> findAllById(Collection<Long> ids) {
		return tables.findAllById(ids).stream().map(DiningTableEntity::toDomain).toList();
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

	@Override
	public void update(DiningTable table) {
		int updated;
		try {
			updated = tables.updateLive(table.id(), table.restaurantId(), table.label(), table.shape(), table.seats(),
					table.rotation(), table.x(), table.y());
		}
		catch (DataIntegrityViolationException labelTaken) {
			throw new AlreadyExistsException();
		}
		if (updated != 1) {
			throw new IllegalStateException("No live table " + table.id() + " in restaurant " + table.restaurantId());
		}
	}

	@Override
	public void softDelete(long id, Instant at) {
		tables.softDelete(id, at);
	}

	@Override
	public void delete(long restaurantId, long id) {
		tables.delete(id, restaurantId);
	}

	@Override
	public boolean hasAnyReservation(long id) {
		return reservations.existsByTableId(id);
	}

	@Override
	public void renameTemporarily(Collection<Long> ids) {
		if (!ids.isEmpty()) {
			tables.renameTemporarily(ids);
		}
	}

}
