package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.LocalDate;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.AlreadyExistsException;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;

@Component
class RestaurantPersistenceAdapter implements RestaurantRepositoryPort {

	private final RestaurantJpaRepository restaurants;
	private final ClosureJpaRepository closures;
	private final DiningTableJpaRepository tables;

	RestaurantPersistenceAdapter(RestaurantJpaRepository restaurants, ClosureJpaRepository closures,
			DiningTableJpaRepository tables) {
		this.restaurants = restaurants;
		this.closures = closures;
		this.tables = tables;
	}

	@Override
	public Optional<Restaurant> findBySlug(String slug) {
		return restaurants.findBySlugAndDeletedAtIsNull(slug).map(RestaurantEntity::toDomain);
	}

	@Override
	public Optional<Restaurant> findById(long id) {
		return restaurants.findById(id).map(RestaurantEntity::toDomain);
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
	public void addClosure(long restaurantId, LocalDate date, String reason) {
		try {
			closures.save(new ClosureEntity(restaurantId, date, reason));
		}
		catch (DataIntegrityViolationException alreadyClosed) {
			// Registrar dos veces el mismo cierre deja el mismo resultado.
		}
	}

	@Override
	public boolean isClosed(long restaurantId, LocalDate date) {
		return closures.existsByRestaurantIdAndDate(restaurantId, date);
	}

	@Override
	public int maxCapacity(long restaurantId) {
		return tables.maxSeats(restaurantId);
	}

}
