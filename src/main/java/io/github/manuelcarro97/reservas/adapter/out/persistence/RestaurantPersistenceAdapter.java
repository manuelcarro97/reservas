package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.AlreadyExistsException;
import io.github.manuelcarro97.reservas.domain.exception.RestaurantNotFoundException;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;

@Component
class RestaurantPersistenceAdapter implements RestaurantRepositoryPort {

	private final RestaurantJpaRepository restaurants;
	private final ClosureJpaRepository closures;
	private final DiningTableJpaRepository tables;
	private final EntityManager entityManager;

	RestaurantPersistenceAdapter(RestaurantJpaRepository restaurants, ClosureJpaRepository closures,
			DiningTableJpaRepository tables, EntityManager entityManager) {
		this.restaurants = restaurants;
		this.closures = closures;
		this.tables = tables;
		this.entityManager = entityManager;
	}

	@Override
	public Optional<Restaurant> findBySlug(String slug) {
		return restaurants.findBySlugAndDeletedAtIsNull(slug).map(RestaurantEntity::toDomain);
	}

	@Override
	public Optional<Restaurant> findById(long id) {
		return restaurants.findByIdAndDeletedAtIsNull(id).map(RestaurantEntity::toDomain);
	}

	@Override
	public List<Restaurant> findByOwner(String ownerUid) {
		return restaurants.findByOwnerUidAndDeletedAtIsNullOrderById(ownerUid)
			.stream()
			.map(RestaurantEntity::toDomain)
			.toList();
	}

	@Override
	public Restaurant lock(long id) {
		requireTransaction();
		RestaurantEntity entity = entityManager.find(RestaurantEntity.class, id);
		if (entity == null) {
			throw new RestaurantNotFoundException();
		}
		// refresh relee la fila bajo el bloqueo: si ya estaba cargada en esta transacción, find devolvería su estado viejo.
		entityManager.refresh(entity, LockModeType.PESSIMISTIC_WRITE);
		if (entity.isDeleted()) {
			throw new RestaurantNotFoundException();
		}
		return entity.toDomain();
	}

	@Override
	public void lockOwner(String ownerUid) {
		requireTransaction();
		entityManager.createNativeQuery("SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(:uid))) AS locked")
			.setParameter("uid", ownerUid)
			.getSingleResult();
	}

	@Override
	public Restaurant save(Restaurant restaurant) {
		try {
			return restaurants.save(RestaurantEntity.from(restaurant)).toDomain();
		}
		catch (DataIntegrityViolationException slugTaken) {
			throw new AlreadyExistsException();
		}
	}

	@Override
	public Restaurant create(Restaurant restaurant, Instant createdAt) {
		Restaurant saved = save(restaurant);
		restaurants.stampCreatedAt(saved.id(), createdAt);
		return saved;
	}

	@Override
	public int countCreatedAfter(String ownerUid, Instant since) {
		return restaurants.countCreatedAfter(ownerUid, since);
	}

	@Override
	public void softDelete(long id, Instant at) {
		restaurants.softDelete(id, at);
	}

	@Override
	public void addClosure(long restaurantId, LocalDate date, String reason) {
		try {
			closures.save(new ClosureEntity(restaurantId, date, reason));
		}
		catch (DataIntegrityViolationException alreadyClosed) {
			// Registrar dos veces el mismo cierre deja el mismo resultado.
		}
	}

	@Override
	public List<LocalDate> closuresFrom(long restaurantId, LocalDate from) {
		return closures.datesFrom(restaurantId, from);
	}

	@Override
	public void removeClosure(long restaurantId, LocalDate date) {
		closures.deleteByRestaurantIdAndDate(restaurantId, date);
	}

	@Override
	public boolean isClosed(long restaurantId, LocalDate date) {
		return closures.existsByRestaurantIdAndDate(restaurantId, date);
	}

	@Override
	public int maxCapacity(long restaurantId) {
		return tables.maxSeats(restaurantId);
	}

	/** Los bloqueos duran lo que la transacción: sin ella se soltarían al terminar la sentencia y no protegerían nada. */
	private static void requireTransaction() {
		if (!TransactionSynchronizationManager.isActualTransactionActive()) {
			throw new IllegalStateException("Locking requires an active transaction");
		}
	}

}
